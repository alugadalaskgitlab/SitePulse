// SitePulse Service Worker v5
// Strategy:
//   /api/*          → network-only (never cached — always live data)
//   navigate (HTML) → network-first, fallback to cached shell
//   immutable assets (.js/.css with content hash) → cache-first
//   icons / manifest → cache-first from install pre-cache
//   everything else → network-first, cache fallback

const CACHE_NAME = 'hlc-sitepulse-v5';
const STATIC_PRECACHE = [
  '/',
  '/manifest.json',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Heuristic: Vite content-hashed assets contain a dash then 8 hex chars before .js/.css
const isImmutableAsset = (url) => /\-[A-Za-z0-9_]{8,}\.(js|css)(\?.*)?$/.test(new URL(url).pathname);

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PRECACHE)),
  );
  // Activate immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Remove all caches from previous versions
      caches.keys().then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))),
      ),
      // Take control of all open tabs immediately
      self.clients.claim(),
    ]),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // 1. Non-GET requests — always pass through to network (mutations must never be cached)
  if (request.method !== 'GET') return;

  // 2. API requests — network only, no caching
  //    This is the most important rule: live data must never come from SW cache.
  if (new URL(url).pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. Navigation (HTML shell) — network first, fallback to cached '/'
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache the fresh shell
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(request))),
    );
    return;
  }

  // 4. Immutable content-hashed assets — cache first (hash guarantees freshness)
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res && res.status === 200) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 5. Everything else (icons, fonts, images) — network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request)),
  );
});

// ── Message — allow app to trigger manual update ──────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'SitePulse',
    body: 'New update',
    url: '/',
    icon: '/icon-192x192.png',
    tag: 'hlc-notification',
  };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: '/favicon-32x32.png',
      tag: data.tag,
      data: { url: data.url },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    }),
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let url = event.notification.data?.url || '/';
  if (url.startsWith('http') && !url.startsWith(self.location.origin)) url = '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
