import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const marques = await prisma.marque.findMany({ orderBy: { ordre: "asc" } });
  return NextResponse.json({ marques });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const { nom } = await req.json();
  if (!nom?.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  const existant = await prisma.marque.findUnique({ where: { nom } });
  if (existant) return NextResponse.json({ error: "Cette marque existe déjà." }, { status: 409 });
  const marque = await prisma.marque.create({ data: { nom } });
  return NextResponse.json({ id: marque.id });
}
