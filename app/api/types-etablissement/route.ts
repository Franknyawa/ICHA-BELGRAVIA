import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const types = await prisma.typeEtablissement.findMany({ orderBy: { ordre: "asc" } });
  return NextResponse.json({ types });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const { nom } = await req.json();
  if (!nom?.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  const existant = await prisma.typeEtablissement.findUnique({ where: { nom } });
  if (existant) return NextResponse.json({ error: "Ce type existe déjà." }, { status: 409 });
  const type = await prisma.typeEtablissement.create({ data: { nom } });
  return NextResponse.json({ id: type.id });
}
