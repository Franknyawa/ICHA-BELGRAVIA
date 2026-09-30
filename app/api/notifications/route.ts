import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** Liste des notifications du commercial connecté (les plus récentes en premier). */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const notifications = await prisma.notification.findMany({
    where: { commercialId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ notifications });
}

/** Marque une notification (ou toutes) comme lue. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { id, toutes } = await req.json();

  if (toutes) {
    await prisma.notification.updateMany({
      where: { commercialId: session.userId, lu: false },
      data: { lu: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  await prisma.notification.updateMany({
    where: { id, commercialId: session.userId },
    data: { lu: true },
  });
  return NextResponse.json({ ok: true });
}
