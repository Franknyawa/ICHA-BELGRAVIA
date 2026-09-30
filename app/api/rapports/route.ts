import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { genererRapport, type GroupBy } from "@/lib/rapports";

const GROUPES_VALIDES: GroupBy[] = ["commercial", "pointVente", "ville", "quartier", "vente"];

/**
 * Rapports admin — un seul endpoint, paramétré par `groupBy`, pour les 5
 * vues (par commercial / point de vente / ville / quartier / détail des
 * ventes) avec les mêmes filtres communs (période, agent, ville, quartier)
 * — voir lib/rapports.ts pour la logique de regroupement.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const groupByParam = searchParams.get("groupBy") || "commercial";
  if (!GROUPES_VALIDES.includes(groupByParam as GroupBy)) {
    return NextResponse.json({ error: "Catégorie de rapport invalide." }, { status: 400 });
  }

  const resultat = await genererRapport(groupByParam as GroupBy, {
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
    commercialId: searchParams.get("commercialId") || undefined,
    villeId: searchParams.get("villeId") || undefined,
    quartier: searchParams.get("quartier") || undefined,
  });

  return NextResponse.json(resultat);
}
