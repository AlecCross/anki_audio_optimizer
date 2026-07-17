const CACHE_NAME = 'anki-audio-optimizer-v1';

// Assets to cache immediately on installation
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './manifest.json',
    './icon.svg',
    './lib/lame.min.js'
];

// Install Event: Caches all initial resources
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Pre-caching offline assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting()) // Force activation
    );
});

// Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Immediately take control of all clients
    );
});

// Fetch Event: Cache-First strategy
self.addEventListener('fetch', (event) => {
    // Only intercept HTTP/S requests (ignores chrome-extension or other protocols)
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    console.log('[Service Worker] Serving from cache:', event.request.url);
                    return cachedResponse;
                }

                // If not in cache, fetch from network
                return fetch(event.request).then((networkResponse) => {
                    // Check if response is valid before caching it dynamically
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }

                    // Dynamically cache new local requests (excluding external API calls if any)
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                }).catch((error) => {
                    console.error('[Service Worker] Fetch failed, network is down:', error);
                    // You could return a custom offline page here if it was cached
                });
            })
    );
});
