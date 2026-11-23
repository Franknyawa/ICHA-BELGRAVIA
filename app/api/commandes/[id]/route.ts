import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces, aEcriture } from "@/lib/permissions";
import { calculerCommande, calculerPaiement, type ModePaiementValue } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * Actions de l'admin sur UNE commande (ADMIN et SUPER_ADMIN seulement pour
 * toute écriture ; le superviseur peut seulement lire) :
 *  - GET    : commande + catalogue de sa gamme + barème, pour la fenêtre de modification.
 *  - PATCH  : { action: "MODIFIER" | "MODE" | "REACTIVER" }
 *  - DELETE : annulation d'un doublon livré (remet le stock, supprime la commande).
 *
 * Règle commune : dès qu'un encaissement existe en caisse pour la commande, on
 * ne modifie plus son montant ni son statut — il faut d'abord annuler
 * l'encaissement dans la caisse. Le journal de caisse ne ment donc jamais.
 */

const MODES = ["ESPECES", "MOBILE_MONEY", "CREDIT_PARTIEL", "CREDIT_TOTAL"] as const;

class Refus extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const SELECT = {
  id: true,
  statut: true,
  gammeId: true,
  montantTotal: true,
  montantRecu: true,
  modePaiement: true,
  operateurMobile: true,
  mobileMoneyConfirme: true,
  lignes: { select: { produitId: true, quantite: true } },
} as const;

function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function aDesEncaissements(tx: Prisma.TransactionClient, commandeId: string) {
  const n = await tx.operationCaisse.count({
    where: { commandeId, categorie: { in: ["ENCAISSEMENT_COMMANDE", "ENCAISSEMENT_CREDIT"] } },
  });
  return n > 0;
}

