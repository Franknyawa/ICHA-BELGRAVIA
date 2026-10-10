import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { assurerGammes } from "@/lib/gammes";
import { libelleGamme } from "@/lib/gammesClient";

/**
 * Tableau de bord — ventes par produit : classement (quel produit se vend le
 * mieux) + détail d'un produit (évolution 12 mois, 30 derniers jours, meilleurs
 * points de vente et quartiers). Les ventes comptent en cartons et en FCFA.
 */

const DECALAGE_MS = 60 * 60 * 1000; // Cameroun : UTC+1
const JOUR_MS = 86_400_000;

const PERIODES: Record<string, number | null> = { "7": 7, "30": 30, "90": 90, "365": 365, tout: null };

function cleMois(d: Date) {
  return new Date(d.getTime() + DECALAGE_MS).toISOString().slice(0, 7);
}
function cleJour(d: Date) {
  return new Date(d.getTime() + DECALAGE_MS).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  await assurerGammes();
  const params = new URL(req.url).searchParams;
  const gammeId = params.get("gammeId") || undefined;
  const periodeCle = params.get("periode") && params.get("periode")! in PERIODES ? params.get("periode")! : "tout";
  const jours = PERIODES[periodeCle];
  const maintenant = Date.now();
  const debutPeriode = jours ? new Date(maintenant - jours * JOUR_MS) : undefined;

  // ---- Classement : calculé par la base (GROUP BY), pas en rapatriant les lignes ----
  const groupes = await prisma.ligneCommande.groupBy({
    by: ["produitId"],
    _sum: { quantite: true, sousTotal: true },
    _count: { _all: true },
    where: {
      produitId: { not: null },
      commande: {
        ...(gammeId ? { gammeId } : {}),
        ...(debutPeriode ? { createdAt: { gte: debutPeriode } } : {}),
      },
    },
  });

  const produits = await prisma.produit.findMany({
    where: gammeId ? { gammeId } : {},
    select: { id: true, nom: true, actif: true, gamme: { select: { code: true, nom: true } } },
  });
  const parId = new Map(produits.map((p) => [p.id, p]));

  const totalCartons = groupes.reduce((s, g) => s + Number(g._sum.quantite || 0), 0);
  const totalCA = groupes.reduce((s, g) => s + Number(g._sum.sousTotal || 0), 0);

  const classement = groupes
    .filter((g) => g.produitId && parId.has(g.produitId))
    .map((g) => {
      const p = parId.get(g.produitId!)!;
      const cartons = Number(g._sum.quantite || 0);
      const montantTotal = Number(g._sum.sousTotal || 0);
      return {
        id: p.id,
        nom: p.nom,
        gamme: p.gamme ? libelleGamme(p.gamme) : "—",
        gammeCode: p.gamme?.code || "",
        cartons,
        montantTotal,
        commandes: g._count._all,
        partCartons: totalCartons > 0 ? (cartons / totalCartons) * 100 : 0,
        partCA: totalCA > 0 ? (montantTotal / totalCA) * 100 : 0,
      };
    })
    .sort((a, b) => b.cartons - a.cartons);

  // ---- Détail du produit sélectionné (par défaut : le plus vendu) ----
  const demande = params.get("produitId");
  const selectionId = demande && parId.has(demande) ? demande : classement[0]?.id;

  let detail = null;
  if (selectionId) {
    const p = parId.get(selectionId)!;

    // 12 mois civils (heure du Cameroun) et 30 derniers jours
    const dm = new Date(maintenant + DECALAGE_MS);
    const an = dm.getUTCFullYear();
    const m0 = dm.getUTCMonth();
    const mois: { cle: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(an, m0 - i, 1));
      mois.push({
        cle: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", ""),
      });
    }
    const debut12Mois = new Date(Date.UTC(an, m0 - 11, 1) - DECALAGE_MS);
    const debut60Jours = new Date(maintenant - 60 * JOUR_MS);

    // Sans limite basse pour « depuis le début » ; sinon 12 mois suffisent (la plus longue période est 365 j).
    const borne = jours ? new Date(Math.min(debut12Mois.getTime(), debutPeriode!.getTime(), debut60Jours.getTime())) : undefined;

    const lignes = await prisma.ligneCommande.findMany({
      where: { produitId: selectionId, ...(borne ? { commande: { createdAt: { gte: borne } } } : {}) },
      select: {
        quantite: true,
        sousTotal: true,
        commandeId: true,
        commande: {
          select: {
            createdAt: true,
            pointVenteId: true,
            pointVente: { select: { nomEtablissement: true, quartier: true, ville: { select: { nom: true } } } },
          },
        },
      },
    });

    const parMois = new Map(mois.map((m) => [m.cle, { cartons: 0, montantTotal: 0 }]));
    const jours30: { cle: string; label: string }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(maintenant - i * JOUR_MS);
      const cle = cleJour(d);
      jours30.push({ cle, label: `${cle.slice(8, 10)}/${cle.slice(5, 7)}` });
    }
    const parJour = new Map(jours30.map((j) => [j.cle, { cartons: 0, montantTotal: 0 }]));

    const pvMap = new Map<string, { label: string; sousLabel: string; cartons: number; montantTotal: number }>();
    const quartierMap = new Map<string, { label: string; sousLabel: string; cartons: number; montantTotal: number }>();
    const commandes = new Set<string>();
    let cartons = 0;
    let montantTotal = 0;
    let cartons30 = 0;
    let cartonsPrec30 = 0;

    for (const l of lignes) {
      const date = l.commande.createdAt;
      const q = l.quantite;
      const m = Number(l.sousTotal);

      const mm = parMois.get(cleMois(date));
      if (mm) {
        mm.cartons += q;
        mm.montantTotal += m;
      }
      const jj = parJour.get(cleJour(date));
      if (jj) {
        jj.cartons += q;
        jj.montantTotal += m;
      }
      const age = maintenant - date.getTime();
      if (age <= 30 * JOUR_MS) cartons30 += q;
      else if (age <= 60 * JOUR_MS) cartonsPrec30 += q;

      // Totaux et classements : respectent la période choisie
      if (debutPeriode && date < debutPeriode) continue;
      commandes.add(l.commandeId);
      cartons += q;
      montantTotal += m;

      const pv = l.commande.pointVente;
      const ville = pv.ville?.nom || "—";
      const e = pvMap.get(l.commande.pointVenteId) || { label: pv.nomEtablissement, sousLabel: `${ville}${pv.quartier ? " · " + pv.quartier : ""}`, cartons: 0, montantTotal: 0 };
      e.cartons += q;
      e.montantTotal += m;
      pvMap.set(l.commande.pointVenteId, e);

      const cleQ = `${ville}||${pv.quartier || "Non précisé"}`;
      const eq = quartierMap.get(cleQ) || { label: pv.quartier || "Non précisé", sousLabel: ville, cartons: 0, montantTotal: 0 };
      eq.cartons += q;
      eq.montantTotal += m;
      quartierMap.set(cleQ, eq);
    }

    const top = (m: Map<string, { label: string; sousLabel: string; cartons: number; montantTotal: number }>) =>
      [...m.values()].sort((a, b) => b.cartons - a.cartons || b.montantTotal - a.montantTotal).slice(0, 5);

    detail = {
      id: p.id,
      nom: p.nom,
      gamme: p.gamme ? libelleGamme(p.gamme) : "—",
      cartons,
      montantTotal,
      commandes: commandes.size,
      pointsVente: pvMap.size,
      prixMoyen: cartons > 0 ? Math.round(montantTotal / cartons) : 0,
      parMois: mois.map((m) => ({ label: m.label, ...parMois.get(m.cle)! })),
      parJour: jours30.map((j) => ({ label: j.label, ...parJour.get(j.cle)! })),
      topPointsVente: top(pvMap),
      topQuartiers: top(quartierMap),
      tendance: {
        cartons30j: cartons30,
        cartonsPrec30j: cartonsPrec30,
        variationPct: cartonsPrec30 > 0 ? Math.round(((cartons30 - cartonsPrec30) / cartonsPrec30) * 100) : null,
      },
    };
  }

  return NextResponse.json({ periode: periodeCle, totalCartons, totalCA, classement, selectionId: selectionId || null, detail });
}
