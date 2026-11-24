"use client";

import { arrondirDemi } from "@/lib/quantites";

/**
 * Quantité de cartons : − / saisie / + (par carton) et « +½ » pour ajouter un demi-carton.
 * 0,5 carton se facture la moitié du prix d'un carton.
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
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={`${bouton} w-8`} onClick={() => onChange(arrondirDemi(valeur - 1))} aria-label={`Retirer un carton de ${libelle}`} disabled={valeur <= 0}>
        −
      </button>
      <input
        type="number"
        min={0}
        step={0.5}
        inputMode="decimal"
        className={`field-input ${compact ? "w-14" : "w-16"} text-center`}
        value={valeur || 0}
        aria-label={`Cartons de ${libelle}`}
        onChange={(e) => onChange(arrondirDemi(parseFloat(e.target.value.replace(",", "."))))}
      />
      <button type="button" className={`${bouton} w-8`} onClick={() => onChange(arrondirDemi(valeur + 1))} aria-label={`Ajouter un carton de ${libelle}`}>
        +
      </button>
      <button type="button" className={`${bouton} px-2 text-xs font-bold`} onClick={() => onChange(arrondirDemi(valeur + 0.5))} aria-label={`Ajouter un demi-carton de ${libelle}`} title="Ajouter un demi-carton">
        +½
      </button>
    </div>
  );
}
