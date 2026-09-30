import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listAlertes } from "@/lib/alertes";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const type = req.nextUrl.searchParams.get("type") || undefined;
  const [alertes, toutes] = await Promise.all([listAlertes(type), type ? listAlertes() : Promise.resolve(null)]);

  // `toutes` (non filtré) alimente les compteurs par type dans les onglets
  // de filtre, sans avoir à refaire une requête séparée par onglet.
  return NextResponse.json({ alertes, toutes: toutes ?? alertes });
}
