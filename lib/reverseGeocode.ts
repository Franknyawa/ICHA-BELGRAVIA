/**
 * Tentative de résolution automatique de la ville à partir des coordonnées
 * GPS (§ Section 2 du CDC : "Ville : récupérée automatiquement").
 *
 * Utilise l'API de géocodage inverse Nominatim (OpenStreetMap), en libre
 * accès mais à usage raisonnable (pas de clé requise). Cette fonction est
 * best-effort : en cas d'échec réseau ou d'absence de correspondance dans
 * le référentiel des villes, l'agent reste libre de sélectionner la ville
 * manuellement dans la liste déroulante — c'est le repli prévu au CDC.
 */
export async function resolveVilleDepuisCoordonnees(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.address?.city || data?.address?.town || data?.address?.county || null;
  } catch {
    return null;
  }
}
