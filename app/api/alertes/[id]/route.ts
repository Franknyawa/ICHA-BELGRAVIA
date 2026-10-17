import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aEcriture } from "@/lib/permissions";

/** Marque une alerte comme résolue — bouton "Résolue". */
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!aEcriture(session, "alertes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const alerte = await prisma.alerte.update({ where: { id: params.id }, data: { resolue: true } });
  return NextResponse.json(alerte);
}
