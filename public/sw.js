/*
 * Divini Partners service worker - minimal, safe offline support for the
 * event-day view. It precaches the app shell, serves SPA navigations from cache
 * when offline, and applies stale-while-revalidate to static assets plus the
 * read-only event-day API calls (events, itinerary, tasks, guests).
 *
 * Deliberately conservative:
 *   - only GET requests are ever cached;
 *   - auth, payments and invoices API calls are never cached or intercepted;
 *   - cross-origin requests pass straight through to the network.
 */

const VERSION = 'dp-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const API_CACHE = `${VERSION}-api`;

// App-shell entry points. Hashed build assets are cached on demand at runtime.
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.png'];

// Read-only API path prefixes that are safe to cache for offline event-day use.
const API_CACHEABLE = ['/api/events', '/api/itinerary', '/api/tasks', '/api/guests'];
// Never cache or intercept these (auth, money movement).
const API_BLOCKED = ['/api/auth', '/api/payments', '/api/invoices', '/api/payout'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiCacheable(pathname) {
  if (API_BLOCKED.some((p) => pathname.startsWith(p))) return false;
  return API_CACHEABLE.some((p) => pathname.startsWith(p));
}

// Stale-while-revalidate: serve cache immediately, refresh in the background.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || network || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache writes

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // pass cross-origin through

  // SPA navigations: network-first so fresh content wins, fall back to the
  // cached shell so the event-day route still loads offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request)) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/')) ||
            Response.error()
          );
        }),
    );
    return;
  }

  // Read-only event-day API: stale-while-revalidate.
  if (url.pathname.startsWith('/api/')) {
    if (isApiCacheable(url.pathname)) {
      event.respondWith(staleWhileRevalidate(request, API_CACHE));
    }
    return; // anything else under /api passes straight to the network
  }

  // Static assets (hashed JS/CSS, images, fonts): stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});
