import { prisma } from "@/lib/prisma";
import { trouverPrixCarton } from "@/lib/pricing";

/**
 * Caisse : recettes et dépenses, reliées au stock de produits.
 *
 * Circuit d'une commande : le commercial l'enregistre → l'admin la valide
 * (« Valider et autoriser la livraison ») → « Effectuer la livraison » (la
 * commande passe LIVREE et son montant entre dans « Commandes à encaisser »)
 * → « Encaisser » dans la caisse, qui crée une opération ENCAISSEMENT_COMMANDE
 * et fait seulement alors bouger le solde.
 *
 * Source unique de vérité : la table OperationCaisse. Une commande ne crée
 * jamais d'argent en caisse par elle-même (le montant « reçu » déclaré par le
 * commercial reste une simple information).
 * Reste à encaisser d'une commande = montantTotal − Σ de ses encaissements.
 */

export const CATEGORIES_RECETTE = {
  AUTRE_RECETTE: "Autre recette",
} as const;

export const CATEGORIES_DEPENSE = {
  REAPPROVISIONNEMENT: "Achat de stock",
  TRANSPORT: "Transport / livraison",
  COMMISSION: "Commissions / primes",
  FRAIS_DIVERS: "Frais divers",
  AUTRE_DEPENSE: "Autre dépense",
} as const;

/** Catégories réservées (jamais saisies via le formulaire « autre recette / dépense »). */
export const CATEGORIES_ENCAISSEMENT = ["ENCAISSEMENT_COMMANDE", "ENCAISSEMENT_CREDIT"] as const;

export const LIBELLE_CATEGORIE: Record<string, string> = {
  ENCAISSEMENT_COMMANDE: "Encaissement de commande",
  ENCAISSEMENT_CREDIT: "Encaissement de crédit",
  TRANSFERT: "Transfert",
  ...CATEGORIES_RECETTE,
  ...CATEGORIES_DEPENSE,
};

/** Moyens de paiement suivis en caisse (un « compte » par moyen). */
export const MODES_CAISSE = {
  ESPECES: "Espèces",
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
  MOBILE_MONEY: "Mobile Money (opérateur non précisé)",
  BANQUE: "Banque",
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
  return m === "ORANGE_MONEY" || m === "MTN_MOMO" || m === "MOBILE_MONEY" || m === "BANQUE" ? m : "ESPECES";
}

/** Les 3 canaux affichés : Espèces, OM/MOMO (Orange + MTN + non précisé), Banque. */
export type Canal = "ESPECES" | "OM_MOMO" | "BANQUE";
export const LIBELLE_CANAL: Record<Canal, string> = { ESPECES: "Espèces", OM_MOMO: "OM/MOMO", BANQUE: "Banque" };
export function canalDe(m: ModeCaisse): Canal {
  return m === "ESPECES" ? "ESPECES" : m === "BANQUE" ? "BANQUE" : "OM_MOMO";
}
/** Mode stocké pour un canal choisi à l'écran (le mobile reprend l'opérateur de la commande s'il est connu). */
export function modePourCanal(canal: unknown, operateurCommande?: string | null): ModeCaisse | null {
  if (canal === "ESPECES" || canal === "BANQUE") return canal;
  if (canal === "OM_MOMO") return operateurCommande === "ORANGE_MONEY" || operateurCommande === "MTN_MOMO" ? operateurCommande : "MOBILE_MONEY";
  return null;
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
  /** Reste à encaisser (montantTotal − encaissements enregistrés). */
  reste: number;
};

/** Commande livrée dont le montant (ou une partie) reste à encaisser. */
export type AEncaisser = DetailsCommande & {
  date: string; // date de la commande
  livreeLe: string | null;
  datePrevue: string | null; // livraison / encaissement prévu
  enRetard: boolean;
  encaisse: number;
};

export type LigneJournal = {
  id: string;
  date: string;
  type: "RECETTE" | "DEPENSE";
  categorie: string;
  libelle: string;
  montant: number;
  source: "ENCAISSEMENT" | "TRANSFERT" | "MANUEL";
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

/** Encaissements enregistrés par commande (nouveaux encaissements et anciens « crédits »). */
export async function encaisseParCommande(ids?: string[]): Promise<Map<string, number>> {
  const rows = await prisma.operationCaisse.groupBy({
    by: ["commandeId"],
    where: { categorie: { in: [...CATEGORIES_ENCAISSEMENT] }, commandeId: ids ? { in: ids } : { not: null } },
    _sum: { montant: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) if (r.commandeId) m.set(r.commandeId, Number(r._sum.montant || 0));
  return m;
}

export type SoldeParCanal = Record<Canal, number>;

/**
 * Cumul depuis le début : tout vient des opérations de caisse.
 * Les transferts déplacent l'argent d'un canal à l'autre : ils comptent dans
 * le solde de chaque canal mais ni dans les recettes ni dans les dépenses.
 */
export async function soldeGlobal() {
  const ops = await prisma.operationCaisse.groupBy({ by: ["type", "modePaiement", "categorie"], _sum: { montant: true } });
  const parMode: Record<ModeCaisse, number> = { ESPECES: 0, ORANGE_MONEY: 0, MTN_MOMO: 0, MOBILE_MONEY: 0, BANQUE: 0 };
  let recettes = 0;
  let depenses = 0;
  for (const o of ops) {
    const v = Number(o._sum.montant || 0);
    const signe = o.type === "RECETTE" ? 1 : -1;
    parMode[modeOperation(o.modePaiement)] += signe * v;
    if (o.categorie === "TRANSFERT") continue;
    if (o.type === "RECETTE") recettes += v;
    else depenses += v;
  }
  const parCanal: SoldeParCanal = {
    ESPECES: parMode.ESPECES,
    OM_MOMO: parMode.ORANGE_MONEY + parMode.MTN_MOMO + parMode.MOBILE_MONEY,
    BANQUE: parMode.BANQUE,
  };
  return {
    recettes,
    depenses,
    solde: parCanal.ESPECES + parCanal.OM_MOMO + parCanal.BANQUE,
    parCanal,
    detailMobile: { ORANGE_MONEY: parMode.ORANGE_MONEY, MTN_MOMO: parMode.MTN_MOMO, MOBILE_MONEY: parMode.MOBILE_MONEY },
  };
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
