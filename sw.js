const CACHE = 'sponge-bible-v2';

// 설치 시 반드시 캐싱해야 하는 앱 셸
const SHELL = [
  './index.html',
  './css/style.css',
  './js/masking.js',
  './js/store.js',
  './js/app.js',
];

// 선택적으로 캐싱 (없어도 설치 실패 안 함)
const OPTIONAL = [
  './assets/icon.png',
  './assets/logo.png',
  './data/bible_100.json',
  './data/bible.json',
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
  // bible.json은 네트워크 우선, 실패 시 캐시 폴백
  if (e.request.url.includes('/data/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 나머지는 캐시 우선, 없으면 네트워크
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
