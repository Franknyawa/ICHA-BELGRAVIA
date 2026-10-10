import { prisma } from "@/lib/prisma";
import { libelleGamme } from "@/lib/gammesClient";
import { dateFilter, filtrePointVente, type FiltresRapport, type GroupBy } from "@/lib/rapports";

/**
 * Détail d'UNE ligne d'un rapport (un commercial, un point de vente, une
 * ville, un quartier, un produit ou une commande) : c'est ce que l'admin
 * voit en cliquant sur la ligne, et ce qu'il peut imprimer seul.
 *
 * Les filtres du rapport (période, commercial, gamme, produit…) continuent de
 * s'appliquer ; seule la courbe des 12 derniers mois les ignore, pour toujours
 * montrer la tendance complète.
 */

export type DetailRapport = {
  titre: string;
  soustitre: string;
  infos: { label: string; valeur: string }[];
  kpis: { label: string; valeur: number | string; montant?: boolean }[];
  parMois: { label: string; cartons: number; montantTotal: number }[];
  parProduit: { label: string; cartons: number; montantTotal: number; partCA: number }[];
  classement?: { titre: string; lignes: { label: string; sousLabel?: string; commandes: number; cartons: number; montantTotal: number }[] };
  commandes: {
    id: string;
    date: string;
    pointVente: string;
    commercial: string;
    modePaiement: string;
    statut: string;
    cartons: number;
    montantTotal: number;
    resteAPayer: number;
  }[];
  commandesTronquees: boolean;
  /** Seulement pour le détail d'une commande. */
  lignesCommande?: { produit: string; quantite: number; prixUnitaire: number; sousTotal: number }[];
};

const DECALAGE_MS = 60 * 60 * 1000; // Cameroun : UTC+1
const MAX_COMMANDES = 300;

const moisDe = (d: Date) => new Date(d.getTime() + DECALAGE_MS).toISOString().slice(0, 7);

function fenetre12Mois() {
  const maintenant = new Date(Date.now() + DECALAGE_MS);
  const an = maintenant.getUTCFullYear();
  const m0 = maintenant.getUTCMonth();
  const mois: { cle: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(an, m0 - i, 1));
    mois.push({
      cle: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", ""),
    });
  }
  return { mois, debut: new Date(Date.UTC(an, m0 - 11, 1) - DECALAGE_MS) };
}

const SELECT_COMMANDE = {
  id: true,
  createdAt: true,
  montantTotal: true,
  resteAPayer: true,
  montantRecu: true,
  modePaiement: true,
  statut: true,
  commercial: { select: { nom: true, prenom: true } },
  gamme: { select: { code: true, nom: true } },
  pointVenteId: true,
  pointVente: { select: { nomEtablissement: true, quartier: true, ville: { select: { nom: true } } } },
  lignes: {
    select: {
      produitId: true,
      libelleLibre: true,
      quantite: true,
      prixUnitaire: true,
      sousTotal: true,
      produit: { select: { nom: true } },
    },
  },
} as const;

/** Conditions propres à la ligne cliquée. `garder` : quelles lignes de commande comptent. */
function conditionDimension(groupBy: GroupBy, id: string) {
  type Garder = (l: { produitId: string | null; libelleLibre: string | null }) => boolean;
  const tout: Garder = () => true;

  switch (groupBy) {
    case "commercial":
      return { where: { commercialId: id }, garder: tout };
    case "pointVente":
    case "historique":
      return { where: { pointVenteId: id }, garder: tout };
    case "ville":
      return { where: { pointVente: { villeId: id === "sans-ville" ? null : id } }, garder: tout };
    case "quartier": {
      const [villeId, quartier] = id.split("||");
      return {
        where: {
          pointVente: {
            villeId: villeId === "?" ? null : villeId,
            ...(quartier === "Non précisé" ? { OR: [{ quartier: null }, { quartier: "" }] } : { quartier }),
          },
        },
        garder: tout,
      };
    }
    case "produit": {
      if (id.startsWith("libre:")) {
        const libelle = id.slice(6);
        return {
          where: { lignes: { some: { produitId: null, libelleLibre: libelle || null } } },
          garder: ((l) => l.produitId === null && (l.libelleLibre || "") === libelle) as Garder,
        };
      }
      return { where: { lignes: { some: { produitId: id } } }, garder: ((l) => l.produitId === id) as Garder };
    }
    default:
      return { where: { id }, garder: tout };
  }
}

