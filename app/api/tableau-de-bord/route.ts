import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function debutJournee() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const debutJour = debutJournee();

  const [
    visitesAujourdhui,
    pointVenteTotal,
    commandesAujourdhui,
    commandesAgg,
    commandesAggJour,
    interessesTotal,
    visitesTotal,
    parPotentiel,
    parType,
    parVille,
    parAgentRaw,
    lignesCommande,
  ] = await Promise.all([
    prisma.visite.count({ where: { createdAt: { gte: debutJour } } }),
    prisma.pointVente.count(),
    prisma.commande.count({ where: { createdAt: { gte: debutJour } } }),
    prisma.commande.aggregate({ _sum: { montantTotal: true } }),
    prisma.commande.aggregate({ _sum: { montantTotal: true }, where: { createdAt: { gte: debutJour } } }),
    prisma.visite.count({ where: { interesseVisiteCommerciale: true } }),
    prisma.visite.count(),
    prisma.visite.groupBy({ by: ["potentielEstime"], _count: true }),
    prisma.pointVente.groupBy({ by: ["typeId"], _count: true }),
    prisma.pointVente.groupBy({ by: ["villeId"], _count: true }),
    prisma.visite.groupBy({ by: ["commercialId"], _count: true }),
    prisma.ligneCommande.findMany({ include: { produit: true } }),
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

  const caParProduit = new Map<string, number>();
  for (const l of lignesCommande) {
    const nom = l.produit?.nom || "Produit libre";
    caParProduit.set(nom, (caParProduit.get(nom) || 0) + Number(l.sousTotal));
  }

  return NextResponse.json({
    visitesAujourdhui,
    pointVenteTotal,
    commandesAujourdhui,
    caTotal: Number(commandesAgg._sum.montantTotal || 0),
    caDuJour: Number(commandesAggJour._sum.montantTotal || 0),
    interessesTotal,
    visitesTotal,
    tauxConversion: visitesTotal ? Math.round((interessesTotal / visitesTotal) * 100) : 0,
    parPotentiel: parPotentiel.map((p) => ({ label: p.potentielEstime || "Non qualifié", valeur: p._count })),
    parType: parType.map((t) => ({ label: nomType(t.typeId), valeur: t._count })).sort((a, b) => b.valeur - a.valeur).slice(0, 8),
    parVille: parVille.map((v) => ({ label: nomVille(v.villeId), valeur: v._count })).sort((a, b) => b.valeur - a.valeur).slice(0, 8),
    parAgent: parAgentRaw.map((a) => ({ label: nomAgent(a.commercialId), valeur: a._count })).sort((a, b) => b.valeur - a.valeur).slice(0, 8),
    caParProduit: Array.from(caParProduit.entries()).map(([label, valeur]) => ({ label, valeur })).sort((a, b) => b.valeur - a.valeur).slice(0, 8),
  });
}
