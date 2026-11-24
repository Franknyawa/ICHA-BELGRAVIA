import type { Prisma } from "@prisma/client";

/**
 * Numérotation des documents commerciaux : une séquence continue par type,
 * jamais remise à zéro ni réutilisée (piste d'audit).
 *   BC = Bon de commande · BL = Bon de livraison · FV = Facture de vente
 *   FR = Facture retour  · FA = Facture d'avoir
 */
export type TypeDocument = "BC" | "BL" | "FV" | "FR" | "FA";

export const PREFIXE_DOCUMENT: Record<TypeDocument, string> = {
  BC: "BCSIRI",
  BL: "BLSIRI",
  FV: "FVSIRI",
  FR: "FRSIRI",
  FA: "FASIRI",
};

export const LIBELLE_DOCUMENT: Record<TypeDocument, string> = {
  BC: "Bon de commande",
  BL: "Bon de livraison",
  FV: "Facture de vente",
  FR: "Facture retour",
  FA: "Facture d'avoir",
};

export function formaterNumero(type: TypeDocument, n: number): string {
  return `${PREFIXE_DOCUMENT[type]} ${String(n).padStart(5, "0")}`;
}

/**
 * Prochain numéro du type demandé. À appeler DANS la transaction qui crée le
 * document : si elle échoue, le compteur revient en arrière (aucun trou).
 */
export async function prochainNumero(tx: Prisma.TransactionClient, type: TypeDocument): Promise<string> {
  const s = await tx.sequence.upsert({
    where: { cle: type },
    update: { valeur: { increment: 1 } },
    create: { cle: type, valeur: 1 },
  });
  return formaterNumero(type, s.valeur);
}

/** Nom de fichier sûr à partir d'un numéro (« FVSIRI 00012 » → « FVSIRI-00012 »). */
export function nomFichierNumero(numero: string): string {
  return numero.replace(/\s+/g, "-");
}
