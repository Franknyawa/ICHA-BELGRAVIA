/**
 * Supprime UNIQUEMENT quelques visites de test précises (et ce qui leur est
 * rattaché), sans toucher au reste des données réelles.
 *
 * Utilisation (depuis le dossier du projet) :
 *   npx tsx prisma/supprimer-visites-test.ts                          -> liste les 40 dernières visites
 *   npx tsx prisma/supprimer-visites-test.ts --ids=3fa8c1d2,9b04e7aa  -> SIMULATION pour ces visites
 *   ... --ids=... --executer                                          -> supprime (sauvegarde + confirmation)
 *   ajouter --avec-commandes pour supprimer aussi les commandes passées à ces points de vente
 *
 * Pour chaque visite choisie sont supprimés : la visite, ses marques présentes, ses photos
 * (références en base) et — si c'était la seule visite du point de vente — le point de vente
 * lui-même. Un point de vente qui a d'autres visites, ou des commandes sans --avec-commandes,
 * est conservé.
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import readline from "node:readline";

const prisma = new PrismaClient();
const executer = process.argv.includes("--executer");
const avecCommandes = process.argv.includes("--avec-commandes");
const idsDemandes = (process.argv.find((a) => a.startsWith("--ids="))?.slice("--ids=".length) || "")
  // PowerShell transforme la virgule en espace : on accepte les deux séparateurs.
  .split(/[,\s]+/)
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

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

const court = (id: string) => id.slice(0, 8);
const dateFr = (d: Date) => d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function lister() {
  const visites = await prisma.visite.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      createdAt: true,
      commercial: { select: { prenom: true, nom: true } },
      pointVente: {
        select: {
          nomEtablissement: true,
          quartier: true,
          ville: { select: { nom: true } },
          _count: { select: { visites: true, commandes: true } },
        },
      },
    },
  });
  const photos = await prisma.photo.groupBy({ by: ["visiteId"], _count: true, where: { visiteId: { in: visites.map((v) => v.id) } } });
  const nbPhotos = new Map(photos.map((p) => [p.visiteId, p._count]));

  console.log("\nLes 40 dernières visites (la plus récente en premier) :");
  console.table(
    visites.map((v) => ({
      id: court(v.id),
      saisie_le: dateFr(v.createdAt),
      point_de_vente: v.pointVente.nomEtablissement,
      lieu: `${v.pointVente.ville?.nom || "—"}${v.pointVente.quartier ? " · " + v.pointVente.quartier : ""}`,
      commercial: `${v.commercial.prenom} ${v.commercial.nom}`,
      photos: nbPhotos.get(v.id) || 0,
      visites_du_pdv: v.pointVente._count.visites,
      commandes_du_pdv: v.pointVente._count.commandes,
    }))
  );
  console.log("Relance avec --ids=<id>,<id> (les 8 premiers caractères suffisent) pour simuler la suppression.");
}

async function main() {
  console.log("Base visée :", baseVisee());
  if (idsDemandes.length === 0) {
    await lister();
    return;
  }
  console.log(executer ? "MODE : EXÉCUTION" : "MODE : SIMULATION (rien ne sera supprimé)");

  // ---- Retrouver les visites demandées (identifiant complet ou début d'identifiant) ----
  const toutes = await prisma.visite.findMany({ select: { id: true } });
  const visiteIds: string[] = [];
  for (const d of idsDemandes) {
    const trouvees = toutes.filter((v) => v.id.toLowerCase().startsWith(d));
    if (trouvees.length !== 1) {
      console.error(trouvees.length === 0 ? `Visite introuvable : ${d}` : `Identifiant ambigu (${trouvees.length} visites) : ${d} — donne plus de caractères.`);
      process.exitCode = 1;
      return;
    }
    visiteIds.push(trouvees[0].id);
  }

  const visites = await prisma.visite.findMany({
    where: { id: { in: visiteIds } },
    select: { id: true, createdAt: true, pointVenteId: true, pointVente: { select: { nomEtablissement: true } } },
  });
  const pdvIds = [...new Set(visites.map((v) => v.pointVenteId))];

  // ---- Pour chaque point de vente : le supprime-t-on aussi ? ----
  const pdvASupprimer: string[] = [];
  const resume: Record<string, string | number>[] = [];
  for (const pid of pdvIds) {
    const [pdv, autresVisites, commandes] = await Promise.all([
      prisma.pointVente.findUnique({ where: { id: pid }, select: { nomEtablissement: true } }),
      prisma.visite.count({ where: { pointVenteId: pid, id: { notIn: visiteIds } } }),
      prisma.commande.count({ where: { pointVenteId: pid } }),
    ]);
    let sort = "supprimé";
    if (autresVisites > 0) sort = `CONSERVÉ (a ${autresVisites} autre(s) visite(s))`;
    else if (commandes > 0 && !avecCommandes) sort = `CONSERVÉ (a ${commandes} commande(s) : ajoute --avec-commandes pour les supprimer aussi)`;
    else pdvASupprimer.push(pid);
    resume.push({
      point_de_vente: pdv?.nomEtablissement || pid,
      visites_supprimees: visites.filter((v) => v.pointVenteId === pid).length,
      commandes: commandes,
      sort_du_point_de_vente: sort,
    });
  }
  console.log("\nCe qui sera supprimé :");
  console.table(resume);

  // ---- Éléments rattachés ----
  const commandes = avecCommandes && pdvASupprimer.length > 0
    ? await prisma.commande.findMany({ where: { pointVenteId: { in: pdvASupprimer } } })
    : [];
  const commandeIds = commandes.map((c) => c.id);
  const photos = await prisma.photo.findMany({
    where: { OR: [{ visiteId: { in: visiteIds } }, { pointVenteId: { in: pdvASupprimer } }] },
  });
  const marques = await prisma.marquePresente.findMany({ where: { visiteId: { in: visiteIds } } });
  const lignes = commandeIds.length ? await prisma.ligneCommande.findMany({ where: { commandeId: { in: commandeIds } } }) : [];
  const mouvements = commandeIds.length
    ? await prisma.mouvementStock.findMany({ where: { referenceType: "COMMANDE", referenceId: { in: commandeIds } } })
    : [];
  const notifications = commandeIds.length ? await prisma.notification.findMany({ where: { commandeId: { in: commandeIds } } }) : [];
  const liaisonsTypes = pdvASupprimer.length ? await prisma.pointVenteType.findMany({ where: { pointVenteId: { in: pdvASupprimer } } }) : [];
  const idsAlertes = [...visiteIds, ...pdvASupprimer, ...commandeIds];
  const alertes = await prisma.alerte.findMany({ where: { entiteId: { in: idsAlertes } } });

  console.table({
    visites: visiteIds.length,
    points_de_vente: pdvASupprimer.length,
    commandes: commandeIds.length,
    marques_presentes: marques.length,
    photos: photos.length,
    mouvements_stock: mouvements.length,
    notifications: notifications.length,
    alertes: alertes.length,
  });
  console.log("Tout le reste (autres visites, points de vente, commandes, comptes) est conservé.");

  if (!executer) {
    console.log("\nSimulation terminée. Pour supprimer pour de bon : relancer avec --executer");
    return;
  }

  // ---- Sauvegarde puis confirmation ----
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
  const fichier = `sauvegarde-visites-test-${horodatage}.json`;
  const [visitesCompletes, pdvCompletes] = await Promise.all([
    prisma.visite.findMany({ where: { id: { in: visiteIds } } }),
    prisma.pointVente.findMany({ where: { id: { in: pdvASupprimer } } }),
  ]);
  fs.writeFileSync(
    fichier,
    JSON.stringify({ visites: visitesCompletes, pointsVente: pdvCompletes, liaisonsTypes, marques, photos, commandes, lignes, mouvements, notifications, alertes }, null, 2)
  );
  if (photos.length > 0) fs.writeFileSync(`photos-visites-test-${horodatage}.txt`, photos.map((p) => p.url).join("\n"));
  console.log(`\nSauvegarde JSON écrite : ${fichier}`);

  if (!(await confirmer("\nTape SUPPRIMER (en majuscules) pour confirmer la suppression définitive : "))) {
    console.log("Annulé : rien n'a été supprimé.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      if (commandeIds.length > 0) {
        // Rendre au stock ce que ces commandes avaient retiré.
        const sorties = await tx.mouvementStock.groupBy({
          by: ["produitId"],
          where: { referenceType: "COMMANDE", referenceId: { in: commandeIds }, type: "SORTIE" },
          _sum: { quantiteCartons: true },
        });
        for (const s of sorties) {
          const total = s._sum.quantiteCartons ?? 0;
          if (total > 0) await tx.stock.updateMany({ where: { produitId: s.produitId }, data: { quantiteCartons: { increment: total } } });
        }
        await tx.mouvementStock.deleteMany({ where: { referenceType: "COMMANDE", referenceId: { in: commandeIds } } });
        await tx.notification.deleteMany({ where: { commandeId: { in: commandeIds } } });
        await tx.ligneCommande.deleteMany({ where: { commandeId: { in: commandeIds } } });
        await tx.commande.deleteMany({ where: { id: { in: commandeIds } } });
      }
      await tx.marquePresente.deleteMany({ where: { visiteId: { in: visiteIds } } });
      await tx.photo.deleteMany({ where: { OR: [{ visiteId: { in: visiteIds } }, { pointVenteId: { in: pdvASupprimer } }] } });
      await tx.visite.deleteMany({ where: { id: { in: visiteIds } } });
      if (pdvASupprimer.length > 0) {
        await tx.pointVenteType.deleteMany({ where: { pointVenteId: { in: pdvASupprimer } } });
        await tx.pointVente.deleteMany({ where: { id: { in: pdvASupprimer } } });
      }
      await tx.alerte.deleteMany({ where: { entiteId: { in: idsAlertes } } });
    },
    { timeout: 60_000, maxWait: 20_000 }
  );

  console.log("\nTerminé : les visites de test (et ce qui leur était rattaché) sont supprimées.");
  console.log("Les fichiers photo déjà envoyés sur l'hébergement ne sont pas supprimés (voir photos-visites-test-*.txt).");
}

main()
  .catch((e) => {
    console.error("Échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
