import { prisma } from "@/lib/prisma";
import { assurerGammes } from "@/lib/gammes";
import { libelleGamme } from "@/lib/gammesClient";

/**
 * Génération des rapports admin — une seule fonction sait construire les 5
 * vues demandées (par commercial / point de vente / ville / quartier /
 * détail des ventes) à partir des mêmes filtres communs (période, agent,
 * ville, quartier), pour que les filtres se comportent de façon identique
 * quel que soit l'onglet actif côté interface ("maintenir les filtres").
 *
 * Plutôt que du SQL agrégé par dimension (ce qui demanderait une requête
 * différente par groupement), on récupère une fois les commandes/visites
 * filtrées puis on regroupe en mémoire selon la dimension demandée — un
 * recensement terrain reste d'un volume raisonnable (des milliers de
 * lignes, pas des millions), donc c'est largement suffisant et beaucoup
 * plus simple à maintenir que 5 requêtes agrégées distinctes.
 */

export type GroupBy = "commercial" | "pointVente" | "ville" | "quartier" | "vente" | "produit" | "historique";

export type FiltresRapport = {
  dateFrom?: string;
  dateTo?: string;
  commercialId?: string;
  villeId?: string;
  quartier?: string;
  /** Filtre de gamme : ne concerne que les commandes / le CA (visites et recensements ne sont pas rattachés à une gamme). */
  gammeId?: string;
};

export type Colonne = { cle: string; label: string; droite?: boolean; montant?: boolean; pourcentage?: boolean };
export type RapportResultat = {
  groupBy: GroupBy;
  colonnes: Colonne[];
  lignes: Record<string, string | number>[];
  totaux: Record<string, number>;
};

function dateFilter(f: FiltresRapport) {
  if (!f.dateFrom && !f.dateTo) return undefined;
  return {
    ...(f.dateFrom ? { gte: new Date(f.dateFrom) } : {}),
    ...(f.dateTo ? { lte: new Date(`${f.dateTo}T23:59:59`) } : {}),
  };
}

function filtrePointVente(f: FiltresRapport) {
  if (!f.villeId && !f.quartier) return undefined;
  return {
    ...(f.villeId ? { villeId: f.villeId } : {}),
    ...(f.quartier ? { quartier: { contains: f.quartier, mode: "insensitive" as const } } : {}),
  };
}

