import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { peut } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Prix du carton négociés avec un client (un par gamme) : proposés d'office à la saisie d'une commande. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "COMMERCIAL" && !peut(session.role, "commandes"))) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }
  const pointVenteId = new URL(req.url).searchParams.get("pointVenteId");
  if (!pointVenteId) return NextResponse.json({ prix: [] });
  const prix = await prisma.prixClient.findMany({ where: { pointVenteId }, select: { gammeId: true, prixCarton: true } });
  return NextResponse.json({ prix: prix.map((p) => ({ gammeId: p.gammeId, prixCarton: Number(p.prixCarton) })) });
}
