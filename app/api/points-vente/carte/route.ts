import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const points = await prisma.pointVente.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true,
      nomEtablissement: true,
      statut: true,
      latitude: true,
      longitude: true,
      visites: { select: { potentielEstime: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 500,
  });

  return NextResponse.json({
    points: points.map((p) => ({
      id: p.id,
      nom: p.nomEtablissement,
      statut: p.statut,
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      potentiel: p.visites[0]?.potentielEstime || null,
    })),
  });
}