function reponseErreur(e: unknown) {
  if (e instanceof Refus) return NextResponse.json({ error: e.message }, { status: e.status });
  if ((e as { code?: string })?.code === "P2034") {
    return NextResponse.json({ error: "Cette commande vient d'être modifiée. Rafraîchissez la page." }, { status: 409 });
  }
  throw e;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!aAcces(session, "commandes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const c = await prisma.commande.findUnique({
    where: { id: params.id },
    select: {
      ...SELECT,
      observations: true,
      dateLivraison: true,
      lignes: { select: { produitId: true, quantite: true, produit: { select: { nom: true } } } },
    },
  });
  if (!c) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });

  const [produits, paliers, encaissements] = await Promise.all([
    prisma.produit.findMany({ where: { actif: true, gammeId: c.gammeId }, orderBy: { ordre: "asc" }, select: { id: true, nom: true } }),
    prisma.palierPrixCarton.findMany({
      where: { actif: true, gammeId: c.gammeId },
      orderBy: { cartonsMin: "asc" },
      select: { cartonsMin: true, cartonsMax: true, prixCarton: true },
    }),
    prisma.operationCaisse.count({
      where: { commandeId: c.id, categorie: { in: ["ENCAISSEMENT_COMMANDE", "ENCAISSEMENT_CREDIT"] } },
    }),
  ]);
  return NextResponse.json({
    commande: c,
    produits,
    paliers: paliers.map((p) => ({ cartonsMin: p.cartonsMin, cartonsMax: p.cartonsMax, prixCarton: Number(p.prixCarton) })),
    verrouille: encaissements > 0,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!aEcriture(session, "commandes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const b = await req.json().catch(() => ({}));

  try {
    // --- Changer seulement le mode de paiement déclaré (espèces / Orange / MTN) ----------
    if (b.action === "MODE") {
      const choix = b.modePaiement as string;
      if (!["ESPECES", "ORANGE_MONEY", "MTN_MOMO"].includes(choix)) {
        return NextResponse.json({ error: "Mode de paiement invalide." }, { status: 400 });
      }
      await transaction(async (tx) => {
        const c = await tx.commande.findUnique({ where: { id: params.id }, select: SELECT });
        if (!c) throw new Refus(404, "Commande introuvable.");
        if (c.modePaiement === "CREDIT_PARTIEL" || c.modePaiement === "CREDIT_TOTAL") {
          throw new Refus(409, "Une commande à crédit se modifie par « Modifier la commande ».");
        }
        const mobile = choix !== "ESPECES";
        const mode: ModePaiementValue = mobile ? "MOBILE_MONEY" : "ESPECES";
        const p = calculerPaiement(mode, Number(c.montantTotal), 0, mobile ? c.mobileMoneyConfirme : false);
        await tx.commande.update({
          where: { id: c.id },
          data: { modePaiement: mode, operateurMobile: mobile ? choix : null, ...p },
        });
      });
      return NextResponse.json({ ok: true });
    }

    // --- Réactiver une commande livrée : elle repasse « livraison à effectuer » ---------------
    if (b.action === "REACTIVER") {
      await transaction(async (tx) => {
        const c = await tx.commande.findUnique({ where: { id: params.id }, select: SELECT });
        if (!c) throw new Refus(404, "Commande introuvable.");
        if (c.statut !== "LIVREE") throw new Refus(409, "Seule une commande livrée peut être réactivée.");
        if (await aDesEncaissements(tx, c.id)) {
          throw new Refus(409, "Des encaissements existent en caisse pour cette commande : annulez-les d'abord dans la Caisse.");
        }
        await tx.commande.update({ where: { id: c.id }, data: { statut: "EN_COURS_LIVRAISON", livreeLe: null } });
      });
      return NextResponse.json({ ok: true });
    }

    // --- Modifier la commande : lignes, paiement, note, date prévue ---------------------------
    if (b.action === "MODIFIER") {
      const brutes = Array.isArray(b.lignes) ? b.lignes : [];
      const quantites = new Map<string, number>();
      for (const l of brutes) {
        const q = Number(l?.quantite);
        if (typeof l?.produitId !== "string" || !Number.isInteger(q) || q <= 0 || q > 100000) {
          return NextResponse.json({ error: "Lignes invalides : produit et quantité entière positive requis." }, { status: 400 });
        }
        quantites.set(l.produitId, (quantites.get(l.produitId) || 0) + q);
      }
      if (quantites.size === 0) return NextResponse.json({ error: "Une commande doit contenir au moins un produit." }, { status: 400 });

      await transaction(async (tx) => {
        const c = await tx.commande.findUnique({ where: { id: params.id }, select: SELECT });
        if (!c) throw new Refus(404, "Commande introuvable.");
        if (await aDesEncaissements(tx, c.id)) {
          throw new Refus(409, "Des encaissements existent en caisse pour cette commande : annulez-les d'abord dans la Caisse.");
        }

        const ids = [...quantites.keys()];
        const produits = await tx.produit.findMany({ where: { id: { in: ids }, actif: true }, select: { id: true, gammeId: true } });
        if (produits.length !== ids.length) throw new Refus(400, "Un ou plusieurs produits ne sont plus disponibles.");
        if (c.gammeId && produits.some((p) => p.gammeId !== c.gammeId)) {
          throw new Refus(400, "Tous les produits doivent appartenir à la gamme de la commande.");
        }

        const paliers = await tx.palierPrixCarton.findMany({ where: { actif: true, gammeId: c.gammeId }, orderBy: { cartonsMin: "asc" } });
        if (paliers.length === 0) throw new Refus(500, "Aucun barème de prix pour cette gamme.");
        const { prixCarton, montantTotal } = calculerCommande(
          ids.map((id) => ({ quantite: quantites.get(id)! })),
          paliers.map((p) => ({ cartonsMin: p.cartonsMin, cartonsMax: p.cartonsMax, prixCarton: Number(p.prixCarton) }))
        );

        // Paiement : le mode choisi décide, jamais un montant libre (sauf crédit partiel).
        const mode = (MODES as readonly string[]).includes(b.modePaiement) ? (b.modePaiement as ModePaiementValue) : (c.modePaiement as ModePaiementValue);
        let operateur: string | null = null;
        if (mode === "MOBILE_MONEY") {
          operateur = ["ORANGE_MONEY", "MTN_MOMO"].includes(b.operateurMobile) ? b.operateurMobile : c.operateurMobile;
          if (!operateur) throw new Refus(400, "Choisissez l'opérateur Mobile Money : Orange Money ou MTN MoMo.");
        }
        const paiement = calculerPaiement(mode, montantTotal, Number(b.montantRecu) || Number(c.montantRecu), c.mobileMoneyConfirme);

        // Stock : on ne touche que la différence, mouvement journalisé.
        const avant = new Map<string, number>();
        for (const l of c.lignes) if (l.produitId) avant.set(l.produitId, (avant.get(l.produitId) || 0) + l.quantite);
        for (const pid of new Set([...avant.keys(), ...quantites.keys()])) {
          const delta = (quantites.get(pid) || 0) - (avant.get(pid) || 0); // > 0 : on sort plus de cartons
          if (delta === 0) continue;
          await tx.stock.upsert({
            where: { produitId: pid },
            update: { quantiteCartons: { decrement: delta } },
            create: { produitId: pid, quantiteCartons: -delta, seuilAlerte: 20 },
          });
          await tx.mouvementStock.create({
            data: {
              produitId: pid,
              type: delta > 0 ? "SORTIE" : "ENTREE",
              quantiteCartons: Math.abs(delta),
              referenceType: "COMMANDE",
              referenceId: c.id,
              note: "Modification de commande",
            },
          });
        }

        await tx.ligneCommande.deleteMany({ where: { commandeId: c.id } });
        await tx.ligneCommande.createMany({
          data: ids.map((id) => ({
            commandeId: c.id,
            produitId: id,
            quantite: quantites.get(id)!,
            prixUnitaire: prixCarton,
            sousTotal: quantites.get(id)! * prixCarton,
          })),
        });

        const date = typeof b.dateLivraison === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dateLivraison) ? new Date(`${b.dateLivraison}T00:00:00+01:00`) : undefined;
        await tx.commande.update({
          where: { id: c.id },
          data: {
            montantTotal,
            modePaiement: mode,
            operateurMobile: operateur,
            ...paiement,
            ...(typeof b.observations === "string" ? { observations: b.observations.trim().slice(0, 500) || null } : {}),
            ...(date ? { dateLivraison: date } : b.dateLivraison === "" ? { dateLivraison: null } : {}),
          },
        });
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (e) {
    return reponseErreur(e);
  }
}

/** Annule un doublon livré : les cartons retournent en stock et la commande disparaît des totaux. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!aEcriture(session, "commandes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  try {
    await transaction(async (tx) => {
      const c = await tx.commande.findUnique({ where: { id: params.id }, select: SELECT });
      if (!c) throw new Refus(404, "Commande introuvable.");
      if (c.statut !== "LIVREE") throw new Refus(409, "Seule une commande livrée peut être annulée comme doublon.");
      if (await aDesEncaissements(tx, c.id)) {
        throw new Refus(409, "Des encaissements existent en caisse pour cette commande : annulez-les d'abord dans la Caisse.");
      }
      for (const l of c.lignes) {
        if (!l.produitId) continue;
        await tx.stock.upsert({
          where: { produitId: l.produitId },
          update: { quantiteCartons: { increment: l.quantite } },
          create: { produitId: l.produitId, quantiteCartons: l.quantite, seuilAlerte: 20 },
        });
        await tx.mouvementStock.create({
          data: { produitId: l.produitId, type: "ENTREE", quantiteCartons: l.quantite, referenceType: "COMMANDE", referenceId: c.id, note: "Annulation d'un doublon livré" },
        });
      }
      await tx.notification.deleteMany({ where: { commandeId: c.id } });
      await tx.commande.delete({ where: { id: c.id } }); // les lignes partent en cascade
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return reponseErreur(e);
  }
}
