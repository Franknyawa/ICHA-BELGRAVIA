import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";
import { dateValide, debutJour, ajouterJours } from "@/lib/dates";

/** Historique paginé des mouvements de stock, filtrable par produit. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!aAcces(session, "stock")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 25;
  const produitId = searchParams.get("produitId") || undefined;

  const du = dateValide(searchParams.get("dateFrom")) ? debutJour(searchParams.get("dateFrom") as string) : null;
  const au = dateValide(searchParams.get("dateTo")) ? debutJour(ajouterJours(searchParams.get("dateTo") as string, 1)) : null;
  const periode = du || au ? { createdAt: { ...(du ? { gte: du } : {}), ...(au ? { lt: au } : {}) } } : {};
  // Filtre « type de mouvement » : les ventes sont des SORTIE liées à une commande, les retours clients des ENTREE « RETOUR ».
  const FILTRES: Record<string, object> = {
    ENTREE: { type: "ENTREE", NOT: { referenceType: "RETOUR" } },
    VENTE: { type: "SORTIE", referenceType: "COMMANDE" },
    RETOUR: { referenceType: "RETOUR" },
    AVARIE: { referenceType: "AVARIE" },
    ECHANTILLON: { referenceType: "ECHANTILLON" },
    GIFT: { referenceType: "GIFT" },
    AJUSTEMENT: { type: "AJUSTEMENT" },
  };
  const filtreType = FILTRES[searchParams.get("type") || ""] ?? {};

  const where = { archiveeLe: null, ...(produitId ? { produitId } : {}), ...periode, ...filtreType };

  const [total, items, horsVente] = await Promise.all([
    prisma.mouvementStock.count({ where }),
    prisma.mouvementStock.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { produit: { select: { nom: true } } },
    }),
    // Sorties hors vente de la période choisie (mêmes dates que l'historique).
    prisma.mouvementStock.groupBy({
      by: ["referenceType"],
      where: { archiveeLe: null, referenceType: { in: ["AVARIE", "ECHANTILLON", "GIFT"] }, ...periode },
      _sum: { quantiteCartons: true },
      _count: { _all: true },
    }),
  ]);

  const hv = (t: string) => {
    const g = horsVente.find((r) => r.referenceType === t);
    return { cartons: g?._sum.quantiteCartons ?? 0, operations: g?._count._all ?? 0 };
  };
  return NextResponse.json({ items, total, page, pageSize, horsVente: { AVARIE: hv("AVARIE"), ECHANTILLON: hv("ECHANTILLON"), GIFT: hv("GIFT") } });
}
