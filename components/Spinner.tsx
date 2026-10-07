/**
 * Indicateurs de chargement de l'application : un anneau doré qui tourne
 * (Spinner), seul ou accompagné d'un libellé centré (ChargementPage).
 * La couleur suit `currentColor` : on la règle avec text-brass, text-bg, etc.
 * Pour les personnes qui préfèrent moins d'animations, l'anneau ralentit
 * mais reste visible (voir globals.css).
 */
export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={`spinner-anneau shrink-0 ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChargementPage({
  label = "Chargement…",
  compact = false,
}: {
  label?: string;
  /** Version réduite, pour un bloc, un tableau ou une fenêtre. */
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "flex flex-col items-center justify-center gap-3 text-ink-muted",
        compact ? "min-h-[140px] py-8" : "min-h-[60vh] py-16",
      ].join(" ")}
    >
      <Spinner className={compact ? "h-7 w-7 text-brass" : "h-10 w-10 text-brass"} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
