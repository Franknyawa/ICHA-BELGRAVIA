import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { intervalleJours, dateValide, debutJour, debutAujourdhui } from "@/lib/dates";
import {
  CATEGORIES_DEPENSE,
  CATEGORIES_RECETTE,
  LIBELLE_MODE_COMMANDE,
  enregistrerAchatStock,
  encaisseParCommande,
  modeDeVente,
  modeOperation,
  soldeGlobal,
  valoriserStock,
  type DetailsCommande,
  type LigneJournal,
  type ModeCaisse,
} from "@/lib/caisse";

export const dynamic = "force-dynamic";

const SELECT_COMMANDE = {
  id: true,
  createdAt: true,
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

function details(c: CommandeCaisse): DetailsCommande {
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
    reste: Number(c.resteAPayer),
  };
}

/** Journal + synthèse de caisse sur la période (jours du Cameroun), soldes, crédits à encaisser, stock valorisé. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const intervalle = intervalleJours(sp.get("du"), sp.get("au"));

  const [commandes, operations, global, stock, creancesBrutes] = await Promise.all([
    chargerCommandes(intervalle ? { createdAt: intervalle } : {}),
    prisma.operationCaisse.findMany({
      where: intervalle ? { dateOperation: intervalle } : {},
      orderBy: { dateOperation: "desc" },
      take: 1000,
    }),
    soldeGlobal(),
    valoriserStock(),
    chargerCommandes({ resteAPayer: { gt: 0 } }, 500),
  ]);

  // Commandes liées à des encaissements de la période mais créées avant elle.
  const idsLies = operations.map((o) => o.commandeId).filter((x): x is string => !!x);
  const dejaChargees = new Set(commandes.map((c) => c.id));
  const manquantes = idsLies.filter((id) => !dejaChargees.has(id));
  const commandesLiees = manquantes.length ? await chargerCommandes({ id: { in: manquantes } }, 1000) : [];
  const parId = new Map<string, CommandeCaisse>([...commandes, ...commandesLiees, ...creancesBrutes].map((c) => [c.id, c]));

  const encaisse = await encaisseParCommande(commandes.map((c) => c.id));
  const produits = await prisma.produit.findMany({ select: { id: true, nom: true } });
  const nomProduit = new Map(produits.map((p) => [p.id, p.nom]));

  const journal: LigneJournal[] = [];

  for (const c of commandes) {
    const total = Number(c.montantTotal);
    const initial = Math.max(0, Number(c.montantRecu) - (encaisse.get(c.id) ?? 0));
    const cartons = c.lignes.reduce((s, l) => s + l.quantite, 0);
    const d = details(c);
    journal.push({
      id: `vente-${c.id}`,
      date: c.createdAt.toISOString(),
      type: "RECETTE",
      categorie: "VENTE",
      libelle: `Vente — ${d.pointVente} (${cartons} carton${cartons > 1 ? "s" : ""})`,
      montant: initial,
      credit: Math.max(0, total - initial),
      source: "VENTE",
      mode: initial > 0 ? modeDeVente(c) : null,
      details: d,
      quantiteCartons: cartons,
      annulable: false,
    });
  }

  for (const o of operations) {
    const c = o.commandeId ? parId.get(o.commandeId) : undefined;
    journal.push({
      id: o.id,
      date: o.dateOperation.toISOString(),
      type: o.type,
      categorie: o.categorie,
      libelle: o.libelle,
      montant: Number(o.montant),
      credit: 0,
      source: o.commandeId ? "ENCAISSEMENT" : "MANUEL",
      mode: modeOperation(o.modePaiement),
      details: c ? details(c) : undefined,
      produit: o.produitId ? nomProduit.get(o.produitId) ?? null : null,
      quantiteCartons: o.quantiteCartons,
      annulable: true,
    });
  }
  journal.sort((a, b) => (a.date < b.date ? 1 : -1));

  const somme = (f: (l: LigneJournal) => boolean) => journal.filter(f).reduce((s, l) => s + l.montant, 0);
  const recettesVentes = somme((l) => l.source === "VENTE");
  const recettesEncaissements = somme((l) => l.source === "ENCAISSEMENT");
  const recettesAutres = somme((l) => l.source === "MANUEL" && l.type === "RECETTE");
  const depenses = somme((l) => l.type === "DEPENSE");
  const recettes = recettesVentes + recettesEncaissements + recettesAutres;

  const parMode: Record<string, number> = {};
  for (const l of journal) if (l.type === "RECETTE" && l.mode && l.montant > 0) parMode[l.mode] = (parMode[l.mode] || 0) + l.montant;

  const parCategorie = new Map<string, { type: string; montant: number }>();
  for (const l of journal) {
    if (l.montant <= 0) continue;
    const cur = parCategorie.get(l.categorie) ?? { type: l.type, montant: 0 };
    cur.montant += l.montant;
    parCategorie.set(l.categorie, cur);
  }

  const creances = creancesBrutes
    .map((c) => ({ ...details(c), date: c.createdAt.toISOString() }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return NextResponse.json({
    periode: { du: sp.get("du"), au: sp.get("au") },
    resume: {
      recettesVentes,
      recettesEncaissements,
      recettesAutres,
      recettes,
      depenses,
      solde: recettes - depenses,
      creditAccorde: journal.filter((l) => l.source === "VENTE").reduce((s, l) => s + l.credit, 0),
      creancesARecouvrer: creances.reduce((s, c) => s + c.reste, 0),
      nbCreances: creances.length,
      parMode,
      tronque: commandes.length >= 1000 || operations.length >= 1000,
    },
    global,
    stock,
    creances,
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

/** Saisie : encaissement d'un crédit (lié à la commande), recette libre, dépense, achat de stock. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const type = b.type as "RECETTE" | "DEPENSE";
  const categorie = String(b.categorie || "");
  const montant = Math.round(Number(b.montant));
  const libelle = String(b.libelle || "").trim().slice(0, 200);
  const mode: ModeCaisse = ["ESPECES", "ORANGE_MONEY", "MTN_MOMO"].includes(b.modePaiement) ? b.modePaiement : "ESPECES";

  if (type !== "RECETTE" && type !== "DEPENSE") return NextResponse.json({ error: "Type d'opération invalide." }, { status: 400 });
  const valides = type === "RECETTE" ? CATEGORIES_RECETTE : CATEGORIES_DEPENSE;
  if (!(categorie in valides)) return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
  if (!Number.isFinite(montant) || montant <= 0) return NextResponse.json({ error: "Montant invalide." }, { status: 400 });

  const dateOperation = dateOperationDe(b.date);

  // Achat de stock : entrée de stock + dépense, indissociables.
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

  // Encaissement d'un crédit : toujours rattaché à une commande, dont il met à jour le solde.
  if (categorie === "ENCAISSEMENT_CREDIT") {
    if (!b.commandeId) return NextResponse.json({ error: "Choisissez la commande à encaisser." }, { status: 400 });
    try {
      await prisma.$transaction(async (tx) => {
        const cmd = await tx.commande.findUnique({
          where: { id: b.commandeId },
          select: { id: true, resteAPayer: true, modePaiement: true, pointVente: { select: { nomEtablissement: true } } },
        });
        if (!cmd) throw new Error("INTROUVABLE");
        const reste = Number(cmd.resteAPayer);
        if (reste <= 0) throw new Error("SOLDEE");
        if (montant > reste) throw new Error(`TROP:${reste}`);
        const nouveauReste = reste - montant;
        await tx.commande.update({
          where: { id: cmd.id },
          data: {
            montantRecu: { increment: montant },
            resteAPayer: nouveauReste,
            // Un paiement Mobile Money jusque-là « non confirmé » devient confirmé une fois soldé.
            ...(nouveauReste === 0 && cmd.modePaiement === "MOBILE_MONEY" ? { mobileMoneyConfirme: true } : {}),
          },
        });
        await tx.operationCaisse.create({
          data: {
            type: "RECETTE",
            categorie,
            montant,
            libelle: libelle || `Encaissement crédit — ${cmd.pointVente.nomEtablissement}`,
            commandeId: cmd.id,
            modePaiement: mode,
            creeParId: session.userId,
            dateOperation,
          },
        });
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "INTROUVABLE") return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
      if (m === "SOLDEE") return NextResponse.json({ error: "Cette commande est déjà soldée." }, { status: 409 });
      if (m.startsWith("TROP:")) {
        return NextResponse.json({ error: `Cette commande n'a plus que ${Number(m.slice(5)).toLocaleString("fr-FR")} FCFA à encaisser.` }, { status: 400 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  }

  if (!libelle) return NextResponse.json({ error: "Indiquez un libellé." }, { status: 400 });
  await prisma.operationCaisse.create({
    data: { type, categorie, montant, libelle, modePaiement: mode, creeParId: session.userId, dateOperation },
  });
  return NextResponse.json({ ok: true });
}
