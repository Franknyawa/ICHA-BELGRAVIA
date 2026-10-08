"use client";

import { useEffect } from "react";
import { confirmerConnexionEnLigne } from "@/lib/verrouLocal";
import { preparerHorsLigne } from "@/lib/horsLigne";

/**
 * Monté dans l'interface commerciale. Quand le réseau est là et que le serveur
 * confirme la session : prolonge l'accès hors-ligne de l'agent et (re)télécharge
 * pages et données pour la prochaine coupure.
 */
export default function HorsLigneInit({ userId }: { userId: string }) {
  useEffect(() => {
    let annule = false;

    async function preparer() {
      if (!navigator.onLine) return;
      try {
        const res = await fetch("/api/me");
        if (!res.ok || annule) return;
        const me = await res.json();
        if (me.userId !== userId) return;
        await confirmerConnexionEnLigne(userId);
        // Laisse d'abord l'écran se charger, puis prépare le hors-ligne en arrière-plan.
        setTimeout(() => {
          if (!annule) preparerHorsLigne(false);
        }, 4000);
      } catch {
        /* hors-ligne ou serveur indisponible : rien à faire */
      }
    }

    preparer();
    window.addEventListener("online", preparer);
    return () => {
      annule = true;
      window.removeEventListener("online", preparer);
    };
  }, [userId]);

  return null;
}
