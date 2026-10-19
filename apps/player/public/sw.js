/* Rihla service worker: shell + engine chunks (stale-while-revalidate), pack bundles and assets
   (cache-first: their names carry a content hash, so they never change). Learning events are queued by the
   engine itself and replayed when back online. */
const SHELL = 'rihla-shell-v1';
const PACKS = 'rihla-packs-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, PACKS].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const hashed = (url) => /\/packs\/.+\/(bundle\.[0-9a-f]{12}\.json|assets\/.+\.[0-9a-f]{12}\.[a-z0-9]+)$/.test(url.pathname);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (hashed(url)) {
    e.respondWith(caches.open(PACKS).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => (r.ok && c.put(e.request, r.clone()), r))));
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => (caches.open(SHELL).then((c) => c.put('/', r.clone())), r)).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(
    caches.open(SHELL).then(async (c) => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then((r) => (r.ok && c.put(e.request, r.clone()), r)).catch(() => hit);
      return hit || net;
    }),
  );
});
/* "Download for class": the portal asks the SW to fetch a pack ahead of the lesson (offline classrooms). */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'prefetch' && Array.isArray(e.data.urls)) e.waitUntil(caches.open(PACKS).then((c) => c.addAll(e.data.urls)));
});
