/**
 * Numérotation des documents des commandes déjà existantes.
 *
 * Chaque ancienne commande reçoit, dans l'ordre chronologique :
 *   - un bon de commande  (BCSIRI 00001…)  d'après sa date de commande ;
 *   - si elle est livrée : un bon de livraison (BLSIRI) et une facture de vente (FVSIRI)
 *     d'après sa date de livraison (à défaut sa date de commande).
 * Les séquences sont continues et ne sont jamais remises à zéro. Les commandes déjà
 * numérotées sont ignorées : le script peut être relancé sans risque.
 *
 * À lancer UNE FOIS, après `npx prisma db push` :
 *   npx tsx prisma/numeroter-documents.ts             (simulation, n'écrit rien)
 *   npx tsx prisma/numeroter-documents.ts --appliquer
 */
import { PrismaClient } from "@prisma/client";
import { prochainNumero } from "../lib/numerotation";

const prisma = new PrismaClient();

async function main() {
  const appliquer = process.argv.includes("--appliquer");

  const sansBC = await prisma.commande.findMany({ where: { numeroBC: null }, orderBy: [{ dateCommande: "asc" }, { id: "asc" }], select: { id: true } });
  const livrees = await prisma.commande.findMany({
    where: { statut: "LIVREE", OR: [{ numeroFV: null }, { numeroBL: null }] },
    select: { id: true, livreeLe: true, dateCommande: true, numeroBL: true, numeroFV: true },
  });
  livrees.sort((a, b) => +(a.livreeLe ?? a.dateCommande) - +(b.livreeLe ?? b.dateCommande) || a.id.localeCompare(b.id));

  console.log(`${sansBC.length} bon(s) de commande, ${livrees.filter((c) => !c.numeroBL).length} bon(s) de livraison, ${livrees.filter((c) => !c.numeroFV).length} facture(s) de vente à numéroter.`);
  if (!appliquer) {
    console.log("Simulation : rien n'a été écrit. Relancez avec --appliquer.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const c of sansBC) await tx.commande.update({ where: { id: c.id }, data: { numeroBC: await prochainNumero(tx, "BC") } });
      for (const c of livrees) {
        const data: { numeroBL?: string; numeroFV?: string } = {};
        if (!c.numeroBL) data.numeroBL = await prochainNumero(tx, "BL");
        if (!c.numeroFV) data.numeroFV = await prochainNumero(tx, "FV");
        await tx.commande.update({ where: { id: c.id }, data });
      }
    },
    { timeout: 120_000, maxWait: 20_000 }
  );
  console.log("Terminé.");
}

main().finally(() => prisma.$disconnect());
