import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** Historique paginé des mouvements de stock, filtrable par produit. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 25;
  const produitId = searchParams.get("produitId") || undefined;

  const where = produitId ? { produitId } : {};

  const [total, items] = await Promise.all([
    prisma.mouvementStock.count({ where }),
    prisma.mouvementStock.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { produit: { select: { nom: true } } },
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
