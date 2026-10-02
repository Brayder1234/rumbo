// Service worker: guarda la app para que abra sin internet.
// Al publicar cambios, sube el número de CACHE.
const CACHE = 'rumbo-v1';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/model.js', './js/scheduler.js', './js/parser.js', './js/store.js', './js/sound.js', './js/time.js',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero internet (para recibir actualizaciones); si no hay conexión o tarda, la copia guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch { /* sin conexión */ }
    const cached = await cache.match(e.request, { ignoreSearch: true });
    return cached || network;
  })());
});

// Tocar una notificación abre (o enfoca) Rumbo
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
