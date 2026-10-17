import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces, estBackOffice, peut, ROLES, type RoleApp } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !estBackOffice(session.role)) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const role = req.nextUrl.searchParams.get("role"); // un rôle, ou absent = tous
  if (role !== null && !ROLES.includes(role as RoleApp)) return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });

  // Les filtres « commercial » des pages (visites, rapports, tracking…) n'ont besoin que
  // de la liste des commerciaux, sans coordonnées : ouverte à tout le back-office.
  // La liste complète des comptes est réservée à la gestion des utilisateurs.
  if (!peut(session.role, "utilisateurs")) {
    if (role !== "COMMERCIAL") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    const commerciaux = await prisma.user.findMany({
      where: { role: "COMMERCIAL" },
      orderBy: { createdAt: "desc" },
      select: { id: true, identifiant: true, nom: true, prenom: true, role: true, actif: true, villeId: true },
    });
    return NextResponse.json({ users: commerciaux });
  }

  const users = await prisma.user.findMany({
    where: role ? { role: role as RoleApp } : {},
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
  if (!aAcces(session, "utilisateurs")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { identifiant, motDePasse, nom, prenom, telephone, role, villeId } = await req.json();
  if (!identifiant || !motDePasse || !nom || !prenom || !role) {
    return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  if (typeof motDePasse !== "string" || motDePasse.length < 8) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, { status: 400 });
  }

  const existant = await prisma.user.findUnique({ where: { identifiant } });
  if (existant) return NextResponse.json({ error: "Cet identifiant existe déjà." }, { status: 409 });

  const passwordHash = await bcrypt.hash(motDePasse, 12);
  const user = await prisma.user.create({
    data: { identifiant, passwordHash, role, nom, prenom, telephone: telephone || null, villeId: villeId || null },
  });

  return NextResponse.json({ id: user.id });
}
