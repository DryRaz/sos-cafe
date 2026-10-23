// SOS Caffè service worker.
// Deliberate design: NO caching of pages, menu, orders or API calls.
// The business rule is "no degraded mode": if the network is down, ordering
// must be blocked, never served from a stale cache. This worker only makes
// the app installable and shows a clear offline screen instead of the
// browser's dinosaur page.
const CACHE = 'sos-caffe-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only page navigations are handled; everything else goes straight to the network.
  if (req.mode !== 'navigate') return;
  event.respondWith(
    fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
  );
});
