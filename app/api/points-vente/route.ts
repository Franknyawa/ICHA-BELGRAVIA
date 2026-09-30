import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Listing paginé des points de vente pour l'admin — sert à la fois d'annuaire
 * "points de vente" et de "fiches clients" (voir app/(admin)/points-de-vente),
 * BELGRAVIA n'ayant pas de modèle Client séparé : le point de vente porte
 * déjà l'ensemble des coordonnées du client (nom, tél. vendeur/patron).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 20;
  const villeId = searchParams.get("villeId") || undefined;
  const typeId = searchParams.get("typeId") || undefined;
  const quartier = searchParams.get("quartier") || undefined;
  const q = searchParams.get("q") || undefined;
  // Pagination normale côté API, mais le PDF/impression a besoin de TOUTES
  // les lignes correspondant aux filtres, pas seulement la page affichée.
  const toutesLesLignes = searchParams.get("toutesLesLignes") === "1";

  const where = {
    ...(villeId ? { villeId } : {}),
    ...(typeId ? { typeId } : {}),
    ...(quartier ? { quartier: { contains: quartier, mode: "insensitive" as const } } : {}),
    ...(q
      ? {
          OR: [
            { nomEtablissement: { contains: q, mode: "insensitive" as const } },
            { nomVendeur: { contains: q, mode: "insensitive" as const } },
            { telVendeur: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.pointVente.count({ where }),
    prisma.pointVente.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(toutesLesLignes ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      include: {
        ville: true,
        type: true,
        createdBy: { select: { nom: true, prenom: true } },
        _count: { select: { visites: true, commandes: true } },
      },
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
