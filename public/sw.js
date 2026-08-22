const CACHE_NAME = 'cotizaciones-shell-v2';
const SHELL_ASSETS = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Network-first para el shell: siempre intenta traer la versión más
// reciente del sitio; solo usa el caché si no hay conexión. Evita que un
// usuario quede atorado en una versión vieja del build (con nombres de
// archivo hasheados que ya no existen) después de un nuevo deploy.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isShellAsset = SHELL_ASSETS.includes(url.pathname);

  if (isShellAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
