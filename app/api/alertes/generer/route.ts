import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";
import { genererToutesLesAlertes } from "@/lib/alertes";

/** Génération manuelle depuis l'admin — bouton "Générer maintenant". */
export async function POST() {
  const session = await getSession();
  if (!aAcces(session, "alertes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await genererToutesLesAlertes();
  return NextResponse.json({ ok: true });
}
