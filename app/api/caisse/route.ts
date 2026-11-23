import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces, aEcriture } from "@/lib/permissions";
import { intervalleJours, dateValide, debutJour, debutAujourdhui } from "@/lib/dates";
import {
  CATEGORIES_DEPENSE,
  CATEGORIES_RECETTE,
  LIBELLE_CANAL,
  LIBELLE_MODE_COMMANDE,
  canalDe,
  enregistrerAchatStock,
  encaisseParCommande,
  modeOperation,
  modePourCanal,
  soldeGlobal,
  valoriserStock,
  type AEncaisser,
  type Canal,
  type DetailsCommande,
  type LigneJournal,
  type ModeCaisse,
} from "@/lib/caisse";

export const dynamic = "force-dynamic";

const SELECT_COMMANDE = {
  id: true,
  createdAt: true,
  statut: true,
  dateLivraison: true,
  livreeLe: true,
  montantTotal: true,
  montantRecu: true,
  resteAPayer: true,
  modePaiement: true,
  operateurMobile: true,
  mobileMoneyConfirme: true,
  pointVente: {
    select: {
      nomEtablissement: true,
      quartier: true,
      repereQuartier: true,
      nomPatron: true,
      nomVendeur: true,
      telPatron: true,
      telVendeur: true,
      ville: { select: { nom: true } },
    },
  },
  commercial: { select: { nom: true, prenom: true } },
  lignes: { select: { quantite: true } },
} as const;

type CommandeCaisse = Awaited<ReturnType<typeof chargerCommandes>>[number];
async function chargerCommandes(where: object, take = 1000) {
  return prisma.commande.findMany({ where, orderBy: { createdAt: "desc" }, take, select: SELECT_COMMANDE });
}

function details(c: CommandeCaisse, encaisse: number): DetailsCommande {
  const pv = c.pointVente;
  return {
    commandeId: c.id,
    pointVente: pv.nomEtablissement,
    localisation: [pv.quartier, pv.ville?.nom].filter(Boolean).join(", ") || "—",
    client: pv.nomPatron || pv.nomVendeur || "—",
    telephone: pv.telPatron || pv.telVendeur || null,
    agent: `${c.commercial.prenom} ${c.commercial.nom}`,
    modePaiementCommande:
      c.modePaiement === "MOBILE_MONEY"
        ? `${c.operateurMobile === "ORANGE_MONEY" ? "Orange Money" : c.operateurMobile === "MTN_MOMO" ? "MTN MoMo" : "Mobile Money"}${c.mobileMoneyConfirme ? "" : " (non confirmé)"}`
        : LIBELLE_MODE_COMMANDE[c.modePaiement] || c.modePaiement,
    montantTotal: Number(c.montantTotal),
    reste: Math.max(0, Number(c.montantTotal) - encaisse),
  };
}

