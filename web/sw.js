/* Tea PM Service Worker — cache-first，API/封面不缓存 */
var CACHE = 'tea-pm-v2.2.0';
var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles/tokens.css',
  './assets/styles/base.css',
  './assets/styles/layout.css',
  './assets/styles/components.css',
  './assets/styles/responsive.css',
  './assets/scripts/lib.js',
  './assets/scripts/theme.js',
  './assets/scripts/store.js',
  './assets/scripts/api.js',
  './assets/scripts/ui/views.js',
  './assets/scripts/ui/project-detail.js',
  './assets/scripts/ui/dashboard.js',
  './assets/scripts/ui/settings-panel.js',
  './vendor/echarts/echarts.min.js',
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // API 与封面：不缓存
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/cover') !== -1) return;
  // 同源才接管
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return resp;
      }).catch(function () {
        // 导航请求回退 index.html
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
