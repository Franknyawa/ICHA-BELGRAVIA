/**
 * Dates "métier" : toutes les notions de "jour" de l'application se calculent
 * à l'heure du Cameroun (UTC+1, sans heure d'été), jamais à l'heure du
 * serveur (Vercel tourne en UTC : "minuit" y tomberait à 1 h du matin chez nous).
 */
export const DECALAGE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * 60 * 60 * 1000;

/** Format AAAA-MM-JJ du jour courant (heure du Cameroun). */
export function aujourdhuiISO(): string {
  return new Date(Date.now() + DECALAGE_MS).toISOString().slice(0, 10);
}

/** Instant UTC correspondant à 00:00 (Cameroun) du jour "AAAA-MM-JJ". */
export function debutJour(iso: string): Date {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j) - DECALAGE_MS);
}

/** Début (inclus) du jour courant, heure du Cameroun. */
export function debutAujourdhui(): Date {
  return debutJour(aujourdhuiISO());
}

/** Ajoute n jours à une date AAAA-MM-JJ. */
export function ajouterJours(iso: string, n: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j) + n * JOUR_MS).toISOString().slice(0, 10);
}

export function dateValide(iso: string | null | undefined): iso is string {
  return !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso));
}

/**
 * Intervalle [gte, lt[ pour un filtre "du … au …" (jours inclus, heure du
 * Cameroun). Retourne undefined si aucune borne n'est valide.
 */
export function intervalleJours(du?: string | null, au?: string | null): { gte?: Date; lt?: Date } | undefined {
  const r: { gte?: Date; lt?: Date } = {};
  if (dateValide(du)) r.gte = debutJour(du);
  if (dateValide(au)) r.lt = debutJour(ajouterJours(au, 1));
  return r.gte || r.lt ? r : undefined;
}
