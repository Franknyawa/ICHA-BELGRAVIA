"use client";

/**
 * File d'attente locale (IndexedDB) pour les visites ET les commandes
 * saisies sans connexion. Quand l'envoi échoue (réseau coupé), le
 * formulaire complet (y compris les photos en data URL, pas encore
 * uploadées) est conservé ici. Il est rejoué automatiquement dès que la
 * connexion revient, ou via le bouton "Synchroniser" (components/SyncBanner.tsx).
 */

const DB_NAME = "belgravia-offline";
const DB_VERSION = 2;
const STORE_VISITES = "visites-en-attente";
const STORE_COMMANDES = "commandes-en-attente";

export type PhotoEnAttente = { uuidClient: string; dataUrl: string; url?: string };

export type VisiteEnAttente = {
  id: string; // = uuidClient de la visite, sert de clé
  payload: Record<string, unknown>;
  photos: PhotoEnAttente[];
  createdAt: number;
};

export type CommandeEnAttente = {
  id: string; // = uuidClient de la commande, sert de clé
  payload: Record<string, unknown>;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_VISITES)) {
        req.result.createObjectStore(STORE_VISITES, { keyPath: "id" });
      }
      if (!req.result.objectStoreNames.contains(STORE_COMMANDES)) {
        req.result.createObjectStore(STORE_COMMANDES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function put<T>(store: string, item: T): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function getAll<T>(store: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      })
  );
}

function del(store: string, id: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

export const enqueuerVisite = (item: VisiteEnAttente) => put(STORE_VISITES, item);
export const listerVisitesEnAttente = () => getAll<VisiteEnAttente>(STORE_VISITES);
export const retirerVisiteEnAttente = (id: string) => del(STORE_VISITES, id);

export const enqueuerCommande = (item: CommandeEnAttente) => put(STORE_COMMANDES, item);
export const listerCommandesEnAttente = () => getAll<CommandeEnAttente>(STORE_COMMANDES);
export const retirerCommandeEnAttente = (id: string) => del(STORE_COMMANDES, id);
