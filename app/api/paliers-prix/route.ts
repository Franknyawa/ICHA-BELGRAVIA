import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Barème de prix au carton par palier de volume — modifiable depuis
 * l'admin (Paramètres), jamais codé en dur dans le formulaire de commande
 * (voir lib/pricing.ts pour le calcul appliqué à chaque commande).
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const paliers = await prisma.palierPrixCarton.findMany({ orderBy: { cartonsMin: "asc" } });
  return NextResponse.json({ paliers });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { cartonsMin, cartonsMax, prixCarton } = await req.json();
  if (cartonsMin === undefined || prixCarton === undefined) {
    return NextResponse.json({ error: "Cartons minimum et prix requis." }, { status: 400 });
  }

  const dernierOrdre = await prisma.palierPrixCarton.count();
  const palier = await prisma.palierPrixCarton.create({
    data: {
      cartonsMin: parseInt(cartonsMin, 10),
      cartonsMax: cartonsMax === null || cartonsMax === "" ? null : parseInt(cartonsMax, 10),
      prixCarton,
      ordre: dernierOrdre + 1,
    },
  });
  return NextResponse.json({ id: palier.id });
}
