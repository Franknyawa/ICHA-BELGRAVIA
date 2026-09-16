import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const { nom, actif } = await req.json();
  const type = await prisma.typeEtablissement.update({
    where: { id: params.id },
    data: { ...(nom !== undefined ? { nom } : {}), ...(actif !== undefined ? { actif } : {}) },
  });
  return NextResponse.json({ id: type.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  try {
    await prisma.typeEtablissement.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Impossible de supprimer : des points de vente utilisent ce type. Désactivez-le plutôt." },
        { status: 409 }
      );
    }
    throw e;
  }
}
