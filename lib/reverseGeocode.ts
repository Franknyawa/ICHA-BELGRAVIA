/**
 * Tentative de résolution automatique de la ville à partir des coordonnées
 * GPS (§ Section 2 du CDC : "Ville : récupérée automatiquement").
 *
 * Utilise l'API de géocodage inverse Nominatim (OpenStreetMap), en libre
 * accès mais à usage raisonnable (pas de clé requise). Cette fonction est
 * best-effort : en cas d'échec réseau ou d'absence de correspondance dans
 * le référentiel des villes, l'agent reste libre de sélectionner la ville
 * manuellement dans la liste déroulante — c'est le repli prévu au CDC.
 *
 * Retourne plusieurs candidats (pas un seul) car Nominatim renvoie parfois
 * un arrondissement ("Douala 3e") plutôt que la ville elle-même : le premier
 * candidat sert à l'affichage ("Détecté : ..."), et la liste complète sert
 * au rapprochement avec le référentiel des villes (voir matchVille).
 */
export async function resolveVilleDepuisCoordonnees(
  lat: number,
  lng: number
): Promise<{ affichage: string | null; candidats: string[] }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return { affichage: null, candidats: [] };
    const data = await res.json();
    const a = data?.address || {};
    const candidats: string[] = [
      a.city,
      a.town,
      a.municipality,
      a.city_district,
      a.county,
      a.state_district,
      a.village,
    ].filter((v): v is string => typeof v === "string" && v.length > 0);

    return { affichage: candidats[0] || null, candidats };
  } catch {
    return { affichage: null, candidats: [] };
  }
}

function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .toLowerCase()
    .trim();
}

/**
 * Rapproche les candidats détectés par géolocalisation avec le référentiel
 * des villes, insensible aux accents/casse, avec un repli "contient" si
 * aucune correspondance exacte (ex. "Douala 3e" → "Douala").
 */
export function matchVille<T extends { id: string; nom: string }>(
  candidats: string[],
  villes: T[]
): T | null {
  const villesNormalisees = villes.map((v) => ({ ville: v, norm: normaliser(v.nom) }));

  for (const candidat of candidats) {
    const c = normaliser(candidat);
    const exact = villesNormalisees.find((v) => v.norm === c);
    if (exact) return exact.ville;
  }
  for (const candidat of candidats) {
    const c = normaliser(candidat);
    const partiel = villesNormalisees.find((v) => c.includes(v.norm) || v.norm.includes(c));
    if (partiel) return partiel.ville;
  }
  return null;
}
