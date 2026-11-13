// Bump this on every release. Shown in Settings via APP_VERSION in app.js — keep the two in sync.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `espanol-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  'index.html',
  'app.js',
  'store.js',
  'styles.css',
  'content.json',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', event => {
  // Deliberately no self.clients.claim() here: claiming would make this worker
  // take control of the page that is loading right now too, even on the very
  // first-ever install — which fires 'controllerchange' on that same page and
  // would trigger an unwanted, unprompted reload moments after someone's first
  // visit. Without it, a page only gets a new controller on its *next* load,
  // so 'controllerchange' only ever fires for a real update the user asked for.
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
