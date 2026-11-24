import type { Prisma } from "@prisma/client";
import { prochainNumero } from "@/lib/numerotation";
import { CATEGORIE_REMBOURSEMENT, CATEGORIES_ENCAISSEMENT, modePourCanal, soldeGlobal, canalDe, LIBELLE_CANAL, type Canal } from "@/lib/caisse";
import { quantiteCartonValide } from "@/lib/quantites";
import { montantLigne } from "@/lib/pricing";

/**
 * Facture retour (FR) et facture d'avoir (FA) — règles comptables :
 *
 *  - Elles se rattachent à UNE facture de vente (FV) déjà émise (commande livrée).
 *  - FR = marchandise rendue par le client : valorisée aux prix de la facture d'origine ;
 *    la marchandise retourne en stock vendable, ou en avaries (hors stock vendable).
 *  - FA = correction de montant sans retour de marchandise : par quantités (aux prix de la
 *    facture) ou par montant libre.
 *  - FR et FA réduisent toutes deux la créance du client. Cumul (FR + FA) plafonné au montant
 *    facturé ; quantités plafonnées à ce qui a été facturé (FR + FA par ligne).
 *  - Si le client a déjà payé plus que le nouveau net dû, l'excédent lui est restitué : sortie
 *    de caisse « Remboursement client » sur le canal choisi. Sinon, seul le reste à encaisser baisse.
 *  - Un document émis est définitif (numéro continu, aucune modification ni suppression).
 *  - Pas de TVA : les montants sont des montants nets, comme sur la facture de vente.
 */

export class RefusDocument extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type DemandeDocument = {
  type: "FR" | "FA";
  commandeId: string;
  lignes?: { ligneId: string; quantite: number }[];
  /** FA sans quantités : montant libre à créditer (FCFA). */
  montantLibre?: number;
  motif: string;
  /** FR : "STOCK" (défaut) ou "AVARIES". */
  destination?: "STOCK" | "AVARIES";
  /** Canal du remboursement si le client a déjà payé : ESPECES | OM_MOMO | BANQUE. */
  canal?: string;
  creeParId?: string | null;
};

