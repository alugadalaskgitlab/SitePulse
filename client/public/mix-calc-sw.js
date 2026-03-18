const CACHE_NAME = 'hlc-mix-calc-v1';
const PRECACHE_ASSETS = [
  '/mix-calculator',
  '/mix-calculator.webmanifest',
  '/icons/mix-calc-icon-192x192.png',
  '/icons/mix-calc-icon-512x512.png',
  '/icons/mix-calc-apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('Precache miss for', url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests — skip POST/PUT/DELETE (saves, API mutations)
  if (req.method !== 'GET') return;

  // Skip API calls entirely — let them go to the network unmodified
  if (url.pathname.startsWith('/api/')) return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Navigation: network-first, fall back to cached page
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/mix-calculator')))
    );
    return;
  }

  // Static assets (icons, manifest): cache-first
  if (
    url.pathname.startsWith('/icons/mix-calc') ||
    url.pathname === '/mix-calculator.webmanifest'
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        });
      })
    );
  }
  // All other same-origin requests: pass through, no caching
});
