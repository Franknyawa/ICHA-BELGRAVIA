import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { peut, peutSaisirCommande } from "@/lib/permissions";
import { quantiteCartonValide } from "@/lib/quantites";
import { ID_CLIENT_DIVERS } from "@/lib/clientDivers";
import { dateValide, debutJour, ajouterJours, aujourdhuiISO } from "@/lib/dates";
import { prochainNumero } from "@/lib/numerotation";
import { calculerCommande, calculerPaiement, montantLigne, type ModePaiementValue } from "@/lib/pricing";
import { assurerGammes } from "@/lib/gammes";

type LigneEntree = { produitId: string; quantite: number };

type NouveauClient = {
  nomEtablissement?: string;
  nomVendeur?: string;
  telVendeur?: string;
  villeId?: string;
  quartier?: string;
  repereQuartier?: string;
  typeId?: string;
};

/** Regroupe les lignes d'un même produit et ne garde que des quantités valides (0,5 carton minimum). */
function regrouper(lignes: unknown): Map<string, number> | null {
  if (!Array.isArray(lignes)) return null;
  const m = new Map<string, number>();
  for (const l of lignes as LigneEntree[]) {
    if (!l?.produitId || !quantiteCartonValide(Number(l.quantite))) continue;
    m.set(l.produitId, (m.get(l.produitId) || 0) + Number(l.quantite));
  }
  return m;
}

