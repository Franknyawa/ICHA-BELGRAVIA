// Service worker BELGRAVIA / VDV — mode hors-ligne de l'interface commerciale.
//
// - Pages et fichiers statiques : réseau d'abord (toujours à jour en ligne),
//   copie en cache en repli hors-ligne.
// - Données de référence (liste blanche ci-dessous) : réseau d'abord avec un
//   délai court, copie en cache en repli. Les autres appels /api/ ne sont
//   JAMAIS interceptés : l'envoi des visites/commandes passe par la boîte
//   d'envoi IndexedDB (lib/syncEngine.ts), pas par ce cache.
// - Les caches sont effacés à la déconnexion volontaire (lib/horsLigne.ts).
const SHELL = "belgravia-shell-v3";
const DONNEES = "belgravia-data-v3";
const COQUILLE = ["/login", "/manifest.json", "/icon-192.png"];

const API_EN_CACHE = [
  /^\/api\/me$/,
  /^\/api\/referentiels$/,
  /^\/api\/points-vente\/hors-ligne$/,
  /^\/api\/points-vente\/[^/]+$/,
  /^\/api\/visites\/mine$/,
  /^\/api\/visites\/tableau-de-bord$/,
  /^\/api\/commandes$/,
  /^\/api\/parametres\/session-duree$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        Promise.all(
          COQUILLE.map((u) =>
            fetch(u).then((r) => (r.ok && !r.redirected ? cache.put(u, r) : undefined)).catch(() => {})
          )
        )
      )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("belgravia-") && k !== SHELL && k !== DONNEES).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

function reseauAvecDelai(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("delai")), ms);
    fetch(request).then(
      (r) => {
        clearTimeout(t);
        resolve(r);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function donnees(request) {
  const cache = await caches.open(DONNEES);
  try {
    const res = await reseauAvecDelai(request, 6000);
    if (res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const copie = await cache.match(request);
    if (copie) return copie;
    throw e;
  }
}

async function pageOuFichier(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    // Pas de redirections ni d'erreurs en cache : une page de connexion
    // gardée sous l'adresse /terrain enfermerait l'agent dehors.
    // Les requêtes RSC (navigation interne de Next) ne sont pas gardées : hors-ligne,
    // Next bascule alors sur une navigation complète, servie depuis la page HTML en cache.
    if (res.ok && !res.redirected && !request.headers.get("RSC")) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const navigation = request.mode === "navigate";
    const copie = await cache.match(request, navigation ? { ignoreVary: true } : undefined);
    if (copie) return copie;
    if (navigation) {
      const url = new URL(request.url);
      // Même page avec d'autres paramètres (?pointVenteId=…) : on sert la page de base.
      const sansParametres = await cache.match(url.pathname, { ignoreVary: true });
      if (sansParametres) return sansParametres;
      // Lancement hors-ligne de l'app ("/") ou page jamais visitée : écran de déverrouillage.
      const login = await cache.match("/login");
      if (login) return login;
    }
    throw e; // scripts/RSC absents : Next.js bascule alors sur une navigation complète
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (API_EN_CACHE.some((re) => re.test(url.pathname))) event.respondWith(donnees(request));
    return;
  }
  event.respondWith(pageOuFichier(request));
});
