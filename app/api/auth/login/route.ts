import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { identifiant, motDePasse } = await req.json();

  if (!identifiant || !motDePasse) {
    return NextResponse.json({ error: "Identifiant et mot de passe requis." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { identifiant } });

  if (!user || !user.actif || !(await bcrypt.compare(motDePasse, user.passwordHash))) {
    return NextResponse.json({ error: "Identifiants incorrects." }, { status: 401 });
  }

  await createSession(user.id, user.role, user.nom, user.prenom);

  return NextResponse.json({ role: user.role });
}
