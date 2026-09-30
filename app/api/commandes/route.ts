import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { visiteEvents, NOUVELLE_COMMANDE } from "@/lib/events";
import { calculerCommande, calculerPaiement, type ModePaiementValue } from "@/lib/pricing";

type LigneEntree = { produitId: string; quantite: number };

/**
 * Création d'une commande + ses lignes, en une transaction. `uuidClient`
 * généré côté PWA avant tout appel réseau garantit l'idempotence si la
 * requête est rejouée après une coupure réseau (même principe que les
 * visites, voir app/api/visites/route.ts).
 *
 * Le prix appliqué N'EST JAMAIS celui envoyé par le client : chaque ligne
 * doit référencer un produit actif du référentiel (produitId obligatoire,
 * plus de saisie libre côté commercial), et le prix/carton est recalculé
 * ici à partir du barème PalierPrixCarton selon le volume total de la
 * commande — voir lib/pricing.ts. Le stock de chaque produit est décrémenté
 * dans la même transaction (voir MouvementStock).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const body = await req.json();
  const {
    uuidClient,
    pointVenteId,
    observations,
    dateLivraison,
    lignes,
    modePaiement,
    montantRecu: montantRecuSaisi,
    mobileMoneyConfirme,
  } = body as {
    uuidClient: string;
    pointVenteId: string;
    observations?: string;
    dateLivraison?: string;
    lignes: LigneEntree[];
    modePaiement: ModePaiementValue;
    montantRecu?: number;
    mobileMoneyConfirme?: boolean;
  };

  if (!uuidClient || !pointVenteId || !Array.isArray(lignes) || lignes.length === 0) {
    return NextResponse.json({ error: "Données incomplètes." }, { status: 400 });
  }
  if (!modePaiement) {
    return NextResponse.json({ error: "Mode de paiement requis." }, { status: 400 });
  }

  const existante = await prisma.commande.findUnique({ where: { uuidClient } });
  if (existante) {
    return NextResponse.json({ id: existante.id, dejaEnregistree: true });
  }

  const lignesValides = lignes.filter((l) => l.produitId && l.quantite > 0);
  if (lignesValides.length === 0) {
    return NextResponse.json({ error: "Au moins une ligne de produit valide est requise." }, { status: 400 });
  }

  // On regroupe par produit au cas où le même produit apparaîtrait sur
  // plusieurs lignes côté client (évite deux lignes distinctes en base pour
  // le même produit).
  const quantitesParProduit = new Map<string, number>();
  for (const l of lignesValides) {
    quantitesParProduit.set(l.produitId, (quantitesParProduit.get(l.produitId) || 0) + l.quantite);
  }
  const produitIds = [...quantitesParProduit.keys()];

  const [produits, paliers] = await Promise.all([
    prisma.produit.findMany({ where: { id: { in: produitIds }, actif: true } }),
    prisma.palierPrixCarton.findMany({ where: { actif: true }, orderBy: { cartonsMin: "asc" } }),
  ]);

  if (produits.length !== produitIds.length) {
    return NextResponse.json(
      { error: "Un ou plusieurs produits sélectionnés ne sont plus disponibles." },
      { status: 400 }
    );
  }
  if (paliers.length === 0) {
    return NextResponse.json(
      { error: "Aucun barème de prix configuré. Contactez l'administrateur." },
      { status: 500 }
    );
  }

  const lignesCalcul = [...quantitesParProduit.entries()].map(([produitId, quantite]) => ({
    produitId,
    quantite,
  }));

  const { prixCarton, montantTotal } = calculerCommande(
    lignesCalcul,
    paliers.map((p) => ({
      cartonsMin: p.cartonsMin,
      cartonsMax: p.cartonsMax,
      prixCarton: Number(p.prixCarton),
    }))
  );

  const { montantRecu, resteAPayer } = calculerPaiement(
    modePaiement,
    montantTotal,
    Number(montantRecuSaisi) || 0,
    !!mobileMoneyConfirme
  );

  const commande = await prisma.$transaction(async (tx) => {
    const c = await tx.commande.create({
      data: {
        uuidClient,
        pointVenteId,
        commercialId: session.userId,
        observations: observations || null,
        dateLivraison: dateLivraison ? new Date(dateLivraison) : null,
        montantTotal,
        modePaiement,
        mobileMoneyConfirme: !!mobileMoneyConfirme,
        montantRecu,
        resteAPayer,
      },
    });

    await tx.ligneCommande.createMany({
      data: lignesCalcul.map((l) => ({
        commandeId: c.id,
        produitId: l.produitId,
        quantite: l.quantite,
        prixUnitaire: prixCarton,
        sousTotal: l.quantite * prixCarton,
      })),
    });

    // Décrémente le stock de chaque produit et journalise le mouvement.
    // Le stock peut devenir négatif (pas de blocage de la vente terrain
    // pour une rupture non encore constatée en admin) — l'onglet Stock
    // signale ces cas plutôt que d'empêcher la prise de commande.
    for (const l of lignesCalcul) {
      await tx.stock.upsert({
        where: { produitId: l.produitId },
        update: { quantiteCartons: { decrement: l.quantite } },
        create: { produitId: l.produitId, quantiteCartons: -l.quantite, seuilAlerte: 20 },
      });
      await tx.mouvementStock.create({
        data: {
          produitId: l.produitId,
          type: "SORTIE",
          quantiteCartons: l.quantite,
          referenceType: "COMMANDE",
          referenceId: c.id,
        },
      });
    }

    return c;
  });

  const complet = await prisma.commande.findUnique({
    where: { id: commande.id },
    include: { pointVente: { include: { ville: true } }, commercial: true, lignes: { include: { produit: true } } },
  });

  visiteEvents.emit(NOUVELLE_COMMANDE, complet);

  return NextResponse.json({
    id: commande.id,
    dejaEnregistree: false,
    montantTotal,
    prixCarton,
    montantRecu,
    resteAPayer,
    numero: commande.id.slice(0, 8).toUpperCase(),
  });
}

/**
 * Listing paginé — usage admin (toutes les commandes, filtrable) ou usage
 * commercial (uniquement ses propres commandes, ex. pour retélécharger sa
 * facture depuis "Mes commandes" — voir app/(commercial)/terrain/commandes).
 * Un commercial ne peut jamais voir ni filtrer les commandes d'un collègue :
 * son commercialId de session écrase tout paramètre reçu.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 20;
  const commercialId =
    session.role === "COMMERCIAL" ? session.userId : searchParams.get("commercialId") || undefined;
  const villeId = searchParams.get("villeId") || undefined;
  const modePaiement = searchParams.get("modePaiement") || undefined;
  const statut = searchParams.get("statut") || undefined;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const where = {
    ...(commercialId ? { commercialId } : {}),
    ...(villeId ? { pointVente: { villeId } } : {}),
    ...(modePaiement ? { modePaiement: modePaiement as any } : {}),
    ...(statut ? { statut: statut as any } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
          },
        }
      : {}),
  };

  // Compteurs par statut (sur les mêmes filtres hors statut) — alimentent
  // les onglets "Non traitées / En cours de livraison / Livrées" côté admin,
  // pour afficher un badge sans requête séparée par onglet.
  const whereSansStatut = { ...where };
  delete (whereSansStatut as any).statut;

  const [total, items, comptesParStatut] = await Promise.all([
    prisma.commande.count({ where }),
    prisma.commande.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        pointVente: { include: { ville: true } },
        commercial: true,
        lignes: { include: { produit: true } },
      },
    }),
    prisma.commande.groupBy({ by: ["statut"], where: whereSansStatut, _count: true }),
  ]);

  const compteurs = { NON_TRAITEE: 0, EN_COURS_LIVRAISON: 0, LIVREE: 0 };
  for (const c of comptesParStatut as any[]) {
    compteurs[c.statut as keyof typeof compteurs] = c._count;
  }

  return NextResponse.json({ items, total, page, pageSize, compteurs });
}
