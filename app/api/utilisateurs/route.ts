import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const role = req.nextUrl.searchParams.get("role"); // "ADMIN" | "COMMERCIAL" | absent = tous

  const users = await prisma.user.findMany({
    where: role ? { role: role as "ADMIN" | "COMMERCIAL" } : {},
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      identifiant: true,
      nom: true,
      prenom: true,
      telephone: true,
      role: true,
      actif: true,
      createdAt: true,
      villeId: true,
    },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { identifiant, motDePasse, nom, prenom, telephone, role, villeId } = await req.json();
  if (!identifiant || !motDePasse || !nom || !prenom || !role) {
    return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  }
  if (role !== "ADMIN" && role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  const existant = await prisma.user.findUnique({ where: { identifiant } });
  if (existant) return NextResponse.json({ error: "Cet identifiant existe déjà." }, { status: 409 });

  const passwordHash = await bcrypt.hash(motDePasse, 10);
  const user = await prisma.user.create({
    data: { identifiant, passwordHash, role, nom, prenom, telephone: telephone || null, villeId: villeId || null },
  });

  return NextResponse.json({ id: user.id });
}