export async function genererRapport(groupBy: GroupBy, f: FiltresRapport): Promise<RapportResultat> {
  await assurerGammes();
  const df = dateFilter(f);
  const pv = filtrePointVente(f);

  const whereCommande = {
    ...(df ? { createdAt: df } : {}),
    ...(f.commercialId ? { commercialId: f.commercialId } : {}),
    ...(f.gammeId ? { gammeId: f.gammeId } : {}),
    ...(pv ? { pointVente: pv } : {}),
  };
  const whereVisite = {
    ...(df ? { createdAt: df } : {}),
    ...(f.commercialId ? { commercialId: f.commercialId } : {}),
    ...(pv ? { pointVente: pv } : {}),
  };
  const whereRecensement = {
    ...(df ? { createdAt: df } : {}),
    ...(f.commercialId ? { createdById: f.commercialId } : {}),
    ...(pv || {}),
  };

  if (groupBy === "produit") return rapportParProduit(f, whereCommande);
  if (groupBy === "historique") return rapportHistorique12Mois(f);

  const [commandes, visites, recensements] = await Promise.all([
    prisma.commande.findMany({
      where: whereCommande,
      select: {
        id: true,
        createdAt: true,
        montantTotal: true,
        resteAPayer: true,
        modePaiement: true,
        statut: true,
        commercialId: true,
        commercial: { select: { nom: true, prenom: true } },
        gamme: { select: { code: true, nom: true } },
        lignes: { select: { quantite: true } },
        pointVenteId: true,
        pointVente: { select: { nomEtablissement: true, quartier: true, villeId: true, ville: { select: { nom: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.visite.findMany({
      where: whereVisite,
      select: {
        commercialId: true,
        pointVenteId: true,
        pointVente: { select: { quartier: true, villeId: true } },
      },
    }),
    prisma.pointVente.findMany({
      where: whereRecensement,
      select: { id: true, createdById: true, villeId: true, quartier: true },
    }),
  ]);

  // ---- Détail des ventes : pas de regroupement, une ligne par commande ----
  if (groupBy === "vente") {
    const lignes = commandes.map((c) => ({
      id: c.id,
      date: c.createdAt.toLocaleDateString("fr-FR"),
      pointVente: c.pointVente.nomEtablissement,
      ville: c.pointVente.ville?.nom || "—",
      quartier: c.pointVente.quartier || "—",
      commercial: `${c.commercial.prenom} ${c.commercial.nom}`,
      gamme: c.gamme ? libelleGamme(c.gamme) : "—",
      modePaiement: c.modePaiement,
      montantTotal: Number(c.montantTotal),
      resteAPayer: Number(c.resteAPayer),
      statut: c.statut,
    }));
    return {
      groupBy,
      colonnes: [
        { cle: "date", label: "Date" },
        { cle: "pointVente", label: "Point de vente" },
        { cle: "ville", label: "Ville" },
        { cle: "quartier", label: "Quartier" },
        { cle: "commercial", label: "Commercial" },
        { cle: "gamme", label: "Gamme" },
        { cle: "modePaiement", label: "Paiement" },
        { cle: "montantTotal", label: "Montant", droite: true, montant: true },
        { cle: "resteAPayer", label: "Reste à payer", droite: true, montant: true },
        { cle: "statut", label: "Statut" },
      ],
      lignes,
      totaux: {
        montantTotal: lignes.reduce((s, l) => s + l.montantTotal, 0),
        resteAPayer: lignes.reduce((s, l) => s + l.resteAPayer, 0),
      },
    };
  }

  // ---- Regroupements agrégés — clé + libellé selon la dimension ----
  type Cle = string;
  const cleEtLabel = (
    dim: Exclude<GroupBy, "vente" | "produit" | "historique">
  ): {
    cleCommande: (c: (typeof commandes)[number]) => Cle;
    cleVisite: (v: (typeof visites)[number]) => Cle;
    cleRecensement: (r: (typeof recensements)[number]) => Cle;
  } => {
    if (dim === "commercial") {
      return {
        cleCommande: (c) => c.commercialId,
        cleVisite: (v) => v.commercialId,
        cleRecensement: (r) => r.createdById,
      };
    }
    if (dim === "pointVente") {
      return {
        cleCommande: (c) => c.pointVenteId,
        cleVisite: (v) => v.pointVenteId,
        cleRecensement: (r) => r.id,
      };
    }
    if (dim === "ville") {
      return {
        cleCommande: (c) => c.pointVente.villeId || "sans-ville",
        cleVisite: (v) => v.pointVente.villeId || "sans-ville",
        cleRecensement: (r) => r.villeId || "sans-ville",
      };
    }
    // quartier — préfixé par la ville pour ne pas fusionner deux quartiers
    // homonymes de villes différentes.
    return {
      cleCommande: (c) => `${c.pointVente.villeId || "?"}||${c.pointVente.quartier || "Non précisé"}`,
      cleVisite: (v) => `${v.pointVente.villeId || "?"}||${v.pointVente.quartier || "Non précisé"}`,
      cleRecensement: (r) => `${r.villeId || "?"}||${r.quartier || "Non précisé"}`,
    };
  };

  const { cleCommande, cleVisite, cleRecensement } = cleEtLabel(groupBy);

  type Ligne = {
    id: string;
    label: string;
    sousLabel?: string;
    pointsVenteRecenses: number;
    visites: number;
    commandes: number;
    cartons: number;
    montantTotal: number;
    resteAPayer: number;
  };
  const parCle = new Map<Cle, Ligne>();

  function ligne(cle: Cle): Ligne {
    let l = parCle.get(cle);
    if (!l) {
      l = { id: cle, label: cle, pointsVenteRecenses: 0, visites: 0, commandes: 0, cartons: 0, montantTotal: 0, resteAPayer: 0 };
      parCle.set(cle, l);
    }
    return l;
  }

  for (const r of recensements) {
    const l = ligne(cleRecensement(r));
    l.pointsVenteRecenses += 1;
  }
  for (const v of visites) {
    const l = ligne(cleVisite(v));
    l.visites += 1;
  }
  for (const c of commandes) {
    const l = ligne(cleCommande(c));
    l.commandes += 1;
    l.cartons += c.lignes.reduce((t, x) => t + x.quantite, 0);
    l.montantTotal += Number(c.montantTotal);
    l.resteAPayer += Number(c.resteAPayer);

    // Renseigne le libellé lisible à la première occurrence rencontrée —
    // les commandes ont toujours les relations nécessaires chargées.
    if (l.label === l.id) {
      if (groupBy === "commercial") l.label = `${c.commercial.prenom} ${c.commercial.nom}`;
      else if (groupBy === "pointVente") {
        l.label = c.pointVente.nomEtablissement;
        l.sousLabel = `${c.pointVente.ville?.nom || "—"}${c.pointVente.quartier ? " · " + c.pointVente.quartier : ""}`;
      } else if (groupBy === "ville") l.label = c.pointVente.ville?.nom || "Sans ville";
      else if (groupBy === "quartier") {
        l.label = c.pointVente.quartier || "Non précisé";
        l.sousLabel = c.pointVente.ville?.nom || "—";
      }
    }
  }

  // Deuxième passe pour les lignes qui n'ont que des visites/recensements
  // (aucune commande) — leur libellé n'a pas encore été renseigné. On va
  // chercher l'info dans les tables de référence correspondantes.
  const clesSansLabel = [...parCle.entries()].filter(([cle, l]) => l.label === cle);
  if (clesSansLabel.length > 0) {
    if (groupBy === "commercial") {
      const ids = clesSansLabel.map(([cle]) => cle);
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true, prenom: true } });
      for (const u of users) parCle.get(u.id)!.label = `${u.prenom} ${u.nom}`;
    } else if (groupBy === "pointVente") {
      const ids = clesSansLabel.map(([cle]) => cle);
      const pvs = await prisma.pointVente.findMany({
        where: { id: { in: ids } },
        select: { id: true, nomEtablissement: true, quartier: true, ville: { select: { nom: true } } },
      });
      for (const p of pvs) {
        const l = parCle.get(p.id)!;
        l.label = p.nomEtablissement;
        l.sousLabel = `${p.ville?.nom || "—"}${p.quartier ? " · " + p.quartier : ""}`;
      }
    } else if (groupBy === "ville") {
      const ids = clesSansLabel.map(([cle]) => cle).filter((id) => id !== "sans-ville");
      const villes = await prisma.ville.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } });
      for (const v of villes) parCle.get(v.id)!.label = v.nom;
      if (parCle.has("sans-ville")) parCle.get("sans-ville")!.label = "Sans ville";
    } else if (groupBy === "quartier") {
      for (const [cle, l] of clesSansLabel) {
        const [villeId, quartier] = cle.split("||");
        l.label = quartier;
        if (villeId && villeId !== "?") {
          const v = await prisma.ville.findUnique({ where: { id: villeId }, select: { nom: true } });
          l.sousLabel = v?.nom || "—";
        } else {
          l.sousLabel = "—";
        }
      }
    }
  }

  const lignesTriees = [...parCle.values()].sort((a, b) => b.montantTotal - a.montantTotal);

  const colonnes: Colonne[] = [
    { cle: "label", label: groupBy === "commercial" ? "Commercial" : groupBy === "pointVente" ? "Point de vente" : groupBy === "ville" ? "Ville" : "Quartier" },
    ...(groupBy === "pointVente" || groupBy === "quartier" ? [{ cle: "sousLabel", label: groupBy === "pointVente" ? "Ville / Quartier" : "Ville" }] : []),
    { cle: "pointsVenteRecenses", label: "Points de vente recensés", droite: true },
    { cle: "visites", label: "Visites", droite: true },
    { cle: "commandes", label: "Commandes", droite: true },
    { cle: "cartons", label: "Cartons vendus", droite: true },
    { cle: "montantTotal", label: "Chiffre d'affaires", droite: true, montant: true },
    { cle: "partCA", label: "% du CA", droite: true, pourcentage: true },
    { cle: "resteAPayer", label: "Reste à payer", droite: true, montant: true },
  ];
  const caTotal = lignesTriees.reduce((s, l) => s + l.montantTotal, 0);

  return {
    groupBy,
    colonnes,
    lignes: lignesTriees.map((l) => ({
      id: l.id,
      label: l.label,
      sousLabel: l.sousLabel || "",
      pointsVenteRecenses: l.pointsVenteRecenses,
      visites: l.visites,
      commandes: l.commandes,
      cartons: l.cartons,
      montantTotal: l.montantTotal,
      partCA: caTotal > 0 ? (l.montantTotal / caTotal) * 100 : 0,
      resteAPayer: l.resteAPayer,
    })),
    totaux: {
      pointsVenteRecenses: lignesTriees.reduce((s, l) => s + l.pointsVenteRecenses, 0),
      visites: lignesTriees.reduce((s, l) => s + l.visites, 0),
      commandes: lignesTriees.reduce((s, l) => s + l.commandes, 0),
      cartons: lignesTriees.reduce((s, l) => s + l.cartons, 0),
      montantTotal: caTotal,
      partCA: caTotal > 0 ? 100 : 0,
      resteAPayer: lignesTriees.reduce((s, l) => s + l.resteAPayer, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Ventes par produit (cartons + chiffre d'affaires)
// ---------------------------------------------------------------------------

type WhereCommande = Parameters<typeof prisma.commande.findMany>[0] extends infer A
  ? A extends { where?: infer W } ? W : never
  : never;

async function rapportParProduit(f: FiltresRapport, whereCommande: WhereCommande): Promise<RapportResultat> {
  const [lignesCmd, produitsActifs] = await Promise.all([
    prisma.ligneCommande.findMany({
      where: { commande: whereCommande },
      select: {
        commandeId: true,
        produitId: true,
        libelleLibre: true,
        quantite: true,
        sousTotal: true,
        produit: { select: { nom: true, gamme: { select: { code: true, nom: true } } } },
        commande: { select: { gamme: { select: { code: true, nom: true } } } },
      },
    }),
    // Les produits actifs sans aucune vente apparaissent aussi (ligne à 0) :
    // on voit tout de suite ce qui ne se vend pas.
    prisma.produit.findMany({
      where: { actif: true, ...(f.gammeId ? { gammeId: f.gammeId } : {}) },
      select: { id: true, nom: true, gamme: { select: { code: true, nom: true } } },
    }),
  ]);

  type L = { id: string; label: string; sousLabel: string; commandes: Set<string>; cartons: number; montantTotal: number };
  const parCle = new Map<string, L>();
  const prendre = (cle: string, label: string, sousLabel: string) => {
    let l = parCle.get(cle);
    if (!l) {
      l = { id: cle, label, sousLabel, commandes: new Set(), cartons: 0, montantTotal: 0 };
      parCle.set(cle, l);
    }
    return l;
  };
  for (const p of produitsActifs) prendre(p.id, p.nom, p.gamme ? libelleGamme(p.gamme) : "—");
  for (const x of lignesCmd) {
    const gamme = x.produit?.gamme || x.commande.gamme;
    const l = x.produitId
      ? prendre(x.produitId, x.produit?.nom || "Produit supprimé", gamme ? libelleGamme(gamme) : "—")
      : prendre(`libre:${x.libelleLibre || ""}`, x.libelleLibre || "Article libre", gamme ? libelleGamme(gamme) : "—");
    l.commandes.add(x.commandeId);
    l.cartons += x.quantite;
    l.montantTotal += Number(x.sousTotal);
  }

  const lignes = [...parCle.values()].sort((a, b) => b.montantTotal - a.montantTotal || a.label.localeCompare(b.label));
  const caTotal = lignes.reduce((s, l) => s + l.montantTotal, 0);
  const cartonsTotal = lignes.reduce((s, l) => s + l.cartons, 0);
  const commandesDistinctes = new Set(lignesCmd.map((x) => x.commandeId)).size;

  return {
    groupBy: "produit",
    colonnes: [
      { cle: "label", label: "Produit" },
      { cle: "sousLabel", label: "Gamme" },
      { cle: "commandes", label: "Commandes", droite: true },
      { cle: "cartons", label: "Cartons vendus", droite: true },
      { cle: "prixMoyen", label: "Prix moyen / carton", droite: true, montant: true },
      { cle: "montantTotal", label: "Chiffre d'affaires", droite: true, montant: true },
      { cle: "partCA", label: "% du CA", droite: true, pourcentage: true },
    ],
    lignes: lignes.map((l) => ({
      id: l.id,
      label: l.label,
      sousLabel: l.sousLabel,
      commandes: l.commandes.size,
      cartons: l.cartons,
      prixMoyen: l.cartons > 0 ? Math.round(l.montantTotal / l.cartons) : 0,
      montantTotal: l.montantTotal,
      partCA: caTotal > 0 ? (l.montantTotal / caTotal) * 100 : 0,
    })),
    totaux: {
      commandes: commandesDistinctes,
      cartons: cartonsTotal,
      prixMoyen: cartonsTotal > 0 ? Math.round(caTotal / cartonsTotal) : 0,
      montantTotal: caTotal,
      partCA: caTotal > 0 ? 100 : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Historique des ventes par point de vente sur 12 mois glissants
// ---------------------------------------------------------------------------

const DECALAGE_MS = 60 * 60 * 1000; // Cameroun : UTC+1, sans heure d'été

/** Clé "AAAA-MM" d'une date, lue à l'heure du Cameroun. */
function moisDe(d: Date): string {
  return new Date(d.getTime() + DECALAGE_MS).toISOString().slice(0, 7);
}

async function rapportHistorique12Mois(f: FiltresRapport): Promise<RapportResultat> {
  const maintenant = new Date(Date.now() + DECALAGE_MS);
  const an = maintenant.getUTCFullYear();
  const mois0 = maintenant.getUTCMonth();

  // 12 mois se terminant par le mois en cours (le plus ancien d'abord).
  const mois: { cle: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(an, mois0 - i, 1));
    const label = d
      .toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" })
      .replace(".", "");
    mois.push({ cle: d.toISOString().slice(0, 7), label });
  }
  const debut = new Date(Date.UTC(an, mois0 - 11, 1) - DECALAGE_MS);

  const pv = filtrePointVente(f);
  const commandes = await prisma.commande.findMany({
    where: {
      createdAt: { gte: debut },
      ...(f.commercialId ? { commercialId: f.commercialId } : {}),
      ...(f.gammeId ? { gammeId: f.gammeId } : {}),
      ...(pv ? { pointVente: pv } : {}),
    },
    select: {
      createdAt: true,
      montantTotal: true,
      pointVenteId: true,
      pointVente: { select: { nomEtablissement: true, quartier: true, ville: { select: { nom: true } } } },
    },
  });

  type L = { id: string; label: string; sousLabel: string; parMois: Record<string, number>; commandes: number; total: number };
  const parPv = new Map<string, L>();
  for (const c of commandes) {
    let l = parPv.get(c.pointVenteId);
    if (!l) {
      l = {
        id: c.pointVenteId,
        label: c.pointVente.nomEtablissement,
        sousLabel: `${c.pointVente.ville?.nom || "—"}${c.pointVente.quartier ? " · " + c.pointVente.quartier : ""}`,
        parMois: {},
        commandes: 0,
        total: 0,
      };
      parPv.set(c.pointVenteId, l);
    }
    const cle = moisDe(c.createdAt);
    const m = Number(c.montantTotal);
    l.parMois[cle] = (l.parMois[cle] || 0) + m;
    l.commandes += 1;
    l.total += m;
  }

  const triees = [...parPv.values()].sort((a, b) => b.total - a.total);
  const totaux: Record<string, number> = { commandes: 0, total: 0 };
  for (const m of mois) totaux[`m_${m.cle}`] = 0;

  const lignes = triees.map((l) => {
    const ligne: Record<string, string | number> = {
      id: l.id,
      label: l.label,
      sousLabel: l.sousLabel,
      commandes: l.commandes,
    };
    for (const m of mois) {
      const v = l.parMois[m.cle] || 0;
      ligne[`m_${m.cle}`] = v;
      totaux[`m_${m.cle}`] += v;
    }
    ligne.total = l.total;
    totaux.commandes += l.commandes;
    totaux.total += l.total;
    return ligne;
  });

  return {
    groupBy: "historique",
    colonnes: [
      { cle: "label", label: "Point de vente" },
      { cle: "sousLabel", label: "Ville / Quartier" },
      ...mois.map((m) => ({ cle: `m_${m.cle}`, label: m.label, droite: true, montant: true })),
      { cle: "total", label: "Total 12 mois", droite: true, montant: true },
      { cle: "commandes", label: "Commandes", droite: true },
    ],
    lignes,
    totaux,
  };
}
