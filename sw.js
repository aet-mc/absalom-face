const CACHE_NAME = 'absalom-mind-v1';
const urlsToCache = [
  '/renderer/layers/mycelium-test.html',
  '/renderer/layers/mycelium.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
