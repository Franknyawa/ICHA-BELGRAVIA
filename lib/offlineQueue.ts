"use client";

/**
 * Boîte d'envoi locale (IndexedDB) : TOUT ce que l'agent saisit (visite ou
 * commande) y est écrit AVANT la moindre requête réseau, puis retiré
 * seulement quand le serveur a confirmé. Un plantage, une coupure ou un
 * onglet fermé en plein envoi ne peuvent donc plus faire perdre de donnée.
 *
 * Les photos sont conservées en data URL ; dès qu'une photo est envoyée, son
 * URL est écrite ici aussi, pour ne jamais la renvoyer en cas de reprise.
 */

const DB_NAME = "belgravia-offline";
const DB_VERSION = 3;
const STORE = "boite-envoi";
// Anciens stores (v2) : leur contenu est migré dans la boîte d'envoi.
const ANCIEN_VISITES = "visites-en-attente";
const ANCIEN_COMMANDES = "commandes-en-attente";

export type PhotoEnAttente = {
  uuidClient: string;
  dataUrl: string;
  url?: string;
  /** Photo refusée définitivement par le serveur : la visite part sans elle. */
  abandonnee?: boolean;
};

export type TypeElement = "VISITE" | "COMMANDE";
export type StatutElement = "EN_ATTENTE" | "BLOQUE";

export type ElementEnAttente = {
  id: string; // = uuidClient (idempotence côté serveur)
  type: TypeElement;
  titre: string;
  payload: Record<string, unknown>;
  photos: PhotoEnAttente[];
  createdAt: number;
  /** Agent propriétaire : un autre compte sur le même appareil n'envoie pas ces éléments. */
  userId?: string;
  statut: StatutElement;
  tentatives: number;
  prochaineTentative: number;
  derniereErreur?: string;
};

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Stockage local indisponible sur cet appareil."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction!;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      const boite = tx.objectStore(STORE);

      const migrer = (nom: string, type: TypeElement) => {
        if (!db.objectStoreNames.contains(nom)) return;
        const lecture = tx.objectStore(nom).getAll();
        lecture.onsuccess = () => {
          for (const ancien of lecture.result as any[]) {
            boite.put({
              id: ancien.id,
              type,
              titre:
                type === "VISITE"
                  ? ancien.payload?.pointVente?.nomEtablissement || "Visite"
                  : "Commande",
              payload: ancien.payload || {},
              photos: ancien.photos || [],
              createdAt: ancien.createdAt || Date.now(),
              statut: "EN_ATTENTE",
              tentatives: 0,
              prochaineTentative: 0,
            } satisfies ElementEnAttente);
          }
          db.deleteObjectStore(nom);
        };
      };
      migrer(ANCIEN_VISITES, "VISITE");
      migrer(ANCIEN_COMMANDES, "COMMANDE");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await ouvrir();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Écriture locale annulée."));
    };
  });
}

export const ajouterElement = (e: ElementEnAttente) => transaction("readwrite", (s) => s.put(e)).then(() => undefined);
export const retirerElement = (id: string) => transaction("readwrite", (s) => s.delete(id)).then(() => undefined);
export const lireElement = (id: string) => transaction<ElementEnAttente | undefined>("readonly", (s) => s.get(id));

export async function listerElements(): Promise<ElementEnAttente[]> {
  const tous = await transaction<ElementEnAttente[]>("readonly", (s) => s.getAll());
  return tous.sort((a, b) => a.createdAt - b.createdAt);
}

/** Lit puis réécrit un élément (si encore présent) avec les changements donnés. */
export async function modifierElement(
  id: string,
  changements: Partial<ElementEnAttente> | ((e: ElementEnAttente) => Partial<ElementEnAttente>)
): Promise<ElementEnAttente | undefined> {
  const actuel = await lireElement(id);
  if (!actuel) return undefined;
  const suite = typeof changements === "function" ? changements(actuel) : changements;
  const maj = { ...actuel, ...suite };
  await ajouterElement(maj);
  return maj;
}

/** Demande au navigateur de ne pas purger la boîte d'envoi quand l'espace manque. */
export function demanderStockagePersistant() {
  try {
    navigator.storage?.persist?.();
  } catch {
    /* sans importance */
  }
}
