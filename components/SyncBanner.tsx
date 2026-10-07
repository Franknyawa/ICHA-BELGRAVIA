"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  abonnerSynchro,
  definirUtilisateurSynchro,
  prochainReveil,
  rafraichirSynchro,
  supprimerElementEnAttente,
  synchroniser,
  type EtatSynchro,
} from "@/lib/syncEngine";
import { IconAlert, IconRefresh, IconTrash, IconStorefront, IconReceipt } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";

const ETAT_INITIAL: EtatSynchro = { elements: [], enCours: false, progression: null, horsLigne: false, sessionExpiree: false };

function dateCourte(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SyncBanner({ userId }: { userId: string }) {
  const [etat, setEtat] = useState<EtatSynchro>(ETAT_INITIAL);
  const [detail, setDetail] = useState(false);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  useEffect(() => {
    definirUtilisateurSynchro(userId);
    const desabonner = abonnerSynchro(setEtat);

    const lancer = () => synchroniser(false);
    rafraichirSynchro().then(lancer);

    // Retour du réseau, retour sur l'application, et réveil programmé selon le délai de reprise.
    const surRetourReseau = () => synchroniser(true);
    const surVisible = () => {
      if (document.visibilityState === "visible") lancer();
    };
    window.addEventListener("online", surRetourReseau);
    window.addEventListener("offline", lancer);
    document.addEventListener("visibilitychange", surVisible);
    const battement = setInterval(() => {
      if (document.visibilityState === "visible") {
        rafraichirSynchro().then(lancer);
      }
    }, 30000);

    return () => {
      desabonner();
      window.removeEventListener("online", surRetourReseau);
      window.removeEventListener("offline", lancer);
      document.removeEventListener("visibilitychange", surVisible);
      clearInterval(battement);
    };
  }, [userId]);

  // Réveil au moment exact où le prochain élément redevient éligible.
  useEffect(() => {
    if (etat.enCours) return;
    const delai = prochainReveil();
    if (delai == null) return;
    const t = setTimeout(() => synchroniser(false), delai + 250);
    return () => clearTimeout(t);
  }, [etat.elements, etat.enCours]);

  const total = etat.elements.length;
  if (total === 0) return null;

  const bloques = etat.elements.filter((e) => e.statut === "BLOQUE");
  const enAttente = total - bloques.length;

  let titre: string;
  let ton: "brass" | "danger" = "brass";
  if (etat.sessionExpiree) {
    titre = "Session expirée : reconnecte-toi pour envoyer tes données";
    ton = "danger";
  } else if (etat.enCours && etat.progression) {
    titre = `Synchronisation… ${etat.progression.fait}/${etat.progression.total}`;
  } else if (bloques.length > 0 && enAttente === 0) {
    titre = `${bloques.length} élément${bloques.length > 1 ? "s" : ""} bloqué${bloques.length > 1 ? "s" : ""}`;
    ton = "danger";
  } else if (etat.horsLigne) {
    titre = `Hors connexion : ${total} élément${total > 1 ? "s" : ""} gardé${total > 1 ? "s" : ""} sur l'appareil`;
  } else {
    titre = `${total} élément${total > 1 ? "s" : ""} en attente d'envoi`;
  }

  const couleur = ton === "danger" ? "border-danger/40 bg-danger/10 text-danger" : "border-brass/40 bg-brass/10 text-brass";

  return (
    <div className={`mb-4 rounded-md border px-3.5 py-2.5 text-sm ${couleur}`}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setDetail((d) => !d)}>
          {etat.enCours ? <Spinner className="h-4 w-4" /> : <IconAlert className="h-4 w-4 shrink-0" />}
          <span className="truncate font-medium">{titre}</span>
        </button>
        {etat.sessionExpiree ? (
          <Link href="/login" className="shrink-0 font-medium underline-offset-2 hover:underline">
            Se reconnecter
          </Link>
        ) : (
          <button
            className="flex shrink-0 items-center gap-1.5 font-medium underline-offset-2 hover:underline disabled:opacity-60"
            onClick={() => synchroniser(true)}
            disabled={etat.enCours}
          >
            <IconRefresh className="h-3.5 w-3.5" />
            Réessayer
          </button>
        )}
      </div>

      {detail && (
        <ul className="mt-2.5 space-y-2 border-t border-current/20 pt-2.5">
          {etat.elements.map((e) => {
            const Icone = e.type === "VISITE" ? IconStorefront : IconReceipt;
            const photosRestantes = e.photos.filter((p) => !p.url && !p.abandonnee && p.dataUrl).length;
            return (
              <li key={e.id} className="flex items-start gap-2 text-ink">
                <Icone className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {e.type === "VISITE" ? "Visite" : "Commande"} · {e.titre}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {dateCourte(e.createdAt)}
                    {photosRestantes > 0 && ` · ${photosRestantes} photo${photosRestantes > 1 ? "s" : ""} à envoyer`}
                    {e.statut === "EN_ATTENTE" && e.tentatives > 0 && ` · ${e.tentatives} essai${e.tentatives > 1 ? "s" : ""}`}
                  </p>
                  {e.derniereErreur && (
                    <p className="mt-0.5 text-xs text-danger">
                      {e.statut === "BLOQUE" ? "Bloqué : " : "Dernier message : "}
                      {e.derniereErreur}
                    </p>
                  )}
                </div>
                {e.statut === "BLOQUE" && (
                  <button
                    type="button"
                    aria-label="Supprimer cet élément"
                    className="shrink-0 rounded p-1 text-danger hover:bg-danger/10"
                    onClick={() => setASupprimer(e.id)}
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
          {bloques.length > 0 && (
            <li className="text-xs text-ink-muted">
              Un élément bloqué a été refusé par le serveur ou a échoué plusieurs fois. Signale le message à
              l&apos;administrateur avant de le supprimer.
            </li>
          )}
        </ul>
      )}

      <ConfirmDialog
        open={aSupprimer !== null}
        title="Supprimer cet élément ?"
        message="Il n'a pas pu être envoyé et sera définitivement effacé de cet appareil."
        confirmLabel="Supprimer"
        onCancel={() => setASupprimer(null)}
        onConfirm={async () => {
          if (aSupprimer) await supprimerElementEnAttente(aSupprimer);
          setASupprimer(null);
        }}
      />
    </div>
  );
}
