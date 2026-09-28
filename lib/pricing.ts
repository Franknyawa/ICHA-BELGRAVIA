/**
 * Calcul du prix au carton selon le barème par palier (PalierPrixCarton).
 * Fonction pure, utilisable côté client (aperçu en direct dans le
 * formulaire de commande) ET côté serveur (calcul faisant foi, jamais basé
 * sur un prix envoyé par le client — voir app/api/commandes/route.ts).
 *
 * Le palier applicable dépend du nombre TOTAL de cartons de la commande
 * (tous produits confondus), pas du nombre de cartons par produit — un
 * même prix/carton s'applique donc à toutes les lignes d'une commande.
 */

export type PalierPrix = {
  cartonsMin: number;
  cartonsMax: number | null; // null = palier ouvert ("et plus")
  prixCarton: number;
};

export function trouverPrixCarton(totalCartons: number, paliers: PalierPrix[]): number {
  if (paliers.length === 0) return 0;

  const applicable = paliers.find(
    (p) => totalCartons >= p.cartonsMin && (p.cartonsMax === null || totalCartons <= p.cartonsMax)
  );
  if (applicable) return applicable.prixCarton;

  // Filet de sécurité : si aucun palier ne couvre exactement ce total
  // (barème mal configuré depuis l'admin, ex. un trou entre deux paliers),
  // on applique le palier le plus proche plutôt que de renvoyer 0 —
  // mieux vaut un prix légèrement inexact qu'une commande gratuite.
  const tries = [...paliers].sort((a, b) => a.cartonsMin - b.cartonsMin);
  const dernier = tries[tries.length - 1];
  return totalCartons > dernier.cartonsMin ? dernier.prixCarton : tries[0].prixCarton;
}

export type LigneCalcul = { quantite: number };

/** Calcule le prix/carton applicable et le montant total pour un ensemble de lignes. */
export function calculerCommande(lignes: LigneCalcul[], paliers: PalierPrix[]) {
  const totalCartons = lignes.reduce((s, l) => s + (l.quantite || 0), 0);
  const prixCarton = trouverPrixCarton(totalCartons, paliers);
  const montantTotal = totalCartons * prixCarton;
  return { totalCartons, prixCarton, montantTotal };
}

export const MODES_PAIEMENT = [
  { value: "ESPECES", label: "Espèces" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "CREDIT_PARTIEL", label: "Crédit partiel" },
  { value: "CREDIT_TOTAL", label: "Crédit total" },
] as const;

export type ModePaiementValue = (typeof MODES_PAIEMENT)[number]["value"];

export function libelleModePaiement(mode: string): string {
  return MODES_PAIEMENT.find((m) => m.value === mode)?.label ?? mode;
}

/**
 * Calcule montantRecu/resteAPayer selon le mode de paiement. `montantSaisi`
 * n'est utilisé que pour CREDIT_PARTIEL (montant reçu déclaré par l'agent) ;
 * pour les autres modes il est ignoré — c'est le mode qui détermine le
 * résultat, jamais une saisie libre, pour éviter toute incohérence.
 */
export function calculerPaiement(
  modePaiement: ModePaiementValue,
  montantTotal: number,
  montantSaisi = 0
) {
  switch (modePaiement) {
    case "ESPECES":
    case "MOBILE_MONEY":
      return { montantRecu: montantTotal, resteAPayer: 0 };
    case "CREDIT_TOTAL":
      return { montantRecu: 0, resteAPayer: montantTotal };
    case "CREDIT_PARTIEL": {
      const recu = Math.max(0, Math.min(montantSaisi, montantTotal));
      return { montantRecu: recu, resteAPayer: Math.max(0, montantTotal - recu) };
    }
    default:
      return { montantRecu: 0, resteAPayer: montantTotal };
  }
}
