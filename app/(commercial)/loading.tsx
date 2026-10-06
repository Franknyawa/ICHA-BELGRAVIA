/** Squelette instantané pour les pages terrain (mobile). */
export default function ChargementTerrain() {
  return (
    <div className="mx-auto max-w-md animate-pulse space-y-4" aria-busy="true" aria-label="Chargement">
      <div className="h-14 rounded-lg bg-line/60" />
      <div className="h-12 rounded-lg bg-line/40" />
      <div className="space-y-2 rounded-lg border border-line bg-bg-elevated p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-md bg-line/40" />
        ))}
      </div>
    </div>
  );
}
