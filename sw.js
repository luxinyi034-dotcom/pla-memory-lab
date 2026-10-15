// Offline support: app files are served from cache and refreshed in the
// background (stale-while-revalidate). Learning data lives in localStorage /
// IndexedDB and is never touched by updates.
const VERSION = 'pla-v2.0.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './styles/app.css',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png',
  './src/app.js', './src/store.js',
  './src/core/time.js', './src/core/srs.js', './src/core/model.js', './src/core/selectors.js', './src/core/grading.js',
  './src/core/actions.js', './src/core/study.js', './src/core/drills.js', './src/core/xlsx.js',
  './src/ui/dom.js',
  './src/views/index.js', './src/views/common.js', './src/views/today.js', './src/views/learn.js', './src/views/study.js',
  './src/views/library.js', './src/views/expression.js', './src/views/plan.js', './src/views/quick.js', './src/views/misc.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  event.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(request, { ignoreSearch: sameOrigin && url.pathname.endsWith('/') });
    const network = fetch(request).then(response => {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
