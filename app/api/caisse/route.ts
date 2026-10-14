import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { intervalleJours, dateValide, debutJour, debutAujourdhui } from "@/lib/dates";
import {
  CATEGORIES_DEPENSE,
  CATEGORIES_RECETTE,
  enregistrerAchatStock,
  soldeGlobal,
  valoriserStock,
  type LigneJournal,
} from "@/lib/caisse";

export const dynamic = "force-dynamic";

/** Journal + synthèse de caisse sur la période (jours du Cameroun), solde global et stock valorisé. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const intervalle = intervalleJours(sp.get("du"), sp.get("au"));

  const [commandes, operations, global, stock, creancesAgg, encaissCreances] = await Promise.all([
    prisma.commande.findMany({
      where: { montantRecu: { gt: 0 }, ...(intervalle ? { createdAt: intervalle } : {}) },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        createdAt: true,
        montantRecu: true,
        modePaiement: true,
        pointVente: { select: { nomEtablissement: true } },
        lignes: { select: { quantite: true } },
      },
    }),
    prisma.operationCaisse.findMany({
      where: intervalle ? { dateOperation: intervalle } : {},
      orderBy: { dateOperation: "desc" },
      take: 1000,
    }),
    soldeGlobal(),
    valoriserStock(),
    prisma.commande.aggregate({ _sum: { resteAPayer: true } }),
    prisma.operationCaisse.aggregate({ _sum: { montant: true }, where: { categorie: "ENCAISSEMENT_CREDIT" } }),
  ]);

  const produits = await prisma.produit.findMany({ select: { id: true, nom: true } });
  const nomProduit = new Map(produits.map((p) => [p.id, p.nom]));

  const journal: LigneJournal[] = [
    ...commandes.map((c) => {
      const cartons = c.lignes.reduce((s, l) => s + l.quantite, 0);
      return {
        id: `vente-${c.id}`,
        date: c.createdAt.toISOString(),
        type: "RECETTE" as const,
        categorie: "VENTE",
        libelle: `Vente — ${c.pointVente.nomEtablissement} (${cartons} carton${cartons > 1 ? "s" : ""})`,
        montant: Number(c.montantRecu),
        source: "VENTE" as const,
        quantiteCartons: cartons,
      };
    }),
    ...operations.map((o) => ({
      id: o.id,
      date: o.dateOperation.toISOString(),
      type: o.type,
      categorie: o.categorie,
      libelle: o.libelle,
      montant: Number(o.montant),
      source: "MANUEL" as const,
      produit: o.produitId ? nomProduit.get(o.produitId) ?? null : null,
      quantiteCartons: o.quantiteCartons,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const somme = (f: (l: LigneJournal) => boolean) => journal.filter(f).reduce((s, l) => s + l.montant, 0);
  const recettesVentes = somme((l) => l.source === "VENTE");
  const recettesAutres = somme((l) => l.source === "MANUEL" && l.type === "RECETTE");
  const depenses = somme((l) => l.type === "DEPENSE");

  const parCategorie = new Map<string, { type: string; montant: number }>();
  for (const l of journal) {
    const cur = parCategorie.get(l.categorie) ?? { type: l.type, montant: 0 };
    cur.montant += l.montant;
    parCategorie.set(l.categorie, cur);
  }

  const creancesBrutes = Number(creancesAgg._sum.resteAPayer || 0);
  const dejaEncaisse = Number(encaissCreances._sum.montant || 0);

  return NextResponse.json({
    periode: { du: sp.get("du"), au: sp.get("au") },
    resume: {
      recettesVentes,
      recettesAutres,
      recettes: recettesVentes + recettesAutres,
      depenses,
      solde: recettesVentes + recettesAutres - depenses,
      creancesARecouvrer: Math.max(0, creancesBrutes - dejaEncaisse),
      tronque: commandes.length >= 1000 || operations.length >= 1000,
    },
    global,
    stock,
    parCategorie: [...parCategorie.entries()].map(([categorie, v]) => ({ categorie, ...v })),
    journal,
  });
}

/** Saisie d'une opération manuelle (recette, dépense, achat de stock). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const type = b.type as "RECETTE" | "DEPENSE";
  const categorie = String(b.categorie || "");
  const montant = Math.round(Number(b.montant));
  const libelle = String(b.libelle || "").trim().slice(0, 200);

  if (type !== "RECETTE" && type !== "DEPENSE") return NextResponse.json({ error: "Type d'opération invalide." }, { status: 400 });
  const valides = type === "RECETTE" ? CATEGORIES_RECETTE : CATEGORIES_DEPENSE;
  if (!(categorie in valides)) return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
  if (!Number.isFinite(montant) || montant <= 0) return NextResponse.json({ error: "Montant invalide." }, { status: 400 });

  // Date saisie = jour (Cameroun) ; on garde l'heure actuelle pour ordonner le journal.
  let dateOperation = new Date();
  if (dateValide(b.date)) {
    dateOperation = new Date(debutJour(b.date).getTime() + (Date.now() - debutAujourdhui().getTime()));
    if (dateOperation.getTime() > Date.now()) dateOperation = new Date();
  }

  // Achat de stock : entrée de stock + dépense, indissociables.
  if (categorie === "REAPPROVISIONNEMENT") {
    const quantite = parseInt(b.quantiteCartons, 10);
    if (!b.produitId || !Number.isFinite(quantite) || quantite <= 0) {
      return NextResponse.json({ error: "Choisissez un produit et une quantité de cartons." }, { status: 400 });
    }
    const produit = await prisma.produit.findUnique({ where: { id: b.produitId } });
    if (!produit) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await enregistrerAchatStock(tx, {
        produitId: b.produitId,
        quantiteCartons: quantite,
        coutTotal: montant,
        note: libelle || "Achat de stock",
        creeParId: session.userId,
        dateOperation,
      });
    });
    return NextResponse.json({ ok: true });
  }

  if (!libelle) return NextResponse.json({ error: "Indiquez un libellé." }, { status: 400 });

  let commandeId: string | null = null;
  if (categorie === "ENCAISSEMENT_CREDIT" && b.commandeId) {
    const cmd = await prisma.commande.findUnique({ where: { id: b.commandeId }, select: { id: true, resteAPayer: true } });
    if (!cmd) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
    const deja = await prisma.operationCaisse.aggregate({
      _sum: { montant: true },
      where: { commandeId: cmd.id, categorie: "ENCAISSEMENT_CREDIT" },
    });
    const reste = Number(cmd.resteAPayer) - Number(deja._sum.montant || 0);
    if (montant > reste) {
      return NextResponse.json({ error: `Cette commande n'a plus que ${reste.toLocaleString("fr-FR")} FCFA à encaisser.` }, { status: 400 });
    }
    commandeId = cmd.id;
  }

  await prisma.operationCaisse.create({
    data: { type, categorie, montant, libelle, commandeId, creeParId: session.userId, dateOperation },
  });
  return NextResponse.json({ ok: true });
}
