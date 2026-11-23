/**
 * Reprise des anciennes données pour le nouveau circuit de caisse.
 *
 * Avant : le montant « reçu » d'une commande entrait en caisse dès la vente.
 * Maintenant : la caisse ne se lit que dans les opérations (OperationCaisse).
 * Pour que le solde ne change pas au passage, ce script crée, pour chaque
 * ancienne commande, une opération « Reprise » égale à ce qui était déjà
 * compté en caisse (montantRecu moins les anciens encaissements de crédit),
 * et renseigne livreeLe pour les commandes déjà livrées.
 *
 * À lancer UNE SEULE FOIS, juste après `npx prisma db push` et avant
 * d'utiliser la nouvelle caisse :
 *   npx tsx prisma/migrer-caisse.ts           (simulation, n'écrit rien)
 *   npx tsx prisma/migrer-caisse.ts --appliquer
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const appliquer = process.argv.includes("--appliquer");

function mode(c: { modePaiement: string; operateurMobile: string | null }) {
  if (c.modePaiement === "MOBILE_MONEY") {
    return c.operateurMobile === "ORANGE_MONEY" || c.operateurMobile === "MTN_MOMO" ? c.operateurMobile : "MOBILE_MONEY";
  }
  return "ESPECES";
}

async function main() {
  const deja = await prisma.operationCaisse.count({ where: { categorie: "ENCAISSEMENT_COMMANDE", libelle: { startsWith: "Reprise" } } });
  if (deja > 0) {
    console.log(`La reprise a déjà été faite (${deja} opérations « Reprise »). Rien à faire.`);
    return;
  }

  const liens = await prisma.operationCaisse.groupBy({
    by: ["commandeId"],
    where: { categorie: "ENCAISSEMENT_CREDIT", commandeId: { not: null } },
    _sum: { montant: true },
  });
  const credits = new Map(liens.map((l) => [l.commandeId as string, Number(l._sum.montant || 0)]));

  const commandes = await prisma.commande.findMany({
    select: {
      id: true,
      statut: true,
      createdAt: true,
      dateLivraison: true,
      livreeLe: true,
      montantRecu: true,
      modePaiement: true,
      operateurMobile: true,
      pointVente: { select: { nomEtablissement: true } },
    },
  });

  let nbOps = 0;
  let total = 0;
  let nbLivrees = 0;
  const ops: Parameters<typeof prisma.operationCaisse.create>[0]["data"][] = [];
  for (const c of commandes) {
    const initial = Math.max(0, Number(c.montantRecu) - (credits.get(c.id) ?? 0));
    if (initial > 0) {
      nbOps++;
      total += initial;
      ops.push({
        type: "RECETTE",
        categorie: "ENCAISSEMENT_COMMANDE",
        montant: initial,
        libelle: `Reprise — ${c.pointVente.nomEtablissement}`,
        commandeId: c.id,
        modePaiement: mode(c),
        dateOperation: c.createdAt,
      });
    }
    if (c.statut === "LIVREE" && !c.livreeLe) nbLivrees++;
  }

  console.log(`${nbOps} opérations de reprise (${Math.round(total).toLocaleString("fr-FR")} FCFA) · ${nbLivrees} commandes livrées à dater.`);
  if (!appliquer) {
    console.log("Simulation : relancez avec --appliquer pour écrire en base.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < ops.length; i += 500) await tx.operationCaisse.createMany({ data: ops.slice(i, i + 500) });
    for (const c of commandes) {
      if (c.statut === "LIVREE" && !c.livreeLe) {
        await tx.commande.update({ where: { id: c.id }, data: { livreeLe: c.dateLivraison ?? c.createdAt } });
      }
    }
  }, { timeout: 120000 });
  console.log("Reprise terminée.");
}

main().finally(() => prisma.$disconnect());
