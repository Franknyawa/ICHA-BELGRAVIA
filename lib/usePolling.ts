"use client";

import { useEffect, useRef } from "react";

/**
 * Appelle `tache` à intervalle régulier, MAIS seulement tant que l'onglet est
 * visible : un onglet oublié en arrière-plan ne consomme ni batterie ni
 * appels serveur, et la mise à jour repart aussitôt qu'on revient dessus.
 *
 * Remplace les flux SSE : ceux-ci reposaient sur une mémoire partagée entre
 * requêtes, qui n'existe pas sur Vercel (chaque requête peut tomber sur une
 * instance différente) — le sondage, lui, marche partout.
 */
export function usePolling(tache: () => void | Promise<void>, intervalleMs: number, actif = true) {
  const tacheRef = useRef(tache);
  tacheRef.current = tache;

  useEffect(() => {
    if (!actif) return;
    let minuteur: ReturnType<typeof setInterval> | null = null;

    const demarrer = () => {
      if (minuteur) return;
      minuteur = setInterval(() => {
        Promise.resolve(tacheRef.current()).catch(() => {});
      }, intervalleMs);
    };
    const arreter = () => {
      if (minuteur) clearInterval(minuteur);
      minuteur = null;
    };
    const surVisibilite = () => {
      if (document.visibilityState === "visible") {
        Promise.resolve(tacheRef.current()).catch(() => {});
        demarrer();
      } else {
        arreter();
      }
    };

    if (document.visibilityState === "visible") demarrer();
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      arreter();
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [intervalleMs, actif]);
}
