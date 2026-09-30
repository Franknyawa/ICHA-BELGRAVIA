import { NextRequest, NextResponse } from "next/server";
import { getSession, getDureeInactiviteMinutes, definirDureeInactiviteMinutes } from "@/lib/auth";

/**
 * Durée d'inactivité avant déconnexion automatique. Lecture ouverte à tout
 * utilisateur connecté (le commercial en a besoin côté client pour régler
 * son propre minuteur — voir components/InactivityLogout.tsx) ; seul
 * l'admin peut la modifier.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const minutes = await getDureeInactiviteMinutes();
  return NextResponse.json({ minutes });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { minutes } = await req.json().catch(() => ({}));
  const n = Number(minutes);
  if (!Number.isFinite(n) || n < 1 || n > 1440) {
    return NextResponse.json({ error: "La durée doit être comprise entre 1 et 1440 minutes (24h)." }, { status: 400 });
  }

  await definirDureeInactiviteMinutes(Math.round(n));
  return NextResponse.json({ ok: true, minutes: Math.round(n) });
}
