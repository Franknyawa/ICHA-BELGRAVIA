import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { visiteEvents, NOUVELLE_COMMANDE } from "@/lib/events";

type LigneEntree = {
  produitId?: string;
  libelleLibre?: string;
  quantite: number;
  prixUnitaire: number;
};

/**
 * Création d'une commande + ses lignes, en une transaction. `uuidClient`
 * généré côté PWA avant tout appel réseau garantit l'idempotence si la
 * requête est rejouée après une coupure réseau (même principe que les
 * visites, voir app/api/visites/route.ts).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const body = await req.json();
  const { uuidClient, pointVenteId, observations, lignes } = body as {
    uuidClient: string;
    pointVenteId: string;
    observations?: string;
    lignes: LigneEntree[];
  };

  if (!uuidClient || !pointVenteId || !Array.isArray(lignes) || lignes.length === 0) {
    return NextResponse.json({ error: "Données incomplètes." }, { status: 400 });
  }

  const existante = await prisma.commande.findUnique({ where: { uuidClient } });
  if (existante) {
    return NextResponse.json({ id: existante.id, dejaEnregistree: true });
  }

  const lignesValides = lignes.filter((l) => l.quantite > 0 && (l.produitId || l.libelleLibre));
  if (lignesValides.length === 0) {
    return NextResponse.json({ error: "Au moins une ligne de produit valide est requise." }, { status: 400 });
  }

  const montantTotal = lignesValides.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);

  const commande = await prisma.$transaction(async (tx) => {
    const c = await tx.commande.create({
      data: {
        uuidClient,
        pointVenteId,
        commercialId: session.userId,
        observations: observations || null,
        montantTotal,
      },
    });

    await tx.ligneCommande.createMany({
      data: lignesValides.map((l) => ({
        commandeId: c.id,
        produitId: l.produitId || null,
        libelleLibre: l.libelleLibre || null,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        sousTotal: l.quantite * l.prixUnitaire,
      })),
    });

    return c;
  });

  const complet = await prisma.commande.findUnique({
    where: { id: commande.id },
    include: { pointVente: true, lignes: { include: { produit: true } } },
  });

  visiteEvents.emit(NOUVELLE_COMMANDE, complet);

  return NextResponse.json({ id: commande.id, dejaEnregistree: false });
}

/** Listing paginé pour le dashboard admin. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 20;

  const [total, items] = await Promise.all([
    prisma.commande.count(),
    prisma.commande.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        pointVente: { include: { ville: true } },
        commercial: true,
        lignes: { include: { produit: true } },
      },
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
