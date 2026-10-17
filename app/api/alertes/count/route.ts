import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";
import { countAlertesActives } from "@/lib/alertes";

/** Alimente le badge "Alertes" du menu admin. */
export async function GET() {
  const session = await getSession();
  if (!aAcces(session, "alertes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const count = await countAlertesActives();
  return NextResponse.json({ count });
}
