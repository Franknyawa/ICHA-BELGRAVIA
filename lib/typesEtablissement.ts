/**
 * Helpers d'affichage pour les types d'établissement (choix multiple) et le
 * répondant — partagés entre les pages admin, les exports et les PDF.
 * Aucune dépendance serveur : utilisable côté client.
 */

type TypeLie = { type?: { nom: string } | null };

type PointVenteTypes = {
  type?: { nom: string } | null;
  typesLies?: TypeLie[] | null;
  typeAutrePrecision?: string | null;
};

/** Noms de tous les types du point de vente (ancien type unique en repli). */
export function nomsTypes(pv: PointVenteTypes | null | undefined): string[] {
  if (!pv) return [];
  const lies = (pv.typesLies || []).map((t) => t.type?.nom).filter((n): n is string => !!n);
  const noms = lies.length > 0 ? lies : pv.type?.nom ? [pv.type.nom] : [];
  return noms.map((n) => (n === "Autre" && pv.typeAutrePrecision ? `Autre (${pv.typeAutrePrecision})` : n));
}

/** "Bar, Restaurant / Fast Food" — ou "—" si rien n'est renseigné. */
export function libelleTypes(pv: PointVenteTypes | null | undefined): string {
  const noms = nomsTypes(pv);
  if (noms.length > 0) return noms.join(", ");
  return pv?.typeAutrePrecision || "—";
}

export const LIBELLES_REPONDANT: Record<string, string> = {
  PATRON: "Patron",
  GERANT: "Gérant",
  GERANT_PATRON: "Gérant / patron",
  EMPLOYE: "Employé",
  AUTRE: "Autre",
};

export function libelleRepondant(repondant: string | null | undefined, precision?: string | null): string {
  if (!repondant) return "—";
  const base = LIBELLES_REPONDANT[repondant] || repondant;
  return repondant === "AUTRE" && precision ? `Autre (${precision})` : base;
}
