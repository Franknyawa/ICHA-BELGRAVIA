import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { intervalleJours } from "@/lib/dates";

/**
 * Listing paginé des points de vente pour l'admin — sert à la fois d'annuaire
 * "points de vente" et de "fiches clients" (voir app/(admin)/points-de-vente),
 * BELGRAVIA n'ayant pas de modèle Client séparé : le point de vente porte
 * déjà l'ensemble des coordonnées du client (nom, tél. vendeur/patron).
 */
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
  const quartier = searchParams.get("quartier") || undefined;
  const q = searchParams.get("q") || undefined;
  // Filtre par jour (heure du Cameroun) : "du" / "au" inclus. "base" choisit
  // ce qui est daté : le recensement du point de vente, ou une visite reçue.
  const intervalle = intervalleJours(searchParams.get("du"), searchParams.get("au"));
  const parVisite = searchParams.get("base") === "visite";
  const potentiel = searchParams.get("potentiel") || undefined;
  // "oui" = déjà client (au moins une commande), "non" = prospect sans commande.
  const client = searchParams.get("client") || undefined;
  // Pagination normale côté API, mais le PDF/impression a besoin de TOUTES
  // les lignes correspondant aux filtres, pas seulement la page affichée.
  const toutesLesLignes = searchParams.get("toutesLesLignes") === "1";

  // Deux conditions "OU" indépendantes (type, recherche texte) : on les
  // combine avec AND pour qu'elles ne s'écrasent pas.
  const where = {
    ...(villeId ? { villeId } : {}),
    ...(intervalle
      ? parVisite
        ? { visites: { some: { createdAt: intervalle } } }
        : { createdAt: intervalle }
      : {}),
    ...(quartier ? { quartier: { contains: quartier, mode: "insensitive" as const } } : {}),
    ...(client === "oui" ? { commandes: { some: {} } } : client === "non" ? { commandes: { none: {} } } : {}),
    AND: [
      ...(potentiel && ["FORT", "MOYEN", "FAIBLE"].includes(potentiel)
        ? [{ visites: { some: { potentielEstime: potentiel as "FORT" | "MOYEN" | "FAIBLE" } } }]
        : []),
      ...(typeId ? [{ OR: [{ typeId }, { typesLies: { some: { typeId } } }] }] : []),
      ...(q
        ? [
            {
              OR: [
                { nomEtablissement: { contains: q, mode: "insensitive" as const } },
                { nomVendeur: { contains: q, mode: "insensitive" as const } },
                { telVendeur: { contains: q, mode: "insensitive" as const } },
                { nomPatron: { contains: q, mode: "insensitive" as const } },
                { telPatron: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [total, items] = await Promise.all([
    prisma.pointVente.count({ where }),
    prisma.pointVente.findMany({
      where,
      orderBy: { createdAt: "desc" },
      // Garde-fou : un export ne dépasse jamais 5 000 lignes d'un coup.
      ...((toutesLesLignes ? { take: 5000 } : { skip: (page - 1) * pageSize, take: pageSize }) as { skip?: number; take: number }),
      include: {
        ville: true,
        type: true,
        typesLies: { include: { type: true } },
        createdBy: { select: { nom: true, prenom: true } },
        _count: { select: { visites: true, commandes: true } },
        visites: { orderBy: { createdAt: "desc" as const }, take: 1, select: { potentielEstime: true } },
      },
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
