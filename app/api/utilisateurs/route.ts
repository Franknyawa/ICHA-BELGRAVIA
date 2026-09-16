import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { role: "COMMERCIAL" },
    orderBy: { createdAt: "desc" },
    select: { id: true, identifiant: true, nom: true, prenom: true, telephone: true, actif: true, createdAt: true },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { identifiant, motDePasse, nom, prenom, telephone } = await req.json();
  if (!identifiant || !motDePasse || !nom || !prenom) {
    return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  }

  const existant = await prisma.user.findUnique({ where: { identifiant } });
  if (existant) return NextResponse.json({ error: "Cet identifiant existe déjà." }, { status: 409 });

  const passwordHash = await bcrypt.hash(motDePasse, 10);
  const user = await prisma.user.create({
    data: { identifiant, passwordHash, role: "COMMERCIAL", nom, prenom, telephone: telephone || null },
  });

  return NextResponse.json({ id: user.id });
}
