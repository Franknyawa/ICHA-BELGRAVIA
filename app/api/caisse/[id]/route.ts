import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aEcriture } from "@/lib/permissions";

/**
 * Annule une opération de caisse.
 * - Achat de stock : retire aussi les cartons ajoutés.
 * - Encaissement de commande : la somme redevient « à encaisser » (le reste se déduit des encaissements).
 * - Transfert : annule les deux lignes (sortie et entrée).
 * - Ancien encaissement de crédit : remet la somme en « reste à payer » sur la commande.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!aEcriture(session, "caisse")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const op = await prisma.operationCaisse.findUnique({ where: { id: params.id } });
  if (!op) return NextResponse.json({ error: "Opération introuvable." }, { status: 404 });

  if (op.categorie === "REMBOURSEMENT_CLIENT") {
    return NextResponse.json({ error: "Un remboursement client est lié à une facture d'avoir / retour émise : il ne peut pas être annulé." }, { status: 409 });
  }
  if (op.commandeId) {
    const n = await prisma.documentCorrectif.count({ where: { commandeId: op.commandeId } });
    if (n > 0) {
      return NextResponse.json({ error: "Une facture d'avoir ou retour a été émise pour cette commande : cet encaissement ne peut plus être annulé." }, { status: 409 });
    }
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (op.mouvementStockId && op.produitId && op.quantiteCartons) {
        const stock = await tx.stock.findUnique({ where: { produitId: op.produitId } });
        if ((stock?.quantiteCartons ?? 0) < op.quantiteCartons) throw new Error("STOCK_INSUFFISANT");
        await tx.stock.update({ where: { produitId: op.produitId }, data: { quantiteCartons: { decrement: op.quantiteCartons } } });
        await tx.mouvementStock.deleteMany({ where: { id: op.mouvementStockId } });
      }
      if (op.categorie === "ENCAISSEMENT_CREDIT" && op.commandeId) {
        const cmd = await tx.commande.findUnique({ where: { id: op.commandeId }, select: { modePaiement: true } });
        if (cmd) {
          await tx.commande.update({
            where: { id: op.commandeId },
            data: {
              montantRecu: { decrement: op.montant },
              resteAPayer: { increment: op.montant },
              ...(cmd.modePaiement === "MOBILE_MONEY" ? { mobileMoneyConfirme: false } : {}),
            },
          });
        }
      }
      if (op.transfertId) await tx.operationCaisse.deleteMany({ where: { transfertId: op.transfertId } });
      else await tx.operationCaisse.delete({ where: { id: op.id } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STOCK_INSUFFISANT") {
      return NextResponse.json(
        { error: "Impossible d'annuler : une partie de ce stock a déjà été vendue. Corrigez plutôt par un ajustement de stock." },
        { status: 409 }
      );
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
