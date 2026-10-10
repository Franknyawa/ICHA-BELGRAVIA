import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { GroupBy } from "@/lib/rapports";
import { detailRapport } from "@/lib/rapportDetail";

const GROUPES_VALIDES: GroupBy[] = ["commercial", "pointVente", "ville", "quartier", "vente", "produit", "historique"];

/** Détail d'une ligne de rapport (aperçu + impression individuelle). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const groupBy = searchParams.get("groupBy") as GroupBy;
  const id = searchParams.get("id");
  if (!GROUPES_VALIDES.includes(groupBy) || !id) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const detail = await detailRapport(groupBy, id, {
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
    commercialId: searchParams.get("commercialId") || undefined,
    villeId: searchParams.get("villeId") || undefined,
    quartier: searchParams.get("quartier") || undefined,
    gammeId: searchParams.get("gammeId") || undefined,
    produitId: searchParams.get("produitId") || undefined,
  });
  if (!detail) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(detail);
}
