"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listerVisitesEnAttente,
  retirerVisiteEnAttente,
  listerCommandesEnAttente,
  retirerCommandeEnAttente,
} from "@/lib/offlineQueue";
import { envoyerVisite } from "@/lib/envoyerVisite";
import { envoyerCommande } from "@/lib/envoyerCommande";

export default function SyncBanner() {
  const [enAttente, setEnAttente] = useState(0);
  const [synchro, setSynchro] = useState(false);

  const rafraichirCompte = useCallback(async () => {
    const [visites, commandes] = await Promise.all([listerVisitesEnAttente(), listerCommandesEnAttente()]);
    setEnAttente(visites.length + commandes.length);
  }, []);

  const synchroniser = useCallback(async () => {
    if (synchro) return;
    setSynchro(true);

    const visites = await listerVisitesEnAttente();
    for (const item of visites) {
      try {
        await envoyerVisite(item.payload, item.photos);
        await retirerVisiteEnAttente(item.id);
      } catch {
        // toujours pas de réseau (ou erreur serveur) — on la retente plus tard
      }
    }

    const commandes = await listerCommandesEnAttente();
    for (const item of commandes) {
      try {
        await envoyerCommande(item.payload);
        await retirerCommandeEnAttente(item.id);
      } catch {
        // idem
      }
    }

    await rafraichirCompte();
    setSynchro(false);
  }, [synchro, rafraichirCompte]);

  useEffect(() => {
    rafraichirCompte();
    window.addEventListener("online", synchroniser);
    const interval = setInterval(rafraichirCompte, 15000);
    return () => {
      window.removeEventListener("online", synchroniser);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (enAttente === 0) return null;

  return (
    <div className="mb-4 flex items-center justify-between rounded-md border border-brass/40 bg-brass/10 px-3.5 py-2.5 text-sm">
      <span className="text-brass">
        {enAttente} élément{enAttente > 1 ? "s" : ""} en attente de synchronisation
      </span>
      <button className="font-medium text-brass underline-offset-2 hover:underline" onClick={synchroniser} disabled={synchro}>
        {synchro ? "Synchronisation…" : "Synchroniser maintenant"}
      </button>
    </div>
  );
}
