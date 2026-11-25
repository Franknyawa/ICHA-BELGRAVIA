/**
 * Nombre avec espace insécable (U+00A0) comme séparateur de milliers.
 * `toLocaleString("fr-FR")` utilise l'espace fine insécable U+202F, absente de
 * certaines polices (Plus Jakarta Sans) : les chiffres s'affichaient collés.
 * Les montants sont arrondis au franc ; seuls les quarts de carton (x,25 ; x,5 ; x,75) gardent leur décimale.
 */
export function nombreFr(n: number | string): string {
  const v = Number(n);
  const groupes = (x: number) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  // Quarts de carton (x,25 ; x,5 ; x,75) : on garde la décimale ; tout le reste est arrondi au franc.
  const quart = Number.isFinite(v) && !Number.isInteger(v) && Math.abs(v * 4 - Math.round(v * 4)) < 1e-9;
  if (!quart) return groupes(Math.round(v));
  const signe = v < 0 ? "-" : "";
  const dec = String(Math.round((Math.abs(v) - Math.trunc(Math.abs(v))) * 100)).padStart(2, "0").replace(/0$/, "");
  return `${signe}${groupes(Math.trunc(Math.abs(v)))},${dec}`;
}
