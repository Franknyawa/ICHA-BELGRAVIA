import { prisma } from "./prisma";

/**
 * Nombre de points de vente par type d'établissement, en comptant CHAQUE
 * type d'un établissement multi-types (ex. un bar-restaurant compte dans
 * Bar et dans Restaurant). Les anciens points de vente, saisis avant le choix
 * multiple, n'ont pas de liaison : ils sont comptés via leur type principal.
 */
export async function compterParType(): Promise<{ typeId: string | null; count: number }[]> {
  const [lies, anciens] = await Promise.all([
    prisma.pointVenteType.groupBy({ by: ["typeId"], _count: true }),
    prisma.pointVente.groupBy({ by: ["typeId"], where: { typesLies: { none: {} } }, _count: true }),
  ]);
  const total = new Map<string | null, number>();
  for (const l of lies) total.set(l.typeId, (total.get(l.typeId) || 0) + l._count);
  for (const a of anciens) total.set(a.typeId, (total.get(a.typeId) || 0) + a._count);
  return [...total.entries()].map(([typeId, count]) => ({ typeId, count }));
}
