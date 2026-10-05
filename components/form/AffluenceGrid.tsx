"use client";

import { Fragment } from "react";

/**
 * Saisie des jours / heures d'affluence sous forme de grille : une ligne par
 * jour, une colonne par plage horaire. Un appui sur une case la
 * sélectionne ; un appui sur le nom d'un jour (ou d'une plage) sélectionne
 * toute la ligne (ou toute la colonne) — beaucoup plus rapide que de
 * cocher 7 × 3 pastilles une à une.
 *
 * Les valeurs de plage sont stockées telles quelles dans Visite.affluence
 * (JSON). MATIN / APRES_MIDI / SOIR existaient déjà ; NUIT est ajoutée. Les
 * heures affichées se règlent ici, en un seul endroit.
 */

export const JOURS_AFFLUENCE = [
  { valeur: "Lundi", court: "Lun" },
  { valeur: "Mardi", court: "Mar" },
  { valeur: "Mercredi", court: "Mer" },
  { valeur: "Jeudi", court: "Jeu" },
  { valeur: "Vendredi", court: "Ven" },
  { valeur: "Samedi", court: "Sam" },
  { valeur: "Dimanche", court: "Dim" },
];

export const PLAGES_AFFLUENCE = [
  { valeur: "MATIN", label: "Matin", heures: "6h–12h" },
  { valeur: "APRES_MIDI", label: "Après-midi", heures: "12h–18h" },
  { valeur: "SOIR", label: "Soir", heures: "18h–23h" },
  { valeur: "NUIT", label: "Nuit", heures: "23h–6h" },
];

export type Affluence = Record<string, string[]>;

function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function AffluenceGrid({
  value,
  onChange,
}: {
  value: Affluence;
  onChange: (next: Affluence) => void;
}) {
  const estActif = (jour: string, plage: string) => (value[jour] || []).includes(plage);

  function basculerCase(jour: string, plage: string) {
    const courants = value[jour] || [];
    onChange({
      ...value,
      [jour]: courants.includes(plage) ? courants.filter((p) => p !== plage) : [...courants, plage],
    });
  }

  function basculerJour(jour: string) {
    const toutesActives = PLAGES_AFFLUENCE.every((p) => estActif(jour, p.valeur));
    onChange({ ...value, [jour]: toutesActives ? [] : PLAGES_AFFLUENCE.map((p) => p.valeur) });
  }

  function basculerPlage(plage: string) {
    const toutesActives = JOURS_AFFLUENCE.every((j) => estActif(j.valeur, plage));
    const next: Affluence = { ...value };
    for (const j of JOURS_AFFLUENCE) {
      const courants = next[j.valeur] || [];
      next[j.valeur] = toutesActives
        ? courants.filter((p) => p !== plage)
        : courants.includes(plage)
        ? courants
        : [...courants, plage];
    }
    onChange(next);
  }

  const total = JOURS_AFFLUENCE.reduce((s, j) => s + (value[j.valeur]?.length || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-[52px_repeat(4,1fr)] gap-1.5">
        <div />
        {PLAGES_AFFLUENCE.map((p) => (
          <button
            key={p.valeur}
            type="button"
            onClick={() => basculerPlage(p.valeur)}
            className="rounded-md px-0.5 py-1 text-center leading-tight text-ink-muted transition-colors hover:bg-brass/10 hover:text-brass"
            title={`Tout sélectionner : ${p.label}`}
          >
            <span className="block text-[11px] font-semibold">{p.label}</span>
            <span className="block text-[10px] opacity-80">{p.heures}</span>
          </button>
        ))}

        {JOURS_AFFLUENCE.map((j) => (
          <Fragment key={j.valeur}>
            <button
              type="button"
              onClick={() => basculerJour(j.valeur)}
              className="rounded-md text-left text-sm font-medium text-ink transition-colors hover:text-brass"
              title={`Tout sélectionner : ${j.valeur}`}
            >
              {j.court}
            </button>
            {PLAGES_AFFLUENCE.map((p) => {
              const actif = estActif(j.valeur, p.valeur);
              return (
                <button
                  key={p.valeur}
                  type="button"
                  onClick={() => basculerCase(j.valeur, p.valeur)}
                  aria-pressed={actif}
                  aria-label={`${j.valeur} ${p.label} ${p.heures}`}
                  className={[
                    "flex h-10 items-center justify-center rounded-md border transition-colors",
                    actif
                      ? "border-brass bg-brass text-white"
                      : "border-line bg-bg-elevated text-transparent hover:border-brass/50",
                  ].join(" ")}
                >
                  <IconCheck className="h-4 w-4" />
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
        <span>
          {total === 0 ? "Touchez les cases pour indiquer les moments d'affluence." : `${total} créneau${total > 1 ? "x" : ""} sélectionné${total > 1 ? "s" : ""}`}
        </span>
        {total > 0 && (
          <button type="button" className="font-medium text-brass hover:underline" onClick={() => onChange({})}>
            Tout effacer
          </button>
        )}
      </div>
    </div>
  );
}
