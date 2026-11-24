import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aEcriture, aAcces, peut } from "@/lib/permissions";
import { assurerGammes } from "@/lib/gammes";
import { enregistrerAchatStock } from "@/lib/caisse";

/** État courant du stock par produit — inclut les produits sans ligne Stock
 * encore créée (quantité affichée à 0) pour ne jamais en oublier un. */
export async function GET() {
  const session = await getSession();
  if (!aAcces(session, "stock")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  await assurerGammes();
  const produits = await prisma.produit.findMany({
    where: { actif: true },
    orderBy: { ordre: "asc" },
    include: { stock: true, gamme: true },
  });

  const items = produits.map((p) => ({
    produitId: p.id,
    nom: p.nom,
    volumeMl: p.volumeMl,
    gammeId: p.gammeId,
    gammeCode: p.gamme?.code ?? null,
    quantiteCartons: p.stock?.quantiteCartons ?? 0,
    seuilAlerte: p.stock?.seuilAlerte ?? 0,
    enAlerte: (p.stock?.quantiteCartons ?? 0) <= (p.stock?.seuilAlerte ?? 0),
  }));

  return NextResponse.json({ items });
}

/** Mouvement manuel (ENTREE réapprovisionnement, ou AJUSTEMENT d'inventaire). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!aEcriture(session, "stock")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { produitId, type, quantiteCartons, note, seuilAlerte, coutTotal } = await req.json();
  if (!produitId || !type || quantiteCartons === undefined) {
    return NextResponse.json({ error: "Données incomplètes." }, { status: 400 });
  }
  if (type !== "ENTREE" && type !== "AJUSTEMENT" && type !== "AVARIE" && type !== "ECHANTILLON" && type !== "GIFT") {
    return NextResponse.json({ error: "Type de mouvement invalide." }, { status: 400 });
  }

  // Au demi-carton près (0,5 ; 1 ; 1,5…).
  const quantite = Number(quantiteCartons);
  if (!Number.isFinite(quantite) || quantite === 0 || !Number.isInteger(quantite * 2)) {
    return NextResponse.json({ error: "Quantité invalide (entière ou par demi-carton)." }, { status: 400 });
  }

  // Sortie hors vente (avarie / échantillon / gift) : le stock diminue, rien n'est facturé ni encaissé.
  if (type === "AVARIE" || type === "ECHANTILLON" || type === "GIFT") {
    if (quantite < 0) return NextResponse.json({ error: "Quantité invalide." }, { status: 400 });
    const motif = String(note || "").trim();
    if (motif.length < 3) return NextResponse.json({ error: "Indiquez le motif (3 caractères minimum)." }, { status: 400 });
    const produit = await prisma.produit.findUnique({ where: { id: produitId }, select: { id: true } });
    if (!produit) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
    const refus = await prisma.$transaction(async (tx) => {
      // Décrément conditionnel : jamais de stock négatif, même si deux sorties arrivent en même temps.
      const r = await tx.stock.updateMany({ where: { produitId, quantiteCartons: { gte: quantite } }, data: { quantiteCartons: { decrement: quantite } } });
      if (r.count === 0) return "Stock insuffisant pour retirer cette quantité.";
      await tx.mouvementStock.create({
        data: { produitId, type: "SORTIE", quantiteCartons: quantite, referenceType: type, note: motif },
      });
      return null;
    });
    if (refus) return NextResponse.json({ error: refus }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  // ENTREE ajoute au stock ; AJUSTEMENT fixe directement la quantité (utile
  // pour recaler après un inventaire physique) — la variation réelle est
  // journalisée dans MouvementStock pour garder un historique cohérent.
  await prisma.$transaction(async (tx) => {
    const stockActuel = await tx.stock.findUnique({ where: { produitId } });
    const quantiteAvant = stockActuel?.quantiteCartons ?? 0;

    if (type === "ENTREE") {
      const cout = peut(session.role, "caisse") ? Math.round(Number(coutTotal) || 0) : 0;
      // Un coût d'achat saisi crée aussi la dépense de caisse correspondante.
      await enregistrerAchatStock(tx, {
        produitId,
        quantiteCartons: quantite,
        coutTotal: cout,
        note: note || null,
        creeParId: session.userId,
      });
      if (seuilAlerte !== undefined) {
        await tx.stock.update({ where: { produitId }, data: { seuilAlerte: parseInt(seuilAlerte, 10) } });
      }
    } else {
      const delta = quantite - quantiteAvant;
      await tx.stock.upsert({
        where: { produitId },
        update: {
          quantiteCartons: quantite,
          ...(seuilAlerte !== undefined ? { seuilAlerte: parseInt(seuilAlerte, 10) } : {}),
        },
        create: { produitId, quantiteCartons: quantite, seuilAlerte: seuilAlerte ? parseInt(seuilAlerte, 10) : 20 },
      });
      await tx.mouvementStock.create({
        data: { produitId, type: "AJUSTEMENT", quantiteCartons: delta, referenceType: "AJUSTEMENT", note: note || null },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
