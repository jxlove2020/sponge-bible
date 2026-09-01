const CACHE = 'sponge-bible-v54';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/masking.js',
  './js/store.js',
  './js/app.js',
  './data/verses.json',
];

const OPTIONAL = ['./assets/icon.png', './assets/logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(SHELL);
      await Promise.allSettled(OPTIONAL.map(url => c.add(url)));
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage('sw-updated'));
    })(),
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.destination === 'document') {
    // 오프라인 fallback: 해당 URL → 루트('/')순으로 시도
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
    return;
  }

  // MP3: Range 헤더를 무시하고 URL 키로 캐싱
  // - caches.match(request)는 Range 헤더 포함 비교 → 캐시 미스 반복 발생
  // - fetch(request)는 206 부분 응답 → 다음 Range 요청과 불일치
  // URL 문자열로 전체 파일을 가져와 캐싱하면 모든 Range 요청 재사용 가능
  if (e.request.destination === 'audio' || url.pathname.includes('/sound/')) {
    e.respondWith(
      caches.match(e.request.url).then(cached => {
        if (cached) return cached;
        return fetch(e.request.url).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request.url, clone));
          }
          return res;
        });
      }),
    );
    return;
  }

  // ignoreSearch로 ?v=timestamp 캐시버스팅 무시 (verses.json 등)
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(cached => cached || fetch(e.request)));
});
