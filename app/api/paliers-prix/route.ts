import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { assurerGammes } from "@/lib/gammes";

/**
 * Barème de prix au carton par palier de volume — modifiable depuis
 * l'admin (Paramètres), jamais codé en dur dans le formulaire de commande
 * (voir lib/pricing.ts pour le calcul appliqué à chaque commande).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await assurerGammes();
  const gammeId = new URL(req.url).searchParams.get("gammeId") || undefined;
  const paliers = await prisma.palierPrixCarton.findMany({
    where: gammeId ? { gammeId } : {},
    orderBy: { cartonsMin: "asc" },
  });
  return NextResponse.json({ paliers });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { cartonsMin, cartonsMax, prixCarton, gammeId } = await req.json();
  if (cartonsMin === undefined || prixCarton === undefined) {
    return NextResponse.json({ error: "Cartons minimum et prix requis." }, { status: 400 });
  }

  const dernierOrdre = await prisma.palierPrixCarton.count();
  const palier = await prisma.palierPrixCarton.create({
    data: {
      cartonsMin: parseInt(cartonsMin, 10),
      cartonsMax: cartonsMax === null || cartonsMax === "" ? null : parseInt(cartonsMax, 10),
      prixCarton,
      gammeId: gammeId || null,
      ordre: dernierOrdre + 1,
    },
  });
  return NextResponse.json({ id: palier.id });
}

/**
 * Remplace tout le barème d'une gamme d'un coup (ex. nouvelle grille
 * tarifaire). Les commandes existantes ne sont pas touchées : elles
 * conservent le prix/carton enregistré au moment de la saisie.
 */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { gammeId, paliers } = await req.json();
  if (!gammeId || !Array.isArray(paliers) || paliers.length === 0) {
    return NextResponse.json({ error: "Gamme et paliers requis." }, { status: 400 });
  }
  const propres = paliers.map((p: any, i: number) => ({
    cartonsMin: parseInt(p.cartonsMin, 10),
    cartonsMax: p.cartonsMax === null || p.cartonsMax === "" || p.cartonsMax === undefined ? null : parseInt(p.cartonsMax, 10),
    prixCarton: Number(p.prixCarton),
    ordre: i + 1,
  }));
  if (propres.some((p: any) => !Number.isFinite(p.cartonsMin) || !Number.isFinite(p.prixCarton) || p.prixCarton < 0)) {
    return NextResponse.json({ error: "Palier invalide." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.palierPrixCarton.deleteMany({ where: { gammeId } }),
    prisma.palierPrixCarton.createMany({ data: propres.map((p: any) => ({ ...p, gammeId })) }),
  ]);
  return NextResponse.json({ ok: true });
}
