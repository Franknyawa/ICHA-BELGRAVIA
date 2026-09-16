import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { prixUnitaire, actif } = await req.json();
  const produit = await prisma.produit.update({
    where: { id: params.id },
    data: {
      ...(prixUnitaire !== undefined ? { prixUnitaire } : {}),
      ...(actif !== undefined ? { actif } : {}),
    },
  });
  return NextResponse.json({ id: produit.id });
}
