/** Logo SIRI pour les en-têtes de PDF (bandeau sombre : version dorée). Mis en cache après le premier chargement. */
const RATIO = 2236 / 1321;
let cache: Promise<string | null> | null = null;

function charger(): Promise<string | null> {
  if (!cache) {
    cache = fetch("/siri-or-pdf.png")
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            const lecteur = new FileReader();
            lecteur.onload = () => resolve(typeof lecteur.result === "string" ? lecteur.result : null);
            lecteur.onerror = () => resolve(null);
            lecteur.readAsDataURL(blob);
          })
      )
      .catch(() => null);
  }
  return cache;
}

/**
 * Dessine le logo à (x, y) pour une hauteur donnée (mm) et renvoie sa largeur,
 * ou 0 si le logo est indisponible (hors-ligne sans cache) — le PDF reste alors valide sans lui.
 */
export async function ajouterLogoPdf(
  doc: { addImage: (...args: any[]) => unknown },
  x: number,
  y: number,
  hauteur: number
): Promise<number> {
  const data = await charger();
  if (!data) return 0;
  const largeur = hauteur * RATIO;
  try {
    doc.addImage(data, "PNG", x, y, largeur, hauteur);
    return largeur;
  } catch {
    return 0;
  }
}
