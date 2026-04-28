const CACHE_NAME = 'wms-bodega-v1';

// Archivos locales a cachear durante la instalación
const LOCAL_FILES = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './catalog.js',
    './manifest.json',
    './icon.svg'
];

// INSTALACIÓN: guardar archivos en cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(LOCAL_FILES))
            .then(() => self.skipWaiting())
    );
});

// ACTIVACIÓN: limpiar caches viejas
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// FETCH: servir desde cache, con fallback a red
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Recursos propios (mismo dominio): Cache primero
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    // Guardar en cache para el futuro
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            }).catch(() => caches.match('./index.html'))
        );
    } else {
        // Recursos externos (Google Fonts, html5-qrcode): Red primero, cache como respaldo
        event.respondWith(
            fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => caches.match(event.request))
        );
    }
});
