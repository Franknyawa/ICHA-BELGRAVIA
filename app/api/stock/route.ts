import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { assurerGammes } from "@/lib/gammes";

/** État courant du stock par produit — inclut les produits sans ligne Stock
 * encore créée (quantité affichée à 0) pour ne jamais en oublier un. */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
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
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { produitId, type, quantiteCartons, note, seuilAlerte } = await req.json();
  if (!produitId || !type || quantiteCartons === undefined) {
    return NextResponse.json({ error: "Données incomplètes." }, { status: 400 });
  }
  if (type !== "ENTREE" && type !== "AJUSTEMENT") {
    return NextResponse.json({ error: "Type de mouvement invalide." }, { status: 400 });
  }

  const quantite = parseInt(quantiteCartons, 10);
  if (!Number.isFinite(quantite) || quantite === 0) {
    return NextResponse.json({ error: "Quantité invalide." }, { status: 400 });
  }

  // ENTREE ajoute au stock ; AJUSTEMENT fixe directement la quantité (utile
  // pour recaler après un inventaire physique) — la variation réelle est
  // journalisée dans MouvementStock pour garder un historique cohérent.
  await prisma.$transaction(async (tx) => {
    const stockActuel = await tx.stock.findUnique({ where: { produitId } });
    const quantiteAvant = stockActuel?.quantiteCartons ?? 0;

    if (type === "ENTREE") {
      await tx.stock.upsert({
        where: { produitId },
        update: {
          quantiteCartons: { increment: quantite },
          ...(seuilAlerte !== undefined ? { seuilAlerte: parseInt(seuilAlerte, 10) } : {}),
        },
        create: { produitId, quantiteCartons: quantite, seuilAlerte: seuilAlerte ? parseInt(seuilAlerte, 10) : 20 },
      });
      await tx.mouvementStock.create({
        data: { produitId, type: "ENTREE", quantiteCartons: quantite, referenceType: "AJUSTEMENT", note: note || null },
      });
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
