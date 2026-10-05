"use client";

/**
 * Bloc de saisie d'une catégorie de boissons relevée au point de vente
 * (vins mousseux / champagnes, ou cocktails RTD) : une ligne par marque du
 * référentiel (présence + prix constaté) puis trois lignes libres
 * "Autre 1/2/3" (nom + prix). Les marques viennent de la base, modifiables
 * depuis Paramètres — rien n'est codé en dur ici.
 */

export type ValeurBoisson = { present: boolean; prix: string };
export type BoissonLibre = { nom: string; prix: string };

function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function nettoyerPrix(brut: string): string {
  // Chiffres uniquement (FCFA, sans décimales) — évite les saisies parasites
  // sur les claviers mobiles.
  return brut.replace(/[^\d]/g, "").slice(0, 8);
}

function ChampPrix({
  valeur,
  onChange,
  disabled,
}: {
  valeur: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative w-[7.5rem] shrink-0">
      <input
        className="field-input pr-12 text-right"
        inputMode="numeric"
        placeholder="Prix"
        value={valeur}
        disabled={disabled}
        onChange={(e) => onChange(nettoyerPrix(e.target.value))}
        aria-label="Prix en FCFA"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-ink-muted">
        FCFA
      </span>
    </div>
  );
}

export default function BlocBoissons({
  marques,
  valeurs,
  onChangeMarque,
  libres,
  onChangeLibre,
}: {
  marques: { id: string; nom: string }[];
  valeurs: Record<string, ValeurBoisson>;
  onChangeMarque: (marqueId: string, valeur: ValeurBoisson) => void;
  libres: BoissonLibre[];
  onChangeLibre: (index: number, valeur: BoissonLibre) => void;
}) {
  return (
    <div className="space-y-2">
      {marques.map((m) => {
        const v = valeurs[m.id] || { present: false, prix: "" };
        return (
          <div
            key={m.id}
            className={[
              "flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors",
              v.present ? "border-brass/60 bg-brass/5" : "border-line bg-bg-elevated",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => onChangeMarque(m.id, { ...v, present: !v.present })}
              aria-pressed={v.present}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  v.present ? "border-brass bg-brass text-white" : "border-line bg-bg text-transparent",
                ].join(" ")}
              >
                <IconCheck className="h-3.5 w-3.5" />
              </span>
              <span className="truncate text-sm font-medium text-ink">{m.nom}</span>
            </button>
            <ChampPrix
              valeur={v.prix}
              onChange={(prix) => onChangeMarque(m.id, { present: prix ? true : v.present, prix })}
            />
          </div>
        );
      })}

      {marques.length === 0 && (
        <p className="text-xs text-ink-muted">Aucune marque configurée dans cette catégorie.</p>
      )}

      {libres.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="field-input min-w-0 flex-1"
            placeholder={`Autre ${i + 1}`}
            value={l.nom}
            onChange={(e) => onChangeLibre(i, { ...l, nom: e.target.value })}
          />
          <ChampPrix valeur={l.prix} onChange={(prix) => onChangeLibre(i, { ...l, prix })} />
        </div>
      ))}
    </div>
  );
}
