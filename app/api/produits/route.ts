import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const produits = await prisma.produit.findMany({ orderBy: { ordre: "asc" } });
  return NextResponse.json({ produits });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { nom, prixUnitaire } = await req.json();
  if (!nom || prixUnitaire === undefined) {
    return NextResponse.json({ error: "Nom et prix requis." }, { status: 400 });
  }

  const existant = await prisma.produit.findUnique({ where: { nom } });
  if (existant) return NextResponse.json({ error: "Ce produit existe déjà." }, { status: 409 });

  const produit = await prisma.produit.create({ data: { nom, prixUnitaire } });
  return NextResponse.json({ id: produit.id });
}
