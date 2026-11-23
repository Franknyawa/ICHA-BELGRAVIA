/**
 * Nombre entier avec espace insécable (U+00A0) comme séparateur de milliers.
 * `toLocaleString("fr-FR")` utilise l'espace fine insécable U+202F, absente de
 * certaines polices (Plus Jakarta Sans) : les chiffres s'affichaient collés.
 */
export function nombreFr(n: number | string): string {
  return Math.round(Number(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
