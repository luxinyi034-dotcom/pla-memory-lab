// Offline support. App files come from the network first (revalidated, so a new
// release shows up on the next open) and fall back to the cache when offline.
// Fonts are cache-first. Learning data lives in localStorage / IndexedDB and is
// never touched by updates.
const VERSION = 'pla-v4.0.2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './styles/app.css',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png',
  './src/app.js', './src/store.js',
  './src/core/time.js', './src/core/srs.js', './src/core/model.js', './src/core/selectors.js', './src/core/grading.js',
  './src/core/actions.js', './src/core/study.js', './src/core/drills.js', './src/core/xlsx.js',
  './src/ui/dom.js', './src/ui/art.js',
  './src/views/index.js', './src/views/common.js', './src/views/today.js', './src/views/learn.js', './src/views/study.js',
  './src/views/library.js', './src/views/expression.js', './src/views/plan.js', './src/views/quick.js', './src/views/misc.js', './src/views/versions.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
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
    if (isFont) {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    }
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: url.pathname.endsWith('/') || request.mode === 'navigate' });
      if (cached) return cached;
      throw error;
    }
  }));
});
