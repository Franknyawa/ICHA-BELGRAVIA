import { prisma } from "@/lib/prisma";
import { trouverPrixCarton } from "@/lib/pricing";

/**
 * Caisse : recettes et dépenses, reliées au stock de produits.
 *
 * - Recettes de ventes : lues directement dans les commandes (montantRecu,
 *   c.-à-d. l'argent réellement encaissé — un crédit n'entre en caisse qu'au
 *   moment où il est encaissé, via une opération ENCAISSEMENT_CREDIT).
 * - Autres mouvements d'argent : table OperationCaisse (saisie manuelle).
 * - Achat de stock : une dépense REAPPROVISIONNEMENT crée en même temps
 *   l'entrée de stock correspondante (voir enregistrerAchatStock).
 */

export const CATEGORIES_RECETTE = {
  ENCAISSEMENT_CREDIT: "Encaissement d'un crédit client",
  AUTRE_RECETTE: "Autre recette",
} as const;

export const CATEGORIES_DEPENSE = {
  REAPPROVISIONNEMENT: "Achat de stock",
  TRANSPORT: "Transport / livraison",
  COMMISSION: "Commissions / primes",
  FRAIS_DIVERS: "Frais divers",
  AUTRE_DEPENSE: "Autre dépense",
} as const;

export const LIBELLE_CATEGORIE: Record<string, string> = {
  VENTE: "Vente",
  ...CATEGORIES_RECETTE,
  ...CATEGORIES_DEPENSE,
};

export type LigneJournal = {
  id: string;
  date: string;
  type: "RECETTE" | "DEPENSE";
  categorie: string;
  libelle: string;
  montant: number;
  source: "VENTE" | "MANUEL";
  produit?: string | null;
  quantiteCartons?: number | null;
};

type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Entrée de stock + dépense de caisse, dans la transaction fournie. */
export async function enregistrerAchatStock(
  tx: Tx,
  p: { produitId: string; quantiteCartons: number; coutTotal: number; note?: string | null; creeParId?: string | null; libelle?: string; dateOperation?: Date }
) {
  const produit = await tx.produit.findUnique({ where: { id: p.produitId }, select: { nom: true } });
  await tx.stock.upsert({
    where: { produitId: p.produitId },
    update: { quantiteCartons: { increment: p.quantiteCartons } },
    create: { produitId: p.produitId, quantiteCartons: p.quantiteCartons, seuilAlerte: 20 },
  });
  const mouvement = await tx.mouvementStock.create({
    data: {
      produitId: p.produitId,
      type: "ENTREE",
      quantiteCartons: p.quantiteCartons,
      referenceType: "AJUSTEMENT",
      note: p.note || "Réapprovisionnement",
    },
  });
  if (p.coutTotal > 0) {
    await tx.operationCaisse.create({
      data: {
        type: "DEPENSE",
        categorie: "REAPPROVISIONNEMENT",
        montant: p.coutTotal,
        libelle: p.libelle || `Achat de stock — ${produit?.nom ?? "produit"} (${p.quantiteCartons} carton${p.quantiteCartons > 1 ? "s" : ""})`,
        produitId: p.produitId,
        quantiteCartons: p.quantiteCartons,
        mouvementStockId: mouvement.id,
        creeParId: p.creeParId ?? null,
        ...(p.dateOperation ? { dateOperation: p.dateOperation } : {}),
      },
    });
  }
  return mouvement;
}

/** Cumul depuis le début : ventes encaissées + recettes manuelles − dépenses. */
export async function soldeGlobal() {
  const [ventes, ops] = await Promise.all([
    prisma.commande.aggregate({ _sum: { montantRecu: true } }),
    prisma.operationCaisse.groupBy({ by: ["type"], _sum: { montant: true } }),
  ]);
  const v = Number(ventes._sum.montantRecu || 0);
  const rec = Number(ops.find((o) => o.type === "RECETTE")?._sum.montant || 0);
  const dep = Number(ops.find((o) => o.type === "DEPENSE")?._sum.montant || 0);
  return { recettes: v + rec, depenses: dep, solde: v + rec - dep };
}

/** Valorisation du stock présent (prix de vente de base et coût d'achat moyen). */
export async function valoriserStock() {
  const [produits, paliers, achats] = await Promise.all([
    prisma.produit.findMany({ where: { actif: true }, orderBy: { ordre: "asc" }, include: { stock: true, gamme: true } }),
    prisma.palierPrixCarton.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } }),
    prisma.operationCaisse.groupBy({
      by: ["produitId"],
      where: { categorie: "REAPPROVISIONNEMENT", produitId: { not: null }, quantiteCartons: { gt: 0 } },
      _sum: { montant: true, quantiteCartons: true },
    }),
  ]);

  const lignes = produits.map((pr) => {
    const paliersGamme = paliers
      .filter((p) => (p.gammeId ?? null) === (pr.gammeId ?? null))
      .map((p) => ({ cartonsMin: p.cartonsMin, cartonsMax: p.cartonsMax, prixCarton: Number(p.prixCarton) }));
    // Prix du palier "1 carton" = prix catalogue le plus haut, donc valorisation prudente à la revente.
    const prixVenteCarton = trouverPrixCarton(1, paliersGamme);
    const achat = achats.find((a) => a.produitId === pr.id);
    const cartonsAchetes = achat?._sum.quantiteCartons || 0;
    const coutMoyenCarton = cartonsAchetes > 0 ? Number(achat?._sum.montant || 0) / cartonsAchetes : null;
    const cartons = pr.stock?.quantiteCartons ?? 0;
    return {
      produitId: pr.id,
      nom: pr.nom,
      gammeCode: pr.gamme?.code ?? null,
      cartons,
      prixVenteCarton,
      coutMoyenCarton,
      valeurVente: cartons * prixVenteCarton,
      valeurCout: coutMoyenCarton !== null ? Math.round(cartons * coutMoyenCarton) : null,
    };
  });

  return {
    lignes,
    totalCartons: lignes.reduce((s, l) => s + l.cartons, 0),
    valeurVente: lignes.reduce((s, l) => s + l.valeurVente, 0),
    valeurCout: lignes.reduce((s, l) => s + (l.valeurCout ?? 0), 0),
    coutInconnu: lignes.some((l) => l.cartons > 0 && l.valeurCout === null),
  };
}
