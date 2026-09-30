import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** Marque une alerte comme résolue — bouton "Résolue". */
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const alerte = await prisma.alerte.update({ where: { id: params.id }, data: { resolue: true } });
  return NextResponse.json(alerte);
}
