import { NextRequest, NextResponse } from "next/server";
import { archiver, lireConfig } from "@/lib/archivage";

export const dynamic = "force-dynamic";

/**
 * Archivage automatique quotidien (déclenché par vercel.json). Vercel envoie
 * `Authorization: Bearer <CRON_SECRET>` : sans cette variable d'environnement,
 * la route refuse tout. Ne fait rien si l'archivage automatique est désactivé.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const config = await lireConfig();
  if (!config.auto) return NextResponse.json({ ok: true, ignore: "archivage automatique désactivé" });
  const compteurs = await archiver(config.jours, true);
  return NextResponse.json({ ok: true, compteurs });
}
