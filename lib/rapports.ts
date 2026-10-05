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

export type GroupBy = "commercial" | "pointVente" | "ville" | "quartier" | "vente";

export type FiltresRapport = {
  dateFrom?: string;
  dateTo?: string;
  commercialId?: string;
  villeId?: string;
  quartier?: string;
  /** Filtre de gamme : ne concerne que les commandes / le CA (visites et recensements ne sont pas rattachés à une gamme). */
  gammeId?: string;
};

export type Colonne = { cle: string; label: string; droite?: boolean; montant?: boolean };
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
    dim: Exclude<GroupBy, "vente">
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
    montantTotal: number;
    resteAPayer: number;
  };
  const parCle = new Map<Cle, Ligne>();

  function ligne(cle: Cle): Ligne {
    let l = parCle.get(cle);
    if (!l) {
      l = { id: cle, label: cle, pointsVenteRecenses: 0, visites: 0, commandes: 0, montantTotal: 0, resteAPayer: 0 };
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
    { cle: "montantTotal", label: "Montant vendu", droite: true, montant: true },
    { cle: "resteAPayer", label: "Reste à payer", droite: true, montant: true },
  ];

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
      montantTotal: l.montantTotal,
      resteAPayer: l.resteAPayer,
    })),
    totaux: {
      pointsVenteRecenses: lignesTriees.reduce((s, l) => s + l.pointsVenteRecenses, 0),
      visites: lignesTriees.reduce((s, l) => s + l.visites, 0),
      commandes: lignesTriees.reduce((s, l) => s + l.commandes, 0),
      montantTotal: lignesTriees.reduce((s, l) => s + l.montantTotal, 0),
      resteAPayer: lignesTriees.reduce((s, l) => s + l.resteAPayer, 0),
    },
  };
}
