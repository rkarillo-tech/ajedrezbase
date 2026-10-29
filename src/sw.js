/* AjedrezBase {{VERSION}} · service worker: permite instalar la aplicación y usarla sin conexión.
   - La página se pide primero a la red (así siempre tienes la última versión) y, si no hay
     conexión, se sirve la copia guardada.
   - Stockfish (19 Lite y, si se usa, 10) se guarda la primera vez y se reutiliza entre versiones.
   - Las consultas a Lichess nunca pasan por aquí: van siempre a la red. */
const VERSION = "{{VERSION}}";
const CACHE = "ajedrezbase-app-" + VERSION;
const ENGINE_CACHE = "ajedrezbase-motor";
const ENGINES = ["{{SF19_JS}}", "{{SF19_WASM}}", "{{SF10_JS}}"];
const PRECACHE_ENGINES = ["{{SF19_JS}}", "{{SF19_WASM}}"];   // el 10 sólo se guarda si llega a usarse
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "sf-worker.js",
  "assets/icon.svg", "assets/icon-32.png", "assets/icon-180.png", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Intenta dejar ya guardado el motor; si falla (sin conexión), se guardará al usarlo.
    const engine = await caches.open(ENGINE_CACHE);
    for (const url of PRECACHE_ENGINES) {
      try {
        if (!(await engine.match(url))) { const res = await fetch(url, { mode: "cors" }); if (res.ok) await engine.put(url, res); }
      } catch (e) { /* se reintentará más adelante */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("ajedrezbase-app-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (ENGINES.includes(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(ENGINE_CACHE);
      const hit = await cache.match(url.href);
      if (hit) return hit;
      // Se pide siempre en modo CORS para que la copia sirva tanto a importScripts como a fetch (wasm)
      const res = await fetch(url.href, { mode: "cors", credentials: "omit" });
      if (res.ok) cache.put(url.href, res.clone());
      return res;
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const cache = await caches.open(CACHE); cache.put("index.html", res.clone()); }
        return res;
      } catch (e) {
        return (await caches.match("index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: url.pathname.endsWith("sf-worker.js") });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) { const cache = await caches.open(CACHE); cache.put(req, res.clone()); }
    return res;
  })());
});
