import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Pastille « Stock » du menu : produits actifs au seuil d'alerte ou en dessous (rupture comprise). */
export async function GET() {
  const session = await getSession();
  if (!aAcces(session, "stock")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const stocks = await prisma.stock.findMany({ where: { produit: { actif: true } }, select: { quantiteCartons: true, seuilAlerte: true } });
  return NextResponse.json({ count: stocks.filter((s) => s.quantiteCartons <= s.seuilAlerte).length });
}
