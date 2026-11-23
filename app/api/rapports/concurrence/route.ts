import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";
import { genererRapportConcurrence } from "@/lib/concurrence";

export const dynamic = "force-dynamic";

/** Marques relevées dans les points de vente : présence (nombre, %), prix moyen/min/max, par catégorie. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!aAcces(session, "rapports")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const p = new URL(req.url).searchParams;
  const rapport = await genererRapportConcurrence({
    dateFrom: p.get("dateFrom"),
    dateTo: p.get("dateTo"),
    villeId: p.get("villeId"),
    quartier: p.get("quartier")?.trim() || null,
    pointVenteId: p.get("pointVenteId"),
    potentiel: p.get("potentiel"),
  });
  return NextResponse.json(rapport);
}
