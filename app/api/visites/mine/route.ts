import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Visites du commercial connecté — par défaut celles du jour (comportement
 * historique, utilisé par l'accueil terrain), ou sur les N derniers jours
 * via ?jours=7 (utilisé par la page Historique).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const jours = parseInt(req.nextUrl.searchParams.get("jours") || "0", 10);

  const depuis = new Date();
  if (jours > 0) {
    depuis.setDate(depuis.getDate() - (jours - 1));
    depuis.setHours(0, 0, 0, 0);
  } else {
    depuis.setHours(0, 0, 0, 0);
  }

  const visites = await prisma.visite.findMany({
    where: { commercialId: session.userId, createdAt: { gte: depuis } },
    orderBy: { createdAt: "desc" },
    include: { pointVente: true },
  });

  return NextResponse.json({ visites });
}
