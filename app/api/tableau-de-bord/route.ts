import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { assurerGammes } from "@/lib/gammes";

function debutJournee() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await assurerGammes();
  const debutJour = debutJournee();

  // Filtre optionnel de gamme : concerne uniquement les commandes et le CA ;
  // visites et points de vente ne sont pas rattachés à une gamme.
  const gammeId = new URL(req.url).searchParams.get("gammeId") || undefined;
  const whereGamme = gammeId ? { gammeId } : {};

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
    caParProduitRaw,
  ] = await Promise.all([
    prisma.visite.count({ where: { createdAt: { gte: debutJour } } }),
    prisma.pointVente.count(),
    prisma.commande.count({ where: { createdAt: { gte: debutJour }, ...whereGamme } }),
    prisma.commande.aggregate({ _sum: { montantTotal: true }, where: whereGamme }),
    prisma.commande.aggregate({ _sum: { montantTotal: true }, where: { createdAt: { gte: debutJour }, ...whereGamme } }),
    prisma.visite.count({ where: { interesseVisiteCommerciale: true } }),
    prisma.visite.count(),
    prisma.visite.groupBy({ by: ["potentielEstime"], _count: true }),
    prisma.pointVente.groupBy({ by: ["typeId"], _count: true }),
    prisma.pointVente.groupBy({ by: ["villeId"], _count: true }),
    prisma.visite.groupBy({ by: ["commercialId"], _count: true }),
    // Agrégation calculée par la base (SQL GROUP BY/SUM), plutôt que de
    // rapatrier CHAQUE ligne de commande jamais saisie pour les additionner
    // en JS : c'était la requête la plus lente du tableau de bord, et elle
    // ralentissait de plus en plus à mesure que l'historique grossissait.
    prisma.ligneCommande.groupBy({
      by: ["produitId"],
      _sum: { sousTotal: true },
      where: gammeId ? { commande: { gammeId } } : {},
    }),
  ]);

  const [types, villes, agents, produits] = await Promise.all([
    prisma.typeEtablissement.findMany(),
    prisma.ville.findMany(),
    prisma.user.findMany({ where: { role: "COMMERCIAL" } }),
    prisma.produit.findMany(),
  ]);

  const nomType = (id: string | null) => types.find((t) => t.id === id)?.nom || "Non renseigné";
  const nomVille = (id: string | null) => villes.find((v) => v.id === id)?.nom || "Non renseignée";
  const nomAgent = (id: string) => {
    const a = agents.find((u) => u.id === id);
    return a ? `${a.prenom} ${a.nom}` : "—";
  };

  const nomProduit = (id: string | null) => produits.find((p) => p.id === id)?.nom || "Produit libre";
  const caParProduit = new Map<string, number>();
  for (const l of caParProduitRaw) {
    const nom = nomProduit(l.produitId);
    caParProduit.set(nom, (caParProduit.get(nom) || 0) + Number(l._sum.sousTotal || 0));
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
