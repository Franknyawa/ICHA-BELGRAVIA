"use client";

/**
 * Moteur de synchronisation (visites + commandes).
 *
 * Principes :
 * 1. Boîte d'envoi : on écrit d'abord en local, on envoie ensuite, on ne
 *    retire qu'après confirmation du serveur (lib/offlineQueue.ts).
 * 2. Idempotence : chaque élément porte son uuidClient ; renvoyer un élément
 *    déjà reçu est sans danger (le serveur répond "dejaEnregistree").
 * 3. Reprise : l'URL de chaque photo est sauvegardée dès qu'elle est envoyée ;
 *    une visite interrompue ne renvoie jamais une photo déjà partie.
 * 4. Erreurs classées (lib/erreurEnvoi.ts) : réseau → on attend le retour ;
 *    session expirée → on s'arrête et on le dit ; temporaire → délai
 *    croissant puis blocage visible ; définitive → blocage immédiat.
 * 5. Un seul envoi à la fois (verrou, y compris entre onglets) pour ne pas
 *    saturer un réseau mobile ni envoyer deux fois la même chose.
 */

import {
  ajouterElement,
  demanderStockagePersistant,
  lireElement,
  listerElements,
  modifierElement,
  retirerElement,
  type ElementEnAttente,
  type PhotoEnAttente,
  type TypeElement,
} from "./offlineQueue";
import { ErreurEnvoi, fetchOuErreurEnvoi } from "./erreurEnvoi";

const TENTATIVES_MAX = 8;
const DELAI_BASE_MS = 5000;
const DELAI_MAX_MS = 15 * 60 * 1000;

export type EtatSynchro = {
  elements: ElementEnAttente[];
  enCours: boolean;
  /** Élément en cours d'envoi et progression "x/y" pour l'affichage. */
  progression: { fait: number; total: number } | null;
  horsLigne: boolean;
  sessionExpiree: boolean;
};

let etat: EtatSynchro = {
  elements: [],
  enCours: false,
  progression: null,
  horsLigne: false,
  sessionExpiree: false,
};
const abonnes = new Set<(e: EtatSynchro) => void>();
let utilisateurCourant: string | undefined;
let verrouLocal = false;
/** Éléments pris en charge par un formulaire en ce moment : la boucle d'arrière-plan les saute. */
const enEnvoiDirect = new Set<string>();

function diffuser(partiel: Partial<EtatSynchro>) {
  etat = { ...etat, ...partiel };
  abonnes.forEach((fn) => fn(etat));
}

export function abonnerSynchro(fn: (e: EtatSynchro) => void): () => void {
  abonnes.add(fn);
  fn(etat);
  return () => {
    abonnes.delete(fn);
  };
}

export function definirUtilisateurSynchro(userId: string) {
  utilisateurCourant = userId;
}

/** Relit la boîte d'envoi (éléments de l'agent connecté uniquement). */
export async function rafraichirSynchro() {
  try {
    const tous = await listerElements();
    const miens = tous.filter((e) => !e.userId || e.userId === utilisateurCourant);
    // Éléments hérités de l'ancienne version (sans propriétaire) : adoptés par l'agent connecté.
    for (const e of miens) {
      if (!e.userId && utilisateurCourant) {
        e.userId = utilisateurCourant;
        await modifierElement(e.id, { userId: utilisateurCourant });
      }
    }
    diffuser({ elements: miens });
  } catch {
    /* stockage local indisponible : rien à afficher */
  }
}

function delaiAvantRetentative(tentatives: number) {
  return Math.min(DELAI_BASE_MS * 2 ** Math.max(0, tentatives - 1), DELAI_MAX_MS);
}

/** Enregistre l'échec sur l'élément : réessai espacé, ou blocage définitif. */
async function noterEchec(id: string, e: ErreurEnvoi) {
  if (e.genre === "RESEAU" || e.genre === "AUTH") {
    // Pas la faute de l'élément : on n'use pas ses tentatives.
    await modifierElement(id, { derniereErreur: e.message });
    return;
  }
  await modifierElement(id, (el) => {
    const tentatives = el.tentatives + 1;
    const bloque = e.genre === "PERMANENTE" || tentatives >= TENTATIVES_MAX;
    return {
      tentatives,
      derniereErreur: e.message,
      statut: bloque ? "BLOQUE" : "EN_ATTENTE",
      prochaineTentative: Date.now() + delaiAvantRetentative(tentatives),
    };
  });
}

/** Envoie les photos manquantes (en sauvegardant chaque URL), puis l'élément. */
async function envoyerElement(el: ElementEnAttente): Promise<any> {
  if (el.type === "VISITE") {
    const photos: PhotoEnAttente[] = [...el.photos];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (p.url || p.abandonnee || !p.dataUrl) continue;
      try {
        const res = await fetchOuErreurEnvoi(
          "/api/photos/upload",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl: p.dataUrl }),
          },
          "Échec de l'envoi d'une photo.",
          60000
        );
        const data = await res.json();
        photos[i] = { ...p, url: data.url };
        await modifierElement(el.id, { photos });
      } catch (e) {
        // Une photo définitivement refusée ne doit pas bloquer les données de la visite.
        if (e instanceof ErreurEnvoi && e.genre === "PERMANENTE") {
          photos[i] = { ...p, abandonnee: true };
          await modifierElement(el.id, { photos });
          continue;
        }
        throw e;
      }
    }
    const res = await fetchOuErreurEnvoi(
      "/api/visites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...el.payload,
          photos: photos.filter((p) => p.url).map((p) => ({ uuidClient: p.uuidClient, url: p.url })),
        }),
      },
      "Échec de l'enregistrement de la visite."
    );
    return res.json();
  }

  const res = await fetchOuErreurEnvoi(
    "/api/commandes",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(el.payload),
    },
    "Échec de l'enregistrement de la commande."
  );
  return res.json();
}

