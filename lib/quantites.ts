/**
 * Quantités en cartons, par quart de carton :
 *   1 carton = 24 bouteilles · ½ carton = 12 bouteilles · ¼ de carton = 6 bouteilles (un pack).
 * Un quart de carton se facture le quart du prix d'un carton.
 */
export const BOUTEILLES_PAR_CARTON = 24;
export const PAS_CARTON = 0.25;

/** Vrai si `q` est une quantité de cartons valide : positive, multiple de 0,25, et raisonnable. */
export function quantiteCartonValide(q: unknown, max = 100000): q is number {
  return typeof q === "number" && Number.isFinite(q) && q > 0 && q <= max && Number.isInteger(q * 4);
}

/** Ramène une saisie au quart de carton le plus proche (jamais négative). */
export function arrondirQuart(q: number): number {
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.round(q * 4) / 4;
}
/** Ancien nom, conservé pour les imports existants. */
export const arrondirDemi = arrondirQuart;

/** « 1,5 » / « 0,25 » / « 2 » : virgule décimale, pas de zéro inutile. */
export function formaterCartons(q: number): string {
  return String(arrondirQuart(Math.abs(q)) * (q < 0 ? -1 : 1)).replace(".", ",");
}

/** Nombre de bouteilles pour une quantité de cartons (24 par carton). */
export function enBouteilles(q: number): number {
  return Math.round(q * BOUTEILLES_PAR_CARTON);
}

/** « 6 bouteilles » / « 1 bouteille » / « 30 bouteilles ». */
export function formaterBouteilles(q: number): string {
  const n = enBouteilles(q);
  return `${n} bouteille${n > 1 ? "s" : ""}`;
}
