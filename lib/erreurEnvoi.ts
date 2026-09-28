"use client";

/**
 * Erreur levée par envoyerVisite()/envoyerCommande() lorsqu'un envoi échoue.
 *
 * Avant ce correctif, toute erreur (vraie coupure réseau OU erreur serveur —
 * session expirée, base de données, FTP down, etc.) était traitée de la
 * même façon : la visite/commande finissait dans la file d'attente locale
 * avec le message générique "Pas de connexion". Si la cause réelle était
 * une erreur serveur, la resynchronisation ultérieure échouait exactement
 * de la même manière à chaque tentative — l'élément restait indéfiniment
 * "en attente de synchronisation" sans que personne ne voie jamais le vrai
 * message d'erreur (voir components/SyncBanner.tsx et lib/envoyerVisite.ts).
 *
 * `estErreurReseau` distingue les deux cas :
 * - true  → le fetch lui-même a échoué (pas de réponse du serveur du tout) :
 *           coupure réseau réelle, comportement normal en hors-ligne.
 * - false → le serveur A répondu, mais avec une erreur (4xx/5xx) : ce n'est
 *           pas un problème de connexion, il faut le signaler clairement.
 */
export class ErreurEnvoi extends Error {
  estErreurReseau: boolean;

  constructor(message: string, estErreurReseau: boolean) {
    super(message);
    this.name = "ErreurEnvoi";
    this.estErreurReseau = estErreurReseau;
  }
}

/** Effectue le fetch et distingue échec réseau (fetch qui throw) d'échec serveur (réponse non-ok). */
export async function fetchOuErreurEnvoi(
  url: string,
  init: RequestInit,
  messageParDefaut: string
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ErreurEnvoi("Réseau indisponible.", true);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ErreurEnvoi(data.error || messageParDefaut, false);
  }
  return res;
}
