import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const villes = await prisma.ville.findMany({ orderBy: { nom: "asc" } });
  return NextResponse.json({ villes });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const { nom } = await req.json();
  if (!nom?.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  const existant = await prisma.ville.findUnique({ where: { nom } });
  if (existant) return NextResponse.json({ error: "Cette ville existe déjà." }, { status: 409 });
  const ville = await prisma.ville.create({ data: { nom } });
  return NextResponse.json({ id: ville.id });
}
