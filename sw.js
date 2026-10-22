/* 手账相册 · 缓存清理（自毁版）
   —— 之前“缓存优先”的旧 service worker 会让手机一直停在旧页面，
      导致新代码（含云同步/自动同步）永远加载不到。
      这里把它改成“一激活就清空所有缓存并注销自己”，
      这样每台手机下次打开时会自动摆脱旧缓存，之后每次都从网络拉最新版本。 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));   // 清空所有旧缓存
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {} // 注销自己，永不再生
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) { try { c.navigate(c.url); } catch (_) {} } // 让被控页面重载到最新
    } catch (_) {}
  })());
});

/* 不接管任何请求：全部直接走网络，保证每次都是最新内容 */
self.addEventListener('fetch', () => {});
