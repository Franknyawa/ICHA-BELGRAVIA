"use client";

/**
 * File d'attente locale (IndexedDB) pour les visites saisies sans connexion.
 * Quand l'envoi d'une visite échoue (réseau coupé), l'intégralité du
 * formulaire (y compris les photos en data URL, pas encore uploadées) est
 * conservée ici. Elle est rejouée automatiquement dès que la connexion
 * revient, ou via le bouton "Synchroniser" (voir components/SyncBanner.tsx).
 */

const DB_NAME = "belgravia-offline";
const STORE = "visites-en-attente";

export type PhotoEnAttente = { uuidClient: string; dataUrl: string; url?: string };

export type VisiteEnAttente = {
  id: string; // = uuidClient de la visite, sert de clé
  payload: Record<string, unknown>;
  photos: PhotoEnAttente[];
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueuerVisite(item: VisiteEnAttente) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listerVisitesEnAttente(): Promise<VisiteEnAttente[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as VisiteEnAttente[]);
    req.onerror = () => reject(req.error);
  });
}

export async function retirerVisiteEnAttente(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
