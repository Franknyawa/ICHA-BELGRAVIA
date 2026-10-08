"use client";

import { useEffect } from "react";

type Props = {
  titre: string;
  detail?: string;
  /** "succes" : reçu par le serveur. "local" : gardé sur l'appareil, envoi automatique plus tard. */
  variante: "succes" | "local";
  libelleBouton: string;
  onContinuer: () => void;
  /** Redirection automatique après ce délai (ms). */
  delaiAuto?: number;
};

/**
 * Écran de confirmation plein écran après un enregistrement : coche animée,
 * message clair, bouton pour continuer (et redirection automatique).
 */
export default function ConfirmationEnregistrement({ titre, detail, variante, libelleBouton, onContinuer, delaiAuto = 2600 }: Props) {
  useEffect(() => {
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
      <button type="button" className="btn-primary mt-8 w-full max-w-xs py-3.5" onClick={onContinuer}>
        {libelleBouton}
      </button>
    </div>
  );
}
