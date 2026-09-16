const CACHE_NAME = "belgravia-shell-v1";
const APP_SHELL = ["/terrain", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stratégie "réseau d'abord, repli sur le cache" : garantit des données
// fraîches quand le réseau est là, et un chargement de l'app shell quand il
// ne l'est pas. Les données (API) ne sont jamais servies depuis le cache —
// la fiabilité des visites repose sur la file d'attente IndexedDB
// (lib/offlineQueue.ts), pas sur un cache HTTP.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.url.includes("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/terrain")))
  );
});
