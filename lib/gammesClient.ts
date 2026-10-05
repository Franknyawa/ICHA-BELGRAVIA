/** Utilitaires gammes utilisables côté navigateur (lib/gammes.ts, lui, touche à la base). */

export type GammeInfo = { id: string; code: string; nom: string };

const LIBELLES_COURTS: Record<string, string> = {
  BELGRAVIA: "Belgravia",
  VDV: "VDV",
};

/** Libellé court affiché dans les onglets et badges (Belgravia / VDV). */
export function libelleGamme(g: Pick<GammeInfo, "code" | "nom"> | null | undefined): string {
  if (!g) return "—";
  return LIBELLES_COURTS[g.code] || g.nom.split(" — ")[0];
}

/** Style du badge de gamme (couleurs distinctes pour repérer d'un coup d'œil). */
export function styleBadgeGamme(code: string | null | undefined): string {
  return code === "VDV" ? "bg-warn/10 text-warn" : "bg-brass/10 text-brass";
}
