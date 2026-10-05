import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { assurerGammes } from "@/lib/gammes";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await assurerGammes();
  const produits = await prisma.produit.findMany({ orderBy: { ordre: "asc" }, include: { gamme: true } });
  return NextResponse.json({ produits });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await assurerGammes();
  const { nom, prixUnitaire, volumeMl, gammeId } = await req.json();
  if (!nom || prixUnitaire === undefined) {
    return NextResponse.json({ error: "Nom et prix requis." }, { status: 400 });
  }

  const existant = await prisma.produit.findUnique({ where: { nom } });
  if (existant) return NextResponse.json({ error: "Ce produit existe déjà." }, { status: 409 });

  const produit = await prisma.produit.create({
    data: { nom, prixUnitaire, volumeMl: volumeMl || 275, gammeId: gammeId || null },
  });
  // Une ligne de stock vide est créée en même temps, pour que le nouveau
  // produit apparaisse immédiatement dans l'onglet admin Stock plutôt que
  // d'y être absent jusqu'au premier mouvement.
  await prisma.stock.create({ data: { produitId: produit.id, quantiteCartons: 0, seuilAlerte: 20 } });
  return NextResponse.json({ id: produit.id });
}
