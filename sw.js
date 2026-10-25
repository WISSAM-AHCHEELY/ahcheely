const CACHE = 'ahcheely-v1';
const CORE = ['./', './index.html', './style.css', './ui.js', './avatars.js', './app.js', './auth.js', './database.js', './firebase-config.js', './manifest.json', './icon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

// الشبكة أولاً للملفات الداخلية الثابتة (تضمن التحديث الفوري)، ولا نلمس طلبات
// Firebase/Cloudinary لأنها خارج أصل الصفحة، ولا أي طلب غير GET.
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) { return m || caches.match('./'); });
    })
  );
});
