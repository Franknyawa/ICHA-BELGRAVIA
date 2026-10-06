import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Sondage léger pour l'admin : combien de visites / commandes ont été créées
 * depuis `since` ? Deux COUNT indexés (createdAt) — quelques millisecondes.
 * L'horloge renvoyée (`maintenant`) vient du serveur, pour ne dépendre
 * d'aucune horloge de téléphone ou d'ordinateur mal réglée.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const maintenant = new Date();
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  if (!since || Number.isNaN(since.getTime())) {
    return NextResponse.json({ visites: 0, commandes: 0, maintenant: maintenant.toISOString() });
  }

  const [visites, commandes] = await Promise.all([
    prisma.visite.count({ where: { createdAt: { gt: since } } }),
    prisma.commande.count({ where: { createdAt: { gt: since } } }),
  ]);

  return NextResponse.json({ visites, commandes, maintenant: maintenant.toISOString() });
}
