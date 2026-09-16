import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const p = await prisma.pointVente.findUnique({
    where: { id: params.id },
    include: { ville: true },
  });
  if (!p) return NextResponse.json({ error: "Point de vente introuvable." }, { status: 404 });

  return NextResponse.json({
    id: p.id,
    nomEtablissement: p.nomEtablissement,
    nomVendeur: p.nomVendeur,
    telVendeur: p.telVendeur,
    quartier: p.quartier,
    ville: p.ville?.nom || null,
  });
}
