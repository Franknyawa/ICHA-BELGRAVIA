/**
 * Grille tarifaire officielle Belgravia (HT, carton de 24 x 27,5 cl).
 * Sert uniquement de valeurs de départ : le barème réellement appliqué aux
 * commandes est celui de la base, modifiable dans Paramètres.
 */
export const BOUTEILLES_PAR_CARTON_BELGRAVIA = 24;

export const GRILLE_BELGRAVIA: { cartonsMin: number; cartonsMax: number | null; prixCarton: number }[] = [
  { cartonsMin: 1, cartonsMax: 9, prixCarton: 24000 },
  { cartonsMin: 10, cartonsMax: 49, prixCarton: 23000 },
  { cartonsMin: 50, cartonsMax: 99, prixCarton: 22000 },
  { cartonsMin: 100, cartonsMax: 199, prixCarton: 21000 },
  { cartonsMin: 200, cartonsMax: null, prixCarton: 20000 },
];
