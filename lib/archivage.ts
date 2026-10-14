import { prisma } from "@/lib/prisma";

/**
 * Archivage : les données plus anciennes que la durée de conservation sont
 * masquées des listes courantes (Visites terrain, Commandes, Factures,
 * historique de stock) mais JAMAIS supprimées. Elles restent consultables,
 * exportables et restaurables depuis l'onglet Archives, et continuent d'être
 * comptées dans les statistiques, rapports et le solde de caisse.
 *
 * Règles de sécurité :
 * - une commande n'est archivée que si elle est LIVREE et entièrement payée
 *   (crédit soldé, y compris par des encaissements enregistrés en caisse) ;
 * - le journal de caisse n'est jamais archivé.
 */

export type TypeArchive = "visites" | "commandes" | "mouvements";
export const TYPES_ARCHIVE: TypeArchive[] = ["visites", "commandes", "mouvements"];

const CLE_JOURS = "archivage_jours";
const CLE_AUTO = "archivage_auto";
const CLE_DERNIER = "archivage_dernier";

export const JOURS_DEFAUT = 90;
export const JOURS_MIN = 7;
export const JOURS_MAX = 3650;

export type ConfigArchivage = { jours: number; auto: boolean };
export type Compteurs = Record<TypeArchive, number>;
export type DernierArchivage = { date: string; jours: number; auto: boolean; compteurs: Compteurs } | null;

async function lire(cle: string) {
  return (await prisma.parametreSysteme.findUnique({ where: { cle } }))?.valeur ?? null;
}
async function ecrire(cle: string, valeur: string) {
  await prisma.parametreSysteme.upsert({ where: { cle }, update: { valeur }, create: { cle, valeur } });
}

export async function lireConfig(): Promise<ConfigArchivage> {
  const [j, a] = await Promise.all([lire(CLE_JOURS), lire(CLE_AUTO)]);
  const jours = Number(j);
  return { jours: Number.isFinite(jours) && jours >= JOURS_MIN ? jours : JOURS_DEFAUT, auto: a === "1" };
}

export async function ecrireConfig(c: Partial<ConfigArchivage>) {
  if (c.jours !== undefined) await ecrire(CLE_JOURS, String(Math.round(c.jours)));
  if (c.auto !== undefined) await ecrire(CLE_AUTO, c.auto ? "1" : "0");
}

export async function lireDernier(): Promise<DernierArchivage> {
  const v = await lire(CLE_DERNIER);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

export function dateSeuil(jours: number): Date {
  return new Date(Date.now() - jours * 24 * 60 * 60 * 1000);
}

/** Ids des commandes archivables : livrées, anciennes, et soldées (les encaissements de caisse mettent déjà à jour le reste à payer). */
async function commandesArchivables(avant: Date): Promise<string[]> {
  const rows = await prisma.commande.findMany({
    where: { archiveeLe: null, statut: "LIVREE", createdAt: { lt: avant }, resteAPayer: { lte: 0 } },
    select: { id: true },
  });
  return rows.map((c) => c.id);
}

/** Ce qui serait archivé pour une durée de conservation donnée (simulation). */
export async function apercu(jours: number): Promise<Compteurs> {
  const avant = dateSeuil(jours);
  const [visites, commandes, mouvements] = await Promise.all([
    prisma.visite.count({ where: { archiveeLe: null, createdAt: { lt: avant } } }),
    commandesArchivables(avant).then((ids) => ids.length),
    prisma.mouvementStock.count({ where: { archiveeLe: null, createdAt: { lt: avant } } }),
  ]);
  return { visites, commandes, mouvements };
}

export async function totauxArchives(): Promise<Compteurs> {
  const [visites, commandes, mouvements] = await Promise.all([
    prisma.visite.count({ where: { archiveeLe: { not: null } } }),
    prisma.commande.count({ where: { archiveeLe: { not: null } } }),
    prisma.mouvementStock.count({ where: { archiveeLe: { not: null } } }),
  ]);
  return { visites, commandes, mouvements };
}

/** Archive tout ce qui dépasse `jours` jours. */
export async function archiver(jours: number, auto: boolean): Promise<Compteurs> {
  const avant = dateSeuil(jours);
  const maintenant = new Date();

  const ids = await commandesArchivables(avant);
  let commandes = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await prisma.commande.updateMany({
      where: { id: { in: ids.slice(i, i + 1000) }, archiveeLe: null },
      data: { archiveeLe: maintenant },
    });
    commandes += r.count;
  }
  const [v, m] = await Promise.all([
    prisma.visite.updateMany({ where: { archiveeLe: null, createdAt: { lt: avant } }, data: { archiveeLe: maintenant } }),
    prisma.mouvementStock.updateMany({ where: { archiveeLe: null, createdAt: { lt: avant } }, data: { archiveeLe: maintenant } }),
  ]);

  const compteurs: Compteurs = { visites: v.count, commandes, mouvements: m.count };
  await ecrire(CLE_DERNIER, JSON.stringify({ date: maintenant.toISOString(), jours, auto, compteurs }));
  return compteurs;
}

/** Remet des éléments archivés dans les listes courantes. ids absent = tout le type. */
export async function restaurer(type: TypeArchive, ids?: string[]): Promise<number> {
  const where = { archiveeLe: { not: null }, ...(ids ? { id: { in: ids } } : {}) };
  const data = { archiveeLe: null };
  if (type === "visites") return (await prisma.visite.updateMany({ where, data })).count;
  if (type === "commandes") return (await prisma.commande.updateMany({ where, data })).count;
  return (await prisma.mouvementStock.updateMany({ where, data })).count;
}
