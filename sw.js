const CACHE = 'sponge-bible-v5';

// 설치 시 반드시 캐싱해야 하는 앱 셸
const SHELL = [
  './index.html',
  './css/style.css',
  './js/masking.js',
  './js/store.js',
  './js/app.js',
  './data/verses.json',
];

// 선택적으로 캐싱 (없어도 설치 실패 안 함)
const OPTIONAL = [
  './assets/icon.png',
  './assets/logo.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(SHELL);
      // 선택 파일은 실패해도 무시
      await Promise.allSettled(OPTIONAL.map(url => c.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
