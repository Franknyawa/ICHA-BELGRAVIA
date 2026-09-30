"use client";

import { useEffect, useRef } from "react";

const EVENEMENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
// On ne relance pas le minuteur à chaque pixel de souris — un throttle
// large (5s) suffit à détecter une vraie activité sans matraquer de setTimeout.
const THROTTLE_MS = 5000;

/**
 * Déconnecte automatiquement après N minutes d'inactivité RÉELLE (souris,
 * clavier, tactile) — pas après N minutes depuis la connexion, et pas
 * "tant que l'app reste ouverte" : le battement de géolocalisation
 * (LocationHeartbeat) tourne en tâche de fond indépendamment de l'humain
 * derrière l'écran, donc on se base uniquement sur ces événements-ci pour
 * mesurer l'inactivité, jamais sur le trafic réseau.
 *
 * La durée est réglable depuis Paramètres (admin) — voir
 * /api/parametres/session-duree. Le serveur applique aussi sa propre
 * vérification (lib/auth.ts, sur lastSeenAt) en filet de sécurité si ce
 * minuteur n'a pas pu se déclencher (onglet fermé, JS bloqué, etc.).
 */
export default function InactivityLogout() {
  const minutesRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dernierResetRef = useRef(0);

  useEffect(() => {
    let annule = false;

    fetch("/api/parametres/session-duree")
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        minutesRef.current = typeof d.minutes === "number" ? d.minutes : null;
        demarrerMinuteur();
      })
      .catch(() => {});

    async function deconnecter() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        /* on redirige quand même */
      }
      window.location.href = "/login?motif=inactivite";
    }

    function demarrerMinuteur() {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!minutesRef.current) return;
      timerRef.current = setTimeout(deconnecter, minutesRef.current * 60 * 1000);
    }

    function surActivite() {
      const maintenant = Date.now();
      if (maintenant - dernierResetRef.current < THROTTLE_MS) return;
      dernierResetRef.current = maintenant;
      demarrerMinuteur();
    }

    EVENEMENTS.forEach((e) => window.addEventListener(e, surActivite, { passive: true }));
    return () => {
      annule = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      EVENEMENTS.forEach((e) => window.removeEventListener(e, surActivite));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
