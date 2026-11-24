/** Quantités en cartons : entières ou par demi-carton (0,5 ; 1 ; 1,5…). */
export const PAS_CARTON = 0.5;

/** Vrai si `q` est une quantité de cartons valide : positive, multiple de 0,5, et raisonnable. */
export function quantiteCartonValide(q: unknown, max = 100000): q is number {
  return typeof q === "number" && Number.isFinite(q) && q > 0 && q <= max && Number.isInteger(q * 2);
}

/** Ramène une saisie au demi-carton le plus proche (jamais négative). */
export function arrondirDemi(q: number): number {
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.round(q * 2) / 2;
}

/** « 1,5 » / « 2 » : virgule décimale, pas de zéro inutile. */
export function formaterCartons(q: number): string {
  return String(Math.round(q * 2) / 2).replace(".", ",");
}
