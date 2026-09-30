import { prisma } from "@/lib/prisma";
import type { TypeAlerte } from "@prisma/client";

/**
 * Génération des alertes admin — même principe que le projet HYPO/HTC
 * (lib/jobs/alertes.ts) : on ne recrée pas de doublon pour une même
 * entité tant qu'une alerte identique NON résolue existe déjà, ce qui
 * permet d'appeler cette génération aussi souvent qu'on veut (bouton
 * "Générer maintenant" côté admin) sans empiler les alertes à chaque clic.
 *
 * Restreint aux situations que le modèle de données BELGRAVIA permet
 * réellement de détecter : stock faible, livraison en retard ou à venir,
 * crédit non réglé depuis plusieurs jours (pas de notion de "prospect" ou
 * de "client inactif" ici, contrairement au projet de référence).
 */

const JOURS_CREDIT_RETARD = 7;
const JOURS_LIVRAISON_PROCHE = 2;

async function creerAlerteSiAbsente(params: {
  type: TypeAlerte;
  message: string;
  entiteType: string;
  entiteId: string;
}) {
  const existante = await prisma.alerte.findFirst({
    where: { type: params.type, entiteType: params.entiteType, entiteId: params.entiteId, resolue: false },
  });
  if (existante) return;

  await prisma.alerte.create({
    data: { type: params.type, message: params.message, entiteType: params.entiteType, entiteId: params.entiteId },
  });
}

async function genererAlertesStock() {
  const stocks = await prisma.stock.findMany({
    where: { seuilAlerte: { gt: 0 } },
    include: { produit: { select: { id: true, nom: true } } },
  });

  for (const s of stocks) {
    if (s.quantiteCartons < s.seuilAlerte) {
      await creerAlerteSiAbsente({
        type: "STOCK_FAIBLE",
        message: `Stock ${s.produit.nom} faible : ${s.quantiteCartons} carton(s) restant(s) (seuil : ${s.seuilAlerte}).`,
        entiteType: "Produit",
        entiteId: s.produit.id,
      });
    }
  }
}

async function genererAlertesLivraisons() {
  const maintenant = new Date();
  const dansXJours = new Date(maintenant.getTime() + JOURS_LIVRAISON_PROCHE * 24 * 3600 * 1000);

  const commandes = await prisma.commande.findMany({
    where: { statut: { in: ["NON_TRAITEE", "EN_COURS_LIVRAISON"] }, dateLivraison: { not: null } },
    select: { id: true, dateLivraison: true, pointVente: { select: { nomEtablissement: true } } },
  });

  for (const c of commandes) {
    if (!c.dateLivraison) continue;

    if (c.dateLivraison < maintenant) {
      await creerAlerteSiAbsente({
        type: "LIVRAISON_RETARD",
        message: `Livraison en retard pour ${c.pointVente.nomEtablissement} (prévue le ${c.dateLivraison.toLocaleDateString("fr-FR")}).`,
        entiteType: "Commande",
        entiteId: c.id,
      });
    } else if (c.dateLivraison <= dansXJours) {
      await creerAlerteSiAbsente({
        type: "LIVRAISON_A_VENIR",
        message: `Livraison à venir pour ${c.pointVente.nomEtablissement} (prévue le ${c.dateLivraison.toLocaleDateString("fr-FR")}).`,
        entiteType: "Commande",
        entiteId: c.id,
      });
    }
  }
}

async function genererAlertesCredits() {
  const seuil = new Date();
  seuil.setDate(seuil.getDate() - JOURS_CREDIT_RETARD);

  const commandes = await prisma.commande.findMany({
    where: { resteAPayer: { gt: 0 }, createdAt: { lte: seuil } },
    select: { id: true, resteAPayer: true, pointVente: { select: { nomEtablissement: true } } },
  });

  for (const c of commandes) {
    await creerAlerteSiAbsente({
      type: "CREDIT_RETARD",
      message: `Crédit en retard chez ${c.pointVente.nomEtablissement} : ${Number(c.resteAPayer).toLocaleString("fr-FR")} FCFA dû depuis plus de ${JOURS_CREDIT_RETARD} jours.`,
      entiteType: "Commande",
      entiteId: c.id,
    });
  }
}

/** Point d'entrée unique — appelé manuellement (bouton admin) ou par un cron. */
export async function genererToutesLesAlertes() {
  await genererAlertesStock();
  await genererAlertesLivraisons();
  await genererAlertesCredits();
}

export async function listAlertes(type?: string) {
  return prisma.alerte.findMany({
    where: { resolue: false, ...(type ? { type: type as TypeAlerte } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export async function countAlertesActives() {
  return prisma.alerte.count({ where: { resolue: false } });
}
