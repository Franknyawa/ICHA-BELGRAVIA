import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";
import { CATEGORIES_ENCAISSEMENT } from "@/lib/caisse";

export const dynamic = "force-dynamic";

/** Profil client : fiche, commandes, encaissements (relevé) et dates de passage. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!aAcces(session, "commandes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const pv = await prisma.pointVente.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      nomEtablissement: true,
      nomVendeur: true,
      telVendeur: true,
      nomPatron: true,
      telPatron: true,
      quartier: true,
      repereQuartier: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      ville: { select: { nom: true } },
      type: { select: { nom: true } },
      createdBy: { select: { nom: true, prenom: true } },
      visites: { select: { id: true, dateVisite: true, commercial: { select: { nom: true, prenom: true } } }, orderBy: { dateVisite: "desc" } },
      commandes: {
        orderBy: { dateCommande: "desc" },
        select: {
          id: true,
          dateCommande: true,
          livreeLe: true,
          statut: true,
          montantTotal: true,
          modePaiement: true,
          commercial: { select: { nom: true, prenom: true } },
          lignes: { select: { quantite: true, libelleLibre: true, produit: { select: { nom: true } } } },
        },
      },
    },
  });
  if (!pv) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  if (pv.commandes.length === 0) return NextResponse.json({ error: "Ce point de vente n'a encore passé aucune commande." }, { status: 404 });

  const ops = await prisma.operationCaisse.findMany({
    where: { categorie: { in: [...CATEGORIES_ENCAISSEMENT] }, commandeId: { in: pv.commandes.map((c) => c.id) } },
    select: { id: true, commandeId: true, montant: true, libelle: true, modePaiement: true, moyen: true, dateOperation: true },
    orderBy: { dateOperation: "asc" },
  });

  return NextResponse.json({
    client: {
      ...pv,
      latitude: pv.latitude ? Number(pv.latitude) : null,
      longitude: pv.longitude ? Number(pv.longitude) : null,
      commandes: pv.commandes.map((c) => ({ ...c, montantTotal: Number(c.montantTotal) })),
    },
    encaissements: ops.map((o) => ({ ...o, montant: Number(o.montant) })),
  });
}
