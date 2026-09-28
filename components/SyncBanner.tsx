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
import { ErreurEnvoi } from "@/lib/erreurEnvoi";

export default function SyncBanner() {
  const [enAttente, setEnAttente] = useState(0);
  const [synchro, setSynchro] = useState(false);
  const [derniereErreurServeur, setDerniereErreurServeur] = useState<string | null>(null);

  const rafraichirCompte = useCallback(async () => {
    const [visites, commandes] = await Promise.all([listerVisitesEnAttente(), listerCommandesEnAttente()]);
    setEnAttente(visites.length + commandes.length);
  }, []);

  const synchroniser = useCallback(async () => {
    if (synchro) return;
    setSynchro(true);

    let erreurServeurRencontree: string | null = null;

    const visites = await listerVisitesEnAttente();
    for (const item of visites) {
      try {
        await envoyerVisite(item.payload, item.photos);
        await retirerVisiteEnAttente(item.id);
      } catch (e) {
        // Coupure réseau : normal, on retente plus tard sans rien afficher.
        // Erreur serveur : PAS normal — on la journalise et on la garde
        // pour l'afficher, sinon elle échouera en boucle silencieusement
        // à chaque "online" et à chaque clic sur "Synchroniser" sans que
        // personne ne sache jamais pourquoi (cause du bug remonté par l'agent).
        if (e instanceof ErreurEnvoi && !e.estErreurReseau) {
          console.error("[SyncBanner] visite — échec serveur :", e);
          erreurServeurRencontree = e.message;
        }
      }
    }

    const commandes = await listerCommandesEnAttente();
    for (const item of commandes) {
      try {
        await envoyerCommande(item.payload);
        await retirerCommandeEnAttente(item.id);
      } catch (e) {
        if (e instanceof ErreurEnvoi && !e.estErreurReseau) {
          console.error("[SyncBanner] commande — échec serveur :", e);
          erreurServeurRencontree = e.message;
        }
      }
    }

    setDerniereErreurServeur(erreurServeurRencontree);
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
    <div className="mb-4 rounded-md border border-brass/40 bg-brass/10 px-3.5 py-2.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-brass">
          {enAttente} élément{enAttente > 1 ? "s" : ""} en attente de synchronisation
        </span>
        <button className="font-medium text-brass underline-offset-2 hover:underline" onClick={synchroniser} disabled={synchro}>
          {synchro ? "Synchronisation…" : "Synchroniser maintenant"}
        </button>
      </div>
      {derniereErreurServeur && (
        <p className="mt-1.5 text-xs text-danger">
          Ce n&apos;est pas un problème de connexion : le serveur a répondu « {derniereErreurServeur} ».
          Signale ce message à l&apos;administrateur.
        </p>
      )}
    </div>
  );
}
