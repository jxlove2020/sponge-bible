const CACHE = 'sponge-bible-v20';

const SHELL = [
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

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await caches.open(CACHE).then(async c => {
      await c.addAll(SHELL);
      await Promise.allSettled(OPTIONAL.map(url => c.add(url)));
    });
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage('sw-updated'));
  })());
  self.clients.claim();
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