type Soumission = {
  id: string;
  type: TypeElement;
  titre: string;
  payload: Record<string, unknown>;
  photos?: PhotoEnAttente[];
};

/**
 * Chemin des formulaires : écrit dans la boîte d'envoi, tente l'envoi tout de
 * suite et renvoie la réponse du serveur. En cas d'échec l'élément RESTE
 * sauvegardé (sauf refus définitif, où l'agent corrige son formulaire).
 * Lève ErreurEnvoi ; si `sauvegarde` est vrai sur l'erreur, rien n'est perdu.
 */
export async function soumettre<T = any>(s: Soumission): Promise<T> {
  enEnvoiDirect.add(s.id);
  try {
    const element: ElementEnAttente = {
      id: s.id,
      type: s.type,
      titre: s.titre,
      payload: s.payload,
      photos: s.photos || [],
      createdAt: Date.now(),
      userId: utilisateurCourant,
      statut: "EN_ATTENTE",
      tentatives: 0,
      prochaineTentative: 0,
    };
    try {
      await ajouterElement(element);
      demanderStockagePersistant();
    } catch {
      throw new ErreurEnvoi(
        "Impossible d'enregistrer sur l'appareil (stockage plein ou bloqué). Libère de l'espace et réessaie.",
        "PERMANENTE"
      );
    }

    try {
      const reponse = await envoyerElement(element);
      await retirerElement(s.id);
      return reponse as T;
    } catch (e) {
      const err = e instanceof ErreurEnvoi ? e : new ErreurEnvoi("Erreur inattendue.", "TEMPORAIRE");
      if (err.genre === "PERMANENTE") {
        // Donnée refusée : inutile de la garder en file, le formulaire est encore à l'écran.
        await retirerElement(s.id).catch(() => {});
      } else {
        await noterEchec(s.id, err);
      }
      if (err.genre === "AUTH") diffuser({ sessionExpiree: true });
      throw err;
    }
  } finally {
    enEnvoiDirect.delete(s.id);
    rafraichirSynchro();
  }
}

async function avecVerrou<T>(action: () => Promise<T>): Promise<T | undefined> {
  if (verrouLocal) return undefined;
  verrouLocal = true;
  try {
    const locks = (navigator as any).locks;
    if (locks?.request) {
      // Verrou partagé entre onglets : un seul onglet synchronise à la fois.
      return await locks.request("belgravia-sync", { ifAvailable: true }, async (l: unknown) =>
        l ? action() : undefined
      );
    }
    return await action();
  } finally {
    verrouLocal = false;
  }
}

/**
 * Parcourt la boîte d'envoi. `forcer` ignore les délais et les blocages
 * (bouton "Réessayer"). Sans lui, seuls les éléments échus partent.
 */
export async function synchroniser(forcer = false): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    diffuser({ horsLigne: true });
    return;
  }
  await avecVerrou(async () => {
    await rafraichirSynchro();
    const maintenant = Date.now();
    const aTraiter = etat.elements.filter(
      (e) =>
        !enEnvoiDirect.has(e.id) &&
        (forcer || (e.statut === "EN_ATTENTE" && e.prochaineTentative <= maintenant))
    );
    if (aTraiter.length === 0) return;

    diffuser({ enCours: true, progression: { fait: 0, total: aTraiter.length }, sessionExpiree: false });
    let fait = 0;
    try {
      for (const brut of aTraiter) {
        const el = await lireElement(brut.id); // état frais (photos déjà envoyées)
        if (!el) continue;
        if (forcer && el.statut === "BLOQUE") await modifierElement(el.id, { statut: "EN_ATTENTE", tentatives: 0 });
        try {
          await envoyerElement(el);
          await retirerElement(el.id);
          diffuser({ horsLigne: false });
        } catch (e) {
          const err = e instanceof ErreurEnvoi ? e : new ErreurEnvoi("Erreur inattendue.", "TEMPORAIRE");
          await noterEchec(el.id, err);
          if (err.genre === "RESEAU") {
            diffuser({ horsLigne: true });
            break; // inutile d'insister : on reprend au retour du réseau
          }
          if (err.genre === "AUTH") {
            diffuser({ sessionExpiree: true });
            break;
          }
        }
        fait++;
        diffuser({ progression: { fait, total: aTraiter.length } });
      }
    } finally {
      diffuser({ enCours: false, progression: null });
      await rafraichirSynchro();
    }
  });
}

export async function supprimerElementEnAttente(id: string) {
  await retirerElement(id);
  await rafraichirSynchro();
}

/** Délai avant le prochain élément échu (pour programmer le réveil), ou null. */
export function prochainReveil(): number | null {
  const attente = etat.elements.filter((e) => e.statut === "EN_ATTENTE");
  if (attente.length === 0) return null;
  const plusProche = Math.min(...attente.map((e) => e.prochaineTentative));
  return Math.max(2000, plusProche - Date.now());
}
