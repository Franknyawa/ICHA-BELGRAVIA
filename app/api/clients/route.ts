import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";
import { encaisseParCommande } from "@/lib/caisse";

export const dynamic = "force-dynamic";

/**
 * Clients = points de vente ayant passé au moins une commande.
 * Facturation = commandes validées (à livrer + livrées) ; reste = facturation − encaissements caisse.
 */
export async function GET() {
  const session = await getSession();
  if (!aAcces(session, "commandes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const commandes = await prisma.commande.findMany({
    select: { id: true, pointVenteId: true, statut: true, montantTotal: true, avoirsTotal: true, dateCommande: true },
  });
  const encaisse = await encaisseParCommande(commandes.map((c) => c.id));

  type Agg = { commandes: number; facture: number; encaisse: number; derniere: Date };
  const parPv = new Map<string, Agg>();
  for (const c of commandes) {
    const a = parPv.get(c.pointVenteId) || { commandes: 0, facture: 0, encaisse: 0, derniere: c.dateCommande };
    a.commandes += 1;
    if (c.statut !== "NON_TRAITEE") {
      a.facture += Number(c.montantTotal) - Number(c.avoirsTotal);
      a.encaisse += encaisse.get(c.id) || 0;
    }
    if (c.dateCommande > a.derniere) a.derniere = c.dateCommande;
    parPv.set(c.pointVenteId, a);
  }

  const points = await prisma.pointVente.findMany({
    where: { id: { in: [...parPv.keys()] } },
    select: {
      id: true,
      nomEtablissement: true,
      nomVendeur: true,
      telVendeur: true,
      nomPatron: true,
      telPatron: true,
      quartier: true,
      ville: { select: { nom: true } },
      type: { select: { nom: true } },
    },
  });

  const clients = points
    .map((p) => {
      const a = parPv.get(p.id)!;
      return {
        ...p,
        commandes: a.commandes,
        facture: a.facture,
        encaisse: a.encaisse,
        reste: Math.max(0, a.facture - a.encaisse),
        derniereCommande: a.derniere,
      };
    })
    .sort((x, y) => +new Date(y.derniereCommande) - +new Date(x.derniereCommande));

  return NextResponse.json({ clients });
}
