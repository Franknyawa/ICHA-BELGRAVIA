import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { visiteEvents, NOUVELLE_VISITE } from "@/lib/events";

/**
 * Création d'un point de vente + de sa visite de recensement en une seule
 * transaction. `uuidClient` est généré côté PWA avant tout appel réseau :
 * si la requête est rejouée après une coupure, la contrainte @unique sur
 * Visite.uuidClient empêche le doublon (idempotence terrain, §6 CDC).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const body = await req.json();
  const {
    uuidClient,
    dateVisite,
    pointVente,
    offrePotentiel,
    qualification,
    marquesPresentes, // [{ marqueId?: string, libelleLibre?: string }]
    photos, // [{ uuidClient: string, url: string }]
  } = body;

  if (!uuidClient || !pointVente?.nomEtablissement) {
    return NextResponse.json({ error: "Données incomplètes." }, { status: 400 });
  }

  const existante = await prisma.visite.findUnique({ where: { uuidClient } });
  if (existante) {
    return NextResponse.json({ id: existante.id, dejaEnregistree: true });
  }

  const visite = await prisma.$transaction(async (tx) => {
    const pv = await tx.pointVente.create({
      data: {
        nomEtablissement: pointVente.nomEtablissement,
        nomVendeur: pointVente.nomVendeur || null,
        telVendeur: pointVente.telVendeur || null,
        telPatron: pointVente.telPatron || null,
        villeId: pointVente.villeId || null,
        quartier: pointVente.quartier || null,
        repereQuartier: pointVente.repereQuartier || null,
        typeId: pointVente.typeId || null,
        typeAutrePrecision: pointVente.typeAutrePrecision || null,
        latitude: pointVente.latitude ?? null,
        longitude: pointVente.longitude ?? null,
        precisionGps: pointVente.precisionGps ?? null,
        statut: pointVente.statut || "OUVERT",
        createdById: session.userId,
      },
    });

    const v = await tx.visite.create({
      data: {
        uuidClient,
        pointVenteId: pv.id,
        commercialId: session.userId,
        dateVisite: dateVisite ? new Date(dateVisite) : new Date(),
        vendSpiritueux: offrePotentiel?.vendSpiritueux ?? null,
        proposeCocktails: offrePotentiel?.proposeCocktails || null,
        capaciteEstimee: offrePotentiel?.capaciteEstimee || null,
        affluence: offrePotentiel?.affluence ?? undefined,
        fournisseurGrossiste: !!offrePotentiel?.fournisseurGrossiste,
        fournisseurMarche: !!offrePotentiel?.fournisseurMarche,
        fournisseurLivraison: !!offrePotentiel?.fournisseurLivraison,
        fournisseurNeSaitPas: !!offrePotentiel?.fournisseurNeSaitPas,
        potentielEstime: qualification?.potentielEstime || null,
        interesseVisiteCommerciale: qualification?.interesseVisiteCommerciale ?? null,
        observations: qualification?.observations || null,
        repondant: qualification?.repondant || null,
        repondantAutrePrecision: qualification?.repondantAutrePrecision || null,
        veutCommander: qualification?.veutCommander ?? null,
      },
    });

    if (Array.isArray(marquesPresentes) && marquesPresentes.length > 0) {
      await tx.marquePresente.createMany({
        data: marquesPresentes.map((m: { marqueId?: string; libelleLibre?: string }) => ({
          visiteId: v.id,
          marqueId: m.marqueId || null,
          libelleLibre: m.libelleLibre || null,
        })),
      });
    }

    if (Array.isArray(photos) && photos.length > 0) {
      await tx.photo.createMany({
        data: photos.map((p: { uuidClient: string; url: string }) => ({
          uuidClient: p.uuidClient,
          pointVenteId: pv.id,
          visiteId: v.id,
          url: p.url,
        })),
      });
    }

    return v;
  });

  const complet = await prisma.visite.findUnique({
    where: { id: visite.id },
    include: { pointVente: { include: { ville: true, type: true } } },
  });

  // Diffusion temps réel vers le dashboard admin (§4.2 CDC).
  visiteEvents.emit(NOUVELLE_VISITE, complet);

  return NextResponse.json({ id: visite.id, dejaEnregistree: false });
}

/** Listing paginé + filtré pour le dashboard admin (§4.3 CDC). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 20;
  const villeId = searchParams.get("villeId") || undefined;
  const typeId = searchParams.get("typeId") || undefined;
  const potentiel = searchParams.get("potentiel") || undefined;
  const commercialId = searchParams.get("commercialId") || undefined;
  const q = searchParams.get("q") || undefined;

  const where = {
    ...(potentiel ? { potentielEstime: potentiel as any } : {}),
    ...(commercialId ? { commercialId } : {}),
    pointVente: {
      ...(villeId ? { villeId } : {}),
      ...(typeId ? { typeId } : {}),
      ...(q ? { nomEtablissement: { contains: q, mode: "insensitive" as const } } : {}),
    },
  };

  const [total, items] = await Promise.all([
    prisma.visite.count({ where }),
    prisma.visite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        pointVente: { include: { ville: true, type: true } },
        marquesPresentes: { include: { marque: true } },
        photos: true,
      },
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