/** Journal + synthèse de caisse sur la période (jours du Cameroun), soldes, commandes à encaisser, stock valorisé. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!aAcces(session, "caisse")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const intervalle = intervalleJours(sp.get("du"), sp.get("au"));

  const [operations, global, stock, livrees, encaisseTout] = await Promise.all([
    prisma.operationCaisse.findMany({
      where: intervalle ? { dateOperation: intervalle } : {},
      orderBy: { dateOperation: "desc" },
      take: 1000,
    }),
    soldeGlobal(),
    valoriserStock(),
    // Commandes dont la livraison a été effectuée (archivées comprises : une dette reste une dette).
    chargerCommandes({ statut: "LIVREE" }, 5000),
    encaisseParCommande(),
  ]);

  // Commandes citées par les opérations de la période mais absentes des livrées (anciens encaissements).
  const connues = new Set(livrees.map((c) => c.id));
  const manquantes = [...new Set(operations.map((o) => o.commandeId).filter((x): x is string => !!x && !connues.has(x)))];
  const autres = manquantes.length ? await chargerCommandes({ id: { in: manquantes } }, 1000) : [];
  const parId = new Map<string, CommandeCaisse>([...livrees, ...autres].map((c) => [c.id, c]));

  const produits = await prisma.produit.findMany({ select: { id: true, nom: true } });
  const nomProduit = new Map(produits.map((p) => [p.id, p.nom]));

  const journal: LigneJournal[] = operations.map((o) => {
    const c = o.commandeId ? parId.get(o.commandeId) : undefined;
    const transfert = o.categorie === "TRANSFERT";
    return {
      id: o.id,
      date: o.dateOperation.toISOString(),
      type: o.type,
      categorie: o.categorie,
      libelle: o.libelle,
      montant: Number(o.montant),
      source: transfert ? "TRANSFERT" : o.commandeId ? "ENCAISSEMENT" : "MANUEL",
      mode: modeOperation(o.modePaiement),
      details: c ? details(c, encaisseTout.get(c.id) ?? 0) : undefined,
      produit: o.produitId ? nomProduit.get(o.produitId) ?? null : null,
      quantiteCartons: o.quantiteCartons,
      annulable: true,
    };
  });

  // Transferts exclus des recettes / dépenses : l'argent change seulement de canal.
  const hors = journal.filter((l) => l.source !== "TRANSFERT");
  const somme = (f: (l: LigneJournal) => boolean) => hors.filter(f).reduce((s, l) => s + l.montant, 0);
  const recettesEncaissements = somme((l) => l.source === "ENCAISSEMENT");
  const recettesAutres = somme((l) => l.source === "MANUEL" && l.type === "RECETTE");
  const depenses = somme((l) => l.type === "DEPENSE");
  const recettes = recettesEncaissements + recettesAutres;

  const parCanal: Record<Canal, number> = { ESPECES: 0, OM_MOMO: 0, BANQUE: 0 };
  for (const l of journal) {
    if (l.mode) parCanal[canalDe(l.mode)] += l.type === "RECETTE" ? l.montant : -l.montant;
  }

  const debut = debutAujourdhui().getTime();
  const aEncaisser: AEncaisser[] = livrees
    .map((c) => {
      const encaisse = encaisseTout.get(c.id) ?? 0;
      const prevue = c.dateLivraison ?? c.livreeLe;
      return {
        ...details(c, encaisse),
        date: c.createdAt.toISOString(),
        livreeLe: c.livreeLe ? c.livreeLe.toISOString() : null,
        datePrevue: prevue ? prevue.toISOString() : null,
        enRetard: !!prevue && prevue.getTime() < debut,
        encaisse,
      };
    })
    .filter((c) => c.reste > 0)
    .sort((a, b) => ((a.datePrevue ?? a.date) < (b.datePrevue ?? b.date) ? -1 : 1));

  const parCategorie = new Map<string, { type: string; montant: number }>();
  for (const l of hors) {
    if (l.montant <= 0) continue;
    const cur = parCategorie.get(l.categorie) ?? { type: l.type, montant: 0 };
    cur.montant += l.montant;
    parCategorie.set(l.categorie, cur);
  }

  return NextResponse.json({
    periode: { du: sp.get("du"), au: sp.get("au") },
    resume: {
      recettesEncaissements,
      nbEncaissements: hors.filter((l) => l.source === "ENCAISSEMENT").length,
      recettesAutres,
      recettes,
      depenses,
      solde: recettes - depenses,
      aEncaisser: aEncaisser.reduce((s, c) => s + c.reste, 0),
      nbAEncaisser: aEncaisser.length,
      nbEnRetard: aEncaisser.filter((c) => c.enRetard).length,
      parCanal,
      tronque: operations.length >= 1000,
    },
    global,
    stock,
    aEncaisser,
    parCategorie: [...parCategorie.entries()].map(([categorie, v]) => ({ categorie, ...v })),
    journal,
  });
}

function dateOperationDe(date: unknown): Date {
  let d = new Date();
  if (dateValide(typeof date === "string" ? date : null)) {
    // Date saisie = jour (Cameroun) ; on garde l'heure actuelle pour ordonner le journal.
    d = new Date(debutJour(date as string).getTime() + (Date.now() - debutAujourdhui().getTime()));
    if (d.getTime() > Date.now()) d = new Date();
  }
  return d;
}

const ERREUR_CONCURRENCE = "Une autre opération vient d'être enregistrée. Rafraîchissez puis recommencez.";

/** Transaction sérialisable : deux encaissements simultanés ne peuvent pas dépasser le reste dû. */
function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * Saisie : encaissement d'une commande livrée (liée à la commande), transfert entre canaux,
 * recette libre, dépense, achat de stock.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!aEcriture(session, "caisse")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const montant = Math.round(Number(b.montant));
  if (!Number.isFinite(montant) || montant <= 0) return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
  const libelle = String(b.libelle || "").trim().slice(0, 200);
  const dateOperation = dateOperationDe(b.date);

  try {
    // --- Transfert entre canaux : une sortie + une entrée, liées par transfertId -------------
    if (b.type === "TRANSFERT") {
      const de = modePourCanal(b.de);
      const vers = modePourCanal(b.vers);
      if (!de || !vers || canalDe(de) === canalDe(vers)) {
        return NextResponse.json({ error: "Choisissez deux canaux différents." }, { status: 400 });
      }
      const canalSource: Canal = canalDe(de);
      await transaction(async (tx) => {
        const g = await soldeGlobal();
        if (g.parCanal[canalSource] < montant) throw new Error(`SOLDE:${canalSource}`);
        const transfertId = randomUUID();
        const lib = `Transfert ${LIBELLE_CANAL[canalSource]} → ${LIBELLE_CANAL[canalDe(vers)]}${libelle ? ` — ${libelle}` : ""}`;
        const base = { categorie: "TRANSFERT", montant, libelle: lib, transfertId, creeParId: session.userId, dateOperation };
        await tx.operationCaisse.create({ data: { ...base, type: "DEPENSE", modePaiement: de } });
        await tx.operationCaisse.create({ data: { ...base, type: "RECETTE", modePaiement: vers } });
      });
      return NextResponse.json({ ok: true });
    }

    // --- Encaissement d'une commande livrée --------------------------------------------------
    if (b.type === "ENCAISSEMENT") {
      if (!b.commandeId) return NextResponse.json({ error: "Choisissez la commande à encaisser." }, { status: 400 });
      await transaction(async (tx) => {
        const cmd = await tx.commande.findUnique({
          where: { id: b.commandeId },
          select: { id: true, statut: true, montantTotal: true, operateurMobile: true, pointVente: { select: { nomEtablissement: true } } },
        });
        if (!cmd) throw new Error("INTROUVABLE");
        if (cmd.statut !== "LIVREE") throw new Error("NON_LIVREE");
        const mode = modePourCanal(b.canal, cmd.operateurMobile);
        if (!mode) throw new Error("CANAL");
        const deja = await tx.operationCaisse.aggregate({
          where: { commandeId: cmd.id, categorie: { in: ["ENCAISSEMENT_COMMANDE", "ENCAISSEMENT_CREDIT"] } },
          _sum: { montant: true },
        });
        const reste = Number(cmd.montantTotal) - Number(deja._sum.montant || 0);
        if (reste <= 0) throw new Error("SOLDEE");
        if (montant > reste) throw new Error(`TROP:${reste}`);
        await tx.operationCaisse.create({
          data: {
            type: "RECETTE",
            categorie: "ENCAISSEMENT_COMMANDE",
            montant,
            libelle: libelle || `Encaissement — ${cmd.pointVente.nomEtablissement}`,
            commandeId: cmd.id,
            modePaiement: mode,
            creeParId: session.userId,
            dateOperation,
          },
        });
      });
      return NextResponse.json({ ok: true });
    }

    // --- Recette libre / dépense / achat de stock --------------------------------------------
    const type = b.type as "RECETTE" | "DEPENSE";
    const categorie = String(b.categorie || "");
    const mode = modePourCanal(b.canal) ?? "ESPECES";
    if (type !== "RECETTE" && type !== "DEPENSE") return NextResponse.json({ error: "Type d'opération invalide." }, { status: 400 });
    const valides = type === "RECETTE" ? CATEGORIES_RECETTE : CATEGORIES_DEPENSE;
    if (!(categorie in valides)) return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });

    if (categorie === "REAPPROVISIONNEMENT") {
      const quantite = parseInt(b.quantiteCartons, 10);
      if (!b.produitId || !Number.isFinite(quantite) || quantite <= 0) {
        return NextResponse.json({ error: "Choisissez un produit et une quantité de cartons." }, { status: 400 });
      }
      const produit = await prisma.produit.findUnique({ where: { id: b.produitId } });
      if (!produit) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
      await prisma.$transaction(async (tx) => {
        await enregistrerAchatStock(tx, {
          produitId: b.produitId,
          quantiteCartons: quantite,
          coutTotal: montant,
          note: libelle || "Achat de stock",
          creeParId: session.userId,
          dateOperation,
          modePaiement: mode,
        });
      });
      return NextResponse.json({ ok: true });
    }

    if (!libelle) return NextResponse.json({ error: "Indiquez un libellé." }, { status: 400 });
    await prisma.operationCaisse.create({
      data: { type, categorie, montant, libelle, modePaiement: mode, creeParId: session.userId, dateOperation },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const code = (e as { code?: string })?.code;
    if (code === "P2034") return NextResponse.json({ error: ERREUR_CONCURRENCE }, { status: 409 });
    if (m === "INTROUVABLE") return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
    if (m === "NON_LIVREE") return NextResponse.json({ error: "Cette commande n'est pas encore livrée : effectuez d'abord la livraison." }, { status: 409 });
    if (m === "CANAL") return NextResponse.json({ error: "Choisissez Espèces, OM/MOMO ou Banque." }, { status: 400 });
    if (m === "SOLDEE") return NextResponse.json({ error: "Cette commande est déjà entièrement encaissée." }, { status: 409 });
    if (m.startsWith("TROP:")) {
      return NextResponse.json({ error: `Cette commande n'a plus que ${Number(m.slice(5)).toLocaleString("fr-FR")} FCFA à encaisser.` }, { status: 400 });
    }
    if (m.startsWith("SOLDE:")) {
      return NextResponse.json({ error: `Solde insuffisant sur le canal ${LIBELLE_CANAL[m.slice(6) as Canal]}.` }, { status: 400 });
    }
    throw e;
  }
}
