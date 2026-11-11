/* ---------- 7. Motor: Stockfish 19 Lite (WASM, NNUE) → Stockfish 10 (asm.js) → motor interno ---------- */
const STOCKFISH = [
  { id: "sf19", name: "Stockfish 19", host: "jsDelivr", js: "{{SF19_JS}}", wasm: "{{SF19_WASM}}", needsWasm: true, size: "1,9 MB" },
  { id: "sf19b", name: "Stockfish 19", host: "unpkg", js: "{{SF19B_JS}}", wasm: "{{SF19B_WASM}}", needsWasm: true, size: "1,9 MB" },
  { id: "sf10", name: "Stockfish 10", host: "cdnjs", js: "{{SF10_JS}}", size: "1,5 MB" }
];
/* Por qué no se ha podido cargar un motor, en palabras claras */
function engineFailReason(def, slow) {
  if (navigator.onLine === false) return `${def.name} no se ha podido cargar: no hay conexión a internet`;
  return slow
    ? `${def.name} tardó demasiado en descargarse desde ${def.host} (conexión lenta o inestable)`
    : `no se pudo descargar ${def.name} desde ${def.host}. Hay conexión, así que probablemente lo bloquea un bloqueador de anuncios, el antivirus, un cortafuegos o la red (por ejemplo, la de una empresa o un centro de estudios)`;
}
function makeFakeWorker() {
  // Respaldo si el navegador no permite Workers: ejecuta el motor interno en el hilo principal
  const fake = { onmessage: null, terminate() {} };
  const scope = { postMessage: d => setTimeout(() => fake.onmessage && fake.onmessage({ data: d }), 0) };
  Chess.workerMain(scope);
  fake.postMessage = d => setTimeout(() => scope.onmessage({ data: d }), 0);
  return fake;
}
/* Copia de Stockfish 19 guardada en el navegador (IndexedDB) para el archivo abierto con doble clic:
   ahí no hay service worker, así que sin esta copia haría falta internet cada vez. */
