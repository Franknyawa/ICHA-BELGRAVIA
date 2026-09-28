import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { cartonsMin, cartonsMax, prixCarton, actif } = await req.json();
  const palier = await prisma.palierPrixCarton.update({
    where: { id: params.id },
    data: {
      ...(cartonsMin !== undefined ? { cartonsMin: parseInt(cartonsMin, 10) } : {}),
      ...(cartonsMax !== undefined ? { cartonsMax: cartonsMax === null || cartonsMax === "" ? null : parseInt(cartonsMax, 10) } : {}),
      ...(prixCarton !== undefined ? { prixCarton } : {}),
      ...(actif !== undefined ? { actif } : {}),
    },
  });
  return NextResponse.json({ id: palier.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  try {
    await prisma.palierPrixCarton.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: "Impossible de supprimer ce palier." }, { status: 409 });
    }
    throw e;
  }
}
