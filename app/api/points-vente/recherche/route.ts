import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Recherche de points de vente par nom, pour la sélection du client au
 * moment de prendre une commande depuis le bouton "Nouvelle commande" de la
 * page d'accueil (hors enchaînement direct après une visite).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json({ points: [] });

  const points = await prisma.pointVente.findMany({
    where: { nomEtablissement: { contains: q, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { ville: true },
  });

  return NextResponse.json({
    points: points.map((p) => ({
      id: p.id,
      nomEtablissement: p.nomEtablissement,
      nomVendeur: p.nomVendeur,
      telVendeur: p.telVendeur,
      quartier: p.quartier,
      ville: p.ville?.nom || null,
    })),
  });
}
