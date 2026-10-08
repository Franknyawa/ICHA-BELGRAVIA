"use client";

/**
 * Verrou local : permet à un agent COMMERCIAL de rouvrir l'application sans
 * internet, sur un téléphone où il s'est déjà connecté une fois en ligne.
 *
 * - Seule une empreinte salée du mot de passe (PBKDF2-SHA256) est conservée,
 *   jamais le mot de passe lui-même.
 * - 5 essais ratés → blocage de plus en plus long (30 s, 1 min, 2 min…, 15 min max).
 * - Durée maximale hors-ligne : DUREE_MAX_JOURS après la dernière connexion
 *   confirmée par le serveur. Passé ce délai, une reconnexion en ligne est exigée.
 * - Effacé à la déconnexion volontaire (LogoutButton) ; PAS à la déconnexion
 *   automatique pour inactivité (sinon l'agent serait enfermé dehors hors-ligne).
 * - Réservé aux comptes COMMERCIAL : l'administration reste en ligne.
 */

const DB_NAME = "belgravia-verrou";
const STORE = "verrou";
const CLE = "local";
const ITERATIONS = 150_000;
export const DUREE_MAX_JOURS = 7;
const ESSAIS_AVANT_BLOCAGE = 5;
const BLOCAGE_BASE_MS = 30_000;
const BLOCAGE_MAX_MS = 15 * 60_000;

type Verrou = {
  cle: string;
  identifiant: string; // normalisé (minuscules, sans espaces autour)
  userId: string;
  nom: string;
  prenom: string;
  sel: string; // base64
  empreinte: string; // base64
  iterations: number;
  derniereConnexionEnLigne: number;
  echecs: number;
  bloqueJusqua: number;
};

export type ResumeVerrou = { prenom: string; nom: string; identifiant: string; expireLe: number };

export type ResultatDeverrouillage =
  | { statut: "OK"; userId: string; prenom: string; nom: string }
  | { statut: "MAUVAIS"; essaisRestants: number }
  | { statut: "BLOQUE"; secondes: number }
  | { statut: "EXPIRE" }
  | { statut: "ABSENT" }
  | { statut: "INDISPONIBLE" };

const normaliser = (s: string) => s.trim().toLowerCase();

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponible"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "cle" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lire(): Promise<Verrou | undefined> {
  const db = await ouvrir();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(CLE);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as Verrou | undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function ecrire(v: Verrou): Promise<void> {
  const db = await ouvrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function versBase64(buf: ArrayBuffer | Uint8Array): string {
  const octets = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  octets.forEach((o) => (s += String.fromCharCode(o)));
  return btoa(s);
}
function depuisBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function empreinteDe(motDePasse: string, sel: Uint8Array, iterations: number): Promise<string> {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(motDePasse), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel as BufferSource, iterations }, cle, 256);
  return versBase64(bits);
}

function egalConstant(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const expireLe = (v: Verrou) => v.derniereConnexionEnLigne + DUREE_MAX_JOURS * 86_400_000;

export function verrouPossible(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof indexedDB !== "undefined";
}

/** À appeler après une connexion en ligne réussie d'un COMMERCIAL. */
export async function enregistrerVerrou(
  identifiant: string,
  motDePasse: string,
  infos: { userId: string; nom: string; prenom: string }
): Promise<void> {
  if (!verrouPossible()) return;
  const sel = crypto.getRandomValues(new Uint8Array(16));
  await ecrire({
    cle: CLE,
    identifiant: normaliser(identifiant),
    userId: infos.userId,
    nom: infos.nom,
    prenom: infos.prenom,
    sel: versBase64(sel),
    empreinte: await empreinteDe(motDePasse, sel, ITERATIONS),
    iterations: ITERATIONS,
    derniereConnexionEnLigne: Date.now(),
    echecs: 0,
    bloqueJusqua: 0,
  });
}

/** Prolonge la durée hors-ligne quand le serveur confirme que la session est valide. */
export async function confirmerConnexionEnLigne(userId: string): Promise<void> {
  try {
    const v = await lire();
    if (v && v.userId === userId) await ecrire({ ...v, derniereConnexionEnLigne: Date.now() });
  } catch {
    /* sans importance */
  }
}

export async function resumeVerrou(): Promise<ResumeVerrou | null> {
  try {
    const v = await lire();
    if (!v) return null;
    return { prenom: v.prenom, nom: v.nom, identifiant: v.identifiant, expireLe: expireLe(v) };
  } catch {
    return null;
  }
}

export async function deverrouiller(identifiant: string, motDePasse: string): Promise<ResultatDeverrouillage> {
  if (!verrouPossible()) return { statut: "INDISPONIBLE" };
  let v: Verrou | undefined;
  try {
    v = await lire();
  } catch {
    return { statut: "INDISPONIBLE" };
  }
  if (!v) return { statut: "ABSENT" };
  if (Date.now() > expireLe(v)) return { statut: "EXPIRE" };

  const maintenant = Date.now();
  if (v.bloqueJusqua > maintenant) return { statut: "BLOQUE", secondes: Math.ceil((v.bloqueJusqua - maintenant) / 1000) };

  const sel = depuisBase64(v.sel);
  const calcule = await empreinteDe(motDePasse, sel, v.iterations);
  const bonIdentifiant = normaliser(identifiant) === v.identifiant;
  // Les deux vérifications sont toujours faites pour ne rien révéler par le temps de réponse.
  if (bonIdentifiant && egalConstant(calcule, v.empreinte)) {
    await ecrire({ ...v, echecs: 0, bloqueJusqua: 0 });
    return { statut: "OK", userId: v.userId, prenom: v.prenom, nom: v.nom };
  }

  const echecs = v.echecs + 1;
  let bloqueJusqua = 0;
  if (echecs >= ESSAIS_AVANT_BLOCAGE) {
    const palier = echecs - ESSAIS_AVANT_BLOCAGE;
    bloqueJusqua = Date.now() + Math.min(BLOCAGE_BASE_MS * 2 ** palier, BLOCAGE_MAX_MS);
  }
  await ecrire({ ...v, echecs, bloqueJusqua });
  if (bloqueJusqua) return { statut: "BLOQUE", secondes: Math.ceil((bloqueJusqua - Date.now()) / 1000) };
  return { statut: "MAUVAIS", essaisRestants: ESSAIS_AVANT_BLOCAGE - echecs };
}

export async function effacerVerrou(): Promise<void> {
  try {
    const db = await ouvrir();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(CLE);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    /* rien à effacer */
  }
}
