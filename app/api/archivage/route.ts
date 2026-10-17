import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { peut } from "@/lib/permissions";
import {
  JOURS_MAX,
  JOURS_MIN,
  TYPES_ARCHIVE,
  apercu,
  archiver,
  ecrireConfig,
  lireConfig,
  lireDernier,
  restaurer,
  totauxArchives,
  type TypeArchive,
} from "@/lib/archivage";

export const dynamic = "force-dynamic";

async function admin() {
  const s = await getSession();
  return s && peut(s.role, "archives") ? s : null;
}

export async function GET(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const config = await lireConfig();
  // Aperçu pour une durée proposée (?jours=) sans la modifier.
  const demande = Number(new URL(req.url).searchParams.get("jours"));
  const joursApercu = Number.isFinite(demande) && demande >= JOURS_MIN && demande <= JOURS_MAX ? demande : config.jours;
  const [aArchiver, archives, dernier] = await Promise.all([apercu(joursApercu), totauxArchives(), lireDernier()]);
  return NextResponse.json({ config, joursApercu, aArchiver, archives, dernier });
}

/** Réglage : durée de conservation (jours) et archivage automatique quotidien. */
export async function PATCH(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const patch: { jours?: number; auto?: boolean } = {};
  if (b.jours !== undefined) {
    const j = Math.round(Number(b.jours));
    if (!Number.isFinite(j) || j < JOURS_MIN || j > JOURS_MAX) {
      return NextResponse.json({ error: `La durée doit être comprise entre ${JOURS_MIN} et ${JOURS_MAX} jours.` }, { status: 400 });
    }
    patch.jours = j;
  }
  if (b.auto !== undefined) patch.auto = !!b.auto;
  await ecrireConfig(patch);
  return NextResponse.json({ ok: true, config: await lireConfig() });
}

/** { action: "archiver" } ou { action: "restaurer", type, ids? } */
export async function POST(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const b = await req.json().catch(() => ({}));

  if (b.action === "archiver") {
    const config = await lireConfig();
    const compteurs = await archiver(config.jours, false);
    return NextResponse.json({ ok: true, compteurs });
  }

  if (b.action === "restaurer") {
    const type = b.type as TypeArchive;
    if (!TYPES_ARCHIVE.includes(type)) return NextResponse.json({ error: "Type invalide." }, { status: 400 });
    const ids = Array.isArray(b.ids) ? b.ids.filter((x: unknown) => typeof x === "string") : undefined;
    if (ids && ids.length === 0) return NextResponse.json({ error: "Rien à restaurer." }, { status: 400 });
    const n = await restaurer(type, ids);
    return NextResponse.json({ ok: true, restaures: n });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
