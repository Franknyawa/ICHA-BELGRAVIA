"use client";

/**
 * Erreur levée lorsqu'un envoi vers le serveur échoue.
 *
 * `genre` dit QUOI faire ensuite — c'est le cœur de la synchronisation :
 * - RESEAU      : pas de réponse (coupure, délai dépassé). Normal hors-ligne,
 *                 on réessaiera au retour du réseau, sans compter d'échec.
 * - AUTH        : 401 — session expirée. Les données restent sur l'appareil,
 *                 l'agent doit se reconnecter. Inutile de réessayer avant.
 * - TEMPORAIRE  : le serveur a répondu 5xx / 408 / 429 (base ou stockage
 *                 photo indisponible, fonction trop lente…). On réessaie avec
 *                 un délai croissant.
 * - PERMANENTE  : 4xx (donnée refusée, trop volumineuse…). Réessayer ne
 *                 servira à rien : l'élément est bloqué et signalé.
 */
export type GenreErreur = "RESEAU" | "AUTH" | "TEMPORAIRE" | "PERMANENTE";

export class ErreurEnvoi extends Error {
  genre: GenreErreur;
  statut?: number;
  /** Conservé pour compatibilité : vrai seulement pour une coupure réseau. */
  estErreurReseau: boolean;

  constructor(message: string, genre: GenreErreur, statut?: number) {
    super(message);
    this.name = "ErreurEnvoi";
    this.genre = genre;
    this.statut = statut;
    this.estErreurReseau = genre === "RESEAU";
  }
}

function genrePourStatut(statut: number): GenreErreur {
  if (statut === 401) return "AUTH";
  if (statut === 408 || statut === 425 || statut === 429 || statut >= 500) return "TEMPORAIRE";
  return "PERMANENTE";
}

/**
 * fetch avec délai maximum : sans lui, une requête qui "pend" sur un réseau
 * mobile instable bloque toute la file indéfiniment.
 */
export async function fetchOuErreurEnvoi(
  url: string,
  init: RequestInit,
  messageParDefaut: string,
  delaiMs = 30000
): Promise<Response> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controleur.signal });
  } catch {
    throw new ErreurEnvoi("Réseau indisponible ou trop lent.", "RESEAU");
  } finally {
    clearTimeout(minuteur);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message =
      res.status === 401
        ? "Session expirée : reconnecte-toi."
        : res.status === 413
        ? "Fichier trop volumineux pour le serveur."
        : data.error || messageParDefaut;
    throw new ErreurEnvoi(message, genrePourStatut(res.status), res.status);
  }
  return res;
}
