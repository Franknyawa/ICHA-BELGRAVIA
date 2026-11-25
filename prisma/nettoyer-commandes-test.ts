/**
 * Réinitialisation avant la mise en service : repart de zéro sur les commandes, la caisse et le stock,
 * en gardant les paramètres et les points de vente recensés.
 *
 * Supprimé / remis à zéro :
 *   - COMMANDES : toutes les commandes (ventes), leurs lignes, factures retour / avoir (FR / FA),
 *     notifications, prix négociés mémorisés, fiche « Client divers » (recréée à la prochaine vente) ;
 *   - CAISSE : tout le journal (encaissements, remboursements, dépenses, recettes, transferts) ;
 *     le solde de chaque canal repart donc à 0 ;
 *   - STOCK : tout l'historique des mouvements (entrées, sorties, avaries, échantillons, gifts, retours) ;
 *     la quantité de chaque produit repart à 0 (le seuil d'alerte de chaque produit est conservé) ;
 *   - ALERTES (stock faible, livraisons, crédits) ;
 *   - NUMÉROTATION BC / BL / FV / FR / FA : repart à 1 (sauf --garder-numeros).
 *
 * Conservé : points de vente recensés, visites, photos, marques présentes, comptes utilisateurs,
 * produits, gammes, paliers de prix, objectifs, paramètres du système, villes et types d'établissement.
 *
 * Utilisation (depuis le dossier du projet) :
 *   npx tsx prisma/nettoyer-commandes-test.ts              -> SIMULATION (n'écrit rien)
 *   npx tsx prisma/nettoyer-commandes-test.ts --executer   -> sauvegarde JSON, confirmation, suppression
 *   ajouter --garder-numeros pour ne pas remettre la numérotation des documents à 1
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import readline from "node:readline";

const prisma = new PrismaClient();
const executer = process.argv.includes("--executer");
const garderNumeros = process.argv.includes("--garder-numeros");

function baseVisee(): string {
  try {
    const u = new URL(process.env.DATABASE_URL || "");
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(DATABASE_URL introuvable ou illisible)";
  }
}

function confirmer(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (rep) => {
      rl.close();
      resolve(rep.trim() === "SUPPRIMER");
    });
  });
}

async function main() {
  console.log("Base visée :", baseVisee());
  console.log(executer ? "MODE : EXÉCUTION" : "MODE : SIMULATION (rien ne sera supprimé)");

  const [commandes, lignes, documents, operations, mouvements, stocks, notifications, alertes, prixClients, sequences, divers] = await Promise.all([
    prisma.commande.findMany(),
    prisma.ligneCommande.findMany(),
    prisma.documentCorrectif.findMany({ include: { lignes: true } }),
    prisma.operationCaisse.findMany(),
    prisma.mouvementStock.findMany(),
    prisma.stock.findMany({ include: { produit: { select: { nom: true } } } }),
    prisma.notification.findMany(),
    prisma.alerte.findMany(),
    prisma.prixClient.findMany(),
    prisma.sequence.findMany(),
    prisma.pointVente.findMany({ where: { estDivers: true }, select: { id: true, _count: { select: { visites: true } } } }),
  ]);
  const diversASupprimer = divers.filter((d) => d._count.visites === 0).map((d) => d.id);
  const statut = (s: string) => commandes.filter((c) => c.statut === s).length;
  const stockNonNul = stocks.filter((s) => Math.abs(s.quantiteCartons) > 1e-9);
  const [pointsVente, visites, produits, utilisateurs, parametres] = await Promise.all([
    prisma.pointVente.count({ where: { estDivers: false } }),
    prisma.visite.count(),
    prisma.produit.count(),
    prisma.user.count(),
    prisma.parametreSysteme.count(),
  ]);

  console.log("\nCe qui sera supprimé ou remis à zéro :");
  console.table({
    commandes: commandes.length,
    "  dont non traitées": statut("NON_TRAITEE"),
    "  dont en cours de livraison": statut("EN_COURS_LIVRAISON"),
    "  dont livrées": statut("LIVREE"),
    lignes_de_commande: lignes.length,
    factures_FR_FA: documents.length,
    operations_de_caisse: operations.length,
    mouvements_de_stock: mouvements.length,
    "produits au stock remis à 0": stockNonNul.length,
    notifications: notifications.length,
    alertes: alertes.length,
    prix_negocies_memorises: prixClients.length,
    fiche_client_divers: diversASupprimer.length,
    "compteurs de numérotation": garderNumeros ? "conservés" : `${sequences.length} remis à 1`,
  });
  if (stockNonNul.length > 0) {
    console.log("Stock actuel (sera remis à 0) :");
    console.table(Object.fromEntries(stockNonNul.map((s) => [s.produit.nom, s.quantiteCartons])));
  }
  console.log(`Conservé : ${pointsVente} point(s) de vente recensé(s), ${visites} visite(s), ${produits} produit(s), ${utilisateurs} compte(s), ${parametres} paramètre(s), gammes, paliers de prix, objectifs.`);
  console.log("Après la remise à zéro : le stock de départ se saisit par « Entrée » dans Stock, et le solde d'ouverture de la caisse par une recette dans Caisse.");

  if (!executer) {
    console.log("\nSimulation terminée. Pour supprimer pour de bon : relancer avec --executer");
    return;
  }

  // ---- Sauvegarde puis confirmation ----
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
  const fichier = `sauvegarde-reinitialisation-${horodatage}.json`;
  fs.writeFileSync(fichier, JSON.stringify({ commandes, lignes, documents, operations, mouvements, stocks, notifications, alertes, prixClients, sequences }, null, 2));
  console.log(`\nSauvegarde JSON écrite : ${fichier}`);
  if (!(await confirmer("\nTape SUPPRIMER (en majuscules) pour confirmer la remise à zéro définitive : "))) {
    console.log("Annulé : rien n'a été supprimé.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.operationCaisse.deleteMany({});
      await tx.mouvementStock.deleteMany({});
      await tx.stock.updateMany({ data: { quantiteCartons: 0 } });
      await tx.notification.deleteMany({});
      await tx.alerte.deleteMany({});
      await tx.documentCorrectifLigne.deleteMany({});
      await tx.documentCorrectif.deleteMany({});
      await tx.ligneCommande.deleteMany({});
      await tx.commande.deleteMany({});
      await tx.prixClient.deleteMany({});
      if (diversASupprimer.length) await tx.pointVente.deleteMany({ where: { id: { in: diversASupprimer } } });
      if (!garderNumeros) await tx.sequence.deleteMany({});
    },
    { timeout: 120_000, maxWait: 30_000 }
  );
  console.log("\nTerminé : commandes, caisse et stock remis à zéro. Paramètres et points de vente recensés conservés.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
