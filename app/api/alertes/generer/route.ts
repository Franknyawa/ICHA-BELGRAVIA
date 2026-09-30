import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { genererToutesLesAlertes } from "@/lib/alertes";

/** Génération manuelle depuis l'admin — bouton "Générer maintenant". */
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await genererToutesLesAlertes();
  return NextResponse.json({ ok: true });
}
