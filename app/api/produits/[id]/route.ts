import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { nom, prixUnitaire, actif, volumeMl, gammeId } = await req.json();
  const produit = await prisma.produit.update({
    where: { id: params.id },
    data: {
      ...(nom !== undefined ? { nom } : {}),
      ...(prixUnitaire !== undefined ? { prixUnitaire } : {}),
      ...(actif !== undefined ? { actif } : {}),
      ...(volumeMl !== undefined ? { volumeMl } : {}),
      ...(gammeId !== undefined ? { gammeId: gammeId || null } : {}),
    },
  });
  return NextResponse.json({ id: produit.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  try {
    await prisma.produit.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Impossible de supprimer : ce produit figure dans des commandes. Désactivez-le plutôt." },
        { status: 409 }
      );
    }
    throw e;
  }
}
