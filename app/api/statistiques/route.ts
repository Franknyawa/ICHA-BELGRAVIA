import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const [total, parPotentiel, parType, parVille, parAgent, interesses, veulentCommander] = await Promise.all([
    prisma.visite.count(),
    prisma.visite.groupBy({ by: ["potentielEstime"], _count: true }),
    prisma.pointVente.groupBy({ by: ["typeId"], _count: true }),
    prisma.pointVente.groupBy({ by: ["villeId"], _count: true }),
    prisma.visite.groupBy({ by: ["commercialId"], _count: true }),
    prisma.visite.count({ where: { interesseVisiteCommerciale: true } }),
    prisma.visite.count({ where: { veutCommander: true } }),
  ]);

  const [types, villes, agents] = await Promise.all([
    prisma.typeEtablissement.findMany(),
    prisma.ville.findMany(),
    prisma.user.findMany({ where: { role: "COMMERCIAL" } }),
  ]);

  const nomType = (id: string | null) => types.find((t) => t.id === id)?.nom || "Non renseigné";
  const nomVille = (id: string | null) => villes.find((v) => v.id === id)?.nom || "Non renseignée";
  const nomAgent = (id: string) => {
    const a = agents.find((u) => u.id === id);
    return a ? `${a.prenom} ${a.nom}` : "—";
  };

  return NextResponse.json({
    total,
    interesses,
    veulentCommander,
    parPotentiel: parPotentiel.map((p) => ({ label: p.potentielEstime || "Non qualifié", count: p._count })),
    parType: parType.map((t) => ({ label: nomType(t.typeId), count: t._count })).sort((a, b) => b.count - a.count),
    parVille: parVille.map((v) => ({ label: nomVille(v.villeId), count: v._count })).sort((a, b) => b.count - a.count),
    parAgent: parAgent.map((a) => ({ label: nomAgent(a.commercialId), count: a._count })).sort((a, b) => b.count - a.count),
  });
}
