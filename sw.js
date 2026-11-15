/* Offline app shell; article images are cached by the browser, not pinned by the service worker. */
const VERSION='pixelpress-shell-v11';
const APP=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icons/app-192.png','./icons/app-512.png','./icons/newspaper.png','./icons/articles.png','./icons/gear.png','./icons/controller.png','./icons/starOutline.png','./icons/starFilled.png','./icons/internet.png'];
self.addEventListener('install', event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.match('./index.html')));return;
 }
 event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put(request,copy)));}return response;}).catch(()=>caches.match(request)));
});