/**
 * Création d'une commande + ses lignes, en une transaction. `uuidClient`
 * généré côté PWA avant tout appel réseau garantit l'idempotence si la
 * requête est rejouée après une coupure réseau (même principe que les
 * visites, voir app/api/visites/route.ts).
 *
 * Le prix appliqué N'EST JAMAIS un montant libre : chaque ligne doit référencer un produit actif
 * du référentiel, et le prix/carton est soit le prix négocié avec le client (envoyé par la saisie ou
 * mémorisé sur sa fiche — PrixClient), soit le barème PalierPrixCarton selon le volume total
 * (voir lib/pricing.ts). Les quantités vont au quart de carton, payé au prorata du prix d'un carton. Le stock
 * de chaque produit est décrémenté dans la même transaction (voir MouvementStock), ainsi que les
 * échantillons, qui sortent du stock sans être facturés.
 *
 * Deux types d'auteurs : le commercial (sa propre commande) ; l'admin, le super admin ou le
 * superviseur qui saisit AU BUREAU pour un commercial (`commercialId`) — la commande est alors
 * comptée dans les chiffres de ce commercial.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const auBureau = !!session && session.role !== "COMMERCIAL" && peutSaisirCommande(session.role);
  if (!session || (session.role !== "COMMERCIAL" && !auBureau)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const {
    uuidClient,
    pointVenteId,
    observations,
    dateLivraison,
    modePaiement,
    montantRecu: montantRecuSaisi,
    mobileMoneyConfirme,
    operateurMobile,
  } = body as {
    uuidClient: string;
    pointVenteId?: string;
    observations?: string;
    dateLivraison?: string;
    modePaiement: ModePaiementValue;
    montantRecu?: number;
    mobileMoneyConfirme?: boolean;
    operateurMobile?: string;
  };
  const nouveauClient = body.nouveauClient as NouveauClient | undefined;

  if (!uuidClient || (!pointVenteId && !nouveauClient)) {
    return NextResponse.json({ error: "Données incomplètes." }, { status: 400 });
  }
  if (nouveauClient && !auBureau) {
    return NextResponse.json({ error: "La création d'un client à la saisie est réservée au bureau." }, { status: 403 });
  }
  if (!modePaiement) {
    return NextResponse.json({ error: "Mode de paiement requis." }, { status: 400 });
  }

  const existante = await prisma.commande.findUnique({ where: { uuidClient } });
  if (existante) {
    return NextResponse.json({ id: existante.id, dejaEnregistree: true });
  }

  const quantitesParProduit = regrouper(body.lignes);
  if (!quantitesParProduit || quantitesParProduit.size === 0) {
    return NextResponse.json({ error: "Au moins une ligne de produit valide est requise (quantité par quart de carton)." }, { status: 400 });
  }
  const echantillons = regrouper(body.echantillons ?? []) ?? new Map<string, number>();
  const produitIds = [...quantitesParProduit.keys()];

  // --- Auteur / commercial concerné -------------------------------------------------------------
  let commercialId = session.userId;
  let creeLe: Date | null = null;
  if (auBureau) {
    const c = await prisma.user.findFirst({ where: { id: String(body.commercialId || ""), role: "COMMERCIAL", actif: true }, select: { id: true } });
    if (!c) return NextResponse.json({ error: "Choisissez le commercial concerné par cette commande." }, { status: 400 });
    commercialId = c.id;
    // Antidatée : la commande (et sa facture) sont comptées à ce jour-là, jamais dans le futur.
    if (body.dateCommande) {
      if (!dateValide(body.dateCommande) || body.dateCommande > aujourdhuiISO()) {
        return NextResponse.json({ error: "Date de commande invalide (pas de date future)." }, { status: 400 });
      }
      if (body.dateCommande !== aujourdhuiISO()) creeLe = new Date(`${body.dateCommande}T12:00:00+01:00`);
    }
  }

  // --- Client ---------------------------------------------------------------------------------------
  const estDivers = pointVenteId === ID_CLIENT_DIVERS;
  if (pointVenteId && !estDivers) {
    const pv = await prisma.pointVente.findUnique({ where: { id: pointVenteId }, select: { id: true } });
    if (!pv) return NextResponse.json({ error: "Point de vente introuvable." }, { status: 400 });
  }
  if (nouveauClient) {
    if (String(nouveauClient.nomEtablissement || "").trim().length < 2) {
      return NextResponse.json({ error: "Nom du point de vente requis." }, { status: 400 });
    }
    if (!nouveauClient.villeId || !(await prisma.ville.findUnique({ where: { id: nouveauClient.villeId }, select: { id: true } }))) {
      return NextResponse.json({ error: "Ville requise pour un nouveau client." }, { status: 400 });
    }
  }

  await assurerGammes();
  const produits = await prisma.produit.findMany({ where: { id: { in: produitIds }, actif: true } });
  if (produits.length !== produitIds.length) {
    return NextResponse.json(
      { error: "Un ou plusieurs produits sélectionnés ne sont plus disponibles." },
      { status: 400 }
    );
  }
  if (echantillons.size > 0) {
    const n = await prisma.produit.count({ where: { id: { in: [...echantillons.keys()] }, actif: true } });
    if (n !== echantillons.size) return NextResponse.json({ error: "Un échantillon porte sur un produit indisponible." }, { status: 400 });
  }

  // Une commande = une seule gamme (BELGRAVIA ou VDV) : la gamme se déduit
  // des produits eux-mêmes, jamais d'une valeur envoyée par le client.
  const gammeIds = new Set(produits.map((p) => p.gammeId));
  if (gammeIds.size > 1) {
    return NextResponse.json(
      { error: "Une commande ne peut contenir que les produits d'une seule gamme. Créez une commande par gamme." },
      { status: 400 }
    );
  }
  const gammeId = produits[0]?.gammeId ?? null;

  // --- Prix : négocié (saisi, sinon mémorisé sur la fiche du client) ou barème ---------------
  const saisi = body.prixCartonNegocie;
  const prixExplicite = typeof saisi === "number" && Number.isFinite(saisi);
  if (prixExplicite && (saisi < 0 || saisi > 10_000_000)) {
    return NextResponse.json({ error: "Prix négocié invalide." }, { status: 400 });
  }
  let prixNegocie = prixExplicite ? Math.round(saisi) : 0;
  if (!prixExplicite && pointVenteId && !estDivers && gammeId) {
    const memo = await prisma.prixClient.findUnique({ where: { pointVenteId_gammeId: { pointVenteId, gammeId } } });
    if (memo) prixNegocie = Math.round(Number(memo.prixCarton));
  }

  const paliers = await prisma.palierPrixCarton.findMany({
    where: { actif: true, gammeId },
    orderBy: { cartonsMin: "asc" },
  });
  if (paliers.length === 0 && prixNegocie <= 0) {
    return NextResponse.json(
      { error: "Aucun barème de prix configuré pour cette gamme. Contactez l'administrateur." },
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
    })),
    prixNegocie
  );

  const { montantRecu, resteAPayer } = calculerPaiement(
    modePaiement,
    montantTotal,
    Number(montantRecuSaisi) || 0,
    !!mobileMoneyConfirme
  );

  const commande = await prisma.$transaction(async (tx) => {
    // Client : existant, « divers » (créé au premier usage) ou nouveau (saisie au bureau).
    let pvId = pointVenteId as string;
    if (estDivers) {
      const divers =
        (await tx.pointVente.findFirst({ where: { estDivers: true }, select: { id: true } })) ??
        (await tx.pointVente.create({ data: { nomEtablissement: "CLIENT DIVERS", estDivers: true, createdById: session.userId }, select: { id: true } }));
      pvId = divers.id;
    } else if (nouveauClient) {
      const pv = await tx.pointVente.create({
        data: {
          nomEtablissement: String(nouveauClient.nomEtablissement).trim().slice(0, 120),
          nomVendeur: nouveauClient.nomVendeur?.trim().slice(0, 120) || null,
          telVendeur: nouveauClient.telVendeur?.trim().slice(0, 40) || null,
          villeId: nouveauClient.villeId,
          quartier: nouveauClient.quartier?.trim().slice(0, 120) || null,
          repereQuartier: nouveauClient.repereQuartier?.trim().slice(0, 200) || null,
          typeId: nouveauClient.typeId || null,
          createdById: commercialId, // le recensement compte pour le commercial concerné
        },
        select: { id: true },
      });
      pvId = pv.id;
    }

    const c = await tx.commande.create({
      data: {
        uuidClient,
        numeroBC: await prochainNumero(tx, "BC"),
        pointVenteId: pvId,
        commercialId,
        saisieParId: auBureau ? session.userId : null,
        gammeId,
        prixNegocie: prixNegocie > 0,
        observations: observations || null,
        dateLivraison: dateLivraison ? new Date(dateLivraison) : null,
        ...(creeLe ? { dateCommande: creeLe, createdAt: creeLe } : {}),
        montantTotal,
        modePaiement,
        mobileMoneyConfirme: !!mobileMoneyConfirme,
        operateurMobile:
          modePaiement === "MOBILE_MONEY" && (operateurMobile === "ORANGE_MONEY" || operateurMobile === "MTN_MOMO")
            ? operateurMobile
            : null,
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
        sousTotal: montantLigne(l.quantite, prixCarton),
      })),
    });

    // Prix négocié mémorisé sur la fiche du client (ou retiré si on revient au tarif général).
    if (prixExplicite && body.memoriserPrix && !estDivers && gammeId) {
      if (prixNegocie > 0) {
        await tx.prixClient.upsert({
          where: { pointVenteId_gammeId: { pointVenteId: pvId, gammeId } },
          update: { prixCarton: prixNegocie },
          create: { pointVenteId: pvId, gammeId, prixCarton: prixNegocie },
        });
      } else {
        await tx.prixClient.deleteMany({ where: { pointVenteId: pvId, gammeId } });
      }
    }

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

    // Échantillons : sortent du stock, jamais facturés ni encaissés.
    for (const [produitId, quantite] of echantillons) {
      await tx.stock.upsert({
        where: { produitId },
        update: { quantiteCartons: { decrement: quantite } },
        create: { produitId, quantiteCartons: -quantite, seuilAlerte: 20 },
      });
      await tx.mouvementStock.create({
        data: {
          produitId,
          type: "SORTIE",
          quantiteCartons: quantite,
          referenceType: "ECHANTILLON",
          referenceId: c.id,
          note: `Échantillon — commande ${c.numeroBC}`,
        },
      });
    }

    return c;
  });

  return NextResponse.json({
    id: commande.id,
    dejaEnregistree: false,
    montantTotal,
    prixCarton,
    montantRecu,
    resteAPayer,
    numero: commande.numeroBC ?? commande.id.slice(0, 8).toUpperCase(),
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
  if (session.role !== "COMMERCIAL" && !peut(session.role, "commandes")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  await assurerGammes();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 20;
  const commercialId =
    session.role === "COMMERCIAL" ? session.userId : searchParams.get("commercialId") || undefined;
  const villeId = searchParams.get("villeId") || undefined;
  const modePaiement = searchParams.get("modePaiement") || undefined;
  const statut = searchParams.get("statut") || undefined;
  const gammeId = searchParams.get("gammeId") || undefined;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  const du = dateValide(dateFrom) ? debutJour(dateFrom) : null;
  const au = dateValide(dateTo) ? debutJour(ajouterJours(dateTo, 1)) : null;

  const where = {
    // Les archives n'apparaissent plus dans les listes de l'admin (voir l'onglet
    // Archives) ; le commercial, lui, garde tout son historique.
    ...(session.role !== "COMMERCIAL" ? { archiveeLe: null } : {}),
    ...(commercialId ? { commercialId } : {}),
    ...(villeId ? { pointVente: { villeId } } : {}),
    ...(modePaiement ? { modePaiement: modePaiement as any } : {}),
    ...(statut ? { statut: statut as any } : {}),
    ...(gammeId ? { gammeId } : {}),
    ...(du || au ? { createdAt: { ...(du ? { gte: du } : {}), ...(au ? { lt: au } : {}) } } : {}),
    // Recherche libre : point de vente, interlocuteur (vendeur / patron), téléphone, quartier, commercial, numéros de documents.
    ...(q
      ? {
          OR: [
            { pointVente: { nomEtablissement: { contains: q, mode: "insensitive" as const } } },
            { pointVente: { nomVendeur: { contains: q, mode: "insensitive" as const } } },
            { pointVente: { nomPatron: { contains: q, mode: "insensitive" as const } } },
            { pointVente: { telVendeur: { contains: q } } },
            { pointVente: { telPatron: { contains: q } } },
            { pointVente: { quartier: { contains: q, mode: "insensitive" as const } } },
            { commercial: { nom: { contains: q, mode: "insensitive" as const } } },
            { commercial: { prenom: { contains: q, mode: "insensitive" as const } } },
            { numeroBC: { contains: q, mode: "insensitive" as const } },
            { numeroBL: { contains: q, mode: "insensitive" as const } },
            { numeroFV: { contains: q, mode: "insensitive" as const } },
          ],
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
      // Champs strictement nécessaires : « commercial: true » renvoyait toute la
      // fiche utilisateur (dont le hash du mot de passe) et rendait la liste lourde.
      include: {
        pointVente: {
          select: {
            id: true,
            nomEtablissement: true,
            nomVendeur: true,
            telVendeur: true,
            nomPatron: true,
            telPatron: true,
            quartier: true,
            ville: { select: { nom: true } },
          },
        },
        commercial: { select: { id: true, nom: true, prenom: true } },
        gamme: true,
        lignes: { include: { produit: { select: { id: true, nom: true } } } },
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
