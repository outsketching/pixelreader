/* PixelPress offline shell. Missing optional files must not block SW install. */
const VERSION = 'pixelpress-shell-v15';
const CORE = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icons/app-192.png', './icons/app-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(CORE.map(async path => {
      try { await cache.add(new Request(path, {cache:'reload'})); }
      catch(err) { console.warn('PixelPress optional preload failed:', path, err); }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pixelpress-shell-') && k!==VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if(request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if(response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(VERSION).then(c => c.put(request,copy)));
    }
    return response;
  }).catch(() => caches.match(request)));
});
