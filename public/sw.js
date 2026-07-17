// TangLak service worker.
//
// Scope, deliberately narrow: this only makes the static app shell (JS/CSS
// bundles, icons, manifest, fonts) available offline, so a previously-
// visited install can at least load its UI without a network connection --
// it does NOT cache page navigations, server-rendered HTML/RSC payloads,
// or any API/data response. Every one of those is server-rendered per
// request from Supabase-backed data (balances, transactions, debts); caching
// them would risk silently showing a stale financial figure as if it were
// current, which this app's own invariants treat as unacceptable. When a
// navigation fails because there's no network, this falls back to a small,
// clearly-labeled static "you're offline" page instead of any cached app
// data -- never a stale page pretending to be live.
const CACHE_NAME = "tanglak-shell-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: always prefer a live network response (this is a
  // financial app -- every page shows data that must be current, never
  // served from a cache). Only fall back to the static offline page when
  // there is genuinely no connection.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Static, content-hashed build assets and icons are safe to serve
  // cache-first -- their filenames change whenever their content does, so a
  // cache hit is never stale.
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest";
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else (API routes, server actions, RSC data fetches) is left
  // completely untouched -- no caching, no offline fallback. A failure here
  // must surface as a real failure so the app's existing OnlineStatus/error
  // handling can respond to it, not be masked by a cached financial figure.
});
