import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const { nom, actif } = await req.json();
  const marque = await prisma.marque.update({
    where: { id: params.id },
    data: { ...(nom !== undefined ? { nom } : {}), ...(actif !== undefined ? { actif } : {}) },
  });
  return NextResponse.json({ id: marque.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  try {
    await prisma.marque.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Impossible de supprimer : cette marque est référencée dans des visites. Désactivez-la plutôt." },
        { status: 409 }
      );
    }
    throw e;
  }
}
