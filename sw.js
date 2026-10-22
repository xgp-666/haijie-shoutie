/* 手账相册 · 离线缓存
   —— 静态站也能在手机上离线打开（照片仍在浏览器里，不受影响） */
const CACHE = 'shiguang-journal-v3';

/* 首次安装时缓存的核心文件（改版后把上面的版本号 +1 即可刷新） */
const CORE = [
  './',
  './index.html',
  './site.webmanifest',
  './assets/css/style.css',
  './assets/js/data.js',
  './assets/js/main.js',
  './assets/images/cover.svg',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png',
  './assets/images/apple-touch-icon.png',
  './assets/images/stickers/sticker-leaf.jpg',
  './assets/images/stickers/sticker-heart.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE).catch(() => null))   // 个别文件缺失也不影响安装
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;   // 外链不缓存

  // 全部网络优先：拿到就用新的，离线时回退缓存（保证部署后立刻生效，不再被旧缓存挡住）
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html') || caches.match('./')))
  );
});
