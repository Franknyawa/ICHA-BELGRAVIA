import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  // Le commercial ne récupère qu'un résumé léger (pré-remplissage du
  // formulaire terrain) ; l'admin reçoit la fiche complète (historique
  // visites + commandes) — c'est la "fiche client" demandée côté admin.
  if (session.role === "COMMERCIAL") {
    const p = await prisma.pointVente.findUnique({ where: { id: params.id }, include: { ville: true } });
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

  const p = await prisma.pointVente.findUnique({
    where: { id: params.id },
    include: {
      ville: true,
      type: true,
      typesLies: { include: { type: true } },
      createdBy: { select: { nom: true, prenom: true } },
      visites: {
        orderBy: { dateVisite: "desc" },
        include: { commercial: { select: { nom: true, prenom: true } } },
      },
      commandes: {
        orderBy: { createdAt: "desc" },
        include: {
          commercial: { select: { nom: true, prenom: true } },
          lignes: { include: { produit: true } },
        },
      },
      // Photos prises sur le terrain pour ce point de vente (voir
      // lib/storage.ts) — l'admin doit pouvoir les consulter ici, ce qui
      // manquait jusque-là : la relation n'était même pas chargée.
      photos: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) return NextResponse.json({ error: "Point de vente introuvable." }, { status: 404 });

  return NextResponse.json({ pointVente: p });
}
