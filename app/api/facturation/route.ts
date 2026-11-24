import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";
import { encaisseParCommande } from "@/lib/caisse";
import { dateValide, debutJour, ajouterJours } from "@/lib/dates";

export const dynamic = "force-dynamic";

const PAGE = 20;

const POINT_VENTE = {
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
} as const;

/**
 * Facturation : factures de vente (FV), factures d'avoir (FA) et factures retour (FR).
 * ?tab=FV|FA|FR & q & typeId & commercialId & villeId & dateFrom & dateTo & page
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!aAcces(session, "commandes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const tab = sp.get("tab") === "FA" ? "FA" : sp.get("tab") === "FR" ? "FR" : "FV";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const q = (sp.get("q") || "").trim();
  const typeId = sp.get("typeId") || undefined;
  const commercialId = sp.get("commercialId") || undefined;
  const villeId = sp.get("villeId") || undefined;
  const du = dateValide(sp.get("dateFrom")) ? debutJour(sp.get("dateFrom") as string) : null;
  const au = dateValide(sp.get("dateTo")) ? debutJour(ajouterJours(sp.get("dateTo") as string, 1)) : null;

  const filtrePv: Prisma.PointVenteWhereInput = {
    ...(typeId ? { OR: [{ typeId }, { typesLies: { some: { typeId } } }] } : {}),
    ...(villeId ? { villeId } : {}),
  };
  const filtreCommande: Prisma.CommandeWhereInput = {
    ...(commercialId ? { commercialId } : {}),
    ...(Object.keys(filtrePv).length ? { pointVente: filtrePv } : {}),
  };
  const recherche = (extra: Prisma.CommandeWhereInput[] = []): Prisma.CommandeWhereInput[] =>
    q
      ? [
          {
            OR: [
              ...extra,
              { pointVente: { nomEtablissement: { contains: q, mode: "insensitive" } } },
              { pointVente: { nomVendeur: { contains: q, mode: "insensitive" } } },
              { pointVente: { nomPatron: { contains: q, mode: "insensitive" } } },
              { pointVente: { telVendeur: { contains: q } } },
              { pointVente: { telPatron: { contains: q } } },
              { pointVente: { quartier: { contains: q, mode: "insensitive" } } },
              { commercial: { nom: { contains: q, mode: "insensitive" } } },
              { commercial: { prenom: { contains: q, mode: "insensitive" } } },
            ],
          },
        ]
      : [];

  if (tab === "FV") {
    const where: Prisma.CommandeWhereInput = {
      statut: "LIVREE",
      ...filtreCommande,
      AND: [
        ...recherche([{ numeroFV: { contains: q, mode: "insensitive" } }]),
        ...(du || au
          ? [
              {
                OR: [
                  { livreeLe: { ...(du ? { gte: du } : {}), ...(au ? { lt: au } : {}) } },
                  { livreeLe: null, dateCommande: { ...(du ? { gte: du } : {}), ...(au ? { lt: au } : {}) } },
                ],
              } as Prisma.CommandeWhereInput,
            ]
          : []),
      ],
    };
    const [total, somme, lignes] = await Promise.all([
      prisma.commande.count({ where }),
      prisma.commande.aggregate({ where, _sum: { montantTotal: true, avoirsTotal: true } }),
      prisma.commande.findMany({
        where,
        orderBy: [{ livreeLe: "desc" }, { dateCommande: "desc" }],
        skip: (page - 1) * PAGE,
        take: PAGE,
        select: {
          id: true,
          numeroBC: true,
          numeroBL: true,
          numeroFV: true,
          dateCommande: true,
          livreeLe: true,
          montantTotal: true,
          avoirsTotal: true,
          modePaiement: true,
          operateurMobile: true,
          pointVente: POINT_VENTE,
          commercial: { select: { id: true, nom: true, prenom: true } },
          gamme: { select: { code: true, nom: true } },
          lignes: { select: { id: true, quantite: true, prixUnitaire: true, sousTotal: true, libelleLibre: true, produit: { select: { nom: true } } } },
          documentsCorrectifs: { select: { id: true, type: true, numero: true, montant: true }, orderBy: { createdAt: "asc" } },
        },
      }),
    ]);

    const ids = lignes.map((c) => c.id);
    const [encaisse, couvert] = await Promise.all([
      encaisseParCommande(ids),
      prisma.documentCorrectifLigne.groupBy({ by: ["ligneCommandeId"], where: { document: { commandeId: { in: ids } } }, _sum: { quantite: true } }),
    ]);
    const couvertParLigne = new Map(couvert.map((r) => [r.ligneCommandeId, Number(r._sum.quantite || 0)]));

    return NextResponse.json({
      tab,
      page,
      pageSize: PAGE,
      total,
      totaux: { facture: Number(somme._sum.montantTotal || 0), avoirs: Number(somme._sum.avoirsTotal || 0) },
      items: lignes.map((c) => {
        const net = Number(c.montantTotal) - Number(c.avoirsTotal);
        const enc = encaisse.get(c.id) || 0;
        return {
          ...c,
          montantTotal: Number(c.montantTotal),
          avoirsTotal: Number(c.avoirsTotal),
          net,
          encaisse: enc,
          reste: Math.max(0, net - enc),
          lignes: c.lignes.map((l) => ({
            id: l.id,
            libelle: l.produit?.nom || l.libelleLibre || "Produit",
            quantite: l.quantite,
            prixUnitaire: Number(l.prixUnitaire),
            sousTotal: Number(l.sousTotal),
            restant: l.quantite - (couvertParLigne.get(l.id) || 0),
          })),
          documentsCorrectifs: c.documentsCorrectifs.map((d) => ({ ...d, montant: Number(d.montant) })),
        };
      }),
    });
  }

  // --- FA / FR ---
  const periode = du || au ? { createdAt: { ...(du ? { gte: du } : {}), ...(au ? { lt: au } : {}) } } : {};
  const whereFinal: Prisma.DocumentCorrectifWhereInput = {
    type: tab,
    ...periode,
    AND: [
      { commande: filtreCommande },
      ...(q
        ? [
            {
              OR: [
                { numero: { contains: q, mode: "insensitive" } },
                { motif: { contains: q, mode: "insensitive" } },
                { commande: { AND: recherche([{ numeroFV: { contains: q, mode: "insensitive" } }]) } },
              ],
            } as Prisma.DocumentCorrectifWhereInput,
          ]
        : []),
    ],
  };

  const [total, somme, docs] = await Promise.all([
    prisma.documentCorrectif.count({ where: whereFinal }),
    prisma.documentCorrectif.aggregate({ where: whereFinal, _sum: { montant: true, remboursement: true } }),
    prisma.documentCorrectif.findMany({
      where: whereFinal,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        lignes: true,
        commande: {
          select: {
            id: true,
            numeroFV: true,
            livreeLe: true,
            dateCommande: true,
            montantTotal: true,
            pointVente: POINT_VENTE,
            commercial: { select: { id: true, nom: true, prenom: true } },
            gamme: { select: { code: true, nom: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    tab,
    page,
    pageSize: PAGE,
    total,
    totaux: { montant: Number(somme._sum.montant || 0), remboursement: Number(somme._sum.remboursement || 0) },
    items: docs.map((d) => ({
      id: d.id,
      type: d.type,
      numero: d.numero,
      createdAt: d.createdAt,
      motif: d.motif,
      destination: d.destination,
      canalRemboursement: d.canalRemboursement,
      montant: Number(d.montant),
      remboursement: Number(d.remboursement),
      lignes: d.lignes.map((l) => ({ id: l.id, libelle: l.libelle, quantite: l.quantite, prixUnitaire: Number(l.prixUnitaire), sousTotal: Number(l.sousTotal) })),
      commande: { ...d.commande, montantTotal: Number(d.commande.montantTotal) },
    })),
  });
}
