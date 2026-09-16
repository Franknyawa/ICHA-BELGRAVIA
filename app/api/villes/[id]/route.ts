import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const { nom, actif } = await req.json();
  const ville = await prisma.ville.update({
    where: { id: params.id },
    data: { ...(nom !== undefined ? { nom } : {}), ...(actif !== undefined ? { actif } : {}) },
  });
  return NextResponse.json({ id: ville.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  try {
    await prisma.ville.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Impossible de supprimer : des points de vente ou utilisateurs utilisent cette ville. Désactivez-la plutôt." },
        { status: 409 }
      );
    }
    throw e;
  }
}
