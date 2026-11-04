/* Ma bergerie — hors ligne.
   Page : réseau d'abord, mais repli sur le cache au bout de 3 s (réseau faible à la bergerie).
   Fichiers : cache d'abord. Les scripts sont versionnés (?v=N) : page et scripts restent cohérents. */
const CACHE = 'bergerie-v9';
const FICHIERS = ['./', './index.html', './modele.js?v=9', './stockage.js?v=9', './manifest.webmanifest', './icon.svg'];
const DELAI_RESEAU = 3000;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function pageEnCache() { return caches.match('./index.html').then(function (r) { return r || caches.match('./'); }); }

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(new Promise(function (resolve) {
      let fini = false;
      const repli = setTimeout(function () {
        pageEnCache().then(function (r) { if (r && !fini) { fini = true; resolve(r); } });
      }, DELAI_RESEAU);
      fetch(e.request).then(function (r) {
        if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(function (c) { c.put('./index.html', cp); }); }
        if (!fini) { fini = true; clearTimeout(repli); resolve(r); }
      }).catch(function () {
        clearTimeout(repli);
        pageEnCache().then(function (r) { if (!fini) { fini = true; resolve(r || Response.error()); } });
      });
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (r) {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); }
      return r;
    });
  }));
});
