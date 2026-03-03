// Service Worker — Jerusalem Shelter Finder
// Uses relative paths so it works at any base URL (GitHub Pages subdir, custom domain, etc.)

const CACHE = 'jlm-v2';

// Derive base path from sw.js location (e.g. /jlm-shelters/ on GitHub Pages)
const BASE = self.registration.scope;

const PRECACHE = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'app.js',
  BASE + 'data.js',
  BASE + 'manifest.json',
  BASE + 'icon.svg',
  'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Heebo:wght@300;400;500;700;800&family=Azeret+Mono:wght@400;600&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE).catch(() => {})) // don't fail install if CDN is offline
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  // OSM tiles: network-first (real-time map tiles)
  if (e.request.url.includes('tile.openstreetmap.org')) {
    e.respondWith(
      fetch(e.request)
        .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r && r.status === 200 && r.type !== 'opaque') {
          caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        }
        return r;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match(BASE + 'index.html');
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
