const CACHE_NAME = 'cuadrante-planificador-cache-v1';
const urlsToCache = [
  'index.html',
  'cuadrante.css',
  'cuadrante.js',
  'icon-192.png',
  'icon-512.png'
];

// Instalar el Service Worker y cachear los archivos principales de la app
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y archivos principales cacheados');
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptar las peticiones y servir desde la caché si es posible
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});