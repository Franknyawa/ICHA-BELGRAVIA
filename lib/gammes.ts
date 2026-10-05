import { prisma } from "@/lib/prisma";

/**
 * Gammes de produits de l'entreprise : BELGRAVIA (cocktails RTD) et VDV
 * (vins mousseux Veuve du Vernay). Chaque gamme a son catalogue, son stock,
 * son barème de prix par palier et ses commandes.
 *
 * `assurerGammes()` est idempotent et appelé par les routes qui lisent les
 * produits / paliers / commandes : à la toute première utilisation après la
 * mise à jour du schéma (`prisma db push`), il crée les deux gammes et
 * rattache à BELGRAVIA tout ce qui existait avant (produits, paliers,
 * commandes) — aucune manipulation SQL manuelle n'est nécessaire.
 * Ensuite il ne fait plus rien (une seule requête de comptage, puis plus
 * aucune tant que l'instance serveur reste active).
 */

export const CODE_GAMME_RTD = "BELGRAVIA";
export const CODE_GAMME_VDV = "VDV";

let pret = false;

export async function assurerGammes(): Promise<void> {
  if (pret) return;

  try {
    const existantes = await prisma.gamme.count();
    if (existantes === 0) {
      await prisma.gamme.createMany({
        data: [
          { code: CODE_GAMME_RTD, nom: "Belgravia — Cocktails RTD", ordre: 1 },
          { code: CODE_GAMME_VDV, nom: "Veuve du Vernay — Vins mousseux", ordre: 2 },
        ],
        skipDuplicates: true,
      });
    }

    const rtd = await prisma.gamme.findUnique({ where: { code: CODE_GAMME_RTD } });
    if (rtd) {
      // Rattrapage de l'existant : tout ce qui n'a pas encore de gamme
      // appartenait à BELGRAVIA (seule gamme avant cette évolution).
      await Promise.all([
        prisma.produit.updateMany({ where: { gammeId: null }, data: { gammeId: rtd.id } }),
        prisma.palierPrixCarton.updateMany({ where: { gammeId: null }, data: { gammeId: rtd.id } }),
        prisma.commande.updateMany({ where: { gammeId: null }, data: { gammeId: rtd.id } }),
      ]);
    }

    if (existantes === 0) {
      // Référentiel de marques du formulaire de recensement : la catégorie
      // "RTD" reprend les marques déjà en base ; "Moscato" est ajouté côté
      // vins mousseux (les autres marques s'ajoutent depuis Paramètres).
      await prisma.marque.createMany({
        data: [{ nom: "Moscato", categorie: "MOUSSEUX", ordre: 1 }],
        skipDuplicates: true,
      });
      const nbRtd = await prisma.marque.count({ where: { categorie: "RTD" } });
      if (nbRtd === 0) {
        await prisma.marque.createMany({
          data: [
            { nom: "Booster", categorie: "RTD", ordre: 1 },
            { nom: "ICE", categorie: "RTD", ordre: 2 },
            { nom: "VK", categorie: "RTD", ordre: 3 },
            { nom: "Le Coq", categorie: "RTD", ordre: 4 },
          ],
          skipDuplicates: true,
        });
      }
    }

    pret = true;
  } catch (e) {
    // Deux requêtes simultanées peuvent entrer en collision à la toute
    // première création : on n'échoue pas la route appelante, la prochaine
    // requête refera le contrôle.
    console.error("[gammes] initialisation différée :", e);
  }
}

export async function listerGammes() {
  await assurerGammes();
  return prisma.gamme.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } });
}
