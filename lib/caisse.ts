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

/** Moyens de paiement suivis en caisse (un « compte » par moyen). */
export const MODES_CAISSE = {
  ESPECES: "Espèces",
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
  MOBILE_MONEY: "Mobile Money (opérateur non précisé)",
} as const;
export type ModeCaisse = keyof typeof MODES_CAISSE;

export const LIBELLE_MODE_COMMANDE: Record<string, string> = {
  ESPECES: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  CREDIT_PARTIEL: "Crédit partiel",
  CREDIT_TOTAL: "Crédit total",
};

/** Mode dans lequel l'argent d'une vente est entré (l'acompte d'un crédit partiel est compté en espèces). */
export function modeDeVente(c: { modePaiement: string; operateurMobile: string | null }): ModeCaisse {
  if (c.modePaiement === "MOBILE_MONEY") {
    return c.operateurMobile === "ORANGE_MONEY" || c.operateurMobile === "MTN_MOMO" ? c.operateurMobile : "MOBILE_MONEY";
  }
  return "ESPECES";
}

export function modeOperation(m: string | null | undefined): ModeCaisse {
  return m === "ORANGE_MONEY" || m === "MTN_MOMO" || m === "MOBILE_MONEY" ? m : "ESPECES";
}

export type DetailsCommande = {
  commandeId: string;
  pointVente: string;
  localisation: string;
  client: string;
  telephone: string | null;
  agent: string;
  modePaiementCommande: string;
  montantTotal: number;
  reste: number;
};

export type LigneJournal = {
  id: string;
  date: string;
  type: "RECETTE" | "DEPENSE";
  categorie: string;
  libelle: string;
  montant: number; // argent réellement entré / sorti
  credit: number; // montant laissé à crédit lors de la vente (info)
  source: "VENTE" | "ENCAISSEMENT" | "MANUEL";
  mode: ModeCaisse | null;
  details?: DetailsCommande;
  produit?: string | null;
  quantiteCartons?: number | null;
  annulable: boolean;
};

type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Entrée de stock + dépense de caisse, dans la transaction fournie. */
export async function enregistrerAchatStock(
  tx: Tx,
  p: { produitId: string; quantiteCartons: number; coutTotal: number; note?: string | null; creeParId?: string | null; libelle?: string; dateOperation?: Date; modePaiement?: string | null }
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
        modePaiement: p.modePaiement ?? null,
        creeParId: p.creeParId ?? null,
        ...(p.dateOperation ? { dateOperation: p.dateOperation } : {}),
      },
    });
  }
  return mouvement;
}

/** Encaissements enregistrés par commande (déjà inclus dans commande.montantRecu). */
export async function encaisseParCommande(ids?: string[]): Promise<Map<string, number>> {
  const rows = await prisma.operationCaisse.groupBy({
    by: ["commandeId"],
    where: { categorie: "ENCAISSEMENT_CREDIT", commandeId: ids ? { in: ids } : { not: null } },
    _sum: { montant: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) if (r.commandeId) m.set(r.commandeId, Number(r._sum.montant || 0));
  return m;
}

export type SoldeParMode = Record<ModeCaisse, { recettes: number; depenses: number; solde: number }>;

/**
 * Cumul depuis le début, total et par moyen de paiement.
 * Recettes = argent encaissé à la vente (commande.montantRecu moins les encaissements
 * ultérieurs, comptés à part à leur date) + opérations de recette ; dépenses = opérations de dépense.
 */
export async function soldeGlobal() {
  const [commandes, linked, ops] = await Promise.all([
    prisma.commande.findMany({
      where: { montantRecu: { gt: 0 } },
      select: { id: true, modePaiement: true, operateurMobile: true, montantRecu: true },
    }),
    encaisseParCommande(),
    prisma.operationCaisse.groupBy({ by: ["type", "modePaiement"], _sum: { montant: true } }),
  ]);

  const vide = () => ({ recettes: 0, depenses: 0, solde: 0 });
  const parMode: SoldeParMode = { ESPECES: vide(), ORANGE_MONEY: vide(), MTN_MOMO: vide(), MOBILE_MONEY: vide() };

  for (const c of commandes) {
    const initial = Math.max(0, Number(c.montantRecu) - (linked.get(c.id) ?? 0));
    parMode[modeDeVente(c)].recettes += initial;
  }
  for (const o of ops) {
    const m = modeOperation(o.modePaiement);
    const v = Number(o._sum.montant || 0);
    if (o.type === "RECETTE") parMode[m].recettes += v;
    else parMode[m].depenses += v;
  }
  let recettes = 0;
  let depenses = 0;
  for (const m of Object.keys(parMode) as ModeCaisse[]) {
    parMode[m].solde = parMode[m].recettes - parMode[m].depenses;
    recettes += parMode[m].recettes;
    depenses += parMode[m].depenses;
  }
  return { recettes, depenses, solde: recettes - depenses, parMode };
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
