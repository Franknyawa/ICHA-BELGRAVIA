import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function plages() {
  const now = new Date();

  const debutJour = new Date(now);
  debutJour.setHours(0, 0, 0, 0);

  const jourSemaine = (now.getDay() + 6) % 7; // 0 = lundi
  const debutSemaine = new Date(now);
  debutSemaine.setDate(now.getDate() - jourSemaine);
  debutSemaine.setHours(0, 0, 0, 0);

  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);

  return { debutJour, debutSemaine, debutMois };
}

/**
 * Tableau de bord du commercial connecté : nombre de visites recensées par
 * période (jour/semaine/mois), et deux listes de suivi — points intéressés
 * par une visite commerciale, et points souhaitant passer commande — pour
 * que l'agent sache où revenir en priorité.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { debutJour, debutSemaine, debutMois } = plages();
  const commercialId = session.userId;

  const [jour, semaine, mois, interessesTotal, commandesTotal, interessesRecents, commandesRecentes] =
    await Promise.all([
      prisma.visite.count({ where: { commercialId, createdAt: { gte: debutJour } } }),
      prisma.visite.count({ where: { commercialId, createdAt: { gte: debutSemaine } } }),
      prisma.visite.count({ where: { commercialId, createdAt: { gte: debutMois } } }),
      prisma.visite.count({ where: { commercialId, interesseVisiteCommerciale: true } }),
      prisma.visite.count({ where: { commercialId, veutCommander: true } }),
      prisma.visite.findMany({
        where: { commercialId, interesseVisiteCommerciale: true },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: { pointVente: true },
      }),
      prisma.visite.findMany({
        where: { commercialId, veutCommander: true },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: { pointVente: true },
      }),
    ]);

  return NextResponse.json({
    stats: { jour, semaine, mois },
    interesses: { total: interessesTotal, items: interessesRecents },
    commandes: { total: commandesTotal, items: commandesRecentes },
  });
}
