import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Liste compacte des points de vente les plus récents, mise en cache sur le
 * téléphone (service worker) pour que l'agent puisse choisir un client et
 * saisir une commande SANS connexion. Même forme que /api/points-vente/recherche.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const points = await prisma.pointVente.findMany({
    orderBy: { createdAt: "desc" },
    take: 600,
    include: { ville: true },
  });

  return NextResponse.json({
    points: points.map((p) => ({
      id: p.id,
      nomEtablissement: p.nomEtablissement,
      nomVendeur: p.nomVendeur,
      telVendeur: p.telVendeur,
      quartier: p.quartier,
      repereQuartier: p.repereQuartier,
      ville: p.ville?.nom || null,
    })),
  });
}
