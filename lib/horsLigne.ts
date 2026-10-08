"use client";

/**
 * Préparation du mode hors-ligne : téléchargement (via le service worker, qui
 * les met en cache) des pages terrain, de leurs scripts et des données de
 * référence, pour que l'application s'ouvre et fonctionne sans internet.
 */

const PAGES_TERRAIN = [
  "/login",
  "/terrain",
  "/terrain/nouvelle-visite",
  "/terrain/nouvelle-commande",
  "/terrain/historique",
  "/terrain/commandes",
];

const DONNEES = [
  "/api/me",
  "/api/referentiels",
  "/api/points-vente/hors-ligne",
  "/api/visites/mine",
  "/api/visites/mine?jours=7",
  "/api/visites/tableau-de-bord",
  "/api/commandes",
  "/api/parametres/session-duree",
];

const CLE_PRECHAUFFAGE = "belgravia_prechauffage";
const INTERVALLE_MS = 12 * 3600_000;

/** Télécharge pages + scripts + données. `force` ignore l'intervalle de 12 h. */
export async function preparerHorsLigne(force = false): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  try {
    const dernier = Number(localStorage.getItem(CLE_PRECHAUFFAGE) || 0);
    if (!force && Date.now() - dernier < INTERVALLE_MS) return;
  } catch {
    /* localStorage indisponible : on prépare quand même */
  }

  const ressources = new Set<string>();
  let reussies = 0;

  for (const page of PAGES_TERRAIN) {
    try {
      const res = await fetch(page, { credentials: "same-origin" });
      if (!res.ok || res.redirected) continue; // redirigé = pas connecté : rien à garder
      reussies++;
      const html = await res.text();
      for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\]+?\.(?:js|css|woff2)/g)) ressources.add(m[0]);
    } catch {
      return; // réseau perdu en cours de route : on réessaiera plus tard
    }
  }

  // Scripts, styles et polices : chargés pour être interceptés et mis en cache par le service worker.
  const liste = Array.from(ressources);
  for (let i = 0; i < liste.length; i += 6) {
    await Promise.all(liste.slice(i, i + 6).map((u) => fetch(u).catch(() => {})));
  }

  await Promise.all(DONNEES.map((u) => fetch(u, { credentials: "same-origin" }).catch(() => {})));

  if (reussies === PAGES_TERRAIN.length) {
    try {
      localStorage.setItem(CLE_PRECHAUFFAGE, String(Date.now()));
    } catch {
      /* sans importance */
    }
  }
}

/** Efface pages et données mises en cache (déconnexion volontaire, changement de compte). */
export async function viderCachesHorsLigne(): Promise<void> {
  try {
    localStorage.removeItem(CLE_PRECHAUFFAGE);
  } catch {
    /* sans importance */
  }
  try {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n.startsWith("belgravia-")).map((n) => caches.delete(n)));
  } catch {
    /* Cache API indisponible */
  }
}