export async function emettreDocumentCorrectif(tx: Prisma.TransactionClient, d: DemandeDocument) {
  if (d.type !== "FR" && d.type !== "FA") throw new RefusDocument(400, "Type de document invalide.");
  const motif = (d.motif || "").trim();
  if (motif.length < 3) throw new RefusDocument(400, "Indiquez le motif (3 caractères minimum).");

  const c = await tx.commande.findUnique({
    where: { id: d.commandeId },
    select: {
      id: true,
      statut: true,
      numeroFV: true,
      montantTotal: true,
      avoirsTotal: true,
      operateurMobile: true,
      lignes: { select: { id: true, produitId: true, libelleLibre: true, quantite: true, prixUnitaire: true, produit: { select: { nom: true } } } },
    },
  });
  if (!c) throw new RefusDocument(404, "Commande introuvable.");
  if (c.statut !== "LIVREE" || !c.numeroFV) {
    throw new RefusDocument(409, "Seule une facture de vente émise (commande livrée) peut recevoir une facture d'avoir ou retour.");
  }

  // Quantités déjà couvertes par des FR / FA précédentes.
  const deja = await tx.documentCorrectifLigne.groupBy({
    by: ["ligneCommandeId"],
    where: { document: { commandeId: c.id } },
    _sum: { quantite: true },
  });
  const dejaParLigne = new Map(deja.map((r) => [r.ligneCommandeId, Number(r._sum.quantite || 0)]));

  const lignesDoc: { ligneCommandeId: string; produitId: string | null; libelle: string; quantite: number; prixUnitaire: number; sousTotal: number }[] = [];
  const vues = new Set<string>();
  for (const l of d.lignes || []) {
    const q = Number(l.quantite);
    if (!q) continue;
    if (!quantiteCartonValide(q)) throw new RefusDocument(400, "Quantités invalides : nombres positifs, par demi-carton.");
    if (vues.has(l.ligneId)) throw new RefusDocument(400, "Ligne en double.");
    vues.add(l.ligneId);
    const lc = c.lignes.find((x) => x.id === l.ligneId);
    if (!lc) throw new RefusDocument(400, "Ligne inconnue pour cette facture.");
    const restant = lc.quantite - (dejaParLigne.get(lc.id) || 0);
    if (q > restant) {
      throw new RefusDocument(400, `${lc.produit?.nom || lc.libelleLibre || "Produit"} : ${restant} carton${restant > 1 ? "s" : ""} restant${restant > 1 ? "s" : ""} (facturé ${lc.quantite}, déjà couvert ${lc.quantite - restant}).`);
    }
    const prix = Number(lc.prixUnitaire);
    lignesDoc.push({ ligneCommandeId: lc.id, produitId: lc.produitId, libelle: lc.produit?.nom || lc.libelleLibre || "Produit", quantite: q, prixUnitaire: prix, sousTotal: montantLigne(q, prix) });
  }

  const libre = Number(d.montantLibre || 0);
  let montant = lignesDoc.reduce((s, l) => s + l.sousTotal, 0);
  if (d.type === "FR") {
    if (lignesDoc.length === 0) throw new RefusDocument(400, "Indiquez les cartons retournés.");
  } else if (lignesDoc.length === 0) {
    if (!Number.isFinite(libre) || libre <= 0 || libre > 1e10) throw new RefusDocument(400, "Indiquez des quantités ou un montant à créditer.");
    montant = Math.round(libre);
  }

  const netAvant = Number(c.montantTotal) - Number(c.avoirsTotal);
  if (montant > netAvant) {
    throw new RefusDocument(400, `Montant trop élevé : il ne reste que ${netAvant} FCFA à créditer sur cette facture (facturé ${Number(c.montantTotal)}, déjà crédité ${Number(c.avoirsTotal)}).`);
  }

  // Encaissé net (encaissements − remboursements déjà faits) et excédent à restituer.
  const ops = await tx.operationCaisse.groupBy({
    by: ["categorie"],
    where: { commandeId: c.id, categorie: { in: [...CATEGORIES_ENCAISSEMENT, CATEGORIE_REMBOURSEMENT] } },
    _sum: { montant: true },
  });
  const encaisseNet = ops.reduce((t, r) => t + (r.categorie === CATEGORIE_REMBOURSEMENT ? -1 : 1) * Number(r._sum.montant || 0), 0);
  const netApres = netAvant - montant;
  const aRembourser = Math.max(0, encaisseNet - netApres);

  let mode: ReturnType<typeof modePourCanal> = null;
  if (aRembourser > 0) {
    mode = modePourCanal(d.canal, c.operateurMobile);
    if (!mode) throw new RefusDocument(400, "Le client a déjà payé : choisissez le canal du remboursement (Espèces, OM/MOMO ou Banque).");
    const g = await soldeGlobal();
    const canal: Canal = canalDe(mode);
    if (g.parCanal[canal] < aRembourser) {
      throw new RefusDocument(400, `Solde insuffisant sur le canal ${LIBELLE_CANAL[canal]} pour rembourser ${aRembourser} FCFA.`);
    }
  }

  const numero = await prochainNumero(tx, d.type);
  const destination = d.type === "FR" ? (d.destination === "AVARIES" ? "AVARIES" : "STOCK") : null;
  const doc = await tx.documentCorrectif.create({
    data: {
      type: d.type,
      numero,
      commandeId: c.id,
      montant,
      remboursement: aRembourser,
      canalRemboursement: mode ? canalDe(mode) : null,
      destination,
      motif,
      creeParId: d.creeParId ?? null,
      lignes: { create: lignesDoc },
    },
  });

  await tx.commande.update({ where: { id: c.id }, data: { avoirsTotal: { increment: montant } } });

  if (d.type === "FR" && destination === "STOCK") {
    for (const l of lignesDoc) {
      if (!l.produitId) continue;
      await tx.stock.upsert({
        where: { produitId: l.produitId },
        update: { quantiteCartons: { increment: l.quantite } },
        create: { produitId: l.produitId, quantiteCartons: l.quantite, seuilAlerte: 20 },
      });
      await tx.mouvementStock.create({
        data: { produitId: l.produitId, type: "ENTREE", quantiteCartons: l.quantite, referenceType: "RETOUR", referenceId: doc.id, note: `Retour ${numero} — ${motif}` },
      });
    }
  }

  if (aRembourser > 0 && mode) {
    await tx.operationCaisse.create({
      data: {
        type: "DEPENSE",
        categorie: CATEGORIE_REMBOURSEMENT,
        montant: aRembourser,
        libelle: `Remboursement client — ${numero}`,
        commandeId: c.id,
        modePaiement: mode,
        creeParId: d.creeParId ?? null,
      },
    });
  }

  return { id: doc.id, numero, type: d.type, montant, remboursement: aRembourser, netApres };
}
