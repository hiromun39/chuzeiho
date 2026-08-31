/* =========================================
   Service Worker
   - オフライン対応のためのキャッシュ
   - アプリ更新時のキャッシュ更新
   ========================================= */

const CACHE_NAME = "chuzeiho-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./css/style.css",
  "./data/rokujuyonka.js",
  "./data/catch_messages.js",
  "./data/yaoji_part1.js",
  "./data/yaoji_part2.js",
  "./data/yaoji_part3.js",
  "./js/kakei.js",
  "./js/chuzeiho.js",
  "./js/supabase.js",
  "./js/app.js"
];

// インストール
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 起動時
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// フェッチ
self.addEventListener("fetch", (event) => {
  // クロスオリジン（API等）はスコープ外
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        // キャッシュがあれば即返す
        if (cached) return cached;

        // なければネットワーク取得 → キャッシュに保存
        return fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {
            // ネットワーク失敗時は index.html（SPA 的に）
            if (event.request.mode === "navigate") {
              return caches.match("./index.html");
            }
            return new Response("", { status: 502 });
          });
      })
  );
});