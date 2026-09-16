import type { Prisma, PotentielEstime } from "@prisma/client";

/**
 * Construit le filtre Prisma des visites à partir des paramètres de requête,
 * partagé entre le listing paginé (/api/visites) et l'export CSV
 * (/api/visites/export) pour que "exporter" respecte toujours exactement les
 * filtres actifs à l'écran.
 */
export function construireFiltreVisites(searchParams: URLSearchParams): Prisma.VisiteWhereInput {
  const villeId = searchParams.get("villeId") || undefined;
  const typeId = searchParams.get("typeId") || undefined;
  const potentiel = searchParams.get("potentiel") || undefined;
  const commercialId = searchParams.get("commercialId") || undefined;
  const veutCommander = searchParams.get("veutCommander") || undefined;
  const q = searchParams.get("q") || undefined;
  const dateFrom = searchParams.get("dateFrom") || undefined;
  const dateTo = searchParams.get("dateTo") || undefined;

  const createdAt: Prisma.DateTimeFilter = {};
  if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00`);
  if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59`);

  return {
    ...(potentiel ? { potentielEstime: potentiel as PotentielEstime } : {}),
    ...(commercialId ? { commercialId } : {}),
    ...(veutCommander ? { veutCommander: veutCommander === "oui" } : {}),
    ...(dateFrom || dateTo ? { createdAt } : {}),
    pointVente: {
      ...(villeId ? { villeId } : {}),
      ...(typeId ? { typeId } : {}),
      ...(q ? { nomEtablissement: { contains: q, mode: "insensitive" as const } } : {}),
    },
  };
}
