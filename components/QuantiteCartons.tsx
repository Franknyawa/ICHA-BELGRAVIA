"use client";

import { arrondirQuart, enBouteilles } from "@/lib/quantites";

const FRACTIONS = [
  { v: 0.25, label: "¼", aide: "¼ de carton = 6 bouteilles" },
  { v: 0.5, label: "½", aide: "½ carton = 12 bouteilles" },
  { v: 0.75, label: "¾", aide: "¾ de carton = 18 bouteilles" },
];

/**
 * Quantité de cartons : − / saisie / + par carton entier, et pastilles ¼ · ½ · ¾ pour la fraction
 * (1 carton = 24 bouteilles, ½ = 12, ¼ = 6 : un pack). Le prix suit la fraction.
 */
export default function QuantiteCartons({
  valeur,
  onChange,
  libelle,
  compact = false,
}: {
  valeur: number;
  onChange: (q: number) => void;
  libelle: string;
  compact?: boolean;
}) {
  const bouton = "btn-secondary h-8 !px-0 text-base leading-none";
  const entier = Math.floor(valeur + 1e-9);
  const fraction = Math.round((valeur - entier) * 4) / 4;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button type="button" className={`${bouton} w-8`} onClick={() => onChange(arrondirQuart(valeur - 1))} aria-label={`Retirer un carton de ${libelle}`} disabled={valeur <= 0}>
          −
        </button>
        <input
          type="number"
          min={0}
          step={0.25}
          inputMode="decimal"
          className={`field-input ${compact ? "w-[5rem]" : "w-[5.25rem]"} text-center`}
          value={valeur || 0}
          aria-label={`Cartons de ${libelle}`}
          onChange={(e) => onChange(arrondirQuart(parseFloat(e.target.value.replace(",", "."))))}
        />
        <button type="button" className={`${bouton} w-8`} onClick={() => onChange(arrondirQuart(valeur + 1))} aria-label={`Ajouter un carton de ${libelle}`}>
          +
        </button>
        <span className="flex overflow-hidden rounded-md border border-line" role="group" aria-label={`Fraction de carton de ${libelle}`}>
          {FRACTIONS.map((f) => {
            const actif = Math.abs(fraction - f.v) < 1e-9;
            return (
              <button
                key={f.v}
                type="button"
                title={f.aide}
                aria-pressed={actif}
                aria-label={`${f.aide} — ${libelle}`}
                onClick={() => onChange(actif ? entier : entier + f.v)}
                className={`h-8 w-8 text-sm font-bold transition-colors ${actif ? "bg-brass text-white" : "bg-bg-elevated text-ink-muted hover:text-brass"} ${f.v !== 0.25 ? "border-l border-line" : ""}`}
              >
                {f.label}
              </button>
            );
          })}
        </span>
      </div>
      {valeur > 0 && <p className="text-[11px] text-ink-muted">= {enBouteilles(valeur)} bouteilles</p>}
    </div>
  );
}
