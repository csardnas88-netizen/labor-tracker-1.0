/* ══════════════════════════════════════════════════════
   Labor Tracker — Service Worker
   Makes the app open with no internet at all.

   Without this, the app lives entirely on GitHub Pages: close the tab
   with no signal and it simply won't load, no matter how much data is
   already saved on the device. This caches the app shell plus the PDF /
   Excel / chart libraries it depends on, so the app boots offline and
   keeps working against local data until the connection returns.

   Bump CACHE_VERSION on every deploy so users get the new build.
   ══════════════════════════════════════════════════════ */
var CACHE_VERSION = 'labor-v6.32.0';

/* Same-origin shell. Relative paths keep this working under the
   /labor-tracker-1.0/ sub-path GitHub Pages serves from. */
var SHELL = [
  './',
  './index.html'
];

/* Third-party libraries. These URLs are version-pinned and immutable,
   so they are safe to cache indefinitely and serve cache-first. */
var VENDOR = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      /* Shell must succeed; vendor files are best-effort so one CDN
         hiccup can't abort the whole install and leave us with no SW. */
      return cache.addAll(SHELL).then(function () {
        return Promise.all(VENDOR.map(function (url) {
          return cache.add(new Request(url, { mode: 'cors' })).catch(function () {});
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  /* Never touch Supabase. Data reads/writes must always hit the network
     so the app's own sync + offline-queue logic stays in control; a
     cached API response here would silently serve stale hours. */
  if (url.hostname.indexOf('supabase.co') !== -1) return;

  /* App shell: network-first so a fresh deploy is picked up as soon as
     the user is online, with the cached copy as the offline fallback. */
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* Everything else (vendor libs, fonts): cache-first, then network. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
