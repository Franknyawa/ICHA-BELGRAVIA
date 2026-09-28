import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Rapport de performance par commercial : nb de points de vente recensés,
 * nb de visites, nb de commandes, montant total vendu, reste à payer en
 * cours. Filtrable par période — aucun chiffre n'est codé en dur, tout est
 * recalculé à partir des tables Visite/Commande/PointVente.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const dateFilter =
    dateFrom || dateTo
      ? {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
        }
      : undefined;

  const commerciaux = await prisma.user.findMany({
    where: { role: "COMMERCIAL" },
    orderBy: [{ nom: "asc" }],
    select: { id: true, nom: true, prenom: true, actif: true },
  });

  const rapports = await Promise.all(
    commerciaux.map(async (c) => {
      const [pointsVenteRecenses, visites, commandes, agg] = await Promise.all([
        prisma.pointVente.count({
          where: { createdById: c.id, ...(dateFilter ? { createdAt: dateFilter } : {}) },
        }),
        prisma.visite.count({
          where: { commercialId: c.id, ...(dateFilter ? { createdAt: dateFilter } : {}) },
        }),
        prisma.commande.count({
          where: { commercialId: c.id, ...(dateFilter ? { createdAt: dateFilter } : {}) },
        }),
        prisma.commande.aggregate({
          where: { commercialId: c.id, ...(dateFilter ? { createdAt: dateFilter } : {}) },
          _sum: { montantTotal: true, resteAPayer: true },
        }),
      ]);

      return {
        commercial: { id: c.id, nom: c.nom, prenom: c.prenom, actif: c.actif },
        pointsVenteRecenses,
        visites,
        commandes,
        montantTotal: agg._sum.montantTotal || 0,
        resteAPayer: agg._sum.resteAPayer || 0,
      };
    })
  );

  rapports.sort((a, b) => Number(b.montantTotal) - Number(a.montantTotal));

  return NextResponse.json({ rapports });
}
