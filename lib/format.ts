/**
 * Nombre avec espace insécable (U+00A0) comme séparateur de milliers.
 * `toLocaleString("fr-FR")` utilise l'espace fine insécable U+202F, absente de
 * certaines polices (Plus Jakarta Sans) : les chiffres s'affichaient collés.
 * Les montants sont arrondis au franc ; seuls les demi-cartons (x,5) gardent leur décimale.
 */
export function nombreFr(n: number | string): string {
  const v = Number(n);
  const demi = Number.isFinite(v) && !Number.isInteger(v) && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
  const groupes = (x: number) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (!demi) return groupes(Math.round(v));
  const signe = v < 0 ? "-" : "";
  return `${signe}${groupes(Math.trunc(Math.abs(v)))},5`;
}
