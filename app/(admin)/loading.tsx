/**
 * Squelette affiché instantanément pendant le chargement d'une page admin :
 * la navigation paraît immédiate au lieu de rester figée sur l'ancienne page.
 */
export default function ChargementAdmin() {
  return (
    <div className="animate-pulse space-y-5 p-5 lg:p-8" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-56 rounded-md bg-line/60" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg border border-line bg-bg-elevated" />
        ))}
      </div>
      <div className="space-y-2 rounded-lg border border-line bg-bg-elevated p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-9 rounded-md bg-line/40" />
        ))}
      </div>
    </div>
  );
}
