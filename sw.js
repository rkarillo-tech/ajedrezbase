/* AjedrezBase 1.0.0 · service worker: permite instalar la aplicación y usarla sin conexión.
   - La página se pide primero a la red (así siempre tienes la última versión) y, si no hay
     conexión, se sirve la copia guardada.
   - Stockfish se guarda la primera vez que se descarga y se reutiliza entre versiones.
   - Las consultas a Lichess nunca pasan por aquí: van siempre a la red. */
const VERSION = "1.0.0";
const CACHE = "ajedrezbase-app-" + VERSION;
const ENGINE_CACHE = "ajedrezbase-motor";
const ENGINE = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "sf-worker.js",
  "assets/icon.svg", "assets/icon-32.png", "assets/icon-180.png", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Intenta dejar ya guardado el motor; si falla (sin conexión), se guardará al usarlo.
    try {
      const engine = await caches.open(ENGINE_CACHE);
      if (!(await engine.match(ENGINE))) await engine.put(ENGINE, await fetch(ENGINE, { mode: "no-cors" }));
    } catch (e) { /* se reintentará más adelante */ }
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

  if (url.href === ENGINE) {
    event.respondWith((async () => {
      const cache = await caches.open(ENGINE_CACHE);
      const hit = await cache.match(ENGINE);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") cache.put(ENGINE, res.clone());
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
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) { const cache = await caches.open(CACHE); cache.put(req, res.clone()); }
    return res;
  })());
});
