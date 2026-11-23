"use client";

import { useEffect, useState } from "react";
import { IconDownload, IconCheckCircle } from "@/components/icons";

type Props = {
  titre: string;
  detail?: string;
  /** "succes" : reçu par le serveur. "local" : gardé sur l'appareil, envoi automatique plus tard. */
  variante: "succes" | "local";
  libelleBouton: string;
  onContinuer: () => void;
  /** Redirection automatique après ce délai (ms) ; null = pas de redirection automatique. */
  delaiAuto?: number | null;
  /** Action facultative proposée à l'utilisateur (ex. télécharger la facture) : jamais déclenchée d'office. */
  action?: { libelle: string; libelleFait: string; executer: () => Promise<void> };
};

/**
 * Écran de confirmation plein écran après un enregistrement : coche animée,
 * message clair, bouton pour continuer (et redirection automatique).
 */
export default function ConfirmationEnregistrement({ titre, detail, variante, libelleBouton, onContinuer, delaiAuto = 2600, action }: Props) {
  const [etat, setEtat] = useState<"repos" | "encours" | "fait" | "echec">("repos");
  useEffect(() => {
    if (delaiAuto === null) return;
    const t = setTimeout(onContinuer, delaiAuto);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const succes = variante === "succes";
  const couleur = succes ? "text-ok" : "text-brass";
  const fond = succes ? "bg-ok/10 border-ok/30" : "bg-brass/10 border-brass/30";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6 text-center"
    >
      <div className={`confirmation-pop flex h-24 w-24 items-center justify-center rounded-full border ${fond} ${couleur}`}>
        {succes ? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path className="confirmation-coche" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
            <path className="confirmation-coche" d="M9.8 12.4l1.7 1.7 3-3.2" />
            <path d="M11 18.6h2" />
          </svg>
        )}
      </div>
      <h2 className="mt-6 font-display text-3xl italic text-ink">{titre}</h2>
      {detail && <p className="mt-2 max-w-xs text-sm text-ink-muted">{detail}</p>}
      {action && (
        <button
          type="button"
          className="btn-secondary mt-6 w-full max-w-xs py-3.5"
          disabled={etat === "encours"}
          onClick={async () => {
            setEtat("encours");
            try {
              await action.executer();
              setEtat("fait");
            } catch {
              setEtat("echec");
            }
          }}
        >
          {etat === "fait" ? <IconCheckCircle className="h-4 w-4 text-ok" /> : <IconDownload className="h-4 w-4" />}
          {etat === "encours" ? "Génération…" : etat === "fait" ? action.libelleFait : etat === "echec" ? "Échec — réessayer" : action.libelle}
        </button>
      )}
      <button type="button" className={`btn-primary w-full max-w-xs py-3.5 ${action ? "mt-3" : "mt-8"}`} onClick={onContinuer}>
        {libelleBouton}
      </button>
    </div>
  );
}
