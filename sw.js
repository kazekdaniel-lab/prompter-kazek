/* Prompter service worker.
   Sieć-najpierw z krótkim limitem czasu (żeby aktualizacje wchodziły od razu),
   cache jako zapas - po pierwszym otwarciu apka działa offline. */
const CACHE = 'tp-shell-v21';
const TIMEOUT = 2500;
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './store.js',
  './dashboard.html',
  './dashboard.js',
  './remote.html',
  './remote.js',
  './mqtt.js',
  './inbox.json',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // GitHub API i reszta - prosto do sieci

  e.respondWith((async () => {
    const cached = await caches.match(req);
    try {
      // no-store: omijamy cache HTTP przeglądarki, żeby po aktualizacji nie
      // zmieszały się pliki z dwóch wersji (np. nowy index.html + stary store.js)
      const res = await withTimeout(fetch(req, { cache: 'no-store' }), TIMEOUT);
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    } catch (err) {
      return cached || caches.match('./index.html');
    }
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