const EngineCache = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise(res => {
      try {
        const r = indexedDB.open("ajedrezbase-motor", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("f");
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => res(null);
      } catch { res(null); }
    });
  },
  async op(mode, fn) {
    const db = await this.open();
    if (!db) return null;
    return new Promise(res => {
      try { const tx = db.transaction("f", mode), q = fn(tx.objectStore("f")); tx.oncomplete = () => res(q && q.result !== undefined ? q.result : true); tx.onerror = tx.onabort = () => res(null); }
      catch { res(null); }
    });
  },
  get(id) { return this.op("readonly", s => s.get(id)); },
  put(id, v) { return this.op("readwrite", s => s.put(v, id)); },
  del(id) { return this.op("readwrite", s => s.delete(id)); }
};
const servedOverHttp = () => /^https?:$/.test(location.protocol);
/* Se antepone al código de Stockfish en el Worker: el primer mensaje trae el .wasm y su descarga se sirve desde ahí */
const WASM_FROM_MESSAGE = '(function(){var r;var p=new Promise(function(x){r=x;});self.addEventListener("message",function(e){if(e.data&&e.data.__wasm){r(e.data.__wasm);e.stopImmediatePropagation();}});var f=self.fetch;self.fetch=function(u,o){return /\\.wasm/.test(String(u))?p.then(function(b){return new Response(b,{headers:{"Content-Type":"application/wasm"}});}):f.call(self,u,o);};})();\n';
const Engine = {
  w: null, kind: "", name: "", ready: false, running: null, pending: null, stopping: false, note: "", readyTimer: null, urls: [], cache: null, fromCache: false, skipCache: false,
  init() {
    this.shutdown();
    this.note = "";
    this.fails = [];
    this.skipCache = false;
    if (settings.engine === "internal") { this.startInternal(""); return; }
    const first = settings.engine === "sf10" ? STOCKFISH.findIndex(d => d.id === "sf10") : 0;
    if (first === 0 && !servedOverHttp()) {
      // Como archivo suelto: si ya hay una copia guardada de Stockfish 19, se usa (también sin conexión)
      setEngineBadge("⏳ Preparando el motor…", "");
      EngineCache.get("sf19").then(c => { this.cache = c && c.js && c.wasm ? c : null; if (!this.w) this.startStockfish(0); });
    } else this.startStockfish(first);
  },
  blobUrl(data, type) { const u = URL.createObjectURL(new Blob(Array.isArray(data) ? data : [data], { type })); this.urls.push(u); return u; },
  shutdown() {
    clearTimeout(this.readyTimer);
    if (this.w) { try { this.w.terminate(); } catch {} }
    this.urls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    this.urls = [];
    this.w = null; this.ready = false; this.stopping = false;
    if (this.running) { const r = this.running; this.running = null; r.cancelled = true; r.resolve && r.resolve(null); }
  },
  attach(w, kind) {
    this.w = w; this.kind = kind; this.ready = false;
    w.onmessage = e => this.onLine(String(e.data));
  },
  /* Prueba Stockfish 19 y, si no puede, Stockfish 10. Publicada (https) se lanza desde sf-worker.js
     del mismo sitio para que el service worker pueda guardarlo y usarlo sin conexión; como archivo
     suelto, desde un Worker «blob». */
  startStockfish(i = 0, forceBlob = false) {
    const def = STOCKFISH[i];
    if (!def) { this.startInternal(this.note || engineFailReason({ name: "Stockfish", host: "internet" })); return; }
    if (def.needsWasm && typeof WebAssembly !== "object") { this.startStockfish(i + 1); return; }
    const sameOrigin = !forceBlob && servedOverHttp();
    const useCache = !sameOrigin && def.id.startsWith("sf19") && this.cache && !this.skipCache;
    const hash = def.wasm ? "#" + encodeURIComponent(useCache ? "stockfish.wasm" : def.wasm) : "";
    let w;
    this.fromCache = !!useCache;
    try {
      if (sameOrigin) w = new Worker(`sf-worker.js?e=${def.id}${hash}`);
      else if (useCache) {
        // Desde un archivo local el Worker no puede cargar otros «blob», así que el código de Stockfish va
        // dentro del propio Worker y el .wasm se le pasa por mensaje (se sirve a su fetch desde memoria)
        w = new Worker(this.blobUrl([WASM_FROM_MESSAGE, this.cache.js], "application/javascript") + hash);
        w.postMessage({ __wasm: this.cache.wasm.slice(0) });
      } else w = new Worker(this.blobUrl(`importScripts(${JSON.stringify(def.js)});`, "application/javascript") + hash);
    } catch {
      if (sameOrigin) { this.startStockfish(i, true); return; }
      this.note = "este navegador o esta vista previa no deja ejecutar Stockfish; abre el archivo directamente en Chrome, Edge o Firefox";
      this.startInternal(this.note);
      return;
    }
    this.attach(w, "stockfish");
    this.def = def;
    setEngineBadge(`⏳ Cargando ${def.name}…`, "");
    const retry = (nextI, blob, reason) => {
      const pend = this.pending;
      this.pending = null;
      this.shutdown();
      if (reason) { this.note = reason; this.fails.push(reason); }
      this.startStockfish(nextI, blob);
      if (pend) this.pending = pend;
    };
    w.onerror = e => {
      if (e && e.preventDefault) e.preventDefault();
      if (this.ready || this.kind !== "stockfish" || this.w !== w) return;
      if (useCache) { this.skipCache = true; EngineCache.del("sf19"); this.cache = null; retry(i, false); return; }   // copia estropeada: se descarga otra vez
      if (sameOrigin) retry(i, true);
      else retry(i + 1, false, engineFailReason(def));
    };
    this.readyTimer = setTimeout(() => { if (!this.ready && this.kind === "stockfish" && this.w === w) retry(i + 1, false, engineFailReason(def, true)); }, 30000);
    this.send("uci");
  },
  fallback(reason) {
    const pend = this.pending;
    this.pending = null;
    this.shutdown();
    this.startInternal(reason);
    if (pend) this.start(pend);
  },
  startInternal(reason) {
    let w;
    try {
      const src = $("coreLib").textContent + "\nChess.workerMain(self);";
      w = new Worker(this.blobUrl(src, "application/javascript"));
    } catch { w = makeFakeWorker(); }
    this.attach(w, "internal");
    this.note = reason || "";
    w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); if (!this.ready) { const fw = makeFakeWorker(); this.attach(fw, "internal"); this.send("uci"); } };
    this.send("uci");
  },
  send(cmd) { try { this.w && this.w.postMessage(cmd); } catch {} },
  onLine(line) {
    if (line === "uciok") {
      this.ready = true;
      clearTimeout(this.readyTimer);
      this.name = this.kind === "stockfish" ? this.def.name : "Motor interno";
      if (this.kind === "stockfish" && this.def.id.startsWith("sf19")) {
        this.note = "";
        if (!this.fromCache && !servedOverHttp()) saveEngineCopy(this.def);
      }
      if (this.kind === "stockfish") this.send("setoption name Hash value 32");
      setEngineBadge("⚙ " + this.name + (this.note ? " ⚠" : ""), this.note);
      renderEngineStatus();
      this.pump();
      if (!this.running) requestLive();
      return;
    }
    const job = this.running;
    if (!job) return;
    if (line.startsWith("info ") && line.includes(" pv ") && line.includes(" score ")) {
      if (/ (lowerbound|upperbound) /.test(line)) return;
      const tk = line.split(" ");
      const get = k => { const i = tk.indexOf(k); return i >= 0 ? tk[i + 1] : null; };
      const si = tk.indexOf("score");
      const kind = tk[si + 1], val = +tk[si + 2];
      const mpv = +(get("multipv") || 1);
      const depth = +(get("depth") || 0);
      const pv = tk.slice(tk.indexOf("pv") + 1).filter(Boolean);
      const L = { depth, pv };
      if (kind === "mate") { L.mate = val * job.stm; if (val === 0) { L.mate = 0; L.winner = -job.stm; } }
      else L.cp = val * job.stm;
      job.lines[mpv - 1] = L;
      job.depth = Math.max(job.depth || 0, depth);
      job.nps = +(get("nps") || 0) || (get("time") && +get("time") ? Math.round(+get("nodes") / (+get("time") / 1000)) : 0);
      if (!job.cancelled && job.onInfo) job.onInfo(job);
      return;
    }
    if (line.startsWith("bestmove")) {
      this.running = null;
      this.stopping = false;
      const b = line.split(/\s+/)[1];
      job.best = b && b !== "(none)" ? b : null;
      if (!job.cancelled) { if (job.onDone) job.onDone(job); if (job.resolve) job.resolve(job); }
      else if (job.resolve) job.resolve(null);
      this.pump();
    }
  },
  /* job: { purpose, fen, moves, stm, movetime, depth, multipv, skill, onInfo, onDone, resolve } */
  start(job) {
    job.lines = [];
    if (this.pending && this.pending !== job) { const p = this.pending; p.cancelled = true; p.resolve && p.resolve(null); }
    this.pending = job;
    if (this.running && !this.stopping) { this.running.cancelled = true; this.stopping = true; this.send("stop"); }
    this.pump();
    return job;
  },
  pump() {
    if (!this.ready || this.running || !this.pending) return;
    const job = this.pending;
    this.pending = null;
    this.running = job;
    if (this.kind === "stockfish") this.send(`setoption name MultiPV value ${job.multipv || 1}`);
    this.send(`setoption name Skill Level value ${job.skill == null ? 20 : job.skill}`);
    this.send(`position fen ${job.fen}` + (job.moves && job.moves.length ? " moves " + job.moves.join(" ") : ""));
    const mt = this.kind === "internal" ? Math.min(job.movetime || 1000, job.purpose === "live" ? 2500 : 4000) : (job.movetime || 1000);
    this.send(job.depth ? `go depth ${job.depth}` : `go movetime ${mt}`);
  },
  cancel(purpose) {
    if (this.pending && (!purpose || this.pending.purpose === purpose)) { const p = this.pending; this.pending = null; p.cancelled = true; p.resolve && p.resolve(null); }
    if (this.running && (!purpose || this.running.purpose === purpose) && !this.stopping) { this.running.cancelled = true; this.stopping = true; this.send("stop"); }
  },
  analyse(node, opts) {
    return new Promise(resolve => {
      const path = Pgn.pathTo(node);
      this.start(Object.assign({
        fen: Chess.toFen(path[0].state), moves: path.slice(1).map(n => n.uci), stm: node.state.t, resolve
      }, opts));
    });
  }
};
/* Estado del motor en ⚙ Ajustes: qué se está usando y, si no es Stockfish 19, por qué */
function renderEngineStatus() {
  const el = $("engineStatus");
  if (!el) return;
  const name = Engine.ready ? Engine.name : "cargando…";
  const fails = (Engine.fails || []).filter((x, i, a) => a.indexOf(x) === i);
  const sf19 = Engine.ready && Engine.def && Engine.kind === "stockfish" && Engine.def.id.startsWith("sf19");
  el.innerHTML = `Ahora se usa: <b>${esc(name)}</b>${sf19 && Engine.def.id === "sf19b" ? " (descargado de unpkg, porque jsDelivr no respondía)" : ""}.`
    + (fails.length && !sf19 ? `<br>⚠ ${fails.map(esc).join("<br>⚠ ")}` : "")
    + (!sf19 && settings.engine === "auto" ? "<br>Si usas un bloqueador de anuncios, permite <b>cdn.jsdelivr.net</b> y <b>unpkg.com</b> para esta página y pulsa «Reintentar»." : "")
    + (servedOverHttp() ? (sf19 ? "<br>💾 Al tener la aplicación instalada, Stockfish 19 queda guardado para usarlo sin conexión." : "")
      : Engine.cache ? `<br>💾 Stockfish 19 está guardado en este navegador (${(Engine.cache.wasm.byteLength / 1048576).toFixed(1).replace(".", ",")} MB, desde ${esc(Engine.cache.from || "internet")}, ${esc(new Date(Engine.cache.t).toLocaleDateString("es-ES"))}): funciona aunque abras el archivo sin conexión.${Engine.fromCache ? " Ahora se está usando esa copia." : ""}`
      : sf19 ? "<br>⏳ Guardando una copia de Stockfish 19 en este navegador para usarlo sin conexión…" : "");
}
/* Guarda en el navegador una copia de Stockfish 19 (el mismo fichero que se acaba de cargar) */
async function saveEngineCopy(def) {
  try {
    const [jsRes, wasmRes] = await Promise.all([fetch(def.js, { mode: "cors", credentials: "omit" }), fetch(def.wasm, { mode: "cors", credentials: "omit" })]);
    if (!jsRes.ok || !wasmRes.ok) return;
    const rec = { js: await jsRes.text(), wasm: await wasmRes.arrayBuffer(), t: Date.now(), from: def.host };
    if (rec.wasm.byteLength < 100000 || rec.js.length < 1000) return;
    if (await EngineCache.put("sf19", rec)) { Engine.cache = rec; renderEngineStatus(); }
  } catch (e) { console.warn("No se pudo guardar la copia de Stockfish:", e); }
}
function resetEngineBadge() { if (Engine.ready) setEngineBadge("⚙ " + Engine.name + (Engine.note ? " ⚠" : ""), ""); }
function setEngineBadge(text, note) {
  $("engineSourceBadge").textContent = text;
  $("engineSourceBadge").title = (note ? "Aviso: " + note : Engine.note ? "Aviso: " + Engine.note : "") + (note || Engine.note ? " · Pulsa para ver el estado del motor" : "");
  if (note) $("engineMeta").textContent = note;
}

/* ---------- 8. Evaluaciones guardadas en los nodos ---------- */
function terminalEval(node) {
  const s = node.state;
  if (!Chess.legal(s).length) return Chess.inCheck(s) ? { mate: 0, winner: -s.t, depth: 99, source: "regla" } : { cp: 0, depth: 99, source: "regla" };
  if (Chess.insufficient(s)) return { cp: 0, depth: 99, source: "regla" };
  return null;
}
function storeEval(node, job, force) {
  const l0 = job && job.lines && job.lines[0];
  if (!l0) return;
  const prev = node.eval;
  if (!force && prev && prev.source !== "pgn" && (prev.depth || 0) > l0.depth) return;
  node.eval = {
    cp: l0.cp, mate: l0.mate, winner: l0.winner, depth: l0.depth, best: l0.pv[0] || job.best, pv: l0.pv.slice(0, 14),
    second: job.lines[1] ? { cp: job.lines[1].cp, mate: job.lines[1].mate, uci: job.lines[1].pv[0] } : null, source: Engine.kind,
    lines: job.lines.filter(Boolean).map(l => ({ cp: l.cp, mate: l.mate, winner: l.winner, depth: l.depth, pv: l.pv.slice(0, 14) })), done: job.purpose === "live"
  };
}

