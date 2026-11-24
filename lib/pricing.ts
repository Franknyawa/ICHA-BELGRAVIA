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

  // Un palier « 6 à 10 » couvre tout ce qui est ≥ 6 et < 11 : un total de 10,5 cartons (demi-carton)
  // reste donc dans ce palier au lieu de tomber dans un trou entre deux paliers.
  const applicable = paliers.find(
    (p) => totalCartons >= p.cartonsMin && (p.cartonsMax === null || totalCartons < p.cartonsMax + 1)
  );
  if (applicable) return applicable.prixCarton;

  // Filet de sécurité : si aucun palier ne couvre ce total (barème mal configuré depuis l'admin,
  // ex. un trou entre deux paliers), on applique le palier le plus proche plutôt que de renvoyer 0 —
  // mieux vaut un prix légèrement inexact qu'une commande gratuite.
  const tries = [...paliers].sort((a, b) => a.cartonsMin - b.cartonsMin);
  const dernier = tries[tries.length - 1];
  return totalCartons > dernier.cartonsMin ? dernier.prixCarton : tries[0].prixCarton;
}

export type LigneCalcul = { quantite: number };

/** Montant d'une ligne : quantité × prix du carton, arrondi au franc (0,5 carton = la moitié du prix). */
export function montantLigne(quantite: number, prixCarton: number): number {
  return Math.round(quantite * prixCarton);
}

/**
 * Calcule le prix/carton applicable et le montant total pour un ensemble de lignes.
 * `prixNegocie` (> 0) remplace le barème : le prix du carton est alors le même quel que soit le volume.
 * Le total est la somme des lignes arrondies, pour que la facture tombe toujours juste.
 */
export function calculerCommande(lignes: LigneCalcul[], paliers: PalierPrix[], prixNegocie = 0) {
  const totalCartons = lignes.reduce((s, l) => s + (l.quantite || 0), 0);
  const prixCarton = prixNegocie > 0 ? prixNegocie : trouverPrixCarton(totalCartons, paliers);
  const montantTotal = lignes.reduce((s, l) => s + montantLigne(l.quantite || 0, prixCarton), 0);
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
 *
 * `mobileMoneyConfirme` reproduit la même logique que le projet HYPO/HTC
 * (voir reassort/page.tsx : montantEffectivementRecu) : un paiement Mobile
 * Money n'est compté comme réellement reçu que si l'agent confirme l'avoir
 * effectivement vu arriver (le SMS de confirmation peut arriver après la
 * saisie de la commande) — tant que ce n'est pas confirmé, il est traité
 * comme un crédit en attente.
 */
export function calculerPaiement(
  modePaiement: ModePaiementValue,
  montantTotal: number,
  montantSaisi = 0,
  mobileMoneyConfirme = false
) {
  switch (modePaiement) {
    case "ESPECES":
      return { montantRecu: montantTotal, resteAPayer: 0 };
    case "MOBILE_MONEY":
      return mobileMoneyConfirme
        ? { montantRecu: montantTotal, resteAPayer: 0 }
        : { montantRecu: 0, resteAPayer: montantTotal };
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