export async function detailRapport(groupBy: GroupBy, id: string, f: FiltresRapport): Promise<DetailRapport | null> {
  const dim = conditionDimension(groupBy, id);
  const pvFiltre = filtrePointVente(f);
  const { mois, debut } = fenetre12Mois();

  const dateWhere =
    groupBy === "historique" ? { createdAt: { gte: debut } } : dateFilter(f) ? { createdAt: dateFilter(f)! } : {};
  const filtresCommuns = {
    ...(groupBy !== "commercial" && f.commercialId ? { commercialId: f.commercialId } : {}),
    ...(f.gammeId ? { gammeId: f.gammeId } : {}),
    ...(f.produitId && groupBy !== "produit" ? { lignes: { some: { produitId: f.produitId } } } : {}),
  };
  const andPv = pvFiltre ? [{ pointVente: pvFiltre }] : [];
  // Le détail d'une commande ignore les filtres : on ouvre toujours la commande cliquée en entier.
  const where = groupBy === "vente" ? { id } : { AND: [dim.where, filtresCommuns, dateWhere, ...andPv] };

  // Quelles lignes comptent : le produit cliqué, sinon le produit filtré, sinon toutes.
  const garder =
    groupBy === "produit" || groupBy === "vente"
      ? dim.garder
      : f.produitId
        ? (l: { produitId: string | null }) => l.produitId === f.produitId
        : dim.garder;
  const filtreProduitActif = groupBy === "produit" || (groupBy !== "vente" && !!f.produitId);

  const commandes = await prisma.commande.findMany({
    where,
    select: SELECT_COMMANDE,
    orderBy: { createdAt: "desc" },
    // On lit plus que l'affichage pour que les totaux restent exacts ; la liste est tronquée plus bas.
    take: 5000,
  });

  // Une commande cliquée qui n'existe plus (ou hors filtres) : rien à montrer.
  if (groupBy === "vente" && commandes.length === 0) return null;

  const montantDe = (c: (typeof commandes)[number]) =>
    filtreProduitActif
      ? c.lignes.filter(garder).reduce((t, l) => t + Number(l.sousTotal), 0)
      : Number(c.montantTotal);
  const cartonsDe = (c: (typeof commandes)[number]) => c.lignes.filter(garder).reduce((t, l) => t + l.quantite, 0);
  const resteDe = (c: (typeof commandes)[number]) => (filtreProduitActif ? 0 : Number(c.resteAPayer));

  const nbCommandes = commandes.length;
  const caTotal = commandes.reduce((s, c) => s + montantDe(c), 0);
  const cartonsTotal = commandes.reduce((s, c) => s + cartonsDe(c), 0);
  const resteTotal = commandes.reduce((s, c) => s + resteDe(c), 0);

  // ---- Par produit -------------------------------------------------------
  const parProduitMap = new Map<string, { label: string; cartons: number; montantTotal: number }>();
  for (const c of commandes) {
    for (const l of c.lignes.filter(garder)) {
      const cle = l.produitId || `libre:${l.libelleLibre || ""}`;
      const e = parProduitMap.get(cle) || { label: l.produit?.nom || l.libelleLibre || "Article libre", cartons: 0, montantTotal: 0 };
      e.cartons += l.quantite;
      e.montantTotal += Number(l.sousTotal);
      parProduitMap.set(cle, e);
    }
  }
  const caProduits = [...parProduitMap.values()].reduce((s, p) => s + p.montantTotal, 0);
  const parProduit = [...parProduitMap.values()]
    .sort((a, b) => b.montantTotal - a.montantTotal)
    .map((p) => ({ ...p, partCA: caProduits > 0 ? (p.montantTotal / caProduits) * 100 : 0 }));

  // ---- Courbe 12 mois (sans le filtre de période) ---------------------------
  const histo = await prisma.commande.findMany({
    where: { AND: [dim.where, { createdAt: { gte: debut } }, filtresCommuns, ...andPv] },
    select: { createdAt: true, montantTotal: true, lignes: { select: { produitId: true, libelleLibre: true, quantite: true, sousTotal: true } } },
  });
  const parMoisMap = new Map<string, { cartons: number; montantTotal: number }>(
    mois.map((m) => [m.cle, { cartons: 0, montantTotal: 0 }])
  );
  for (const c of histo) {
    const e = parMoisMap.get(moisDe(c.createdAt));
    if (!e) continue;
    const lignes = c.lignes.filter(garder);
    e.cartons += lignes.reduce((t, l) => t + l.quantite, 0);
    e.montantTotal += filtreProduitActif ? lignes.reduce((t, l) => t + Number(l.sousTotal), 0) : Number(c.montantTotal);
  }
  const parMois = mois.map((m) => ({ label: m.label, ...parMoisMap.get(m.cle)! }));

  // ---- Classement secondaire --------------------------------------------------
  let classement: DetailRapport["classement"];
  const classementPar =
    groupBy === "ville" ? "quartier" : ["commercial", "quartier", "produit"].includes(groupBy) ? "pointVente" : null;
  if (classementPar) {
    const m = new Map<string, { label: string; sousLabel?: string; commandes: number; cartons: number; montantTotal: number }>();
    for (const c of commandes) {
      const cle = classementPar === "quartier" ? c.pointVente.quartier || "Non précisé" : c.pointVenteId;
      const e = m.get(cle) || {
        label: classementPar === "quartier" ? c.pointVente.quartier || "Non précisé" : c.pointVente.nomEtablissement,
        sousLabel:
          classementPar === "pointVente"
            ? `${c.pointVente.ville?.nom || "—"}${c.pointVente.quartier ? " · " + c.pointVente.quartier : ""}`
            : undefined,
        commandes: 0,
        cartons: 0,
        montantTotal: 0,
      };
      e.commandes += 1;
      e.cartons += cartonsDe(c);
      e.montantTotal += montantDe(c);
      m.set(cle, e);
    }
    classement = {
      titre: classementPar === "quartier" ? "Ventes par quartier" : "Ventes par point de vente",
      lignes: [...m.values()].sort((a, b) => b.montantTotal - a.montantTotal).slice(0, 15),
    };
  }

  // ---- Titre, informations et KPIs selon la dimension ---------------------------
  let titre = "Détail";
  let soustitre = "";
  const infos: DetailRapport["infos"] = [];
  const kpis: DetailRapport["kpis"] = [];

  if (groupBy === "pointVente" || groupBy === "historique") {
    const pv = await prisma.pointVente.findUnique({
      where: { id },
      select: {
        nomEtablissement: true,
        quartier: true,
        repereQuartier: true,
        nomPatron: true,
        telPatron: true,
        nomVendeur: true,
        telVendeur: true,
        ville: { select: { nom: true } },
        type: { select: { nom: true } },
        createdAt: true,
      },
    });
    if (!pv) return null;
    titre = pv.nomEtablissement;
    soustitre = `Point de vente · ${pv.ville?.nom || "—"}${pv.quartier ? " · " + pv.quartier : ""}`;
    if (pv.type) infos.push({ label: "Type", valeur: pv.type.nom });
    if (pv.repereQuartier) infos.push({ label: "Repère", valeur: pv.repereQuartier });
    if (pv.nomPatron || pv.telPatron) infos.push({ label: "Patron", valeur: [pv.nomPatron, pv.telPatron].filter(Boolean).join(" · ") });
    if (pv.nomVendeur || pv.telVendeur) infos.push({ label: "Vendeur", valeur: [pv.nomVendeur, pv.telVendeur].filter(Boolean).join(" · ") });
    infos.push({ label: "Recensé le", valeur: pv.createdAt.toLocaleDateString("fr-FR") });
    const visites = await prisma.visite.count({ where: { pointVenteId: id } });
    kpis.push({ label: "Visites", valeur: visites });
  } else if (groupBy === "commercial") {
    const u = await prisma.user.findUnique({ where: { id }, select: { nom: true, prenom: true } });
    if (!u) return null;
    titre = `${u.prenom} ${u.nom}`;
    soustitre = "Commercial";
    const [visites, recenses] = await Promise.all([
      prisma.visite.count({ where: { commercialId: id, ...(dateFilter(f) ? { createdAt: dateFilter(f)! } : {}) } }),
      prisma.pointVente.count({ where: { createdById: id, ...(dateFilter(f) ? { createdAt: dateFilter(f)! } : {}) } }),
    ]);
    kpis.push({ label: "Visites", valeur: visites }, { label: "Points de vente recensés", valeur: recenses });
  } else if (groupBy === "ville") {
    if (id === "sans-ville") titre = "Sans ville";
    else {
      const v = await prisma.ville.findUnique({ where: { id }, select: { nom: true } });
      if (!v) return null;
      titre = v.nom;
    }
    soustitre = "Ville";
    const pvCount = new Set(commandes.map((c) => c.pointVenteId)).size;
    kpis.push({ label: "Points de vente ayant commandé", valeur: pvCount });
  } else if (groupBy === "quartier") {
    const [villeId, quartier] = id.split("||");
    titre = quartier || "Non précisé";
    const v = villeId && villeId !== "?" ? await prisma.ville.findUnique({ where: { id: villeId }, select: { nom: true } }) : null;
    soustitre = `Quartier · ${v?.nom || "—"}`;
    const pvCount = new Set(commandes.map((c) => c.pointVenteId)).size;
    kpis.push({ label: "Points de vente ayant commandé", valeur: pvCount });
  } else if (groupBy === "produit") {
    if (id.startsWith("libre:")) {
      titre = id.slice(6) || "Article libre";
      soustitre = "Article libre";
    } else {
      const p = await prisma.produit.findUnique({ where: { id }, select: { nom: true, volumeMl: true, gamme: { select: { code: true, nom: true } } } });
      if (!p) return null;
      titre = p.nom;
      soustitre = `Produit · ${p.gamme ? libelleGamme(p.gamme) : "—"} · ${p.volumeMl / 10} cl`;
    }
    const pvCount = new Set(commandes.map((c) => c.pointVenteId)).size;
    kpis.push({ label: "Points de vente clients", valeur: pvCount });
  } else {
    // Une commande
    const c = commandes[0];
    titre = `Commande du ${c.createdAt.toLocaleDateString("fr-FR")}`;
    soustitre = `${c.pointVente.nomEtablissement} · ${c.pointVente.ville?.nom || "—"}${c.pointVente.quartier ? " · " + c.pointVente.quartier : ""}`;
    infos.push(
      { label: "Commercial", valeur: `${c.commercial.prenom} ${c.commercial.nom}` },
      { label: "Gamme", valeur: c.gamme ? libelleGamme(c.gamme) : "—" },
      { label: "Paiement", valeur: c.modePaiement },
      { label: "Statut", valeur: c.statut }
    );
    kpis.push(
      { label: "Montant", valeur: Number(c.montantTotal), montant: true },
      { label: "Reçu", valeur: Number(c.montantRecu), montant: true },
      { label: "Reste à payer", valeur: Number(c.resteAPayer), montant: true }
    );
  }

  if (groupBy !== "vente") {
    kpis.unshift(
      { label: "Commandes", valeur: nbCommandes },
      { label: "Cartons vendus", valeur: cartonsTotal },
      { label: "Chiffre d'affaires", valeur: caTotal, montant: true }
    );
    if (nbCommandes > 0) kpis.push({ label: "Panier moyen", valeur: Math.round(caTotal / nbCommandes), montant: true });
    if (!filtreProduitActif) kpis.push({ label: "Reste à payer", valeur: resteTotal, montant: true });
  }

  const liste = commandes.slice(0, MAX_COMMANDES).map((c) => ({
    id: c.id,
    date: c.createdAt.toLocaleDateString("fr-FR"),
    pointVente: c.pointVente.nomEtablissement,
    commercial: `${c.commercial.prenom} ${c.commercial.nom}`,
    modePaiement: c.modePaiement,
    statut: c.statut,
    cartons: cartonsDe(c),
    montantTotal: montantDe(c),
    resteAPayer: resteDe(c),
  }));

  return {
    titre,
    soustitre,
    infos,
    kpis,
    parMois,
    parProduit,
    classement,
    commandes: groupBy === "vente" ? [] : liste,
    commandesTronquees: commandes.length > MAX_COMMANDES,
    lignesCommande:
      groupBy === "vente"
        ? commandes[0].lignes.map((l) => ({
            produit: l.produit?.nom || l.libelleLibre || "Article libre",
            quantite: l.quantite,
            prixUnitaire: Number(l.prixUnitaire),
            sousTotal: Number(l.sousTotal),
          }))
        : undefined,
  };
}
