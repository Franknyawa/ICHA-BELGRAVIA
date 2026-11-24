import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";
import { aujourdhuiISO, ajouterJours, debutJour } from "@/lib/dates";
import { assurerGammes } from "@/lib/gammes";
import { CATEGORIES_ENCAISSEMENT } from "@/lib/caisse";

export const dynamic = "force-dynamic";

/** AAAA-MM-JJ (heure du Cameroun) d'un instant. */
const jourDe = (d: Date) => new Date(d.getTime() + 3600_000).toISOString().slice(0, 10);

type Cumul = { total: number; jour: number; semaine: number; mois: number };

/**
 * Activité du jour du tableau de bord, calculée à l'heure du Cameroun.
 * Le filtre de gamme ne s'applique qu'aux commandes (visites et caisse restent globales).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!aAcces(session, "tableau_de_bord")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  await assurerGammes();

  const gammeId = new URL(req.url).searchParams.get("gammeId") || undefined;
  const whereGamme = gammeId ? { gammeId } : {};
  const aujourdhui = aujourdhuiISO();
  const hier = ajouterJours(aujourdhui, -1);
  const jours14 = Array.from({ length: 14 }, (_, i) => ajouterJours(aujourdhui, i - 13));
  const dJour = debutJour(aujourdhui);
  const dDemain = debutJour(ajouterJours(aujourdhui, 1));
  const d14 = debutJour(jours14[0]);
  const d7 = debutJour(ajouterJours(aujourdhui, -6));
  const jourSemaine = new Date(`${aujourdhui}T00:00:00Z`).getUTCDay(); // 0 = dimanche
  const dSemaine = debutJour(ajouterJours(aujourdhui, -((jourSemaine + 6) % 7))); // lundi
  const dMois = debutJour(`${aujourdhui.slice(0, 8)}01`);
  const dDebutLignes = dMois < d14 ? dMois : d14;

  const [gammes, visites7j, commandes, lignes, caisseJour, enAttente, enLivraison, anciennes, totalDebut] = await Promise.all([
    prisma.gamme.findMany({
      where: { actif: true },
      orderBy: { ordre: "asc" },
      include: { produits: { where: { actif: true }, orderBy: { ordre: "asc" }, select: { id: true, nom: true } } },
    }),
    prisma.visite.findMany({ where: { dateVisite: { gte: d7, lt: dDemain } }, select: { pointVenteId: true, dateVisite: true } }),
    prisma.commande.findMany({
      where: { createdAt: { gte: d14, lt: dDemain }, ...whereGamme },
      select: { id: true, createdAt: true, statut: true, montantTotal: true, avoirsTotal: true },
    }),
    prisma.ligneCommande.findMany({
      where: { commande: { createdAt: { gte: dDebutLignes, lt: dDemain }, ...whereGamme } },
      select: { commandeId: true, produitId: true, quantite: true, commande: { select: { createdAt: true, gammeId: true } } },
    }),
    prisma.operationCaisse.groupBy({
      by: ["type", "categorie"],
      where: { dateOperation: { gte: dJour, lt: dDemain }, categorie: { not: "TRANSFERT" } },
      _sum: { montant: true },
    }),
    prisma.commande.aggregate({ where: { statut: "NON_TRAITEE", archiveeLe: null, ...whereGamme }, _count: true, _sum: { montantTotal: true } }),
    prisma.commande.count({ where: { statut: "EN_COURS_LIVRAISON", archiveeLe: null, ...whereGamme } }),
    prisma.commande.findMany({
      where: { statut: "EN_COURS_LIVRAISON", archiveeLe: null, createdAt: { lt: dJour }, ...whereGamme },
      select: { montantTotal: true, lignes: { select: { quantite: true } } },
    }),
    prisma.ligneCommande.groupBy({ by: ["produitId"], _sum: { quantite: true }, where: gammeId ? { commande: { gammeId } } : {} }),
  ]);

  const net = (c: { montantTotal: unknown; avoirsTotal: unknown }) => Number(c.montantTotal) - Number(c.avoirsTotal);

  // ---- Visites -----------------------------------------------------------
  const pointsParJour = new Map<string, Set<string>>();
  const visitesParJour = new Map<string, number>();
  for (const v of visites7j) {
    const j = jourDe(v.dateVisite);
    if (!pointsParJour.has(j)) pointsParJour.set(j, new Set());
    pointsParJour.get(j)!.add(v.pointVenteId);
    visitesParJour.set(j, (visitesParJour.get(j) || 0) + 1);
  }
  const sept = Array.from({ length: 7 }, (_, i) => ajouterJours(aujourdhui, i - 6));
  const moyennePoints = sept.reduce((s, j) => s + (pointsParJour.get(j)?.size || 0), 0) / 7;

  // ---- Cartons : par commande, par gamme, par jour -----------------------
  const cartonsParCommande = new Map<string, number>();
  const parGamme = new Map<string, Cumul>();
  const parProduit = new Map<string, Cumul>();
  const parJourGamme = new Map<string, number>();
  const parJour = new Map<string, number>();
  const ajouter = (m: Map<string, Cumul>, k: string, q: number, d: Date) => {
    const e = m.get(k) || { total: 0, jour: 0, semaine: 0, mois: 0 };
    e.total += q;
    if (d >= dJour) e.jour += q;
    if (d >= dSemaine) e.semaine += q;
    if (d >= dMois) e.mois += q;
    m.set(k, e);
  };
  for (const l of lignes) {
    const d = l.commande.createdAt;
    const q = Number(l.quantite);
    cartonsParCommande.set(l.commandeId, (cartonsParCommande.get(l.commandeId) || 0) + q);
    if (l.produitId) ajouter(parProduit, l.produitId, q, d);
    if (l.commande.gammeId) ajouter(parGamme, l.commande.gammeId, q, d);
    if (d >= d14) {
      const j = jourDe(d);
      parJour.set(j, (parJour.get(j) || 0) + q);
      if (l.commande.gammeId) parJourGamme.set(`${j}|${l.commande.gammeId}`, (parJourGamme.get(`${j}|${l.commande.gammeId}`) || 0) + q);
    }
  }
  const totalParProduit = new Map(totalDebut.filter((t) => t.produitId).map((t) => [t.produitId as string, Number(t._sum.quantite || 0)]));

  const cartes = gammes
    .filter((g) => !gammeId || g.id === gammeId)
    .map((g) => {
      const e = parGamme.get(g.id);
      const produits = g.produits.map((p) => ({ id: p.id, nom: p.nom, total: totalParProduit.get(p.id) || 0, mois: parProduit.get(p.id)?.mois || 0 }));
      return {
        id: g.id,
        code: g.code,
        nom: g.nom,
        jour: e?.jour || 0,
        semaine: e?.semaine || 0,
        mois: e?.mois || 0,
        total: produits.reduce((s, p) => s + p.total, 0),
        produits,
      };
    });
  const totalGeneral = cartes.reduce((s, c) => s + c.total, 0);

  // ---- Commandes du jour -------------------------------------------------
  const duJour = commandes.filter((c) => c.createdAt >= dJour);
  const validees = duJour.filter((c) => c.statut !== "NON_TRAITEE");
  const livrees = validees.filter((c) => c.statut === "LIVREE");
  const aLivrer = validees.filter((c) => c.statut === "EN_COURS_LIVRAISON");
  const attenteJour = duJour.filter((c) => c.statut === "NON_TRAITEE");
  const somme = (cs: typeof duJour) => cs.reduce((s, c) => s + net(c), 0);
  const cartonsDe = (cs: typeof duJour) => cs.reduce((s, c) => s + (cartonsParCommande.get(c.id) || 0), 0);

  // ---- Tableau des 14 derniers jours ------------------------------------
  const tableau = jours14.map((j) => {
    const cmds = commandes.filter((c) => jourDe(c.createdAt) === j);
    return {
      jour: j,
      cartons: parJour.get(j) || 0,
      parGamme: Object.fromEntries(gammes.map((g) => [g.id, parJourGamme.get(`${j}|${g.id}`) || 0])),
      commandes: cmds.length,
      facture: somme(cmds),
    };
  });

  // ---- Caisse du jour ----------------------------------------------------
  const encaisse = caisseJour
    .filter((o) => o.type === "RECETTE" && (CATEGORIES_ENCAISSEMENT as readonly string[]).includes(o.categorie))
    .reduce((s, o) => s + Number(o._sum.montant || 0), 0);
  const depenses = caisseJour.filter((o) => o.type === "DEPENSE").reduce((s, o) => s + Number(o._sum.montant || 0), 0);

  return NextResponse.json({
    date: aujourdhui,
    gammes: gammes.map((g) => ({ id: g.id, code: g.code, nom: g.nom })),
    kpi: {
      pointsVisites: pointsParJour.get(aujourdhui)?.size || 0,
      pointsVisitesHier: pointsParJour.get(hier)?.size || 0,
      moyennePoints7j: Math.round(moyennePoints * 10) / 10,
      visites: visitesParJour.get(aujourdhui) || 0,
      ventesValidees: validees.length,
      cartonsValides: cartonsDe(validees),
      livrees: livrees.length,
      aLivrer: aLivrer.length,
      chiffreAffaires: somme(validees),
      encaisse,
      depenses,
      enAttente: enAttente._count,
      enAttenteMontant: Number(enAttente._sum.montantTotal || 0),
      livraisonsAVenir: enLivraison,
    },
    cartes,
    totalGeneral,
    jourCommandes: {
      validees: { commandes: validees.length, cartons: cartonsDe(validees), montant: somme(validees) },
      livrees: { commandes: livrees.length, montant: somme(livrees) },
      aLivrer: { commandes: aLivrer.length, montant: somme(aLivrer) },
      enAttente: { commandes: attenteJour.length, montant: somme(attenteJour) },
      anterieuresALivrer: {
        commandes: anciennes.length,
        cartons: anciennes.reduce((s, c) => s + c.lignes.reduce((a, l) => a + Number(l.quantite), 0), 0),
        montant: anciennes.reduce((s, c) => s + Number(c.montantTotal), 0),
      },
    },
    tableau,
  });
}
