/**
 * Niveaux d'accès. Un seul endroit décrit qui peut faire quoi : le menu, le
 * middleware, les pages et les API s'appuient tous sur ce fichier (sans
 * dépendance serveur : utilisable côté client et dans le middleware).
 *
 * - COMMERCIAL  : application terrain uniquement (/terrain), inchangée.
 * - SUPERVISEUR : visites terrain, points de vente, stock.
 * - ADMIN       : tout, sauf la gestion des utilisateurs et des paramètres.
 * - SUPER_ADMIN : contrôle total.
 */
export type RoleApp = "COMMERCIAL" | "SUPERVISEUR" | "ADMIN" | "SUPER_ADMIN";

export type Module =
  | "tableau_de_bord"
  | "visites"
  | "alertes"
  | "commandes" // commandes + factures
  | "points_de_vente"
  | "rapports"
  | "carte"
  | "tracking"
  | "stock"
  | "caisse"
  | "archives"
  | "produits"
  | "utilisateurs"
  | "parametres";

const TOUS: Module[] = [
  "tableau_de_bord", "visites", "alertes", "commandes", "points_de_vente", "rapports",
  "carte", "tracking", "stock", "caisse", "archives", "produits", "utilisateurs", "parametres",
];

const ACCES: Record<RoleApp, readonly Module[]> = {
  COMMERCIAL: [],
  SUPERVISEUR: ["visites", "points_de_vente", "stock"],
  ADMIN: TOUS.filter((m) => m !== "utilisateurs" && m !== "parametres"),
  SUPER_ADMIN: TOUS,
};

export const LIBELLE_ROLE: Record<RoleApp, string> = {
  COMMERCIAL: "Commercial",
  SUPERVISEUR: "Superviseur",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super admin",
};

export const DESCRIPTION_ROLE: Record<RoleApp, string> = {
  COMMERCIAL: "Application terrain : recensement, commandes.",
  SUPERVISEUR: "Visites terrain, points de vente et stock.",
  ADMIN: "Tout, sauf la gestion des utilisateurs et des paramètres.",
  SUPER_ADMIN: "Contrôle total.",
};

export const ROLES: RoleApp[] = ["COMMERCIAL", "SUPERVISEUR", "ADMIN", "SUPER_ADMIN"];

function estRole(r: unknown): r is RoleApp {
  return r === "COMMERCIAL" || r === "SUPERVISEUR" || r === "ADMIN" || r === "SUPER_ADMIN";
}

export function peut(role: string | null | undefined, module: Module): boolean {
  return estRole(role) && ACCES[role].includes(module);
}

/** Tout rôle qui n'est pas COMMERCIAL travaille dans le back-office. */
export function estBackOffice(role: string | null | undefined): boolean {
  return estRole(role) && role !== "COMMERCIAL";
}

/** Vrai si la session existe et a accès au module (sert de garde de type dans les API). */
export function aAcces<S extends { role: string } | null | undefined>(session: S, module: Module): session is NonNullable<S> {
  return !!session && peut(session.role, module);
}

/** Pages du back-office, de la plus précise à la plus large. */
const PAGES: { prefixe: string; module: Module }[] = [
  { prefixe: "/tableau-de-bord", module: "tableau_de_bord" },
  { prefixe: "/dashboard", module: "visites" },
  { prefixe: "/alertes", module: "alertes" },
  { prefixe: "/commandes", module: "commandes" },
  { prefixe: "/factures", module: "commandes" },
  { prefixe: "/points-de-vente", module: "points_de_vente" },
  { prefixe: "/rapports", module: "rapports" },
  { prefixe: "/statistiques", module: "carte" },
  { prefixe: "/tracking", module: "tracking" },
  { prefixe: "/stock", module: "stock" },
  { prefixe: "/caisse", module: "caisse" },
  { prefixe: "/archives", module: "archives" },
  { prefixe: "/produits", module: "produits" },
  { prefixe: "/utilisateurs", module: "utilisateurs" },
  { prefixe: "/parametres", module: "parametres" },
];

export const PREFIXES_BACK_OFFICE = PAGES.map((p) => p.prefixe);

export function moduleDePage(pathname: string): Module | null {
  const p = PAGES.find((x) => pathname === x.prefixe || pathname.startsWith(x.prefixe + "/"));
  return p ? p.module : null;
}

/** Première page à ouvrir après connexion (ou si l'accès demandé est refusé). */
export function accueilPourRole(role: string | null | undefined): string {
  if (role === "COMMERCIAL") return "/terrain";
  if (peut(role, "tableau_de_bord")) return "/tableau-de-bord";
  const premiere = PAGES.find((p) => peut(role, p.module));
  return premiere ? premiere.prefixe : "/login";
}
