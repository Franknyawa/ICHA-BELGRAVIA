import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  const visites = await prisma.visite.findMany({
    where: { commercialId: session.userId, createdAt: { gte: debutJournee } },
    orderBy: { createdAt: "desc" },
    include: { pointVente: true },
  });

  return NextResponse.json({ visites });
}
