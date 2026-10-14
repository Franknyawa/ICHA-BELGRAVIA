import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { intervalleJours } from "@/lib/dates";
import { TYPES_ARCHIVE, type TypeArchive } from "@/lib/archivage";

export const dynamic = "force-dynamic";

const TAILLE = 20;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str) && Number.isNaN(Number(str))) str = "'" + str;
  return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Données archivées d'un type (visites | commandes | mouvements) : liste paginée ou export CSV complet. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") as TypeArchive;
  if (!TYPES_ARCHIVE.includes(type)) return NextResponse.json({ error: "Type invalide." }, { status: 400 });

  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const q = sp.get("q")?.trim() || undefined;
  const intervalle = intervalleJours(sp.get("du"), sp.get("au"));
  const csv = sp.get("format") === "csv";
  const pagination: { skip?: number; take?: number } = csv ? {} : { skip: (page - 1) * TAILLE, take: TAILLE };
  const base = { archiveeLe: { not: null as null }, ...(intervalle ? { createdAt: intervalle } : {}) };

  if (type === "visites") {
    const where = { ...base, ...(q ? { pointVente: { nomEtablissement: { contains: q, mode: "insensitive" as const } } } : {}) };
    const [total, rows] = await Promise.all([
      prisma.visite.count({ where }),
      prisma.visite.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pagination,
        include: { pointVente: { include: { ville: true } }, commercial: { select: { nom: true, prenom: true } } },
      }),
    ]);
    const items = rows.map((v) => ({
      id: v.id,
      date: v.createdAt.toISOString(),
      archiveeLe: v.archiveeLe,
      titre: v.pointVente.nomEtablissement,
      detail: [v.pointVente.ville?.nom, v.pointVente.quartier].filter(Boolean).join(" · ") || "—",
      agent: `${v.commercial.prenom} ${v.commercial.nom}`,
      info: v.potentielEstime ? `Potentiel : ${v.potentielEstime}` : "—",
      lien: `/dashboard/${v.id}`,
    }));
    return reponse(csv, type, total, items, page);
  }

  if (type === "commandes") {
    const where = { ...base, ...(q ? { pointVente: { nomEtablissement: { contains: q, mode: "insensitive" as const } } } : {}) };
    const [total, rows] = await Promise.all([
      prisma.commande.count({ where }),
      prisma.commande.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pagination,
        include: {
          pointVente: { include: { ville: true } },
          commercial: true,
          gamme: true,
          lignes: { include: { produit: true } },
        },
      }),
    ]);
    const items = rows.map((c) => ({
      id: c.id,
      date: c.createdAt.toISOString(),
      archiveeLe: c.archiveeLe,
      titre: c.pointVente.nomEtablissement,
      detail: `${c.lignes.reduce((s, l) => s + l.quantite, 0)} cartons · ${c.modePaiement}`,
      agent: `${c.commercial.prenom} ${c.commercial.nom}`,
      info: `${Number(c.montantTotal).toLocaleString("fr-FR")} FCFA`,
      commande: csv ? undefined : c,
    }));
    return reponse(csv, type, total, items, page);
  }

  const where = { ...base, ...(q ? { produit: { nom: { contains: q, mode: "insensitive" as const } } } : {}) };
  const [total, rows] = await Promise.all([
    prisma.mouvementStock.count({ where }),
    prisma.mouvementStock.findMany({ where, orderBy: { createdAt: "desc" }, ...pagination, include: { produit: { select: { nom: true } } } }),
  ]);
  const items = rows.map((m) => ({
    id: m.id,
    date: m.createdAt.toISOString(),
    archiveeLe: m.archiveeLe,
    titre: m.produit.nom,
    detail: m.type === "SORTIE" ? "Sortie" : m.type === "ENTREE" ? "Entrée" : "Ajustement",
    agent: "—",
    info: `${m.type === "SORTIE" ? "-" : m.quantiteCartons >= 0 ? "+" : ""}${m.quantiteCartons} carton(s)${m.note ? ` — ${m.note}` : ""}`,
  }));
  return reponse(csv, type, total, items, page);
}

type Item = { id: string; date: string; archiveeLe: Date | null; titre: string; detail: string; agent: string; info: string };

function reponse(csv: boolean, type: TypeArchive, total: number, items: Item[], page: number) {
  if (!csv) return NextResponse.json({ items, total, page, pageSize: TAILLE });
  const entete = ["Date", "Élément", "Détail", "Agent", "Information", "Archivé le"];
  const lignes = items.map((i) =>
    [
      new Date(i.date).toLocaleString("fr-FR"),
      i.titre,
      i.detail,
      i.agent,
      i.info,
      i.archiveeLe ? new Date(i.archiveeLe).toLocaleDateString("fr-FR") : "",
    ]
      .map(csvEscape)
      .join(";")
  );
  const corps = "﻿" + [entete.join(";"), ...lignes].join("\r\n");
  return new NextResponse(corps, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="archives-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
