import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Sessions actives d'un utilisateur — panneau "Sessions actives" de
 * app/(admin)/utilisateurs/page.tsx, même principe que le projet HYPO/HTC
 * (lib/auth/session.ts : révocation immédiate, pas seulement expiration
 * naturelle du JWT).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const sessions = await prisma.session.findMany({
    where: { userId: params.id, revoked: false, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true },
  });
  return NextResponse.json({ sessions });
}

/** Déconnecte l'utilisateur de partout d'un coup ("Déconnecter partout"). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await prisma.session.updateMany({
    where: { userId: params.id, revoked: false },
    data: { revoked: true },
  });
  return NextResponse.json({ ok: true });
}
