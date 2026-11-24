import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces, aEcriture } from "@/lib/permissions";
import { aujourdhuiISO, debutJour } from "@/lib/dates";

export const dynamic = "force-dynamic";

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function bornes(mois: string) {
  const [a, m] = mois.split("-").map(Number);
  const suivant = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return { debut: debutJour(`${mois}-01`), fin: debutJour(`${suivant}-01`), jours: new Date(a, m, 0).getDate() };
}

/**
 * Objectifs mensuels par commercial + réalisé du mois (heure du Cameroun).
 * Réalisé : chiffre d'affaires et cartons = commandes validées (à livrer + livrées) ;
 * nouveaux PV = points de vente recensés ; visites = visites terrain enregistrées.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!aAcces(session, "objectifs")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const demande = new URL(req.url).searchParams.get("mois");
  const aujourdhui = aujourdhuiISO();
  const mois = demande && MOIS_RE.test(demande) ? demande : aujourdhui.slice(0, 7);
  const { debut, fin, jours } = bornes(mois);

  const [commerciaux, objectifs, commandes, pvs, visites] = await Promise.all([
    prisma.user.findMany({ where: { role: "COMMERCIAL", actif: true }, select: { id: true, nom: true, prenom: true }, orderBy: { nom: "asc" } }),
    prisma.objectifCommercial.findMany({ where: { mois } }),
    prisma.commande.findMany({
      where: { statut: { not: "NON_TRAITEE" }, dateCommande: { gte: debut, lt: fin } },
      select: { commercialId: true, montantTotal: true, lignes: { select: { quantite: true } } },
    }),
    prisma.pointVente.groupBy({ by: ["createdById"], where: { estDivers: false, createdAt: { gte: debut, lt: fin } }, _count: { _all: true } }),
    prisma.visite.groupBy({ by: ["commercialId"], where: { dateVisite: { gte: debut, lt: fin } }, _count: { _all: true } }),
  ]);

  const real = new Map<string, { ca: number; commandes: number; cartons: number }>();
  for (const c of commandes) {
    const r = real.get(c.commercialId) || { ca: 0, commandes: 0, cartons: 0 };
    r.ca += Number(c.montantTotal);
    r.commandes += 1;
    r.cartons += c.lignes.reduce((s, l) => s + l.quantite, 0);
    real.set(c.commercialId, r);
  }
  const nbPv = new Map(pvs.map((x) => [x.createdById, x._count._all]));
  const nbVis = new Map(visites.map((x) => [x.commercialId, x._count._all]));
  const obj = new Map(objectifs.map((o) => [o.commercialId, o]));

  const estCourant = mois === aujourdhui.slice(0, 7);
  const avancement = estCourant ? Math.min(1, Number(aujourdhui.slice(8, 10)) / jours) : mois < aujourdhui.slice(0, 7) ? 1 : 0;

  return NextResponse.json({
    mois,
    avancement,
    lignes: commerciaux.map((u) => {
      const o = obj.get(u.id);
      const r = real.get(u.id) || { ca: 0, commandes: 0, cartons: 0 };
      return {
        commercial: u,
        objectif: {
          chiffreAffaires: Number(o?.chiffreAffaires ?? 0),
          nouveauxPv: o?.nouveauxPv ?? 0,
          visites: o?.visites ?? 0,
          commandes: o?.commandes ?? 0,
          cartons: o?.cartons ?? 0,
        },
        realise: { chiffreAffaires: r.ca, nouveauxPv: nbPv.get(u.id) || 0, visites: nbVis.get(u.id) || 0, commandes: r.commandes, cartons: r.cartons },
      };
    }),
  });
}

/** Enregistre (ou remplace) les objectifs d'un commercial pour un mois. Admin / super admin. */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!aEcriture(session, "objectifs")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b || typeof b.commercialId !== "string" || typeof b.mois !== "string" || !MOIS_RE.test(b.mois)) {
    return NextResponse.json({ error: "Commercial et mois (AAAA-MM) requis." }, { status: 400 });
  }
  const champs = ["chiffreAffaires", "nouveauxPv", "visites", "commandes", "cartons"] as const;
  const data: Record<string, number> = {};
  for (const k of champs) {
    const v = Number(b[k] ?? 0);
    if (!Number.isFinite(v) || v < 0 || v > 1e12 || (k !== "chiffreAffaires" && !Number.isInteger(v))) {
      return NextResponse.json({ error: `Valeur invalide pour « ${k} » : nombre positif${k === "chiffreAffaires" ? "" : " entier"} requis.` }, { status: 400 });
    }
    data[k] = v;
  }
  const u = await prisma.user.findUnique({ where: { id: b.commercialId }, select: { role: true } });
  if (!u || u.role !== "COMMERCIAL") return NextResponse.json({ error: "Commercial introuvable." }, { status: 404 });

  await prisma.objectifCommercial.upsert({
    where: { commercialId_mois: { commercialId: b.commercialId, mois: b.mois } },
    create: { commercialId: b.commercialId, mois: b.mois, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
