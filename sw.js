const CACHE = 'sponge-bible-v6';

const SHELL = [
  './index.html',
  './css/style.css',
  './js/masking.js',
  './js/store.js',
  './js/app.js',
  './data/verses.json',
];

const OPTIONAL = [
  './assets/icon.png',
  './assets/logo.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(SHELL);
      await Promise.allSettled(OPTIONAL.map(url => c.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage('sw-updated'));
  })());
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
