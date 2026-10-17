import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";

/** Révoque une session précise (un seul appareil/navigateur) — bouton "Déconnecter". */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!aAcces(session, "utilisateurs")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await prisma.session.update({ where: { id: params.id }, data: { revoked: true } });
  return NextResponse.json({ ok: true });
}
