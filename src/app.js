"use strict";
/* =========================================================================
   APLICACIÓN
   ========================================================================= */

/* ---------- 0. Utilidades ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function throttle(fn, ms) {
  let last = 0, t = null, lastArgs;
  return (...a) => {
    lastArgs = a;
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else if (!t) t = setTimeout(() => { t = null; last = Date.now(); fn(...lastArgs); }, ms - (now - last));
  };
}
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    return ok;
  }
}
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safeName = s => String(s || "partida").replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim().replace(/\s+/g, "_").slice(0, 60) || "partida";

/* ---------- 1. Ajustes persistentes ---------- */
const DEFAULTS = {
  pieceStyle: "staunton", lang: "es", theme: "wood", sound: true, engine: "auto", token: "",
  analysisMs: 1000, multipv: 3, liveMs: 4000, live: true, arrow: true, cpuLevel: 8,
  branchMode: "variation", notation: "auto", coords: true, showLegal: true, autosave: true, explorerDb: "masters",
  animate: true, wheel: true, moveView: "list", lichessUser: "", myNames: "",
  cpuStyle: "balanced", cpuClock: "", cpuColor: "board", cpuFrom: "new"
};
const settings = Object.assign({}, DEFAULTS, LS.get("ajedrezSettings", {}));
try { const legacy = localStorage.getItem("ajedrezPieceStyle"); if (legacy && !localStorage.getItem("ajedrezSettings")) settings.pieceStyle = legacy; } catch {}
const saveSettings = () => LS.set("ajedrezSettings", settings);

/* ---------- 2. Notación y nombres ---------- */
const PIECE_ART = { p: "el peón", n: "el caballo", b: "el alfil", r: "la torre", q: "la dama", k: "el rey" };
const PIECE_ES = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
const PIECE_LABEL = { P: "peón blanco", N: "caballo blanco", B: "alfil blanco", R: "torre blanca", Q: "dama blanca", K: "rey blanco", p: "peón negro", n: "caballo negro", b: "alfil negro", r: "torre negra", q: "dama negra", k: "rey negro" };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function formatSan(sanStr, lang, color = 1) {
  if (!sanStr || lang === "en") return sanStr;
  const map = lang === "es" ? { K: "R", Q: "D", R: "T", B: "A", N: "C" }
    : color === 1 ? { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" } : { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞" };
  return sanStr.replace(/^[KQRBN]/, m => map[m]).replace(/=([QRBN])/, (_, m) => "=" + map[m]);
}
const dispSan = n => formatSan(n.san, settings.lang, n.parent.state.t);
const numPrefix = s => s.full + (s.t === 1 ? "." : "...");
/* Convierte una lista UCI en texto SAN con números, desde un estado */
function lineText(state, ucis, maxPlies = 10) {
  const out = [];
  let s = state;
  for (let i = 0; i < Math.min(ucis.length, maxPlies); i++) {
    const L = Chess.legal(s);
    const m = Chess.moveFromUci(s, ucis[i], L);
    if (!m) break;
    const prefix = s.t === 1 ? s.full + "." : i === 0 ? s.full + "..." : "";
    out.push(prefix + formatSan(Chess.san(s, m, L), settings.lang, s.t));
    s = Chess.apply(s, m);
  }
  return out.join(" ");
}
/* Igual que lineText, pero cada jugada es un <span> con la FEN resultante (para el minitablero) */
function lineSpans(state, ucis, maxPlies = 10) {
  const out = [];
  let s = state;
  for (let i = 0; i < Math.min(ucis.length, maxPlies); i++) {
    const L = Chess.legal(s);
    const m = Chess.moveFromUci(s, ucis[i], L);
    if (!m) break;
    const prefix = s.t === 1 ? s.full + "." : i === 0 ? s.full + "..." : "";
    const txt = prefix + formatSan(Chess.san(s, m, L), settings.lang, s.t);
    s = Chess.apply(s, m);
    out.push(`<span class="pv-mv" data-fen="${esc(Chess.toFen(s))}" data-from="${m.from}" data-to="${m.to}">${esc(txt)}</span>`);
  }
  return out.join(" ");
}
function fmtEval(ev) {
  if (!ev) return "–";
  if (ev.mate != null) return ev.mate === 0 ? (ev.winner === 1 ? "1-0" : "0-1") : ev.mate > 0 ? "#" + ev.mate : "−#" + Math.abs(ev.mate);
  const v = ev.cp / 100;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
}
function winPct(ev) {
  if (!ev) return 50;
  if (ev.mate != null) return ev.mate === 0 ? (ev.winner === 1 ? 100 : 0) : ev.mate > 0 ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * ev.cp)) - 1);
}

/* ---------- 3. Piezas ---------- */
/*__PIECES__*/

/* ---------- 4. Sonido ---------- */
const Sound = {
  ctx: null,
  tone(freq, dur, type = "triangle", when = 0, vol = 0.09) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur + 0.02);
  },
  play(kind) {
    if (!settings.sound) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (kind === "capture") { this.tone(240, .09, "square", 0, .05); this.tone(180, .08, "triangle", .03); }
      else if (kind === "check") { this.tone(660, .08); this.tone(880, .1, "triangle", .08); }
      else if (kind === "end") { this.tone(520, .12); this.tone(390, .12, "triangle", .12); this.tone(260, .22, "triangle", .24); }
      else if (kind === "error") { this.tone(150, .18, "sawtooth", 0, .05); }
      else if (kind === "ok") { this.tone(700, .07); this.tone(1050, .09, "triangle", .07); }
      else this.tone(430, .06);
    } catch {}
  }
};

/* ---------- 5. Libro ECO indexado por posición ---------- */
const ECO = (() => {
  const byKey = new Map();
  for (const e of ECO_BOOK) {
    const r = Pgn.parseGame(e.moves, { lang: "en" });
    if (r.error) continue;
    const line = Pgn.mainlineFrom(r.game.root);
    e.key = line[line.length - 1].key;
    e.ucis = line.map(n => n.uci);
    byKey.set(e.key, e);
  }
  return {
    byKey,
    detect(node) { for (let n = node; n; n = n.parent) { const e = byKey.get(n.key); if (e) return { entry: e, exact: n === node }; } return null; }
  };
})();

/* ---------- 6. Estado ---------- */
let game = Pgn.newGame();
const ui = {
  selected: null, drag: null, autoplay: null, flipped: false, drawStart: null, nodeMap: new Map(),
  cpu: { on: false, side: -1, thinking: false, prevLive: true, over: false, level: 8, style: "balanced", tc: "", blind: false, startNode: null, lastEval: null }, blind: false, peek: false, analysing: false, cancelAnalysis: false,
  activeTab: "study", engineArrow: null, liveNode: null,
  libId: null, dirty: false, rev: 0, saveError: "", recUpdated: 0, explorerAbort: null, fav: false, tags: [], legacyStudy: null, markCtx: null, librarySub: "games"
};
const trainer = { active: false, side: 1, errors: 0, hints: 0, correct: 0, hintLevel: 0, hintArrow: null, hintSq: -1, libId: null, markId: null, card: false, busy: false };
const editor = { active: false, state: null, tool: "MOVE", sel: null, origin: null };
const cur = () => game.current;
/* ¿Estamos en un ejercicio o jugando contra la CPU? Entonces se oculta el motor y no se navega por la partida */
const quiz = () => trainer.active || Retry.active || Guess.active || Vis.active || ui.cpu.on;
const viewState = () => (editor.active ? editor.state : game.current.state);

/* ---------- 7. Motor: Stockfish 19 Lite (WASM, NNUE) → Stockfish 10 (asm.js) → motor interno ---------- */
const STOCKFISH = [
  { id: "sf19", name: "Stockfish 19", js: "{{SF19_JS}}", wasm: "{{SF19_WASM}}", needsWasm: true, size: "1,9 MB" },
  { id: "sf10", name: "Stockfish 10", js: "{{SF10_JS}}", size: "1,5 MB" }
];
function makeFakeWorker() {
  // Respaldo si el navegador no permite Workers: ejecuta el motor interno en el hilo principal
  const fake = { onmessage: null, terminate() {} };
  const scope = { postMessage: d => setTimeout(() => fake.onmessage && fake.onmessage({ data: d }), 0) };
  Chess.workerMain(scope);
  fake.postMessage = d => setTimeout(() => scope.onmessage({ data: d }), 0);
  return fake;
}
const Engine = {
  w: null, kind: "", name: "", ready: false, running: null, pending: null, stopping: false, note: "", readyTimer: null,
  init() {
    this.shutdown();
    this.note = "";
    if (settings.engine === "internal") this.startInternal("");
    else this.startStockfish(settings.engine === "sf10" ? 1 : 0);
  },
  shutdown() {
    clearTimeout(this.readyTimer);
    if (this.w) { try { this.w.terminate(); } catch {} }
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
    if (!def) { this.startInternal(this.note || "no se pudo cargar Stockfish (¿sin conexión?)"); return; }
    if (def.needsWasm && typeof WebAssembly !== "object") { this.startStockfish(i + 1); return; }
    const sameOrigin = !forceBlob && /^https?:$/.test(location.protocol);
    const hash = def.wasm ? "#" + encodeURIComponent(def.wasm) : "";
    let w;
    try {
      if (sameOrigin) w = new Worker(`sf-worker.js?e=${def.id}${hash}`);
      else w = new Worker(URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(def.js)});`], { type: "application/javascript" })) + hash);
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
      if (reason) this.note = reason;
      this.startStockfish(nextI, blob);
      if (pend) this.pending = pend;
    };
    w.onerror = e => {
      if (e && e.preventDefault) e.preventDefault();
      if (this.ready || this.kind !== "stockfish" || this.w !== w) return;
      if (sameOrigin) retry(i, true);
      else retry(i + 1, false, `${def.name} no está disponible (¿sin conexión?)`);
    };
    this.readyTimer = setTimeout(() => { if (!this.ready && this.kind === "stockfish" && this.w === w) retry(i + 1, false, `${def.name} tardó demasiado en cargar`); }, 30000);
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
      w = new Worker(URL.createObjectURL(new Blob([src], { type: "application/javascript" })));
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
      if (this.kind === "stockfish" && this.def.id === "sf19") this.note = "";
      if (this.kind === "stockfish") this.send("setoption name Hash value 32");
      setEngineBadge("⚙ " + this.name + (this.note ? " ⚠" : ""), this.note);
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
function resetEngineBadge() { if (Engine.ready) setEngineBadge("⚙ " + Engine.name + (Engine.note ? " ⚠" : ""), ""); }
function setEngineBadge(text, note) {
  $("engineSourceBadge").textContent = text;
  $("engineSourceBadge").title = note ? "Aviso: " + note : Engine.note ? "Usando el motor interno: " + Engine.note : "";
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

/* ---------- 9. Renderizado del tablero ---------- */
const boardEl = $("board");
function renderBoard() {
  const s = viewState(), node = cur();
  const last = !editor.active && node.move ? node.move : null;
  const checkSq = !editor.active && Chess.inCheck(s) ? Chess.kingSq(s.b, s.t) : -1;
  const targets = new Map();
  if (!editor.active && ui.selected != null && settings.showLegal) for (const m of Chess.legal(s)) if (m.from === ui.selected) targets.set(m.to, m.captured !== ".");
  const locked = !editor.active && !canUserMove();
  const frag = document.createDocumentFragment();
  for (let d = 0; d < 64; d++) {
    const r = d >> 3, c = d & 7;
    const rr = ui.flipped ? 7 - r : r, cc = ui.flipped ? 7 - c : c;
    const i = rr * 16 + cc, p = s.b[i];
    const el = document.createElement("div");
    el.className = "square " + ((rr + cc) % 2 === 0 ? "light" : "dark");
    el.dataset.sq = i;
    el.setAttribute("role", "gridcell");
    el.setAttribute("aria-label", Chess.sqName(i) + (p !== "." ? ", " + PIECE_LABEL[p] : ""));
    if (ui.selected === i) el.classList.add("selected");
    if (last && (last.from === i || last.to === i)) el.classList.add("last");
    if (checkSq === i) el.classList.add("in-check");
    if ((trainer.active && trainer.hintSq === i) || (Retry.active && Retry.hintSq === i) || (Guess.active && Guess.hintSq === i)) el.classList.add("hint-sq");
    if (Vis.marks.ok === i) el.classList.add("vis-ok");
    if (Vis.marks.bad === i) el.classList.add("vis-bad");
    if (targets.has(i)) { el.classList.add("target"); if (targets.get(i)) el.classList.add("occupied"); }
    if (!locked && !editor.active && p !== "." && Chess.color(p) === s.t) el.classList.add("has-own");
    el.innerHTML = `<div class="piece-holder">${getPieceHTML(p, settings.pieceStyle)}</div>`;
    if (settings.coords) {
      if (c === 0) el.insertAdjacentHTML("beforeend", `<span class="coord">${8 - rr}</span>`);
      if (r === 7) el.insertAdjacentHTML("beforeend", `<span class="coord file">${"abcdefgh"[cc]}</span>`);
    }
    frag.append(el);
  }
  boardEl.replaceChildren(frag);
  boardEl.classList.toggle("editor-cursor", editor.active);
  boardEl.classList.toggle("locked", locked && !Vis.active);
  boardEl.classList.toggle("blind", !!ui.blind && !ui.peek && !editor.active);
  boardEl.classList.toggle("no-coords", Vis.active && Vis.mode === "coords");
  boardEl.classList.toggle("vis-hide", Vis.active && Vis.mode === "color");
  // Símbolo de calidad (?? ? ?! ! !!) sobre la casilla de destino de la última jugada
  if (last && node.nag && !quiz()) {
    const sq = boardEl.querySelector(`.square[data-sq="${last.to}"]`);
    if (sq) sq.insertAdjacentHTML("beforeend", `<span class="sq-badge ${NAG_CLASS[node.nag] || ""}-bg" title="${esc(NAG_TITLE[node.nag] || "")}">${esc(node.nag)}</span>`);
  }
  const prev = ui.prevRenderNode;
  ui.prevRenderNode = editor.active ? null : node;
  if (prev && prev !== node && !editor.active && settings.animate && !ui.noAnimOnce && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    if (node.parent === prev && node.move) animateMove(node.move, 1);
    else if (prev.parent === node && prev.move) animateMove(prev.move, -1);
  }
  ui.noAnimOnce = false;
  renderShapes();
}
const NAG_TITLE = { "!!": "Jugada brillante", "!": "Buena jugada", "!?": "Interesante", "?!": "Imprecisión", "?": "Error", "??": "Error grave" };
/* Desliza la pieza desde su casilla de origen (o de vuelta, al retroceder) */
function animateMove(mv, dir) {
  const slide = (from, to) => {
    const el = boardEl.querySelector(`.square[data-sq="${to}"] .piece-holder`);
    const sqEl = boardEl.querySelector(`.square[data-sq="${to}"]`);
    if (!el || !sqEl || !el.animate) return;
    const size = sqEl.getBoundingClientRect().width;
    const col = i => (ui.flipped ? 7 - (i & 7) : i & 7), row = i => (ui.flipped ? 7 - (i >> 4) : i >> 4);
    const dx = (col(from) - col(to)) * size, dy = (row(from) - row(to)) * size;
    el.style.zIndex = 9;
    const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 160, easing: "ease-out" });
    a.onfinish = a.oncancel = () => { el.style.zIndex = ""; };
  };
  const f = dir > 0 ? mv.from : mv.to, t = dir > 0 ? mv.to : mv.from;
  slide(f, t);
  if (mv.flag === "castle") {
    const rf = mv.to > mv.from ? mv.from + 3 : mv.from - 4, rt = mv.to > mv.from ? mv.from + 1 : mv.from - 1;
    slide(dir > 0 ? rf : rt, dir > 0 ? rt : rf);
  }
}
function sqCenter(i) {
  const f = i & 7, r = i >> 4;
  return [(ui.flipped ? 7 - f : f) * 100 + 50, (ui.flipped ? 7 - r : r) * 100 + 50];
}
const SHAPE_COLORS = { green: "rgba(76,175,80,0.85)", red: "rgba(239,83,80,0.85)", blue: "rgba(41,182,246,0.85)", yellow: "rgba(255,202,40,0.9)", engine: "rgba(186,104,200,0.72)", threat: "rgba(239,83,80,0.8)" };
function renderShapes() {
  const list = [];
  if (!editor.active) {
    for (const sh of cur().shapes || []) list.push({ color: sh.color, from: Chess.sqIdx(sh.from), to: Chess.sqIdx(sh.to) });
    if (ui.engineArrow && settings.arrow && !quiz() && ui.engineArrow.node === cur()) list.push({ color: "engine", from: ui.engineArrow.from, to: ui.engineArrow.to });
    if (Threat.node === cur() && !quiz()) list.push({ color: "threat", from: Threat.from, to: Threat.to });
    if (trainer.active && trainer.hintArrow) list.push({ color: "blue", from: trainer.hintArrow.from, to: trainer.hintArrow.to });
    if (Retry.active) for (const a of Retry.arrows) list.push(a);
  }
  let html = "";
  for (const sh of list) {
    const col = SHAPE_COLORS[sh.color] || SHAPE_COLORS.green;
    const [x1, y1] = sqCenter(sh.from), [x2, y2] = sqCenter(sh.to);
    if (sh.from === sh.to) { html += `<circle cx="${x1}" cy="${y1}" r="44" fill="none" stroke="${col}" stroke-width="7"/>`; continue; }
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const sw = sh.color === "engine" ? 13 : 15;
    const ex = x2 - ux * 22, ey = y2 - uy * 22;
    const marker = sh.color === "threat" ? "red" : sh.color;
    const dash = sh.color === "threat" ? ` stroke-dasharray="18 14"` : "";
    html += `<line x1="${x1}" y1="${y1}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="${dash ? "butt" : "round"}"${dash} marker-end="url(#ah-${marker})"/>`;
  }
  $("arrowsGroup").innerHTML = html;
}
function toggleShape(from, to, color) {
  const node = cur();
  const f = Chess.sqName(from), t = Chess.sqName(to);
  const i = node.shapes.findIndex(s => s.from === f && s.to === t);
  if (i >= 0) { const same = node.shapes[i].color === color; node.shapes.splice(i, 1); if (!same) node.shapes.push({ color, from: f, to: t }); }
  else node.shapes.push({ color, from: f, to: t });
  renderShapes();
  markDirty();
}
const shapeColor = e => (e.shiftKey && e.altKey ? "yellow" : e.shiftKey ? "red" : e.altKey ? "blue" : "green");

/* ---------- 10. Interacción con el tablero (clic, arrastre, flechas) ---------- */
function canUserMove() {
  if (ui.cpu.thinking || trainer.busy || Vis.active) return false;
  if (Guess.active) return Guess.state === "ask" && !Guess.busy && cur().state.t === Guess.side;
  if (Retry.active) return !Retry.busy && Retry.state !== "solved" && Retry.state !== "shown";
  if (trainer.active) return trainerUserTurn();
  if (ui.cpu.on && cur().state.t === ui.cpu.side) return false;
  return true;
}
function sqFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const sqEl = el && el.closest ? el.closest(".square") : null;
  return sqEl && boardEl.contains(sqEl) ? +sqEl.dataset.sq : null;
}
boardEl.addEventListener("contextmenu", e => e.preventDefault());
$("drawingLayer").addEventListener("contextmenu", e => e.preventDefault());
boardEl.addEventListener("pointerdown", e => {
  const sqEl = e.target.closest(".square");
  if (!sqEl) return;
  const i = +sqEl.dataset.sq;
  if (e.button === 2) {
    if (editor.active) { editor.state.b[i] = "."; editor.sel = null; editorChanged(); return; }
    ui.drawStart = { sq: i, color: shapeColor(e) };
    return;
  }
  if (e.button !== 0) return;
  if (editor.active) {
    const p = editor.state.b[i];
    ui.drag = { editor: true, from: i, piece: p !== "." ? p : null, x0: e.clientX, y0: e.clientY, ghost: null, moved: false };
    e.preventDefault();
    return;
  }
  if (Vis.active) { visAnswer(i); return; }
  const s = cur().state;
  if (!canUserMove()) {
    if (ui.cpu.thinking) toast("La CPU está pensando…");
    else if (trainer.active && !trainer.busy) toast("Espera la respuesta del rival.");
    return;
  }
  if (ui.selected != null && ui.selected !== i && tryMove(ui.selected, i)) return;
  if (Chess.color(s.b[i]) === s.t) {
    const wasSelected = ui.selected === i;
    ui.selected = i;
    renderBoard();
    ui.drag = { from: i, x0: e.clientX, y0: e.clientY, ghost: null, moved: false, wasSelected };
    e.preventDefault();
  } else if (ui.selected != null) { ui.selected = null; renderBoard(); }
});
window.addEventListener("pointermove", e => {
  const d = ui.drag;
  if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
  if (d.editor && !d.piece) return;
  if (!d.ghost) {
    const sqEl = d.from != null ? boardEl.querySelector(`.square[data-sq="${d.from}"]`) : null;
    if (d.from != null && !sqEl) return;
    const size = (sqEl || boardEl.querySelector(".square")).getBoundingClientRect().width;
    const pc = d.piece || cur().state.b[d.from];
    d.ghost = document.createElement("div");
    d.ghost.className = "drag-ghost";
    d.ghost.style.width = d.ghost.style.height = size + "px";
    d.ghost.innerHTML = `<div class="piece-holder" style="width:100%;height:100%">${getPieceHTML(pc, settings.pieceStyle)}</div>`;
    document.body.append(d.ghost);
    if (sqEl) sqEl.classList.add("drag-origin");
  }
  d.moved = true;
  d.ghost.style.left = e.clientX + "px";
  d.ghost.style.top = e.clientY + "px";
  const over = sqFromPoint(e.clientX, e.clientY);
  if (over !== d.over) {
    boardEl.querySelectorAll(".hover-target").forEach(x => x.classList.remove("hover-target"));
    if (over != null) { const t = boardEl.querySelector(`.square[data-sq="${over}"]`); if (t && (editor.active || t.classList.contains("target"))) t.classList.add("hover-target"); }
    d.over = over;
  }
});
window.addEventListener("pointerup", e => {
  if (e.button === 2 && ui.drawStart) {
    const to = sqFromPoint(e.clientX, e.clientY);
    if (to != null) toggleShape(ui.drawStart.sq, to, ui.drawStart.color);
    ui.drawStart = null;
    return;
  }
  const d = ui.drag;
  if (!d) return;
  ui.drag = null;
  if (d.ghost) d.ghost.remove();
  if (d.palette) {
    if (d.moved && editor.active) { const to = sqFromPoint(e.clientX, e.clientY); if (to != null) editorPlace(to, d.piece); }
    return;
  }
  if (d.editor) {
    if (!editor.active) return;
    if (d.moved && d.piece) { editor.sel = null; editorMovePiece(d.from, sqFromPoint(e.clientX, e.clientY)); }
    else editorClick(d.from);
    return;
  }
  if (d.moved) {
    const to = sqFromPoint(e.clientX, e.clientY);
    ui.noAnimOnce = true;
    if (to != null && to !== d.from && tryMove(d.from, to)) return;
    renderBoard();
  } else if (d.wasSelected) { ui.selected = null; renderBoard(); }
});
window.addEventListener("pointercancel", () => { if (ui.drag && ui.drag.ghost) ui.drag.ghost.remove(); ui.drag = null; renderBoard(); });

function askPromotion(color) {
  return new Promise(resolve => {
    const box = $("promoChoices");
    box.innerHTML = "";
    for (const p of ["q", "r", "b", "n"]) {
      const b = document.createElement("button");
      b.className = "promo-btn";
      b.title = cap(PIECE_ES[p]);
      b.innerHTML = getPieceHTML(color === 1 ? p.toUpperCase() : p, settings.pieceStyle);
      b.onclick = () => { $("promoModal").classList.remove("open"); resolve(p); };
      box.append(b);
    }
    $("cancelPromo").onclick = () => { $("promoModal").classList.remove("open"); resolve(null); };
    $("promoModal").classList.add("open");
  });
}
function tryMove(from, to) {
  const s = cur().state;
  const cands = Chess.legal(s).filter(m => m.from === from && m.to === to);
  if (!cands.length) return false;
  ui.selected = null;
  if (cands.length > 1) {
    askPromotion(s.t).then(p => {
      if (!p) { renderBoard(); return; }
      playMove(cands.find(m => m.promotion === p), "user");
    });
    return true;
  }
  playMove(cands[0], "user");
  return true;
}
function soundFor(node) {
  const st = gameStatus(node);
  if (st.over) Sound.play("end");
  else if (Chess.inCheck(node.state)) Sound.play("check");
  else if (node.move && node.move.captured !== ".") Sound.play("capture");
  else Sound.play("move");
}
function playMove(move, who = "user") {
  if (Retry.active && who === "user") { retryMove(move); return; }
  if (trainer.active && who === "user") { trainerUserMove(move); return; }
  if (Guess.active && who === "user") { guessResolve(move); return; }
  if (who === "user") stopAutoplay();
  const existed = cur().children.some(c => Pgn.sameMove(c.move, move));
  const child = Pgn.addMove(cur(), move, settings.branchMode);
  game.current = child;
  if (!existed) markDirty();
  ui.selected = null;
  soundFor(child);
  render();
  if (ui.cpu.on) cpuAfterMove(child, who);
  else if (who === "user") {
    if ($("tbPractice").checked && ui.activeTab === "endgames") setTimeout(tbReply, 60);
  }
  if (ui.activeTab === "endgames" && who !== "user") debouncedSyzygy();
}

/* ---------- 11. Navegación ---------- */
function goTo(node) { if (!node) return; game.current = node; ui.selected = null; render(); }
const goBack = () => cur().parent && goTo(cur().parent);
const goForward = () => cur().children.length && goTo(cur().children[0]);
const goStart = () => goTo(game.root);
const goEnd = () => { const l = Pgn.mainlineFrom(cur()); if (l.length) goTo(l[l.length - 1]); };
function goSibling(dir) {
  const n = cur(), p = n.parent;
  if (!p || p.children.length < 2) return;
  const i = p.children.indexOf(n);
  goTo(p.children[(i + dir + p.children.length) % p.children.length]);
}
function stopAutoplay() {
  if (ui.autoplay) { clearInterval(ui.autoplay); ui.autoplay = null; $("playBtn").textContent = "▶ Auto"; }
}
function toggleAutoplay() {
  if (ui.autoplay) { stopAutoplay(); return; }
  if (!cur().children.length) goStart();
  $("playBtn").textContent = "⏸ Pausa";
  ui.autoplay = setInterval(() => {
    if (!cur().children.length) { stopAutoplay(); return; }
    goForward();
    soundFor(cur());
  }, 1000);
}

/* ---------- 12. Estado de la partida ---------- */
function gameStatus(node) {
  const s = node.state, L = Chess.legal(s), chk = Chess.inCheck(s);
  const side = s.t === 1 ? "blancas" : "negras", other = s.t === 1 ? "negras" : "blancas";
  if (!L.length) return chk ? { over: true, text: `Jaque mate · ganan las ${other}`, result: s.t === 1 ? "0-1" : "1-0" } : { over: true, text: "Rey ahogado · tablas", result: "1/2-1/2" };
  if (Chess.insufficient(s)) return { over: true, text: "Tablas por material insuficiente", result: "1/2-1/2" };
  if (s.half >= 100) return { over: true, text: "Tablas por la regla de las 50 jugadas", result: "1/2-1/2" };
  let reps = 0;
  for (let n = node; n; n = n.parent) if (n.key === node.key) reps++;
  if (reps >= 3) return { over: true, text: "Tablas por triple repetición", result: "1/2-1/2" };
  return { over: false, check: chk, text: chk ? `¡Jaque! Juegan las ${side}` : `Juegan las ${side}` };
}
function renderStatus() {
  const el = $("statusText");
  if (editor.active) { el.textContent = "✏ Editor: mueve las piezas libremente y pulsa «Empezar desde esta posición»."; el.className = "status-line"; return; }
  const st = gameStatus(cur());
  let txt = st.text;
  if (ui.cpu.thinking) txt += " · 🤖 la CPU está pensando…";
  else if (ui.cpu.on && !st.over) txt += cur().state.t === ui.cpu.side ? " · turno de la CPU" : " · tu turno";
  if (trainer.active) txt = "🎯 Entrenamiento · " + txt;
  if (Retry.active) txt = "🎯 Aprende de tus errores · " + txt;
  if (Guess.active) txt = "🔮 Adivina la jugada · " + txt;
  if (Vis.active) txt = "🙈 Visualización: responde en el panel de abajo";
  if (ui.blind && !Vis.active) txt += " · 🙈 piezas ocultas";
  el.textContent = txt;
  el.className = "status-line" + (st.over ? " over" : st.check ? " check" : "");
}

/* ---------- 13. Barras de jugadores (nombres, material) ---------- */
function renderBars() {
  const s = viewState(), cnt = Chess.material(s);
  const start = { Q: 1, R: 2, B: 2, N: 2, P: 8 }, vals = { Q: 9, R: 5, B: 3, N: 3, P: 1 };
  let capW = "", capB = "", matW = 0, matB = 0;
  for (const p of Object.keys(start)) {
    const w = cnt[p] || 0, b = cnt[p.toLowerCase()] || 0;
    matW += w * vals[p]; matB += b * vals[p];
    capB += glyphUnicode[p.toLowerCase()].repeat(Math.max(0, start[p] - b)); // negras capturadas por blancas
    capW += glyphUnicode[p].repeat(Math.max(0, start[p] - w));
  }
  const diff = matW - matB;
  const h = game.headers;
  const wName = `${esc(h.White || "Blancas")}${h.WhiteElo ? `<span class="player-elo">(${esc(h.WhiteElo)})</span>` : ""}`;
  const bName = `${esc(h.Black || "Negras")}${h.BlackElo ? `<span class="player-elo">(${esc(h.BlackElo)})</span>` : ""}`;
  const white = { name: "⬜ " + wName, cap: capB, adv: diff > 0 ? "+" + diff : "" };
  const black = { name: "⬛ " + bName, cap: capW, adv: diff < 0 ? "+" + -diff : "" };
  const top = ui.flipped ? white : black, bot = ui.flipped ? black : white;
  $("topName").innerHTML = top.name; $("topCaptured").textContent = top.cap;
  $("topAdv").textContent = top.adv; $("topAdv").hidden = !top.adv;
  $("bottomName").innerHTML = bot.name; $("bottomCaptured").textContent = bot.cap;
  $("bottomAdv").textContent = bot.adv; $("bottomAdv").hidden = !bot.adv;
  renderClocks();
  const whiteToMove = s.t === 1;
  $("topBar").classList.toggle("to-move", ui.flipped ? whiteToMove : !whiteToMove);
  $("bottomBar").classList.toggle("to-move", ui.flipped ? !whiteToMove : whiteToMove);
}

/* ---------- 14. Lista de jugadas con variantes ---------- */
const NAG_CLASS = { "!!": "nag-brilliant", "!": "nag-good", "!?": "nag-good", "?!": "nag-inacc", "?": "nag-mistake", "??": "nag-blunder" };
function renderMoves() {
  const box = $("moves");
  if (typeof hoverTip !== "undefined") hoverTip.hidden = true;
  ui.nodeMap = new Map();
  const marked = Lib.ready ? markedNodesOfCurrent() : new Map();
  const frag = document.createDocumentFragment();
  const emit = (parentEl, node, forceNum) => {
    const ps = node.parent.state;
    if (ps.t === 1 || forceNum) {
      const n = document.createElement("span");
      n.className = "mvnum";
      n.textContent = ps.full + (ps.t === 1 ? "." : "…");
      parentEl.append(n);
    }
    const b = document.createElement("span");
    b.className = "mv" + (node === cur() ? " active" : "");
    b.dataset.id = node.id;
    const mk = marked.get(node.id);
    b.innerHTML = esc(dispSan(node)) + (node.nag ? `<span class="nag ${NAG_CLASS[node.nag] || ""}">${esc(node.nag)}</span>` : "") + (node.posNag ? `<span class="nag-pos">${esc(node.posNag)}</span>` : "") + (mk ? `<span class="mv-mark" title="${esc(CATS[mk.cat].name + (mk.note ? ": " + mk.note : ""))}">${CATS[mk.cat].icon}</span>` : "");
    ui.nodeMap.set(node.id, node);
    parentEl.append(b, " ");
  };
  const comment = (parentEl, node) => {
    if (!node.comment) return false;
    const c = document.createElement("span");
    c.className = "mvcomment";
    c.textContent = node.comment.length > 220 ? node.comment.slice(0, 217) + "…" : node.comment;
    c.title = node.comment;
    parentEl.append(c, " ");
    return true;
  };
  if (quiz()) {
    const path = Pgn.pathTo(cur()).slice(1);
    path.forEach((n, i) => emit(frag, n, i === 0));
    if (!path.length) frag.append(Object.assign(document.createElement("span"), { className: "empty-moves", textContent: "Entrenamiento en curso: las jugadas aparecen a medida que las haces." }));
  } else {
    if (game.root.comment) comment(frag, game.root);
    if (!game.root.children.length) frag.append(Object.assign(document.createElement("span"), { className: "empty-moves", textContent: "Sin jugadas. Mueve una pieza o importa una partida." }));
    const line = (parentEl, node, forceNum) => {
      let c = node;
      while (c.children.length) {
        const main = c.children[0];
        emit(parentEl, main, forceNum);
        forceNum = comment(parentEl, main);
        for (const alt of c.children.slice(1)) {
          const v = document.createElement("div");
          v.className = "var";
          emit(v, alt, true);
          const hc = comment(v, alt);
          line(v, alt, hc);
          parentEl.append(v);
          forceNum = true;
        }
        c = main;
      }
    };
    if (settings.moveView === "sheet" && game.root.children.length) {
      // Planilla: dos columnas (Nº · blancas · negras); comentarios y variantes cortan la tabla
      const emitMove = (cell, node) => { const tmp = document.createElement("span"); emit(tmp, node, false); tmp.querySelectorAll(".mvnum").forEach(x => x.remove()); cell.append(...tmp.childNodes); };
      let cells = null;
      const startRow = (num, blackFirst) => {
        const row = document.createElement("div");
        row.className = "sheet-row";
        row.innerHTML = `<span class="sheet-num">${num}.</span><span class="sheet-cell"></span><span class="sheet-cell"></span>`;
        cells = row.querySelectorAll(".sheet-cell");
        if (blackFirst) cells[0].textContent = "…";
        frag.append(row);
      };
      for (const node of Pgn.mainlineFrom(game.root)) {
        const ps = node.parent.state;
        if (ps.t === 1 || !cells) startRow(ps.full, ps.t === -1);
        emitMove(cells[ps.t === 1 ? 0 : 1], node);
        const alts = node.parent.children.slice(1);
        if (node.comment || alts.length) {
          const blk = document.createElement("div");
          blk.className = "sheet-extra";
          comment(blk, node);
          for (const alt of alts) { const v = document.createElement("div"); v.className = "var"; emit(v, alt, true); const hc = comment(v, alt); line(v, alt, hc); blk.append(v); }
          frag.append(blk);
          cells = null;
        }
        if (ps.t === -1) cells = null;
      }
    } else line(frag, game.root, true);
  }
  box.replaceChildren(frag);
  const a = box.querySelector(".mv.active");
  if (a) {
    const top = a.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 30) box.scrollTop = Math.max(0, top - box.clientHeight / 2);
  } else if (!cur().parent) box.scrollTop = 0;
}
$("moves").addEventListener("click", e => {
  const el = e.target.closest(".mv");
  if (!el) return;
  const n = ui.nodeMap.get(+el.dataset.id);
  if (n && !quiz()) { stopAutoplay(); goTo(n); }
});

/* ---------- 15. Comentario, apertura, gráfico y barra de evaluación ---------- */
function renderComment() {
  const n = cur();
  const ta = $("annotation");
  if (document.activeElement !== ta) ta.value = n.comment || "";
  $("currentMoveBadge").textContent = n.parent ? `Tras ${numPrefix(n.parent.state)}${dispSan(n)}` : "Posición inicial";
}
function renderEco() {
  const d = ECO.detect(cur());
  const banner = $("ecoBanner");
  if (d) banner.textContent = `${d.entry.eco} · ${d.entry.name}`;
  else if (game.root.state && Chess.toFen(game.root.state) !== Chess.START_FEN) banner.textContent = "Posición personalizada";
  else banner.textContent = cur().parent ? "Apertura sin catalogar" : "Posición inicial";
}
function updateEvalBar(ev) {
  const outer = $("evalBarOuter");
  outer.classList.toggle("flipped", ui.flipped);
  outer.classList.toggle("hidden-eval", !ev || quiz());
  const top = $("evalTopText"), bot = $("evalBotText");
  top.textContent = bot.textContent = "";
  if (!ev || quiz()) return;
  const w = winPct(ev);
  $("evalBarWhite").style.height = Math.max(2, Math.min(98, w)) + "%";
  const txt = ev.mate != null ? (ev.mate === 0 ? "#" : "#" + Math.abs(ev.mate)) : (Math.abs(ev.cp) >= 1000 ? Math.round(Math.abs(ev.cp) / 100) : (Math.abs(ev.cp) / 100).toFixed(1));
  const whiteBetter = w >= 50;
  // El texto aparece en el extremo del bando que lleva ventaja
  ((whiteBetter !== ui.flipped) ? bot : top).textContent = txt;
}
function renderEvalChart() {
  const svg = $("evalChartSvg");
  const line = [game.root, ...Pgn.mainlineFrom(game.root)];
  const W = 600, H = 64;
  const msg = $("chartMsg"), legend = $("chartLegend");
  const empty = html => {
    svg.innerHTML = `<line x1="0" y1="32" x2="600" y2="32" stroke="#2c384e" stroke-dasharray="4,4"/>`;
    msg.innerHTML = html; msg.hidden = false; legend.hidden = true;
    const btn = msg.querySelector("button");
    if (btn) btn.onclick = ev => { ev.stopPropagation(); analyseGame({ quick: true }); };
  };
  if (quiz()) { empty(`Gráfico oculto durante ${ui.cpu.on ? "la partida" : "el ejercicio"}`); return; }
  if (line.length < 2) { empty("El gráfico de evaluación aparecerá cuando haya jugadas"); return; }
  const pts = line.map((n, i) => (n.eval ? { i, w: winPct(n.eval), n } : null)).filter(Boolean);
  // Sólo se dibuja la curva si cubre casi toda la partida (o mientras se está analizando)
  const enough = pts.length >= 2 && (pts.length >= line.length * 0.8 || line.length - pts.length <= 2);
  if (!enough && !(ui.analysing && pts.length >= 2)) {
    empty(`<span>Gráfico pendiente: ${pts.length} de ${line.length} posiciones evaluadas.</span><button class="sm-btn info-btn" ${ui.analysing ? "disabled" : ""}>📈 Completar gráfico</button>`);
    return;
  }
  msg.hidden = true;
  legend.hidden = false;
  const X = i => (i / (line.length - 1)) * W, Y = w => H - (w / 100) * H;
  const poly = pts.map(p => `${X(p.i).toFixed(1)},${Y(p.w).toFixed(1)}`).join(" ");
  let marks = "";
  for (const p of pts) {
    const c = { "??": "#ef5350", "?": "#ff7043", "?!": "#ffca28", "!": "#26c6da", "!!": "#26c6da" }[p.n.nag];
    if (c) marks += `<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.w).toFixed(1)}" r="3.4" fill="${c}" stroke="#111" stroke-width=".8"/>`;
  }
  let curNode = cur();
  while (curNode && !Pgn.isMainline(curNode)) curNode = curNode.parent;
  const ci = line.indexOf(curNode);
  svg.innerHTML = `
    <rect x="0" y="0" width="${W}" height="${H}" fill="#1a202b"/>
    <polygon points="${X(pts[0].i).toFixed(1)},${H} ${poly} ${X(pts[pts.length - 1].i).toFixed(1)},${H}" fill="#dfe5ee" opacity=".9"/>
    <polyline points="${poly}" fill="none" stroke="#94a3b8" stroke-width="1"/>
    <line x1="0" y1="32" x2="600" y2="32" stroke="#64748b" stroke-width="1" stroke-dasharray="3,3"/>
    ${marks}
    ${ci >= 0 ? `<line x1="${X(ci).toFixed(1)}" y1="0" x2="${X(ci).toFixed(1)}" y2="${H}" stroke="#ffa726" stroke-width="2"/>` : ""}`;
}
$("evalChartWrap").addEventListener("click", e => {
  if (!$("chartMsg").hidden) return;
  const line = [game.root, ...Pgn.mainlineFrom(game.root)];
  if (line.length < 2 || quiz()) return;
  const rect = $("evalChartWrap").getBoundingClientRect();
  const idx = Math.round(((e.clientX - rect.left) / rect.width) * (line.length - 1));
  goTo(line[Math.max(0, Math.min(line.length - 1, idx))]);
});

/* ---------- 16. Panel del motor ---------- */
function renderEngineLines(lines, stateNode, meta) {
  const box = $("engineLines");
  if (quiz()) { box.innerHTML = `<div class="pv-empty">Motor oculto durante ${ui.cpu.on ? "la partida" : "el ejercicio"}.</div>`; $("engineMeta").textContent = ""; return; }
  if (!lines || !lines.length) { box.innerHTML = `<div class="pv-empty">${esc(meta || "Sin análisis para esta posición.")}</div>`; return; }
  box.innerHTML = "";
  lines.forEach(l => {
    if (!l) return;
    const ev = { cp: l.cp, mate: l.mate, winner: l.winner };
    const row = document.createElement("div");
    row.className = "pv-line";
    const sc = winPct(ev) >= 50 ? "pos" : "neg";
    row.innerHTML = `<span class="pv-score ${sc}">${esc(fmtEval(ev))}</span><span class="pv-moves">${lineSpans(stateNode.state, l.pv, 12)}</span>`;
    row.title = "Pulsa para jugar la primera jugada de esta línea";
    row.onclick = () => {
      const m = Chess.moveFromUci(stateNode.state, l.pv[0]);
      if (m && cur() === stateNode && canUserMove()) playMove(m, "user");
    };
    box.append(row);
  });
}
function showEngineFor(node, job) {
  if (job && job.lines && job.lines.length) {
    const l0 = job.lines[0];
    updateEvalBar({ cp: l0.cp, mate: l0.mate, winner: l0.winner });
    renderEngineLines(job.lines, node);
    $("engineMeta").textContent = `prof. ${job.depth || 0}` + (job.nps ? ` · ${Math.round(job.nps / 1000)} kN/s` : "");
    if (l0.pv[0]) { ui.engineArrow = { node, from: Chess.sqIdx(l0.pv[0].slice(0, 2)), to: Chess.sqIdx(l0.pv[0].slice(2, 4)) }; renderShapes(); }
    return;
  }
  const ev = node.eval;
  ui.engineArrow = null;
  if (ev) {
    updateEvalBar(ev);
    const pseudoLines = ev.lines && ev.lines.length ? ev.lines : [{ cp: ev.cp, mate: ev.mate, winner: ev.winner, pv: ev.pv || (ev.best ? [ev.best] : []) }];
    if (pseudoLines[0].pv.length) renderEngineLines(pseudoLines, node);
    else renderEngineLines(null, node, `Evaluación ${fmtEval(ev)}`);
    $("engineMeta").textContent = ev.depth && ev.depth < 99 ? `prof. ${ev.depth} (guardada)` : "";
    if (ev.best && /^[a-h][1-8][a-h][1-8]/.test(ev.best)) ui.engineArrow = { node, from: Chess.sqIdx(ev.best.slice(0, 2)), to: Chess.sqIdx(ev.best.slice(2, 4)) };
  } else {
    updateEvalBar(null);
    const st = gameStatus(node);
    renderEngineLines(null, node, st.over ? st.text : settings.live ? "Analizando…" : "Análisis en pausa. Activa «Analizar» o pulsa E.");
    $("engineMeta").textContent = "";
  }
  renderShapes();
}
const requestLive = debounce(() => {
  const node = cur();
  if (!settings.live || editor.active || quiz() || Threat.busy || ui.analysing || ui.cpu.thinking || !Engine.ready) {
    Engine.cancel("live");
    return;
  }
  if (gameStatus(node).over) { Engine.cancel("live"); return; }
  if (ui.liveNode === node && Engine.running && Engine.running.purpose === "live" && !Engine.running.cancelled) return;
  const want = Engine.kind === "stockfish" ? +settings.multipv : 1;
  const ev = node.eval;
  if (ev && ev.done && ev.source === Engine.kind && (ev.lines || []).length >= want) return;
  ui.liveNode = node;
  resetEngineBadge();
  const onInfo = throttle(j => { if (cur() === node && !j.cancelled) showEngineFor(node, j); }, 150);
  Engine.analyse(node, {
    purpose: "live", movetime: settings.liveMs, multipv: Engine.kind === "stockfish" ? +settings.multipv : 1, onInfo,
    onDone: j => { storeEval(node, j); if (ui.liveNode === node) ui.liveNode = null; if (cur() === node) { showEngineFor(node, j); renderEvalChart(); } }
  });
}, 140);

/* ---------- 17. Render general ---------- */
function saveSessionNow() {
  if (!settings.autosave || trainer.active || (typeof Cards !== "undefined" && Cards.stash)) return;
  LS.set("ajedrezStudioCurrent", {
    pgn: Pgn.exportPgn(game, { evals: true }), path: Pgn.pathTo(cur()).slice(1).map(n => n.uci), libId: ui.libId, dirty: ui.dirty, fav: ui.fav, tags: ui.tags, flipped: ui.flipped, name: $("gameName").value
  });
}
const scheduleAutosave = debounce(saveSessionNow, 600);
window.addEventListener("pagehide", saveSessionNow);
function updateButtons() {
  const n = cur();
  const q = quiz();
  $("backBtn").disabled = $("startBtn").disabled = !n.parent || q;
  $("forwardBtn").disabled = $("endBtn").disabled = !n.children.length || q;
  $("playBtn").disabled = q || !game.root.children.length;
  $("undoBtn").disabled = !n.parent || q;
  $("promoteVarBtn").disabled = !n.parent || n.parent.children[0] === n || q;
  $("mainVarBtn").disabled = Pgn.isMainline(n) || q;
  $("analyseVarBtn").hidden = Pgn.isMainline(n) || q;
  $("threatBtn").disabled = q || editor.active;
  $("playBestMoveBtn").disabled = q;
  $("threatBtn").classList.toggle("on", Threat.node === n);
  $("threatInfo").hidden = Threat.node !== n || q;
  $("clearShapesBtn").disabled = !n.shapes.length;
  $("liveToggle").checked = settings.live;
  $("arrowToggle").checked = settings.arrow;
  $("playCpuToggle").textContent = ui.cpu.on ? "⏹ Terminar vs CPU" : "🤖 Jugar vs CPU";
  $("playCpuToggle").className = ui.cpu.on ? "on" : "info-btn";
}
function render() {
  renderBoard();
  renderBars();
  renderStatus();
  renderMoves();
  renderComment();
  renderEco();
  renderEvalChart();
  if (!editor.active) {
    const running = Engine.running && Engine.running.purpose === "live" && !Engine.running.cancelled && ui.liveNode === cur() ? Engine.running : null;
    showEngineFor(cur(), running);
  }
  updateButtons();
  updateSaveState();
  requestLive();
  if (ui.activeTab === "explorer") refreshExplorer();
  if (ui.activeTab === "library" && ui.librarySub === "position") renderPosTarget();
  scheduleAutosave();
}
function syncHeaderForm() {
  document.querySelectorAll("[data-h]").forEach(el => { el.value = game.headers[el.dataset.h] || (el.tagName === "SELECT" ? "*" : ""); });
}
document.querySelectorAll("[data-h]").forEach(el => el.addEventListener("input", () => {
  game.headers[el.dataset.h] = el.value.trim();
  renderBars();
  markDirty();
}));

/* ---------- 18. Carga de partidas ---------- */
function setGame(g, opts = {}) {
  if (!opts.noConfirm && !confirmLeave()) return false;
  stopAutoplay();
  if (trainer.active && !opts.keepTrainer) stopTraining(true);
  if (ui.cpu.on) stopCpu(true);
  if (Guess.active) guessStop();
  if (Vis.active && !opts.keepVis) visStop(true);
  $("cpuBox").hidden = $("guessBox").hidden = true;
  if (!opts.keepVis) $("visBox").hidden = true;
  clockStop();
  Clock.shown = false;
  game = g;
  game.current = opts.current || g.root;
  ui.selected = null;
  ui.liveNode = null;
  ui.engineArrow = null;
  if (Retry.active) retryEnd(true);
  Threat.node = null;
  ui.analysedLine = null;
  ui.report = null;
  $("reportExtra").innerHTML = "";
  $("retryStart").hidden = true;
  ui.libId = opts.libId || null;
  ui.recUpdated = ui.libId && typeof Lib !== "undefined" && Lib.games.get(ui.libId) ? Lib.games.get(ui.libId).updated : 0;
  ui.saveError = "";
  ui.dirty = false;
  ui.rev++;
  ui.fav = !!opts.fav;
  ui.tags = (opts.tags || []).slice();
  $("gameTags").value = ui.tags.join(", ");
  $("gameName").value = opts.name !== undefined ? opts.name : "";
  $("reportBox").classList.remove("show");
  $("analysisStatus").textContent = "";
  syncHeaderForm();
  render();
  if (Lib.ready && ui.activeTab === "library") renderLibrary();
  return true;
}
function importResultMsg(r, extra = "") {
  const el = $("importResult");
  if (r.error) {
    el.className = "small msg-err";
    el.textContent = `⚠ Se importaron ${r.count} jugadas. ${r.error.inVariation ? "Variante descartada" : "Detenido"} en «${r.error.label}»: ${r.error.message}${extra}`;
  } else {
    el.className = "small msg-ok";
    el.textContent = `✔ ${r.count} jugadas importadas.${extra}`;
  }
}
function looksLikeFen(t) { return /^\s*[prnbqkPRNBQK1-8]+(\/[prnbqkPRNBQK1-8]+){7}\s+[wb]\b/.test(t); }
function loadPgnText(text, opts = {}) {
  const parts = Pgn.splitGames(text);
  if (!parts.length) { toast("No se encontraron jugadas en el texto."); return null; }
  const r = Pgn.parseGame(parts[0], { lang: opts.lang || "auto" });
  const name = opts.name !== undefined ? opts.name : (r.game.headers.White && r.game.headers.White !== "Blancas" ? `${r.game.headers.White} – ${r.game.headers.Black}` : "");
  const target = opts.endAtEnd ? Pgn.mainlineFrom(r.game.root).pop() : null;
  if (setGame(r.game, { name, current: target || r.game.root }) === false) return null;
  return { r, parts };
}
function loadFen(fen) {
  try {
    const g = Pgn.newGame(fen.trim());
    if (setGame(g, { name: "" }) === false) return false;
    toast("Posición FEN cargada.");
    return true;
  } catch (e) { toast("FEN no válida: " + e.message, 4000); return false; }
}

/* ---------- 19. Análisis completo y comentarios automáticos ---------- */
function materialBalance(st) {
  const v = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let sum = 0;
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const x = st.b[i]; if (x !== ".") sum += Chess.color(x) * v[x.toLowerCase()]; }
  return sum;
}
function playUcis(st, ucis, max) {
  let s = st;
  for (const u of ucis.slice(0, max)) { const m = Chess.moveFromUci(s, u); if (!m) break; s = Chess.apply(s, m); }
  return s;
}
function hangingInfo(node) {
  const m = node.move, s = node.state, mover = node.parent.state.t;
  const p = s.b[m.to];
  if (!p || p === "." || "kp".includes(p.toLowerCase())) return null;
  const att = Chess.attackers(s.b, m.to, -mover);
  if (!att.length) return null;
  const def = Chess.attackers(s.b, m.to, mover);
  const val = Chess.VAL[p.toLowerCase()];
  const minAtt = Math.min(...att.map(x => Chess.VAL[s.b[x].toLowerCase()] || 1000));
  if (!def.length || minAtt < val) return `Ojo: ${PIECE_ART[p.toLowerCase()]} de ${Chess.sqName(m.to)} queda ${def.length ? "atacad" + (["r", "q"].includes(p.toLowerCase()) ? "a" : "o") + " por una pieza de menor valor" : "sin defensa"}.`;
  return null;
}
/* Ideas estratégicas de una jugada, comparando la posición antes y después.
   Devuelve [{ txt, w }]: w = importancia (3 alta, 1 baja). */
function strategicNotes(node) {
  const p = node.parent, before = p.state, after = node.state, m = node.move, me = before.t, them = -me;
  const pc = m.piece.toLowerCase(), notes = [];
  // En mitad de un cambio (se puede recapturar en la misma casilla) la estructura aún no es la definitiva
  if (m.captured !== "." && Chess.attackers(after.b, m.to, them).length) return notes;
  const sb = Chess.pawnStructure(before), sa = Chess.pawnStructure(after);
  const nm = sq => Chess.sqName(sq);
  // Peones pasados propios nuevos
  const newPassed = sa[me].passed.filter(x => !sb[me].passed.includes(x) && !(pc === "p" && x === m.to && sb[me].passed.includes(m.from)));
  const advanced = pc === "p" && sb[me].passed.includes(m.from) && sa[me].passed.includes(m.to);
  if (newPassed.length) notes.push({ txt: `Crea un peón pasado en ${nm(newPassed[0])}.`, w: 3 });
  else if (advanced) {
    const rank = me === 1 ? 8 - (m.to >> 4) : (m.to >> 4) + 1;
    notes.push({ txt: rank >= 6 ? `El peón pasado avanza a ${nm(m.to)}, cada vez más cerca de coronar.` : `Empuja el peón pasado a ${nm(m.to)}.`, w: rank >= 6 ? 3 : 2 });
  }
  // Debilidades en la estructura rival / propia
  const isoThem = sa[them].isolated.filter(x => !sb[them].isolated.includes(x));
  if (isoThem.length) notes.push({ txt: `Deja aislado el peón rival de ${nm(isoThem[0])}.`, w: 2 });
  const dblThem = sa[them].doubled.filter(c => !sb[them].doubled.includes(c));
  if (dblThem.length) notes.push({ txt: `Dobla los peones rivales en la columna ${"abcdefgh"[dblThem[0]]}.`, w: 2 });
  const isoMe = sa[me].isolated.filter(x => !sb[me].isolated.includes(x) && x !== m.to);
  if (isoMe.length && m.captured !== ".") notes.push({ txt: `A cambio, se queda con un peón aislado en ${nm(isoMe[0])}.`, w: 1 });
  const dblMe = sa[me].doubled.filter(c => !sb[me].doubled.includes(c));
  if (dblMe.length) notes.push({ txt: `Acepta peones doblados en la columna ${"abcdefgh"[dblMe[0]]}.`, w: 1 });
  // Pareja de alfiles
  if (Chess.bishopPair(before, me) && !Chess.bishopPair(after, me) && Chess.bishopPair(after, them)) notes.push({ txt: "Cede la pareja de alfiles.", w: 2 });
  if (Chess.bishopPair(before, them) && !Chess.bishopPair(after, them) && Chess.bishopPair(after, me)) notes.push({ txt: "Elimina la pareja de alfiles rival y se queda con la suya.", w: 2 });
  // Casilla fuerte para el caballo (o el alfil)
  if ((pc === "n" || pc === "b") && Chess.isOutpost(after, m.to, me)) notes.push({ txt: `Instala ${PIECE_ART[pc]} en ${nm(m.to)}, una casilla fuerte apoyada por un peón y que ningún peón rival puede atacar.`, w: 3 });
  // Torre en séptima
  if ((pc === "r" || pc === "q") && (me === 1 ? m.to >> 4 === 1 : m.to >> 4 === 6) && (me === 1 ? m.from >> 4 !== 1 : m.from >> 4 !== 6)) notes.push({ txt: `${pc === "r" ? "La torre" : "La dama"} llega a la séptima fila, donde ataca los peones y encierra al rey.`, w: 2 });
  // Cambio de damas
  const queens = st => { let n = 0; for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (st.b[i] === "Q" || st.b[i] === "q") n++; } return n; };
  if (m.captured.toLowerCase() === "q" && queens(after) === 0) notes.push({ txt: "Se cambian las damas: la partida se encamina hacia el final.", w: 2 });
  // Debilitar el enroque
  if (pc === "p") {
    const k = Chess.kingSq(before.b, me), kf = k & 7, home = me === 1 ? 7 : 0;
    const castledK = (k >> 4) === home && kf >= 5, castledQ = (k >> 4) === home && kf <= 2;
    const f = m.from & 7, fromHome = (m.from >> 4) === (me === 1 ? 6 : 1);
    if (fromHome && ((castledK && f >= 5) || (castledQ && f <= 2))) notes.push({ txt: "Avanza un peón del enroque: debilita la protección del rey.", w: 1 });
  }
  return notes;
}
function describeMotif(node) {
  const p = node.parent, s = p.state, m = node.move, pc = m.piece.toLowerCase(), to = Chess.sqName(m.to);
  const out = [];
  const ply = Pgn.pathTo(node).length - 1;
  if (m.flag === "castle") out.push(m.to > m.from ? "Enroque corto: el rey se pone a salvo y la torre entra en juego." : "Enroque largo: el rey se refugia en el flanco de dama y la torre llega a la columna d.");
  else if (m.promotion) out.push(`Corona ${m.promotion === "q" ? "una dama" : "en " + PIECE_ES[m.promotion]}.`);
  else if (m.captured !== ".") out.push(`${cap(PIECE_ART[pc])} captura ${PIECE_ART[m.captured.toLowerCase()]} de ${to}.`);
  else if (pc === "p" && ply <= 24 && ["d4", "e4", "d5", "e5", "c4", "c5", "f4", "f5"].includes(to)) out.push(`Peón a ${to}: gana espacio y pelea por el centro.`);
  else if ((pc === "n" || pc === "b") && (m.from >> 4) === (s.t === 1 ? 7 : 0)) out.push(`Desarrolla ${PIECE_ART[pc]} a ${to}.`);
  else if (pc === "r") {
    const f = m.to & 7;
    let own = false, any = false;
    for (let r = 0; r < 8; r++) { const x = node.state.b[r * 16 + f]; if (x === "P" || x === "p") { any = true; if (Chess.color(x) === s.t) own = true; } }
    if (!any) out.push(`La torre ocupa la columna ${"abcdefgh"[f]} abierta.`);
    else if (!own) out.push(`La torre se sitúa en la columna ${"abcdefgh"[f]} semiabierta.`);
  } else if (pc === "k" && (s.c & (s.t === 1 ? 3 : 12))) out.push("El rey se mueve y pierde el derecho a enrocar.");
  else if (pc === "p") {
    const rank = s.t === 1 ? 8 - (m.to >> 4) : (m.to >> 4) + 1;
    if (rank >= 6) out.push(`El peón avanza a ${to}, cada vez más cerca de coronar.`);
  }
  if (Chess.inCheck(node.state)) out.push(Chess.legal(node.state).length ? "Da jaque." : "¡Jaque mate!");
  // Hasta dos ideas estratégicas, las más importantes
  const strat = strategicNotes(node).sort((a, b) => b.w - a.w).slice(0, 2).map(x => x.txt);
  // Evitar repetir lo del peón que avanza
  if (strat.some(t => t.startsWith("El peón pasado avanza"))) { const i = out.findIndex(t => t.startsWith("El peón avanza")); if (i >= 0) out.splice(i, 1); }
  return out.concat(strat).join(" ");
}
function classifyMove(n) {
  const p = n.parent;
  if (!p || !p.eval || !n.eval) return null;
  const mover = p.state.t;
  // Si la jugada es una de las líneas calculadas desde la posición anterior, usamos ESA
  // evaluación (misma búsqueda): elimina el ruido de comparar dos búsquedas distintas.
  let after = n.eval;
  if (p.eval.best === n.uci && p.eval.mate !== 0) after = p.eval;
  else if (p.eval.second && p.eval.second.uci === n.uci) after = p.eval.second;
  if (n.eval.mate === 0) after = n.eval;
  const wb = mover === 1 ? winPct(p.eval) : 100 - winPct(p.eval);
  const wa = mover === 1 ? winPct(after) : 100 - winPct(after);
  const book = ECO.byKey.has(n.key);
  const loss = book ? 0 : Math.max(0, wb - wa);
  const cpOf = ev => (ev.mate != null ? (ev.mate === 0 ? ev.winner * 1000 : Math.sign(ev.mate) * 1000) : Math.max(-1000, Math.min(1000, ev.cp)));
  const cpl = book ? 0 : Math.max(0, (cpOf(p.eval) - cpOf(after)) * mover);
  const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  let cls = loss >= 15 ? "??" : loss >= 10 ? "?" : loss >= 5 ? "?!" : "";
  // Jugada única: coincide con el motor y la segunda opción era claramente peor
  const obvious = Chess.inCheck(p.state) || n.move.captured !== ".";
  if (!cls && !book && !obvious && p.eval.best === n.uci && p.eval.second) {
    const ws = mover === 1 ? winPct(p.eval.second) : 100 - winPct(p.eval.second);
    if (wb - ws >= 20 && wb < 97) cls = "!";
  }
  // Dejar escapar un mate forzado se marca siempre
  const hadMate = p.eval.mate != null && p.eval.mate !== 0 && p.eval.mate * mover > 0;
  const keepsMate = (after.mate != null && after.mate !== 0 && after.mate * mover > 0) || (after.mate === 0 && after.winner === mover);
  if (hadMate && !keepsMate && (!cls || cls === "?!" || cls === "!")) cls = "?";
  return { loss, cpl, acc, cls, mover, after, book };
}
function buildComment(n, info) {
  const p = n.parent, mover = p.state.t, parts = [];
  const lang = settings.lang;
  const eco = ECO.byKey.get(n.key);
  if (eco && !n.children.some(c => ECO.byKey.has(c.key))) parts.push(`Teoría: ${eco.eco} ${eco.name}.`);
  const cls = info ? info.cls : "";
  if (cls === "!") parts.push("¡Muy buena! Era prácticamente la única jugada que mantenía la valoración.");
  if (["?!", "?", "??"].includes(cls)) {
    const label = { "?!": "Imprecisión", "?": "Error", "??": "Error grave" }[cls];
    let s = `${label} (${cls}).`;
    const pe = p.eval, ne = info.after || n.eval;
    if (pe.mate != null && pe.mate * mover > 0 && !(ne.mate != null && ne.mate * mover > 0)) s += ` Se escapa un mate en ${Math.abs(pe.mate)}.`;
    else if (ne.mate != null && ne.mate !== 0 && ne.mate * mover < 0) s += ` Permite mate en ${Math.abs(ne.mate)}.`;
    else s += ` La valoración pasa de ${fmtEval(pe)} a ${fmtEval(ne)}.`;
    if (pe.best && pe.best !== n.uci) {
      const txt = lineText(p.state, pe.pv && pe.pv.length ? pe.pv : [pe.best], 5);
      if (txt) s += ` Era mejor ${txt}.`;
    }
    const refUci = n.eval.best;
    if (refUci) {
      const L = Chess.legal(n.state), rm = Chess.moveFromUci(n.state, refUci, L);
      if (rm) {
        const pv = n.eval.pv && n.eval.pv.length ? n.eval.pv : [refUci];
        s += ` La respuesta precisa es ${lineText(n.state, pv, cls === "?!" ? 1 : 3)}`;
        s += n.eval.mate != null && n.eval.mate !== 0 && n.eval.mate * mover < 0 ? ", que lleva al mate." : ".";
        const lost = (materialBalance(p.state) - materialBalance(playUcis(n.state, pv, 8))) * mover;
        if (lost >= 2 && !(n.eval.mate != null && n.eval.mate * mover < 0)) {
          s += ` El rival gana material (unos ${Math.round(lost)} puntos).`;
          if (rm.captured !== "." && rm.to === n.move.to) { const hang = hangingInfo(n); if (hang) s += " " + hang; }
        }
      }
    }
    parts.push(s);
  }
  const motif = describeMotif(n);
  if (motif) parts.push(motif);
  return parts.join(" ");
}
async function analyseGame(opts = {}) {
  if (Batch.running) { toast("Ahora se están analizando tus partidas de la biblioteca: espera a que termine o detenlo en «📊 Estadísticas»."); return; }
  if (ui.analysing) return;
  const quick = !!opts.quick;
  // Por defecto, la línea principal; con opts.variation, la línea que pasa por la jugada actual
  const nodes = opts.variation ? [...Pgn.pathTo(cur()), ...Pgn.mainlineFrom(cur())] : [game.root, ...Pgn.mainlineFrom(game.root)];
  ui.analysedLine = nodes;
  if (nodes.length < 2) { toast("No hay jugadas que analizar."); return; }
  if (quiz()) { toast("Termina antes el ejercicio."); return; }
  ui.analysing = true;
  ui.cancelAnalysis = false;
  Engine.cancel("live");
  $("autoAnnotateBtn").disabled = true;
  $("cancelAnalysisBtn").hidden = false;
  $("analysisProgress").classList.add("show");
  const bar = $("analysisProgress").firstElementChild;
  const minDepth = quick ? (Engine.kind === "stockfish" ? 8 : 4) : (Engine.kind === "stockfish" ? 12 : 5);
  const t0 = Date.now();
  for (let i = 0; i < nodes.length && !ui.cancelAnalysis; i++) {
    const n = nodes[i];
    const term = terminalEval(n);
    if (term) n.eval = term;
    else if (!(n.eval && n.eval.source !== "pgn" && (n.eval.depth || 0) >= minDepth && (quick || n.eval.second !== undefined || Engine.kind !== "stockfish"))) {
      const job = await Engine.analyse(n, quick
        ? { purpose: "batch", movetime: Math.min(300, +settings.analysisMs), multipv: 1 }
        : { purpose: "batch", movetime: +settings.analysisMs, multipv: Engine.kind === "stockfish" ? 2 : 1 });
      if (job) storeEval(n, job, true);
    }
    bar.style.width = ((i + 1) / nodes.length * 100).toFixed(1) + "%";
    $("analysisStatus").textContent = `${quick ? "Completando el gráfico" : "Analizando"} con ${Engine.name}: posición ${i + 1} de ${nodes.length}…`;
    if (i % 3 === 0) renderEvalChart();
  }
  const cancelled = ui.cancelAnalysis;
  ui.analysing = false;
  $("autoAnnotateBtn").disabled = false;
  $("cancelAnalysisBtn").hidden = true;
  $("analysisProgress").classList.remove("show");
  bar.style.width = "0";
  if (cancelled) { $("analysisStatus").textContent = "Análisis detenido. Las evaluaciones obtenidas se conservan."; render(); return; }
  if (quick) { $("analysisStatus").textContent = "📈 Gráfico completado. Para marcar errores y redactar comentarios usa «🤖 Analizar y comentar»."; if (ui.libId) markDirty(); render(); return; }
  const st = annotateNodes(nodes);
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const harm = a => a.length / a.reduce((x, y) => x + 1 / Math.max(1, y), 0);
  for (const [k, pre] of [[1, "W"], [-1, "B"]]) {
    const S = st[k];
    $(`rep${pre}Acc`).textContent = S.acc.length ? Math.round((mean(S.acc) + harm(S.acc)) / 2) + "%" : "–";
    $(`rep${pre}Acpl`).textContent = S.cpl.length ? Math.round(mean(S.cpl)) : "–";
    $(`rep${pre}Good`).textContent = S.good;
    $(`rep${pre}Inacc`).textContent = S.inacc;
    $(`rep${pre}Mistake`).textContent = S.mistake;
    $(`rep${pre}Blunder`).textContent = S.blunder;
  }
  $("repWName").textContent = game.headers.White || "Blancas";
  $("repBName").textContent = game.headers.Black || "Negras";
  ui.report = buildGameReport(nodes);
  if (!opts.variation) game.analysis = analysisSummary(ui.report, game.root, "motor");
  renderGameReport();
  $("reportBox").classList.add("show");
  $("analysisStatus").textContent = `✔ Análisis ${opts.variation ? "de la variante " : ""}completado con ${Engine.name} en ${Math.round((Date.now() - t0) / 1000)} s. Se han marcado y comentado las jugadas críticas.`;
  markDirty();
  render();
  renderRetryStart();
}
/* Clasifica las jugadas (??, ?, ?!, !) y redacta los comentarios automáticos de una línea ya evaluada */
function annotateNodes(nodes) {
  const st = { 1: { acc: [], cpl: [], good: 0, inacc: 0, mistake: 0, blunder: 0 }, "-1": { acc: [], cpl: [], good: 0, inacc: 0, mistake: 0, blunder: 0 } };
  for (const n of nodes.slice(1)) {
    const info = classifyMove(n);
    if (!info) continue;
    const S = st[info.mover];
    S.acc.push(info.acc); S.cpl.push(info.cpl);
    if (info.cls === "!") S.good++;
    if (info.cls === "?!") S.inacc++;
    if (info.cls === "?") S.mistake++;
    if (info.cls === "??") S.blunder++;
    if (!n.nag || n.nagAuto) { n.nag = info.cls; n.nagAuto = Boolean(info.cls); }
    const important = info.cls || ECO.byKey.has(n.key) && !n.children.some(c => ECO.byKey.has(c.key)) || !Chess.legal(n.state).length;
    if (important && (!n.comment || n.commentAuto)) {
      const txt = buildComment(n, info);
      if (txt) { n.comment = txt; n.commentAuto = true; }
    } else if (!n.comment || n.commentAuto) {
      // Jugadas tranquilas con una idea estratégica clara: un comentario breve
      const strat = strategicNotes(n).filter(x => x.w >= 2).sort((a, b) => b.w - a.w);
      if (strat.length) { n.comment = strat.slice(0, 2).map(x => x.txt).join(" "); n.commentAuto = true; }
      else if (n.commentAuto) { n.comment = ""; n.commentAuto = false; }
    }
  }
  return st;
}
/* ---------- 19a. Informe pedagógico de la partida ---------- */
const PHASES = [["apertura", "Apertura"], ["medio", "Medio juego"], ["final", "Final"]];
function phaseOfNode(n, ply) {
  if (Chess.nonPawnCount(n.parent.state) <= 6) return "final";
  if (ply <= 20 || (ply <= 30 && ECO.byKey.has(n.parent.key))) return "apertura";
  return "medio";
}
function evalCategory(w) {
  return w >= 85 ? "ganada para las blancas" : w >= 65 ? "con ventaja de las blancas" : w > 35 ? "equilibrada" : w > 15 ? "con ventaja de las negras" : "ganada para las negras";
}
function moveTheme(n, info) {
  const p = n.parent, mover = info.mover, pe = p.eval, ne = info.after || n.eval;
  if (pe.mate != null && pe.mate !== 0 && pe.mate * mover > 0 && !(ne.mate != null && ne.mate * mover > 0)) return { key: "mateMissed", txt: `se le escapó un mate en ${Math.abs(pe.mate)}` };
  if (n.eval.mate != null && n.eval.mate !== 0 && n.eval.mate * mover < 0) return { key: "mateAllowed", txt: `permitió un mate en ${Math.abs(n.eval.mate)}` };
  let after = null;
  if (n.eval.pv && n.eval.pv.length) after = playUcis(n.state, n.eval.pv, 8);
  else { let k = n; for (let i = 0; i < 6 && k.children.length; i++) k = k.children[0]; after = k.state; }
  const lost = (materialBalance(p.state) - materialBalance(after)) * mover;
  if (lost >= 2) return { key: "material", txt: `perdió material (unos ${Math.round(lost)} puntos)` };
  const wb = mover === 1 ? winPct(pe) : 100 - winPct(pe);
  if (wb >= 80 && wb - info.loss < 65) return { key: "wasted", txt: "dejó escapar una posición ganadora" };
  return info.loss >= 15 ? { key: "positional", txt: "cometió un error decisivo de planteamiento" } : { key: "positional", txt: "empeoró su posición" };
}
function buildGameReport(nodes, h = game.headers) {
  const moves = [];
  nodes.slice(1).forEach((n, k) => {
    const info = classifyMove(n);
    if (!info) return;
    moves.push({ n, info, ply: k + 1, phase: phaseOfNode(n, k + 1), w: winPct(info.after || n.eval) });
  });
  if (!moves.length) return null;
  const name = c => (c === 1 ? h.White || "Blancas" : h.Black || "Negras");
  // Momentos clave: las jugadas que más cambiaron la partida
  const key = moves.filter(x => x.info.loss >= 7 && ["?!", "?", "??"].includes(x.info.cls)).sort((a, b) => b.info.loss - a.info.loss).slice(0, 5)
    .map(x => Object.assign(x, { theme: moveTheme(x.n, x.info) }));
  // Precisión por fases
  const mean = a => a.reduce((s2, y) => s2 + y, 0) / (a.length || 1);
  const harm = a => a.length / a.reduce((s2, y) => s2 + 1 / Math.max(1, y), 0);
  const phases = {};
  for (const [ph] of PHASES) for (const c of [1, -1]) {
    const accs = moves.filter(x => x.phase === ph && x.info.mover === c).map(x => x.info.acc);
    phases[ph + c] = accs.length ? Math.round((mean(accs) + harm(accs)) / 2) : null;
  }
  // Resumen: tramos de valoración (ignorando vaivenes de una sola jugada)
  const cats = [{ ply: 0, cat: evalCategory(winPct(nodes[0].eval || { cp: 0 })) }];
  for (let i = 0; i < moves.length; i++) {
    const c = evalCategory(moves[i].w);
    const next = moves[i + 1] ? evalCategory(moves[i + 1].w) : c;
    if (c !== cats[cats.length - 1].cat && (next === c || i === moves.length - 1)) cats.push({ ply: moves[i].ply, cat: c, m: moves[i] });
  }
  const lbl = m => `${numPrefix(m.n.parent.state)}${dispSan(m.n)}${m.n.nag || ""}`;
  const sentences = [];
  const eco = ECO.detect(nodes[nodes.length - 1]);
  if (eco) sentences.push(`Apertura: ${eco.entry.eco} ${eco.entry.name}.`);
  sentences.push(`La partida empezó ${cats[0].cat}.`);
  const changes = cats.slice(1);
  const shown = changes.length > 5 ? changes.filter(c => key.some(k => Math.abs(k.ply - c.ply) <= 1)).slice(0, 4) : changes;
  for (const c of shown) sentences.push(`Tras ${lbl(c.m)} pasó a estar ${c.cat}.`);
  if (changes.length > shown.length) sentences.push(`La valoración cambió de manos ${changes.length} veces: fue una partida muy disputada.`);
  const lastNode = nodes[nodes.length - 1], st = gameStatus(lastNode), res = h.Result;
  if (st.over) sentences.push(`Terminó así: ${st.text.toLowerCase()}.`);
  else if (res === "1-0" || res === "0-1") sentences.push(`${name(res === "1-0" ? 1 : -1)} ganó la partida${changes.length ? "" : " sin que la valoración cambiara de manos"}.`);
  else if (res === "1/2-1/2") sentences.push("Terminó en tablas.");
  else sentences.push(`Al final la posición está ${evalCategory(moves[moves.length - 1].w)}.`);
  // Por jugador: precisión y qué practicar
  const players = [1, -1].map(c => {
    const mine = moves.filter(x => x.info.mover === c);
    const accs = mine.map(x => x.info.acc);
    const errs = mine.filter(x => x.info.cls === "?" || x.info.cls === "??");
    const counts = { "?!": mine.filter(x => x.info.cls === "?!").length, "?": mine.filter(x => x.info.cls === "?").length, "??": mine.filter(x => x.info.cls === "??").length };
    const themes = {};
    for (const e of errs) { const t = moveTheme(e.n, e.info); themes[t.key] = (themes[t.key] || 0) + 1; themes["ph_" + e.phase] = (themes["ph_" + e.phase] || 0) + 1; }
    const practice = [];
    if (themes.mateMissed) practice.push("Ejercicios de mate en 2 y 3: se te pasó algún mate.");
    if (themes.mateAllowed) practice.push("Seguridad del rey y patrones de mate: permitiste un ataque decisivo.");
    if (themes.material) practice.push("Táctica: piezas colgadas, dobles ataques y clavadas (repasa los errores con 🎯).");
    if (themes.wasted) practice.push("Convertir posiciones ganadas: simplifica cuando vas por delante y evita riesgos innecesarios.");
    if ((themes.ph_apertura || 0) >= 1) practice.push(`La apertura${eco ? ` (${eco.entry.name})` : ""}: repasa las primeras jugadas con el explorador o la enciclopedia ECO.`);
    if ((themes.ph_final || 0) >= 1) practice.push("Técnica de finales: practica en la pestaña 👑 Finales contra la tabla perfecta.");
    if (!practice.length && errs.length) practice.push("Planes y valoración de posiciones: repasa los momentos clave con «🎯 Aprende de tus errores» para ver qué idea fallaba.");
    if (!practice.length && counts["?!"] >= 3) practice.push("Precisión en posiciones tranquilas: muchas imprecisiones pequeñas; dedica más tiempo a comparar candidatas.");
    const acc = accs.length ? Math.round((mean(accs) + harm(accs)) / 2) : null;
    let verdict = `${name(c)}: ${acc != null ? acc + " % de precisión" : "sin datos"}`;
    const parts = [];
    if (counts["??"]) parts.push(`${counts["??"]} error${counts["??"] > 1 ? "es" : ""} grave${counts["??"] > 1 ? "s" : ""}`);
    if (counts["?"]) parts.push(`${counts["?"]} error${counts["?"] > 1 ? "es" : ""}`);
    if (counts["?!"]) parts.push(`${counts["?!"]} imprecisi${counts["?!"] > 1 ? "ones" : "ón"}`);
    verdict += parts.length ? `, con ${parts.join(", ")}.` : ", sin errores.";
    const phErr = {};
    for (const e of errs) phErr[e.phase] = (phErr[e.phase] || 0) + 1;
    const th = {};
    for (const k of ["material", "mateMissed", "mateAllowed", "wasted", "positional"]) if (themes[k]) th[k] = themes[k];
    return { c, verdict, practice, acc, n: mine.length, cpl: mine.length ? Math.round(mean(mine.map(x => x.info.cpl))) : null, counts, th, phErr };
  });
  return { key, phases, summary: sentences.join(" "), players, moves, eco };
}
/* Resumen compacto del análisis que se guarda con la partida (estadísticas y ejercicios) */
function lineHash(root) {
  let x = 5381;
  for (const n of Pgn.mainlineFrom(root)) for (let i = 0; i < n.uci.length; i++) x = ((x << 5) + x + n.uci.charCodeAt(i)) | 0;
  return (x >>> 0).toString(36);
}
const compactEval = ev => (ev ? (ev.mate != null ? { mate: ev.mate, winner: ev.winner } : { cp: ev.cp }) : null);
function analysisSummary(R, root, src) {
  if (!R) return null;
  const p = {};
  for (const pl of R.players) p[pl.c] = { acc: pl.acc, n: pl.n, cpl: pl.cpl, c: pl.counts, th: pl.th, phErr: pl.phErr, ph: { apertura: R.phases["apertura" + pl.c], medio: R.phases["medio" + pl.c], final: R.phases["final" + pl.c] } };
  const err = R.moves.filter(x => x.info.cls === "?" || x.info.cls === "??").map(x => {
    const n = x.n, pe = n.parent.eval, t = moveTheme(n, x.info);
    return {
      ply: x.ply, cls: x.info.cls, loss: Math.round(x.info.loss), th: t.key, ph: x.phase, mover: x.info.mover,
      fen: Chess.toFen(n.parent.state), uci: n.uci, ev: compactEval(pe), evAfter: compactEval(x.info.after || n.eval),
      best: pe.best && pe.best !== n.uci ? pe.best : null, pv: pe.best && pe.best !== n.uci && pe.pv ? pe.pv.slice(0, 8) : null
    };
  });
  return { v: 1, at: Date.now(), src, engine: src === "pgn" ? "" : Engine.name, hash: lineHash(root), plies: R.moves.length, eco: R.eco ? R.eco.entry.eco : "", p, err };
}
const analysisOf = g => (g.analysis && g.analysis.hash === lineHash(g.root) ? g.analysis : null);
function renderGameReport() {
  const box = $("reportExtra"), R = ui.report;
  if (!R) { box.innerHTML = ""; return; }
  const h = game.headers, nm = c => esc(c === 1 ? h.White || "Blancas" : h.Black || "Negras");
  const pcell = v => (v == null ? "–" : v + "%");
  let html = `<h3>📝 Resumen</h3><p class="rep-summary">${esc(R.summary)}</p>`;
  html += `<h3>📍 Momentos clave</h3>`;
  if (R.key.length) {
    html += `<ol class="rep-key">` + R.key.map((x, i) => {
      const n = x.n, p = n.parent;
      return `<li><a href="#" data-k="${i}"><b>${esc(numPrefix(p.state) + dispSan(n) + (n.nag || ""))}</b></a> (${esc(p.state.t === 1 ? h.White || "blancas" : h.Black || "negras")}): ${esc(x.theme.txt)}; la valoración pasa de ${esc(fmtEval(p.eval))} a ${esc(fmtEval(x.info.after || n.eval))}.</li>`;
    }).join("") + `</ol>`;
  } else html += `<p class="small">No hubo errores importantes: ninguna jugada cambió el rumbo de la partida.</p>`;
  html += `<h3>⏱ Precisión por fases</h3><table class="rep-phases"><thead><tr><th></th><th>${nm(1)}</th><th>${nm(-1)}</th></tr></thead><tbody>` +
    PHASES.map(([k, label]) => `<tr><td>${label}</td><td>${pcell(R.phases[k + 1])}</td><td>${pcell(R.phases[k + -1])}</td></tr>`).join("") + `</tbody></table>`;
  html += `<h3>🎯 Qué practicar</h3>` + R.players.map(pl => `<div class="rep-player"><b>${esc(pl.verdict)}</b>${pl.practice.length ? `<ul>${pl.practice.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : `<div class="small">Nada destacable: ¡buena partida!</div>`}</div>`).join("");
  box.innerHTML = html;
  box.querySelectorAll("[data-k]").forEach(a => a.onclick = e => { e.preventDefault(); const x = R.key[+a.dataset.k]; if (x && !quiz()) goTo(x.n); });
}

async function explainCurrentMove() {
  const n = cur();
  if (!n.parent) { toast("Sitúate en una jugada para comentarla."); return; }
  const btn = $("explainMoveBtn");
  btn.disabled = true;
  btn.textContent = "⏳ Analizando…";
  try {
    for (const x of [n.parent, n]) {
      const term = terminalEval(x);
      if (term) { x.eval = term; continue; }
      if (!x.eval || x.eval.source === "pgn" || (x.eval.depth || 0) < (Engine.kind === "stockfish" ? 12 : 5)) {
        const job = await Engine.analyse(x, { purpose: "explain", movetime: Math.max(800, +settings.analysisMs * 1.5), multipv: Engine.kind === "stockfish" ? 2 : 1 });
        if (job) storeEval(x, job, true);
      }
    }
    const info = classifyMove(n);
    const txt = buildComment(n, info) || describeMotif(n) || "Jugada tranquila que mantiene el equilibrio.";
    n.comment = txt;
    n.commentAuto = false;
    if (info && (!n.nag || n.nagAuto)) { n.nag = info.cls; n.nagAuto = Boolean(info.cls); }
    $("annotation").value = txt;
    markDirty();
  } finally {
    btn.disabled = false;
    btn.textContent = "✍ Redactar comentario con el motor";
    render();
  }
}

/* ---------- 19b. «Ver amenaza»: qué jugaría el rival si le tocara mover ---------- */
const Threat = { node: null, from: -1, to: -1, busy: false };
function clearThreat() { Threat.node = null; render(); }
async function showThreat() {
  const node = cur();
  if (Threat.node === node) { clearThreat(); return; }
  if (editor.active || quiz() || Threat.busy) return;
  const s = node.state;
  if (gameStatus(node).over) { toast("La partida ha terminado."); return; }
  if (Chess.inCheck(s)) { toast("Estás en jaque: la amenaza es el propio jaque."); return; }
  const t = Chess.clone(s);
  t.t = -s.t;
  t.ep = -1;
  if (!Chess.legal(t).length) { toast("El rival no tendría ninguna jugada."); return; }
  Threat.busy = true;
  $("threatBtn").textContent = "⏳ Amenaza";
  Engine.cancel("live");
  ui.liveNode = null;
  const job = await new Promise(resolve => Engine.start({ purpose: "threat", fen: Chess.toFen(t), moves: [], stm: t.t, movetime: Math.max(900, Math.min(2500, +settings.analysisMs * 1.5)), multipv: 1, resolve }));
  Threat.busy = false;
  $("threatBtn").textContent = "👁 Amenaza";
  const l = job && job.lines && job.lines[0];
  const u = (l && l.pv[0]) || (job && job.best);
  if (!u || cur() !== node) { render(); return; }
  Threat.node = node;
  Threat.from = Chess.sqIdx(u.slice(0, 2));
  Threat.to = Chess.sqIdx(u.slice(2, 4));
  const ev = l ? { cp: l.cp, mate: l.mate, winner: l.winner } : null;
  const who = t.t === 1 ? "las blancas" : "las negras";
  const L = Chess.legal(t), m = Chess.moveFromUci(t, u, L);
  const san = m ? formatSan(Chess.san(t, m, L), settings.lang, t.t) : u;
  const capt = m && m.captured !== "." ? `, capturando ${PIECE_ART[m.captured.toLowerCase()]} de ${Chess.sqName(m.to)}` : "";
  $("threatInfo").innerHTML = `👁 <b>Amenaza:</b> si les tocara, ${who} jugarían <b>${esc(san)}</b>${esc(capt)}${ev ? ` (${esc(fmtEval(ev))})` : ""}. <span class="small">${l && l.pv.length > 1 ? "Línea: " + esc(lineText(t, l.pv, 5)) : ""}</span>`;
  render();
}

/* ---------- 19c. «Aprende de tus errores»: rehacer los ? y ?? de la partida ---------- */
const Retry = { active: false, busy: false, queue: [], i: 0, attempts: 0, hint: 0, hintSq: -1, state: "", results: [], arrows: [], msg: "", prevFlip: false };
function mistakesOf(side) {
  const line = ui.analysedLine || [game.root, ...Pgn.mainlineFrom(game.root)];
  return line.slice(1).filter(n => (n.nag === "?" || n.nag === "??") && n.parent && n.parent.eval && n.parent.eval.best && n.parent.eval.best !== n.uci && (!side || n.parent.state.t === side));
}
function renderRetryStart() {
  const box = $("retryStart");
  const w = mistakesOf(1).length, b = mistakesOf(-1).length;
  if (!w && !b) { box.hidden = false; box.innerHTML = `<span class="small">🎯 No hay errores (? ni ??) que repasar en esta partida.</span>`; return; }
  const h = game.headers;
  box.hidden = false;
  box.innerHTML = `<b>🎯 Aprende de tus errores:</b>
    <button class="sm-btn primary" data-s="1" ${w ? "" : "disabled"}>${esc(h.White || "Blancas")} (${w})</button>
    <button class="sm-btn primary" data-s="-1" ${b ? "" : "disabled"}>${esc(h.Black || "Negras")} (${b})</button>
    <button class="sm-btn" data-s="0">Todos (${w + b})</button>`;
  box.querySelectorAll("button").forEach(btn => btn.onclick = () => startRetry(+btn.dataset.s));
}
function startRetry(side, queue) {
  const q = queue || mistakesOf(side);
  if (!q.length) { toast("No hay errores que repasar."); return; }
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  if (trainer.active) stopTraining(true);
  if (ui.cpu.on) stopCpu(true);
  if (Guess.active) guessStop();
  if (Vis.active) visStop(true);
  if (editor.active) closeEditor();
  stopAutoplay();
  Threat.node = null;
  Engine.cancel("live");
  Object.assign(Retry, { active: true, busy: false, queue: q, i: 0, results: [], prevFlip: ui.flipped });
  retryShow();
  const box = $("retryBox");
  setTimeout(() => { const r = $("boardWrap").getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) $("topBar").scrollIntoView({ block: "start", behavior: "smooth" }); }, 40);
  if (box) box.focus && box.focus();
}
const retryNode = () => Retry.queue[Retry.i];
function retryDesc(node) {
  const p = node.parent, side = p.state.t === 1 ? "las blancas" : "las negras";
  if (node.__drill) {
    const d = node.__drill, th = d.e.th && THEMES[d.e.th] ? ` · ${THEMES[d.e.th].icon} ${esc(THEMES[d.e.th].name)}` : "";
    return `<span class="small">📚 ${esc(d.title)}${d.date && !/^\?/.test(d.date) ? ` (${esc(d.date.slice(0, 4))})` : ""}${th}</span><br>En la partida, ${side} jugaron <b>${esc(numPrefix(p.state) + dispSan(node) + (node.nag || ""))}</b> y la valoración pasó de ${esc(fmtEval(p.eval))} a ${esc(fmtEval(node.eval))}.`;
  }
  return `En la partida, ${side} jugaron <b>${esc(numPrefix(p.state) + dispSan(node) + (node.nag || ""))}</b> y la valoración pasó de ${esc(fmtEval(p.eval))} a ${esc(fmtEval(node.eval))}.`;
}
async function retryShow() {
  const node = retryNode();
  if (node.__game && game !== node.__game) {
    Retry.active = false;
    setGame(node.__game, { noConfirm: true, name: `🎯 Ejercicio · ${node.__drill.title}` });
    Retry.active = true;
  }
  Object.assign(Retry, { attempts: 0, hint: 0, hintSq: -1, state: "ask", arrows: [], msg: "" });
  if (node.__drill && !(node.parent.eval && node.parent.eval.best)) {
    game.current = node.parent;
    ui.flipped = node.parent.state.t === -1;
    render();
    const ok = await prepareDrill(node);
    if (!Retry.active || retryNode() !== node) return;
    if (!ok || node.parent.eval.best === node.uci) { Retry.i++; if (Retry.i >= Retry.queue.length) retryEnd(false); else retryShow(); return; }
    Retry.state = "ask";
  }
  game.current = node.parent;
  ui.selected = null;
  ui.flipped = node.parent.state.t === -1;
  render();
  retryPanel();
}
function retryPanel() {
  const box = $("retryBox");
  if (!box) return;
  box.hidden = false;
  if (!Retry.active) return;
  const node = retryNode(), n = Retry.queue.length;
  const who = node.parent.state.t === 1 ? "las blancas" : "las negras";
  let html = `<div class="retry-head">🎯 ${node.__drill ? "Ejercicio" : "Error"} ${Retry.i + 1} de ${n}</div><div>${retryDesc(node)}</div>`;
  if (Retry.state === "ask" || Retry.state === "wrong") html += `<div class="retry-q">¿Qué era mejor para ${who}? Haz la jugada en el tablero.</div>`;
  if (Retry.msg) html += `<div class="retry-msg">${Retry.msg}</div>`;
  const open = Retry.state === "ask" || Retry.state === "wrong";
  html += `<div class="controls">`;
  if (open) html += `<button class="sm-btn" data-a="hint">💡 Pista</button><button class="sm-btn" data-a="show">👁 Ver solución</button><button class="sm-btn" data-a="skip">⏭ Saltar</button>`;
  if (Retry.state === "checking") html += `<span class="small">⏳ Comprobando tu jugada con el motor…</span>`;
  if (Retry.state === "preparing") html += `<span class="small">⏳ El motor está calculando la mejor jugada de esta posición…</span>`;
  if (Retry.state === "solved" || Retry.state === "shown") {
    html += `<button class="sm-btn warn-btn" data-a="card">📌 Guardar como tarjeta</button>`;
    html += Retry.i + 1 < n ? `<button class="sm-btn primary" data-a="next">Siguiente ▶</button>` : `<button class="sm-btn primary" data-a="next">Ver resumen ▶</button>`;
  }
  html += `<button class="sm-btn danger" data-a="end">⏹ Terminar</button>${node.__drill && Cards.stash ? `<button class="sm-btn" data-a="back" title="Deja los ejercicios y vuelve a la partida que tenías">↩ Volver a tu partida</button>` : ""}</div>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-a]").forEach(b => b.onclick = () => retryAction(b.dataset.a));
}
function bestOf(node) {
  const p = node.parent, best = p.eval.best;
  const L = Chess.legal(p.state), m = Chess.moveFromUci(p.state, best, L);
  return { uci: best, move: m, san: m ? formatSan(Chess.san(p.state, m, L), settings.lang, p.state.t) : best, line: lineText(p.state, p.eval.pv && p.eval.pv.length ? p.eval.pv : [best], 6) };
}
function retryAction(a) {
  const node = retryNode();
  if (a === "end") { retryEnd(false); return; }
  if (a === "next") { Retry.i++; if (Retry.i >= Retry.queue.length) retryEnd(false); else retryShow(); return; }
  if (a === "back") { restoreStash(); return; }
  if (a === "skip") { Retry.results.push({ node, ok: false, skipped: true }); Retry.i++; if (Retry.i >= Retry.queue.length) retryEnd(false); else retryShow(); return; }
  if (a === "card") { retrySaveCard(node); return; }
  if (a === "hint") {
    const b = bestOf(node);
    Retry.hint++;
    if (Retry.hint === 1 && b.move) { Retry.hintSq = b.move.from; Retry.msg = "💡 La pieza que debes mover está marcada en azul."; }
    else if (b.move) { Retry.arrows = [{ color: "blue", from: b.move.from, to: b.move.to }]; Retry.msg = "💡 La flecha azul indica la jugada."; }
    renderBoard(); retryPanel(); return;
  }
  if (a === "show") { retryShowSolution(); return; }
}
async function retryMove(move) {
  const node = retryNode(), p = node.parent, u = Chess.uci(move);
  if (Retry.busy || Retry.state === "solved" || Retry.state === "shown" || Retry.state === "preparing") return;
  const L = Chess.legal(p.state), san = formatSan(Chess.san(p.state, move, L), settings.lang, p.state.t);
  if (u === p.eval.best) { retrySolved(move, san, 0); return; }
  if (u === node.uci) { Retry.attempts++; Retry.state = "wrong"; Retry.msg = `❌ ${esc(san)} es justo la jugada de la partida, la que fue un error. Busca otra.`; Sound.play("error"); retryPanel(); return; }
  Retry.busy = true;
  Retry.state = "checking";
  retryPanel();
  const fake = { parent: p, uci: u, state: Chess.apply(p.state, move) };
  let ev = terminalEval(fake);
  if (!ev) {
    const job = await Engine.analyse(fake, { purpose: "retry", movetime: Math.max(700, +settings.analysisMs), multipv: 1 });
    const l = job && job.lines && job.lines[0];
    ev = l ? { cp: l.cp, mate: l.mate, winner: l.winner } : null;
  }
  Retry.busy = false;
  if (!Retry.active || retryNode() !== node) return;
  if (!ev) { Retry.state = "ask"; Retry.msg = "No se ha podido comprobar la jugada: inténtalo otra vez."; retryPanel(); return; }
  const mover = p.state.t;
  const wBest = mover === 1 ? winPct(p.eval) : 100 - winPct(p.eval);
  const wUser = mover === 1 ? winPct(ev) : 100 - winPct(ev);
  const loss = Math.max(0, wBest - wUser);
  if (loss <= 5) { retrySolved(move, san, loss); return; }
  Retry.attempts++;
  Retry.state = "wrong";
  Retry.arrows = [{ color: "red", from: move.from, to: move.to }];
  Sound.play("error");
  Retry.msg = `❌ Con ${esc(san)} la valoración sería ${esc(fmtEval(ev))}: sigue sin ser buena. ${Retry.attempts >= 3 ? "" : "Prueba otra."}`;
  renderShapes();
  if (Retry.attempts >= 3) { retryShowSolution(Retry.msg + "<br>"); return; }
  retryPanel();
}
function retrySolved(move, san, loss) {
  const node = retryNode(), b = bestOf(node);
  Retry.state = "solved";
  Retry.hintSq = -1;
  Retry.results.push({ node, ok: Retry.attempts === 0 && Retry.hint === 0 });
  if (node.__drill) drillRecord(node, Retry.attempts === 0 && Retry.hint === 0);
  Retry.arrows = [{ color: "green", from: move.from, to: move.to }];
  if (b.move && Chess.uci(move) !== b.uci) Retry.arrows.push({ color: "blue", from: b.move.from, to: b.move.to });
  Sound.play("ok");
  Retry.msg = loss === 0
    ? `✔ <b>¡Exacto!</b> ${esc(san)} era la mejor jugada. Línea: ${esc(b.line)}`
    : `✔ <b>¡Bien!</b> ${esc(san)} también vale (casi tan buena como la del motor). La mejor era ${esc(b.san)} (flecha azul): ${esc(b.line)}`;
  renderBoard();
  retryPanel();
}
function retryShowSolution(prefix = "") {
  const node = retryNode(), b = bestOf(node);
  Retry.state = "shown";
  Retry.hintSq = -1;
  Retry.results.push({ node, ok: false });
  if (node.__drill) drillRecord(node, false);
  Retry.arrows = b.move ? [{ color: "green", from: b.move.from, to: b.move.to }] : [];
  Retry.msg = `${prefix}👁 La buena era <b>${esc(b.san)}</b> (flecha verde). Línea: ${esc(b.line)}`;
  renderBoard();
  retryPanel();
}
function retryEnd(silent) {
  const res = Retry.results, done = res.filter(r => !r.skipped).length, first = res.filter(r => r.ok).length;
  const last = Retry.queue[Math.min(Retry.i, Retry.queue.length - 1)];
  Retry.active = false;
  Retry.arrows = [];
  Retry.hintSq = -1;
  ui.flipped = Retry.prevFlip;
  const box = $("retryBox");
  if (silent) { box.hidden = true; return; }
  if (last) game.current = last;
  box.hidden = false;
  const drill = Retry.queue.some(n => n.__drill);
  box.innerHTML = `<div class="retry-head">🏁 Repaso terminado</div><div>Has repasado ${done} ${drill ? `ejercicio${done === 1 ? "" : "s"}` : `error${done === 1 ? "" : "es"}`}: <b>${first}</b> resuelto${first === 1 ? "" : "s"} a la primera${done - first > 0 ? `, ${done - first} con ayuda` : ""}${res.length - done ? ` y ${res.length - done} saltado${res.length - done === 1 ? "" : "s"}` : ""}.</div>
    <div class="small">${drill ? "Los que fallaste vuelven mañana; los acertados se espacian (3, 7, 16… días)." : "Guarda como tarjeta 📌 los que quieras repasar más adelante en «🎯 Entrenar › Tarjetas»."}</div>
    <div class="controls">${drill && Cards.stash ? `<button class="sm-btn primary" data-back-retry>↩ Volver a tu partida</button>` : ""}<button class="sm-btn" data-close-retry>Cerrar</button></div>`;
  box.querySelector("[data-close-retry]").onclick = () => { box.hidden = true; };
  const bk = box.querySelector("[data-back-retry]");
  if (bk) bk.onclick = () => { box.hidden = true; restoreStash(); };
  render();
}
async function retrySaveCard(node) {
  if (!Lib.ready) return;
  if (node.__drill) {
    const d = node.__drill, src = Lib.games.get(d.recId);
    if (!src) { toast("La partida de este ejercicio ya no está en la biblioteca."); return; }
    const b = bestOf(node), path = pathOfPly(src, d.e.ply), p = node.parent;
    const prev = marksOfGame(src.id).find(m => m.path.join(" ") === path.join(" "));
    const rec = Object.assign(prev ? Object.assign({}, prev) : { created: Date.now(), srs: null }, {
      gameId: src.id, path, fen: Chess.toFen(node.state), fenBefore: Chess.toFen(p.state), san: node.san, num: numPrefix(p.state), color: p.state.t,
      cat: "error", note: `En la partida se jugó ${numPrefix(p.state)}${dispSan(node)}${node.nag || ""}. La buena era ${b.san}.`, train: "best", answer: b.uci, updated: Date.now()
    });
    try { await DB.put("marks", rec); } catch (e) { toast("❌ No se pudo guardar la tarjeta: " + e.message); return; }
    Lib.marks.set(rec.id, rec);
    toast("📌 Guardada como tarjeta (⚠ Error típico).", 3000);
    refreshLibraryViews();
    return;
  }
  if (!ui.libId || !Lib.games.has(ui.libId)) {
    if (!confirm("Para guardar tarjetas, la partida tiene que estar en tu biblioteca.\n\n¿Guardarla ahora?")) return;
    if (!(await saveToLibrary({}))) return;
  }
  const p = node.parent, b = bestOf(node);
  const path = Pgn.pathTo(node).slice(1).map(n => n.uci);
  const prev = marksOfGame(ui.libId).find(m => m.path.join(" ") === path.join(" "));
  const rec = Object.assign(prev ? Object.assign({}, prev) : { created: Date.now(), srs: null }, {
    gameId: ui.libId, path, fen: Chess.toFen(node.state), fenBefore: Chess.toFen(p.state), san: node.san, num: numPrefix(p.state), color: p.state.t,
    cat: "error", note: `En la partida se jugó ${numPrefix(p.state)}${dispSan(node)}${node.nag || ""}. La buena era ${b.san}.`, train: "best", answer: b.uci, updated: Date.now()
  });
  try { await DB.put("marks", rec); } catch (e) { toast("❌ No se pudo guardar la tarjeta: " + e.message); return; }
  Lib.marks.set(rec.id, rec);
  toast("📌 Guardada como tarjeta (⚠ Error típico). La repasarás en «🎯 Entrenar › Tarjetas».", 4000);
  refreshLibraryViews();
}

/* ---------- 20. Jugar contra la CPU: nivel, estilo y reloj ---------- */
const CPU_STYLES = { balanced: "⚖ Equilibrado", aggressive: "⚔ Agresivo", positional: "🏰 Posicional", defensive: "🛡 Defensivo", human: "🎲 Humano" };
const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/* Deja todo lo que esté en marcha (ejercicios, partida contra la CPU, editor) antes de empezar otra cosa */
function leaveModes() {
  if (editor.active) closeEditor();
  if (trainer.active) stopTraining(true);
  if (Retry.active) retryEnd(true);
  if (ui.cpu.on) stopCpu(true);
  if (Guess.active) guessStop();
  if (Vis.active) visStop(true);
  stopAutoplay();
  Threat.node = null;
  Engine.cancel("live");
}
/* Guarda la partida del tablero para volver a ella al terminar (tarjetas, ejercicios, adivina la jugada…) */
function stashBoard() {
  if (Cards.stash) return true;
  if (!trainer.active && !confirmLeave()) return false;
  if (trainer.active) stopTraining(true);
  Cards.stash = { game, current: game.current, flipped: ui.flipped, libId: ui.libId, fav: ui.fav, tags: ui.tags.slice(), name: $("gameName").value, dirty: ui.dirty && !ui.libId };
  $("cardsBackBtn").hidden = false;
  return true;
}

/* Reloj: empieza a correr con la primera jugada; cada bando recibe el incremento al mover */
const Clock = { shown: false, running: false, started: false, base: 0, inc: 0, ms: { 1: 0, "-1": 0 }, turn: 1, last: 0, timer: null };
function parseTc(v) {
  const m = /^(\d+)\+(\d+)$/.exec(v || "");
  return m ? { base: +m[1] * 60000, inc: +m[2] * 1000 } : null;
}
function clockLeft(c) { return Clock.ms[c] - (Clock.running && Clock.started && Clock.turn === c ? Date.now() - Clock.last : 0); }
function fmtClock(ms) {
  ms = Math.max(0, ms);
  if (ms < 10000) return "0:0" + (Math.floor(ms / 100) / 10).toFixed(1);
  const s = Math.ceil(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function renderClocks() {
  const top = ui.flipped ? 1 : -1;
  for (const [id, c] of [["topClock", top], ["bottomClock", -top]]) {
    const el = $(id);
    el.hidden = !Clock.shown;
    if (!Clock.shown) continue;
    const left = clockLeft(c), run = Clock.running && Clock.started && Clock.turn === c;
    el.textContent = fmtClock(left);
    el.classList.toggle("running", run);
    el.classList.toggle("low", left < Math.min(20000, Clock.base * 0.1 + 1));
  }
}
function clockStart(tc) {
  clearInterval(Clock.timer);
  Object.assign(Clock, { shown: true, running: true, started: false, base: tc.base, inc: tc.inc, ms: { 1: tc.base, "-1": tc.base }, turn: cur().state.t, last: Date.now() });
  Clock.timer = setInterval(clockTick, 100);
  renderClocks();
}
function clockStop() {
  if (Clock.running && Clock.started) Clock.ms[Clock.turn] = Math.max(0, clockLeft(Clock.turn));
  Clock.running = false;
  clearInterval(Clock.timer);
  Clock.timer = null;
  renderClocks();
}
/* Pulsa el reloj del bando que acaba de mover. Devuelve false si se le había acabado el tiempo. */
function clockPress(mover) {
  if (!Clock.running) return true;
  const now = Date.now();
  if (Clock.started) {
    Clock.ms[mover] -= now - Clock.last;
    if (Clock.ms[mover] <= 0) { Clock.ms[mover] = 0; clockFlag(mover); return false; }
    Clock.ms[mover] += Clock.inc;
  }
  Clock.started = true;
  Clock.turn = -mover;
  Clock.last = now;
  renderClocks();
  return true;
}
function clockTick() {
  if (!Clock.running || !Clock.started) return;
  if (clockLeft(Clock.turn) <= 0) { Clock.ms[Clock.turn] = 0; clockFlag(Clock.turn); return; }
  renderClocks();
}
/* ¿Puede dar mate el bando c con lo que le queda? (rey solo o rey y una pieza menor: no) */
function hasMatingMaterial(s, c) {
  let minors = 0;
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = s.b[i];
    if (p === "." || Chess.color(p) !== c) continue;
    const t = p.toLowerCase();
    if (t === "p" || t === "r" || t === "q") return true;
    if (t === "n" || t === "b") minors++;
  }
  return minors >= 2;
}
function clockFlag(c) {
  Clock.running = false;
  clearInterval(Clock.timer);
  Clock.timer = null;
  renderClocks();
  if (!ui.cpu.on || ui.cpu.over) return;
  const draw = !hasMatingMaterial(cur().state, -c);
  const who = c === 1 ? "las blancas" : "las negras";
  cpuGameOver(draw ? "1/2-1/2" : c === 1 ? "0-1" : "1-0", `Se acabó el tiempo de ${who}${draw ? ", pero el rival no tiene material para dar mate: tablas" : ""}.`);
}

/* Bonificación de cada estilo para una jugada candidata (sólo elige entre jugadas casi igual de buenas) */
function cpuStyleBonus(s, m, style) {
  const pc = m.piece.toLowerCase(), cap = m.captured && m.captured !== "." ? m.captured.toLowerCase() : "";
  const after = Chess.apply(s, m), check = Chess.inCheck(after);
  const ek = Chess.kingSq(s.b, -s.t), ok = Chess.kingSq(s.b, s.t);
  const dist = (a, b) => (a < 0 || b < 0 ? 8 : Math.max(Math.abs((a >> 4) - (b >> 4)), Math.abs((a & 7) - (b & 7))));
  const fwd = s.t === 1 ? (m.from >> 4) - (m.to >> 4) : (m.to >> 4) - (m.from >> 4);
  const castle = m.flag === "castle", center = [3, 4].includes(m.to >> 4) && [2, 3, 4, 5].includes(m.to & 7);
  const backRank = (m.from >> 4) === (s.t === 1 ? 7 : 0);
  const opening = s.full <= 12;
  let v = 0;
  if (style === "aggressive") {
    if (check) v += 3;
    if (cap) v += 1.5 + (PIECE_VAL[cap] < PIECE_VAL[pc] ? 1 : 0);   // también los sacrificios
    v += Math.max(0, 4 - dist(m.to, ek)) * 0.8 - Math.max(0, 4 - dist(m.from, ek)) * 0.4;
    if (fwd > 0) v += 0.6; else if (fwd < 0) v -= 1;
    if (pc === "p" && Math.abs((m.to & 7) - (ek & 7)) <= 2) v += 0.7;
  } else if (style === "positional") {
    if (castle) v += 2.5;
    if (opening && backRank && (pc === "n" || pc === "b")) v += 2;
    if (center) v += 1;
    if (pc === "k" && !castle && Chess.nonPawnCount(s) > 6) v -= 2;
    if (opening && pc === "q") v -= 1;
    if (pc === "p" && [0, 1, 6, 7].includes(m.from & 7) && opening) v -= 1;
    if (check && !cap) v -= 0.5;
  } else if (style === "defensive") {
    if (cap && PIECE_VAL[cap] >= PIECE_VAL[pc] && pc !== "p") v += 2;   // cambiar piezas
    if (castle) v += 2;
    if (fwd < 0) v += 0.8;
    v += Math.max(0, 3 - dist(m.to, ok)) * 0.5;
    if (check && !cap) v -= 1;
    if (pc === "p" && fwd > 0 && Math.abs((m.from & 7) - (ok & 7)) <= 1) v -= 1.5;   // no adelantar los peones del enroque
  }
  return v;
}
/* Elige la jugada de la CPU entre las líneas del motor según el estilo y el nivel */
function cpuPick(s, lines, style, level, rnd = Math.random) {
  const L = Chess.legal(s), me = s.t, cands = [];
  for (const l of lines || []) {
    const u = l && l.pv && l.pv[0];
    if (!u || cands.some(c => c.uci === u)) continue;
    const m = Chess.moveFromUci(s, u, L);
    if (m) cands.push({ uci: u, m, w: me === 1 ? winPct(l) : 100 - winPct(l), mate: l.mate });
  }
  if (!cands.length) return null;
  const best = cands.reduce((a, b) => (b.w > a.w ? b : a));
  if (style === "balanced" || cands.length === 1 || (best.mate != null && best.w >= 100)) return best.uci;
  const weak = (20 - level) / 19;   // 0 en el nivel máximo, 1 en el mínimo
  const tol = ({ aggressive: 7, positional: 6, defensive: 6, human: 4 }[style] || 0) + weak * 14;
  let pick = best, top = -Infinity;
  for (const c of cands) {
    const loss = best.w - c.w;
    if (loss > tol) continue;
    const sc = style === "human" ? rnd() * (2 + weak * 6) - loss * 0.25 : cpuStyleBonus(s, c.m, style) + rnd() * 0.6 - loss * 0.35;
    if (sc > top) { top = sc; pick = c; }
  }
  return pick.uci;
}
function cpuLevelName(level) { const opts = [...$("cpuLevel").options], i = opts.findIndex(o => +o.value === +level); return "nivel " + (i >= 0 ? i + 1 : level); }
function cpuName() { return `CPU ${cpuLevelName(ui.cpu.level)} (${CPU_STYLES[ui.cpu.style].replace(/^\S+ /, "").toLowerCase()})`; }
function cpuThinkMs() {
  const level = ui.cpu.level, base = 250 + level * 70;
  if (!Clock.running) return base;
  const left = clockLeft(ui.cpu.side);
  return Math.round(Math.max(60, Math.min(base, left / 40 + Clock.inc * 0.4)));
}
function maybeCpuMove() {
  if (!ui.cpu.on || ui.cpu.thinking || ui.cpu.over) return;
  const node = cur();
  if (node.state.t !== ui.cpu.side || gameStatus(node).over) return;
  ui.cpu.thinking = true;
  Engine.cancel("live");
  renderStatus(); renderBoard();
  const { level, style } = ui.cpu;
  const styled = style !== "balanced" && Engine.kind === "stockfish";
  Engine.analyse(node, { purpose: "cpu", movetime: cpuThinkMs(), multipv: styled ? 4 : 1, skill: styled ? 20 : level }).then(job => {
    ui.cpu.thinking = false;
    if (!job || !job.best || cur() !== node || !ui.cpu.on || ui.cpu.over) { render(); return; }
    if (job.lines[0]) ui.cpu.lastEval = job.lines[0];
    const u = styled ? cpuPick(node.state, job.lines, style, level) || job.best : job.best;
    const m = Chess.moveFromUci(node.state, u);
    if (m) playMove(m, "cpu"); else render();
  });
}
/* Tras cada jugada de la partida contra la CPU: reloj, final de la partida y respuesta de la CPU */
function cpuAfterMove(child, who) {
  if (!clockPress(child.parent.state.t)) return;
  const st = gameStatus(child);
  if (st.over) { cpuGameOver(st.result, st.text); return; }
  cpuPanel();
  if (who === "user") setTimeout(maybeCpuMove, 60);
}
function openCpuDialog(blind) {
  if (ui.cpu.on) { stopCpu(false); return; }
  $("cpuLevel").value = String(settings.cpuLevel);
  if ($("cpuLevel").selectedIndex < 0) $("cpuLevel").value = "8";
  $("cpuStyle").value = settings.cpuStyle in CPU_STYLES ? settings.cpuStyle : "balanced";
  $("cpuClock").value = settings.cpuClock;
  if ($("cpuClock").selectedIndex < 0) $("cpuClock").value = "";
  $("cpuColor").value = settings.cpuColor;
  if ($("cpuColor").selectedIndex < 0) $("cpuColor").value = "board";
  $("cpuFrom").value = editor.active ? "here" : settings.cpuFrom;
  $("cpuBlind").checked = blind != null ? blind : ui.blind;
  openModal("cpuModal");
}
function startCpuGame(opts = {}) {
  if (Batch.running) { toast("El motor está analizando tus partidas de la biblioteca: espera a que termine o detenlo en «📊 Estadísticas»."); return false; }
  Object.assign(settings, { cpuLevel: +$("cpuLevel").value, cpuStyle: $("cpuStyle").value, cpuClock: $("cpuClock").value, cpuColor: $("cpuColor").value, cpuFrom: $("cpuFrom").value });
  saveSettings();
  if (editor.active && settings.cpuFrom === "here" && !applyEditor()) return false;
  if (settings.cpuFrom === "new") {
    if (!confirmLeave()) return false;
    leaveModes();
    setGame(Pgn.newGame(), { name: "", noConfirm: true });
  } else leaveModes();
  if (gameStatus(cur()).over) { toast("La partida ya ha terminado en esta posición."); return false; }
  closeModals();
  const c = settings.cpuColor;
  const user = opts.color || (c === "r" ? (Math.random() < 0.5 ? 1 : -1) : c === "board" ? (ui.flipped ? -1 : 1) : +c);
  ui.flipped = user === -1;
  const tc = parseTc(settings.cpuClock);
  Object.assign(ui.cpu, { on: true, side: -user, thinking: false, over: false, level: settings.cpuLevel, style: settings.cpuStyle, tc: settings.cpuClock, prevLive: settings.live, startNode: cur(), lastEval: null, blind: $("cpuBlind").checked });
  settings.live = false;
  if (!game.root.children.length && game.headers.Event === "Estudio") {
    const d = new Date();
    Object.assign(game.headers, {
      Event: "Partida contra la CPU", Date: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
      White: user === 1 ? "Tú" : cpuName(), Black: user === 1 ? cpuName() : "Tú"
    });
    if (tc) game.headers.TimeControl = `${tc.base / 1000}+${tc.inc / 1000}`;
    syncHeaderForm();
  }
  if (ui.cpu.blind !== !!ui.blind) setBlind(ui.cpu.blind);
  if (tc) clockStart(tc); else { clockStop(); Clock.shown = false; renderClocks(); }
  toast(`Juegas con ${user === 1 ? "blancas" : "negras"} contra la CPU (${cpuLevelName(ui.cpu.level)}, ${CPU_STYLES[ui.cpu.style]}${tc ? `, ${settings.cpuClock}` : ""}).`, 3500);
  render();
  cpuPanel();
  maybeCpuMove();
  return true;
}
function stopCpu(silent) {
  if (!ui.cpu.on) return;
  ui.cpu.on = false;
  ui.cpu.thinking = false;
  settings.live = ui.cpu.prevLive;
  Engine.cancel("cpu");
  clockStop();
  Clock.shown = false;
  renderClocks();
  if (ui.cpu.blind && ui.blind) setBlind(false);
  $("cpuBox").hidden = true;
  if (!silent) { toast("Partida contra la CPU terminada."); render(); }
}
function cpuGameOver(result, text) {
  const user = -ui.cpu.side;
  ui.cpu.over = true;
  ui.cpu.on = false;
  ui.cpu.thinking = false;
  settings.live = ui.cpu.prevLive;
  Engine.cancel("cpu");
  clockStop();
  game.headers.Result = result;
  syncHeaderForm();
  markDirty();
  if (ui.cpu.blind && ui.blind) setBlind(false);
  const sc = scoreOf(result, user);
  Sound.play("end");
  cpuPanel(sc === 1 ? "🏆 ¡Has ganado!" : sc === 0 ? "❌ Has perdido." : "🟰 Tablas.", text);
  render();
}
function cpuUndo() {
  if (Clock.running) return;
  const user = -ui.cpu.side, path = Pgn.pathTo(cur()), start = path.indexOf(ui.cpu.startNode);
  let i = path.length - 2;
  while (i >= 0 && path[i].state.t !== user) i--;
  if (i < 0 || i < start) { toast("No hay jugadas tuyas que deshacer."); return; }
  Engine.cancel("cpu");
  ui.cpu.thinking = false;
  game.current = path[i];
  ui.selected = null;
  render();
  cpuPanel();
}
function cpuOfferDraw() {
  const l = ui.cpu.lastEval, plies = Pgn.pathTo(cur()).length - Pgn.pathTo(ui.cpu.startNode).length;
  const w = l ? (ui.cpu.side === 1 ? winPct(l) : 100 - winPct(l)) : 100;
  if (plies >= 20 && w <= 56) cpuGameOver("1/2-1/2", "La CPU acepta las tablas.");
  else toast(plies < 20 ? "La CPU rechaza las tablas: es pronto para eso." : "La CPU rechaza las tablas: cree que va mejor.", 3200);
}
function cpuPanel(head, text) {
  const box = $("cpuBox");
  const desc = `${cpuLevelName(ui.cpu.level)} · ${CPU_STYLES[ui.cpu.style]}${ui.cpu.tc ? ` · ⏱ ${ui.cpu.tc}` : ""}${ui.cpu.blind ? " · 🙈 a ciegas" : ""}`;
  box.hidden = false;
  if (ui.cpu.over || head) {
    box.innerHTML = `<div class="retry-head">🏁 ${esc(head || "Partida terminada")}</div><div>${esc(text || "")} <span class="small">(CPU ${esc(desc)})</span></div>
      <div class="controls"><button class="sm-btn primary" data-c="analyse">🤖 Analizar la partida</button><button class="sm-btn" data-c="save">💾 Guardar</button><button class="sm-btn info-btn" data-c="rematch">🔁 Revancha</button><button class="sm-btn" data-c="close">Cerrar</button></div>`;
  } else {
    box.innerHTML = `<div class="retry-head">🤖 Partida contra la CPU</div><div class="small">${esc(desc)}</div>
      <div class="controls">${ui.cpu.tc ? "" : `<button class="sm-btn" data-c="undo" title="Deshace tu última jugada y la respuesta de la CPU">↶ Deshacer</button>`}<button class="sm-btn" data-c="draw">½ Ofrecer tablas</button><button class="sm-btn danger" data-c="resign">🏳 Rendirse</button><button class="sm-btn" data-c="stop" title="Deja la partida sin resultado y vuelve al análisis">⏹ Terminar</button></div>`;
  }
  box.querySelectorAll("[data-c]").forEach(b => b.onclick = () => cpuAction(b.dataset.c));
}
function cpuAction(a) {
  if (a === "undo") cpuUndo();
  else if (a === "draw") cpuOfferDraw();
  else if (a === "resign") { if (confirm("¿Seguro que quieres rendirte?")) cpuGameOver(ui.cpu.side === 1 ? "1-0" : "0-1", "Te has rendido."); }
  else if (a === "stop") stopCpu(false);
  else if (a === "analyse") { $("cpuBox").hidden = true; switchTab("study"); analyseGame(); }
  else if (a === "save") saveToLibrary({});
  else if (a === "close") { $("cpuBox").hidden = true; Clock.shown = false; renderClocks(); }
  else if (a === "rematch") {
    const prev = -ui.cpu.side;
    $("cpuLevel").value = String(ui.cpu.level); $("cpuStyle").value = ui.cpu.style; $("cpuClock").value = ui.cpu.tc || ""; $("cpuFrom").value = "new"; $("cpuBlind").checked = ui.cpu.blind;
    startCpuGame({ color: -prev });
  }
}

/* ---------- 20b. «Adivina la jugada»: reproduce una partida acertando las jugadas de un bando ---------- */
const Guess = { active: false, busy: false, state: "", side: 1, line: [], i: 0, total: 0, pts: 0, ref: 0, max: 0, hits: 0, n: 0, last: "", hint: false, hintSq: -1, bestJob: null, title: "", result: "*" };
const GUESS_WORDS = ["un error", "floja", "dudosa", "buena", "muy buena", "excelente"];
/* Puntos (0-5) según lo que se pierde, en probabilidad de ganar, respecto a la mejor jugada del motor */
function guessPoints(loss) {
  for (const [lim, p] of [[2, 5], [5, 4], [10, 3], [18, 2], [30, 1]]) if (loss <= lim) return p;
  return 0;
}
const guessMs = () => Math.max(600, Math.min(2500, +settings.analysisMs));
function guessSource(kind) {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  if (kind === "board") {
    if (!game.root.children.length) { toast("Carga antes una partida en el tablero (o elige una clásica)."); return null; }
    const line = Pgn.mainlineFrom(game.root);
    let start = Pgn.isMainline(cur()) ? Pgn.pathTo(cur()).length - 1 : 0;
    if (start >= line.length - 1) start = 0;
    return { game, start, side: ui.flipped ? -1 : 1, title: $("gameName").value.trim() || defaultTitle(game.headers) };
  }
  if (kind === "classic") {
    const parts = Pgn.splitGames(SAMPLE_MULTI_PGN), g = Pgn.parseGame(pick(parts), { lang: "auto" }).game;
    return { game: g, start: 0, side: g.headers.Result === "0-1" ? -1 : 1, title: defaultTitle(g.headers) };
  }
  const recs = [...Lib.games.values()].filter(r => r.pgn), names = myNameList();
  const mine = recs.filter(r => colorOfMe(r, names));
  const pool = mine.length ? mine : recs;
  if (!pool.length) { toast("Tu biblioteca está vacía: guarda antes alguna partida (o descárgalas de Lichess)."); return null; }
  const rec = pick(pool), g = Pgn.parseGame(rec.pgn, { lang: "en" }).game;
  return { game: g, start: 0, side: colorOfMe(rec, names) || 1, title: rec.title || defaultTitle(g.headers) };
}
function startGuess() {
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  const src = guessSource($("guessSource").value);
  if (!src) return;
  const sel = $("guessSide").value, side = sel === "auto" ? src.side : +sel;
  const line = Pgn.mainlineFrom(src.game.root);
  const total = line.slice(src.start).filter(n => n.parent.state.t === side).length;
  if (!total) { toast("No quedan jugadas de ese bando que adivinar."); return; }
  if (!stashBoard()) return;
  leaveModes();
  const g = Pgn.newGame(Chess.toFen(src.game.root.state));
  g.headers = Object.assign({}, src.game.headers, { Result: "*" });
  let node = g.root;
  for (let k = 0; k < src.start; k++) node = Pgn.addMove(node, line[k].move);
  ui.flipped = side === -1;
  setGame(g, { noConfirm: true, current: node, name: "🔮 " + src.title });
  Object.assign(Guess, { active: true, busy: false, state: "", side, line, i: src.start, total, pts: 0, ref: 0, max: 0, hits: 0, n: 0, last: "", hint: false, hintSq: -1, title: src.title, result: src.game.headers.Result || "*" });
  $("guessBadge").textContent = "Activo";
  $("guessBadge").className = "srs-pill ok";
  guessAdvance();
  setTimeout(() => { const r = $("boardWrap").getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) $("topBar").scrollIntoView({ block: "start", behavior: "smooth" }); }, 40);
}
function guessPlay(srcNode) {
  const child = Pgn.addMove(cur(), srcNode.move);
  game.current = child;
  Guess.i++;
  soundFor(child);
  return child;
}
/* Juega las respuestas del rival hasta que le toca al bando que adivinas */
function guessAdvance() {
  if (!Guess.active) return;
  const next = Guess.line[Guess.i];
  if (!next) { guessFinish(); return; }
  if (next.parent.state.t !== Guess.side) {
    Guess.busy = true;
    Guess.state = "reply";
    render(); guessPanel();
    setTimeout(() => {
      if (!Guess.active || Guess.state !== "reply") return;
      guessPlay(next);
      Guess.busy = false;
      guessAdvance();
    }, 600);
    return;
  }
  Object.assign(Guess, { state: "ask", busy: false, hint: false, hintSq: -1 });
  Guess.bestJob = Engine.analyse(cur(), { purpose: "guess", movetime: guessMs(), multipv: 1 });
  render(); guessPanel();
}
async function guessResolve(move) {
  if (!Guess.active || Guess.state !== "ask" || Guess.busy) return;
  const p = cur(), real = Guess.line[Guess.i];
  if (!real || p.state.t !== Guess.side) return;
  Guess.busy = true;
  Guess.state = "checking";
  Guess.hintSq = -1;
  renderBoard(); guessPanel();
  const L = Chess.legal(p.state), mover = p.state.t;
  const sanOf = uci => { const m = Chess.moveFromUci(p.state, uci, L); return m ? formatSan(Chess.san(p.state, m, L), settings.lang, mover) : uci; };
  const u = move ? Chess.uci(move) : null;
  let job = await Guess.bestJob;
  if (!Guess.active) return;
  if (!job || !job.lines || !job.lines[0]) job = await Engine.analyse(p, { purpose: "guess", movetime: guessMs(), multipv: 1 });
  if (!Guess.active) return;
  const l0 = job && job.lines && job.lines[0], best = job && (job.best || (l0 && l0.pv[0]));
  const bestEv = l0 ? { cp: l0.cp, mate: l0.mate, winner: l0.winner } : null;
  const w = ev => (mover === 1 ? winPct(ev) : 100 - winPct(ev));
  const evalOf = async uci => {
    if (!bestEv) return null;
    if (uci === best) return bestEv;
    const m = Chess.moveFromUci(p.state, uci, L);
    const fake = { parent: p, uci, state: Chess.apply(p.state, m) };
    const t = terminalEval(fake);
    if (t) return t;
    const j = await Engine.analyse(fake, { purpose: "guess", movetime: guessMs(), multipv: 1 });
    const l = j && j.lines && j.lines[0];
    return l ? { cp: l.cp, mate: l.mate, winner: l.winner } : null;
  };
  const same = u === real.uci;
  const evU = u ? await evalOf(u) : null;
  if (!Guess.active) return;
  const evR = same ? evU : await evalOf(real.uci);
  if (!Guess.active) return;
  const pointsOf = ev => (!bestEv ? 0 : ev ? guessPoints(Math.max(0, w(bestEv) - w(ev))) : 0);
  let pu = u ? (bestEv ? pointsOf(evU) : same ? 5 : 0) : 0;
  const pr = bestEv ? pointsOf(evR) : 5;
  if (Guess.hint) pu = Math.min(pu, 3);
  Object.assign(Guess, { pts: Guess.pts + pu, ref: Guess.ref + pr, max: Guess.max + 5, n: Guess.n + 1, hits: Guess.hits + (same ? 1 : 0) });
  const realSan = formatSan(real.san, settings.lang, mover), num = numPrefix(p.state);
  const engineNote = best && best !== real.uci && best !== u ? ` · el motor prefería <b>${esc(sanOf(best))}</b>` : "";
  if (!u) Guess.last = `👁 En la partida se jugó <b>${esc(num + realSan)}</b> (${pr}/5)${engineNote}.`;
  else if (same) Guess.last = `✔ <b>¡Como en la partida!</b> ${esc(num + realSan)}: ${pu}/5, ${GUESS_WORDS[pu]}${engineNote}.`;
  else Guess.last = `Tú: <b>${esc(num + sanOf(u))}</b> → ${pu}/5 (${GUESS_WORDS[pu]}) · partida: <b>${esc(realSan)}</b> → ${pr}/5${engineNote}.`;
  Sound.play(pu >= 4 ? "ok" : pu <= 1 ? "error" : "move");
  // La partida resultante guarda tus intentos: la jugada real como principal y la tuya como variante
  const child = guessPlay(real);
  child.comment = !u ? `🔮 Vista sin adivinar (${pr}/5).` : same ? `🔮 Acertada: ${pu}/5.` : `🔮 Tú: ${sanOf(u)} (${pu}/5) · partida: ${pr}/5.`;
  if (best && best !== real.uci && best !== u) child.comment += ` Motor: ${sanOf(best)}.`;
  if (u && !same) Pgn.addMove(p, move).comment = `Tu jugada: ${pu}/5.`;
  Guess.busy = false;
  guessAdvance();
}
function guessPanel() {
  const box = $("guessBox");
  box.hidden = false;
  if (!Guess.active) return;
  const h = game.headers, side = Guess.side === 1 ? "blancas" : "negras", player = (Guess.side === 1 ? h.White : h.Black) || "Partida";
  let html = `<div class="retry-head">🔮 Adivina la jugada · ${esc(Guess.title)}</div>
    <div class="guess-score"><span>Tú: <b>${Guess.pts}</b>/${Guess.max}</span><span>${esc(player)}: <b>${Guess.ref}</b>/${Guess.max}</span><span>Coincidencias: <b>${Guess.hits}</b>/${Guess.n}</span><span>Jugada ${Math.min(Guess.n + 1, Guess.total)} de ${Guess.total}</span></div>`;
  if (Guess.last) html += `<div class="retry-msg">${Guess.last}</div>`;
  if (Guess.state === "ask") html += `<div class="retry-q">¿Qué jugaron las ${side}? Haz la jugada en el tablero.</div>`;
  if (Guess.state === "checking") html += `<div class="small">⏳ El motor está puntuando la jugada…</div>`;
  if (Guess.state === "reply") html += `<div class="small">Responden las ${Guess.side === 1 ? "negras" : "blancas"}…</div>`;
  html += `<div class="controls">${Guess.state === "ask" ? `<button class="sm-btn" data-g="hint" title="Marca la pieza que se movió (esta jugada valdrá como mucho 3 puntos)">💡 Pista</button><button class="sm-btn" data-g="show" title="Ver la jugada de la partida (0 puntos)">👁 Ver la jugada</button>` : ""}<button class="sm-btn danger" data-g="end">⏹ Terminar</button></div>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-g]").forEach(b => b.onclick = () => guessAction(b.dataset.g));
}
function guessAction(a) {
  if (a === "end") { guessFinish(); return; }
  if (Guess.state !== "ask" || Guess.busy) return;
  if (a === "show") guessResolve(null);
  else if (a === "hint") {
    const real = Guess.line[Guess.i];
    Guess.hint = true;
    Guess.hintSq = real.move.from;
    Guess.last = "💡 La pieza que se movió en la partida está marcada en azul (esta jugada vale como mucho 3 puntos).";
    renderBoard(); guessPanel();
  }
}
function guessStop() {
  Guess.active = false;
  Guess.busy = false;
  Guess.hintSq = -1;
  Engine.cancel("guess");
  $("guessBadge").textContent = "Inactivo";
  $("guessBadge").className = "srs-pill";
}
function guessFinish() {
  if (!Guess.active) return;
  const complete = Guess.i >= Guess.line.length;
  guessStop();
  const pct = x => (Guess.max ? Math.round((x / Guess.max) * 100) : 0);
  const h = game.headers, player = (Guess.side === 1 ? h.White : h.Black) || "el jugador";
  if (complete) h.Result = Guess.result;
  const summary = `🔮 Adivina la jugada (${Guess.side === 1 ? "blancas" : "negras"}): ${Guess.pts}/${Guess.max} puntos (${pct(Guess.pts)} %); ${player}: ${Guess.ref}/${Guess.max} (${pct(Guess.ref)} %); coincidencias ${Guess.hits} de ${Guess.n}.`;
  if (Guess.n) game.root.comment = summary;
  const verdict = !Guess.n ? "No has adivinado ninguna jugada."
    : Guess.pts > Guess.ref ? "🏆 ¡Has jugado mejor que el jugador de la partida, según el motor!"
    : Guess.pts === Guess.ref ? "🤝 Has jugado igual de bien que el jugador de la partida."
    : pct(Guess.pts) >= 80 ? "👍 Muy buen nivel: tus jugadas son casi tan buenas como las de la partida."
    : pct(Guess.pts) >= 60 ? "Bien: revisa las jugadas con pocos puntos en la lista (tus intentos quedan como variantes)." : "Repasa las jugadas con pocos puntos: tus intentos quedan como variantes en la lista.";
  const box = $("guessBox");
  box.hidden = false;
  box.innerHTML = `<div class="retry-head">🏁 ${complete ? "Partida terminada" : "Adivina la jugada: terminado"}</div>
    <div class="guess-score"><span>Tú: <b>${Guess.pts}</b>/${Guess.max} (${pct(Guess.pts)} %)</span><span>${esc(player)}: <b>${Guess.ref}</b>/${Guess.max} (${pct(Guess.ref)} %)</span><span>Coincidencias: <b>${Guess.hits}</b>/${Guess.n}</span></div>
    <div class="retry-msg">${verdict}</div>
    <div class="controls"><button class="sm-btn primary" data-g="again">🔁 Otra partida</button>${Cards.stash ? `<button class="sm-btn" data-g="back">↩ Volver a tu partida</button>` : ""}<button class="sm-btn" data-g="close">Cerrar</button></div>`;
  box.querySelector("[data-g=again]").onclick = startGuess;
  const bk = box.querySelector("[data-g=back]");
  if (bk) bk.onclick = () => { box.hidden = true; restoreStash(); };
  box.querySelector("[data-g=close]").onclick = () => { box.hidden = true; };
  render();
}

/* ---------- 20c. A ciegas y visualización ---------- */
function setBlind(on) {
  ui.blind = !!on;
  ui.peek = false;
  $("blindBtn").textContent = ui.blind ? "👁 Mostrar piezas" : "🙈 Ocultar piezas";
  $("peekBtn").hidden = !ui.blind;
  $("blindBadge").textContent = ui.blind ? "Piezas ocultas" : "Piezas visibles";
  $("blindBadge").className = "srs-pill" + (ui.blind ? " ok" : "");
  renderBoard();
  renderStatus();
}
function peekPieces() {
  if (!ui.blind) return;
  ui.peek = true;
  ui.peeks = (ui.peeks || 0) + 1;
  renderBoard();
  clearTimeout(ui.peekTimer);
  ui.peekTimer = setTimeout(() => { ui.peek = false; renderBoard(); }, 2000);
}
const Vis = { active: false, mode: "", state: "", n: 0, ok: 0, bad: 0, total: 0, q: null, t0: 0, end: 0, timer: null, msg: "", marks: {}, plies: 4 };
let VIS_CLASSICS = null;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const randomSq = () => { const d = Math.floor(Math.random() * 64); return (d >> 3) * 16 + (d & 7); };
const pieceText = p => (p === "." ? "nada (vacía)" : PIECE_LABEL[p]);
/* Sigue cada pieza desde su casilla de partida a lo largo de las jugadas y prepara la pregunta */
function visQuestion(P, moves) {
  const loc = new Map(), promoted = new Set();
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (P.b[i] !== ".") loc.set(i, i); }
  const find = sq => { for (const [k, v] of loc) if (v === sq) return k; return null; };
  let s = P;
  for (const m of moves) {
    const capSq = m.flag === "ep" ? m.to + 16 * s.t : m.to;
    if (s.b[capSq] !== ".") { const v = find(capSq); if (v != null) loc.delete(v); }
    const k = find(m.from);
    if (k != null) { loc.set(k, m.to); if (m.promotion) promoted.add(k); }
    if (m.flag === "castle") {
      const row = m.from & 0x70, [rf, rt] = m.to > m.from ? [row + 7, row + 5] : [row, row + 3], rk = find(rf);
      if (rk != null) loc.set(rk, rt);
    }
    s = Chess.apply(s, m);
  }
  const moved = [...loc].filter(([k, v]) => k !== v && !promoted.has(k));
  const changed = [];
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (P.b[i] !== s.b[i]) changed.push(i); }
  if (moved.length && (Math.random() < 0.6 || !changed.length)) {
    const [k, v] = moved[Math.floor(Math.random() * moved.length)];
    return { type: "where", piece: P.b[k], from: k, answer: v, F: s };
  }
  if (!changed.length) return null;
  const sq = changed[Math.floor(Math.random() * changed.length)], ans = s.b[sq];
  const others = shuffle([...new Set([P.b[sq], ".", ...moves.map(m => m.piece), ...moves.map(m => m.captured || ".")])].filter(x => x && x !== ans)).slice(0, 3);
  return { type: "what", sq, answer: ans, choices: shuffle([ans, ...others]), F: s };
}
function visLineQuestion(plies) {
  if (!VIS_CLASSICS) VIS_CLASSICS = Pgn.splitGames(SAMPLE_MULTI_PGN).map(t => ({ t, lang: "auto" }));
  const pool = VIS_CLASSICS.concat(Lib.ready ? [...Lib.games.values()].filter(r => r.pgn).map(r => ({ t: r.pgn, lang: "en", title: r.title })) : []);
  for (let tries = 0; tries < 40; tries++) {
    const it = pool[Math.floor(Math.random() * pool.length)];
    let g;
    try { g = Pgn.parseGame(it.t, { lang: it.lang }).game; } catch { continue; }
    const line = Pgn.mainlineFrom(g.root);
    if (line.length < plies + 6) continue;
    const start = 4 + Math.floor(Math.random() * (line.length - plies - 3));
    const P = line[start - 1].state, seq = line.slice(start, start + plies);
    const q = visQuestion(P, seq.map(n => n.move));
    if (q) return Object.assign(q, { P, seq, after: line[start - 1], title: it.title || defaultTitle(g.headers) });
  }
  return null;
}
function startVis() {
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  const mode = $("visMode").value;
  if (mode === "line" && !stashBoard()) return;
  leaveModes();
  Object.assign(Vis, { active: true, mode, state: "", n: 0, ok: 0, bad: 0, total: mode === "line" ? 10 : mode === "color" ? 20 : 0, q: null, t0: Date.now(), msg: "", marks: {}, plies: +$("visPlies").value });
  clearInterval(Vis.timer);
  if (mode === "coords") { Vis.end = Date.now() + 30000; Vis.timer = setInterval(visTick, 200); }
  visNext();
  setTimeout(() => { const r = $("boardWrap").getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) $("topBar").scrollIntoView({ block: "start", behavior: "smooth" }); }, 40);
}
function visNext() {
  if (!Vis.active) return;
  if (Vis.total && Vis.n >= Vis.total) { visFinish(); return; }
  Vis.marks = {};
  Vis.state = "ask";
  if (Vis.mode === "line") {
    const q = visLineQuestion(Vis.plies);
    if (!q) { toast("No hay partidas lo bastante largas para este ejercicio."); visFinish(); return; }
    Vis.q = q;
    const g = Pgn.newGame(Chess.toFen(q.P));
    g.headers.Event = "Ejercicio";
    let n = g.root;
    for (const x of q.seq) n = Pgn.addMove(n, x.move);
    ui.flipped = q.P.t === -1;
    setGame(g, { noConfirm: true, keepVis: true, name: "🙈 Visualización" });
  } else {
    let sq;
    do sq = randomSq(); while (Vis.q && sq === Vis.q.sq);
    Vis.q = { sq };
    renderBoard(); renderStatus();
  }
  visPanel();
}
function visTick() {
  if (!Vis.active || Vis.mode !== "coords") return;
  if (Date.now() >= Vis.end) { visFinish(); return; }
  const el = $("visClock");
  if (el) el.textContent = Math.ceil((Vis.end - Date.now()) / 1000) + " s";
}
function visPanel() {
  const box = $("visBox");
  box.hidden = false;
  const q = Vis.q;
  let html = "";
  if (Vis.mode === "line") {
    const lineTxt = lineText(q.P, q.seq.map(n => n.uci), Vis.plies);
    const ask = q.type === "where"
      ? `¿Dónde está ahora ${PIECE_ART[q.piece.toLowerCase()]} ${PIECE_LABEL[q.piece].split(" ")[1]} que estaba en <b>${Chess.sqName(q.from)}</b>? Pulsa su casilla.`
      : `¿Qué hay ahora en <b>${Chess.sqName(q.sq)}</b>?`;
    html = `<div class="retry-head">🙈 Sigue la línea · ${Vis.state === "answered" ? Vis.n : Vis.n + 1} de ${Vis.total} · aciertos ${Vis.ok}</div>
      <div class="small">${esc(q.title)} · ${q.after.parent ? `tras ${esc(numPrefix(q.after.parent.state) + dispSan(q.after))}` : "posición inicial"}. Imagina estas jugadas sin mover las piezas:</div>
      <div class="vis-line">${esc(lineTxt)}</div>`;
    if (Vis.state === "ask") {
      html += `<div class="retry-q">${ask}</div>`;
      if (q.type === "what") html += `<div class="vis-choices">${q.choices.map(c => `<button class="sm-btn" data-v="${c}">${c === "." ? "∅" : glyphUnicode[c]} ${esc(pieceText(c))}</button>`).join("")}</div>`;
    }
  } else if (Vis.mode === "color") {
    html = `<div class="retry-head">🙈 Color de las casillas · ${Vis.n + 1} de ${Vis.total} · aciertos ${Vis.ok}</div>
      <div class="vis-big">${Chess.sqName(q.sq)}</div>
      <div class="vis-choices" style="justify-content:center"><button class="sm-btn" data-v="l">⬜ Clara</button><button class="sm-btn" data-v="d">⬛ Oscura</button></div>`;
  } else {
    html = `<div class="retry-head">🙈 Encuentra la casilla · ⏱ <span id="visClock">${Math.ceil((Vis.end - Date.now()) / 1000)} s</span> · ✔ ${Vis.ok} ✖ ${Vis.bad}</div>
      <div class="vis-big">${Chess.sqName(q.sq)}</div><div class="small" style="text-align:center">Pulsa esa casilla en el tablero (${ui.flipped ? "negras" : "blancas"} abajo).</div>`;
  }
  if (Vis.msg) html += `<div class="retry-msg">${Vis.msg}</div>`;
  html += `<div class="controls">${Vis.state === "answered" ? `<button class="sm-btn primary" data-v="next">${Vis.n >= Vis.total ? "Ver resultado ▶" : "Siguiente ▶"}</button>` : ""}<button class="sm-btn danger" data-v="end">⏹ Terminar</button></div>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-v]").forEach(b => b.onclick = () => visAnswer(b.dataset.v));
}
/* Respuestas: casilla pulsada en el tablero (número) o botón (pieza, «l»/«d», next, end) */
function visAnswer(v) {
  if (!Vis.active) return;
  if (v === "end") { visFinish(); return; }
  if (v === "next") { visNext(); return; }
  if (Vis.state !== "ask") return;
  const q = Vis.q, sqName = Chess.sqName;
  if (Vis.mode === "coords") {
    if (typeof v !== "number") return;
    const ok = v === q.sq;
    if (ok) Vis.ok++; else Vis.bad++;
    Sound.play(ok ? "move" : "error");
    Vis.msg = ok ? "" : `✖ Eso era ${sqName(v)}; ${sqName(q.sq)} está marcada en verde.`;
    visNext();
    Vis.marks = ok ? { ok: v } : { ok: q.sq, bad: v };
    renderBoard();
    clearTimeout(Vis.markTimer);
    Vis.markTimer = setTimeout(() => { Vis.marks = {}; renderBoard(); }, 450);
    return;
  }
  let ok, txt;
  if (Vis.mode === "color") {
    if (v !== "l" && v !== "d") return;
    const light = ((q.sq >> 4) + (q.sq & 7)) % 2 === 0;
    ok = (v === "l") === light;
    txt = `${sqName(q.sq)} es ${light ? "clara" : "oscura"}.`;
    Vis.n++;
    if (ok) Vis.ok++; else Vis.bad++;
    Vis.msg = (ok ? "✔ " : "✖ ") + txt;
    Sound.play(ok ? "move" : "error");
    visNext();
    return;
  }
  if (q.type === "where") {
    if (typeof v !== "number") return;
    ok = v === q.answer;
    Vis.marks = ok ? { ok: v } : { ok: q.answer, bad: v };
    txt = `${cap(PIECE_ART[q.piece.toLowerCase()])} está en <b>${sqName(q.answer)}</b>.`;
  } else {
    if (typeof v === "number") return;
    ok = v === q.answer;
    Vis.marks = { ok: q.sq };
    txt = `En ${sqName(q.sq)} hay ${esc(pieceText(q.answer))}.`;
  }
  Vis.n++;
  if (ok) Vis.ok++; else Vis.bad++;
  Vis.state = "answered";
  Vis.msg = (ok ? "✔ <b>¡Correcto!</b> " : "❌ No. ") + txt + " El tablero muestra ahora la posición final.";
  Sound.play(ok ? "ok" : "error");
  goTo(Pgn.mainlineFrom(game.root).pop());
  visPanel();
}
function visStop(silent) {
  clearInterval(Vis.timer);
  clearTimeout(Vis.markTimer);
  Vis.timer = null;
  Vis.active = false;
  Vis.marks = {};
  if (!silent) renderBoard();
}
function visFinish() {
  if (!Vis.active) return;
  const mode = Vis.mode, secs = Math.round((Date.now() - Vis.t0) / 1000);
  visStop(false);
  let res;
  if (mode === "coords") {
    const recs = LS.get("ajedrezVisRecords", {}), key = "coords" + (ui.flipped ? "B" : "W"), prev = recs[key] || 0;
    if (Vis.ok > prev) { recs[key] = Vis.ok; LS.set("ajedrezVisRecords", recs); }
    res = `${Vis.ok} casilla${Vis.ok === 1 ? "" : "s"} en 30 s${Vis.bad ? ` (${Vis.bad} fallo${Vis.bad === 1 ? "" : "s"})` : ""}. ${Vis.ok > prev ? "🏆 ¡Nuevo récord!" : `Tu récord con las ${ui.flipped ? "negras" : "blancas"} abajo: ${prev}.`}`;
  } else if (mode === "color") res = `${Vis.ok} de ${Vis.n} aciertos en ${secs} s.`;
  else res = `${Vis.ok} de ${Vis.n} aciertos con líneas de ${Vis.plies} medias jugadas.`;
  const box = $("visBox");
  box.hidden = false;
  box.innerHTML = `<div class="retry-head">🏁 Visualización terminada</div><div>${res}</div>
    <div class="controls"><button class="sm-btn primary" data-v="again">🔁 Otra vez</button>${mode === "line" && Cards.stash ? `<button class="sm-btn" data-v="back">↩ Volver a tu partida</button>` : ""}<button class="sm-btn" data-v="close">Cerrar</button></div>`;
  box.querySelector("[data-v=again]").onclick = () => { $("visMode").value = mode; startVis(); };
  const bk = box.querySelector("[data-v=back]");
  if (bk) bk.onclick = () => { box.hidden = true; restoreStash(); };
  box.querySelector("[data-v=close]").onclick = () => { box.hidden = true; };
  render();
}

/* ---------- 21a. Consultas a Lichess: de una en una y respetando sus pausas ----------
   Lichess pide hacer una sola petición a la vez y esperar un minuto entero tras una respuesta 429. */
const Lichess = {
  chain: Promise.resolve(), blockedUntil: 0,
  waitSeconds() { return Math.max(0, Math.ceil((this.blockedUntil - Date.now()) / 1000)); },
  fetch(url, opts = {}) {
    const run = async () => {
      if (opts.signal && opts.signal.aborted) throw new DOMException("Consulta cancelada", "AbortError");
      const wait = this.waitSeconds();
      if (wait > 0) { const e = Error(`Lichess pide esperar: inténtalo de nuevo en ${wait} s.`); e.status = 429; throw e; }
      const res = await fetch(url, opts);
      if (res.status === 429) this.blockedUntil = Date.now() + 61000;
      return res;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
};

/* ---------- 21. Explorador de aperturas ---------- */
const explorerCache = new Map();
const refreshExplorer = debounce(() => fetchExplorer(), 260);
const authHeaders = () => (settings.token ? { Authorization: "Bearer " + settings.token } : {});
function wdlBar(w, d, b) {
  const total = w + d + b || 1;
  const wp = Math.round(w / total * 100), dp = Math.round(d / total * 100), bp = 100 - wp - dp;
  return `<div class="wdl-bar" title="Blancas ${wp}% · Tablas ${dp}% · Negras ${bp}%"><div class="wdl-w" style="width:${wp}%">${wp > 14 ? wp + "%" : ""}</div><div class="wdl-d" style="width:${dp}%">${dp > 14 ? dp + "%" : ""}</div><div class="wdl-b" style="width:${bp}%">${bp > 14 ? bp + "%" : ""}</div></div>`;
}
function explorerMoveRows(node, rows) {
  const tbody = $("explorerMovesBody");
  tbody.innerHTML = "";
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="4" class="small">No hay partidas registradas en esta posición.</td></tr>`; return; }
  for (const m of rows) {
    const tr = document.createElement("tr");
    const total = m.white + m.draws + m.black;
    tr.innerHTML = `<td><b>${esc(formatSan(m.san, settings.lang, node.state.t))}</b></td><td class="num">${total.toLocaleString("es-ES")}</td><td>${wdlBar(m.white, m.draws, m.black)}</td><td class="num hide-sm">${m.averageRating || "—"}</td>`;
    tr.onclick = () => {
      if (cur() !== node || !canUserMove()) return;
      try { playMove(Chess.parseMove(node.state, m.san, "en").move, "user"); } catch {}
    };
    tbody.append(tr);
  }
}
async function fetchExplorer() {
  if (ui.activeTab !== "explorer") return;
  const node = cur();
  const db = $("explorerDbSelect").value;
  if (db === "local") { renderLocalExplorer(node); return; }
  const fen = Chess.toFen(node.state);
  const url = db === "masters"
    ? `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&moves=12&topGames=8`
    : `https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1800,2000,2200,2500&fen=${encodeURIComponent(fen)}&moves=12&topGames=8&recentGames=0`;
  const tbody = $("explorerMovesBody"), gbody = $("explorerGamesBody");
  if (!settings.token) {
    $("explorerHint").textContent = "Lichess pide ahora un token personal gratuito para consultar su explorador.";
    $("explorerOpening").textContent = "";
    tbody.innerHTML = `<tr><td colspan="4"><div class="token-help"><b>🔑 Falta tu token de Lichess</b> (gratis, se hace una sola vez):
      <ol>
        <li>Entra en lichess.org con tu cuenta y abre <a href="https://lichess.org/account/oauth/token/create?description=AjedrezBase" target="_blank" rel="noopener">la página para crear tokens</a>.</li>
        <li><b>No marques ningún permiso</b> y pulsa el botón de crear del final.</li>
        <li>Copia el código que empieza por <code>lip_</code> (sólo se muestra una vez).</li>
        <li>Pégalo en <a href="#" data-open-settings>⚙ Ajustes</a> y pulsa «🔌 Probar token».</li>
      </ol>
      Mientras tanto: <a href="#" data-use-local>usar «Mi biblioteca + .pgn abierto»</a> (sin conexión) o la enciclopedia ECO de abajo.</div></td></tr>`;
    gbody.innerHTML = `<tr><td colspan="5" class="small">—</td></tr>`;
    tbody.querySelector("[data-open-settings]").onclick = e => { e.preventDefault(); openModal("settingsModal"); };
    tbody.querySelector("[data-use-local]").onclick = e => { e.preventDefault(); $("explorerDbSelect").value = "local"; $("explorerDbSelect").dispatchEvent(new Event("change")); };
    return;
  }
  $("explorerHint").textContent = "Estadísticas reales de Lichess para la posición del tablero. Pulsa una jugada para hacerla.";
  let data = explorerCache.get(url);
  if (!data) {
    tbody.innerHTML = `<tr><td colspan="4" class="small">Consultando Lichess…</td></tr>`;
    if (ui.explorerAbort) ui.explorerAbort.abort();
    const ctrl = ui.explorerAbort = new AbortController();
    try {
      const res = await Lichess.fetch(url, { headers: authHeaders(), signal: ctrl.signal });
      if (res.status === 401 || res.status === 403) {
        tbody.innerHTML = `<tr><td colspan="4" class="small msg-err">Lichess ha rechazado el token: no es válido, se ha borrado o está mal copiado. Crea otro y pégalo en ⚙ Ajustes (pulsa «🔌 Probar token»).</td></tr>`;
        gbody.innerHTML = `<tr><td colspan="5" class="small">—</td></tr>`;
        return;
      }
      if (res.status === 429) { tbody.innerHTML = `<tr><td colspan="4" class="small msg-err">Lichess pide una pausa por demasiadas consultas: se reanudará en ${Lichess.waitSeconds()} s (vuelve a mover o cambia de pestaña).</td></tr>`; return; }
      if (!res.ok) throw Error(res.status);
      data = await res.json();
      explorerCache.set(url, data);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (e && e.status === 429) { if (cur() === node) tbody.innerHTML = `<tr><td colspan="4" class="small msg-err">${esc(e.message)}</td></tr>`; return; }
      if (cur() === node) {
        tbody.innerHTML = `<tr><td colspan="4" class="small">No se pudo conectar con Lichess (¿sin conexión?). Puedes usar «Mi biblioteca + .pgn abierto» o la enciclopedia ECO de abajo. En ⚙ Ajustes, «🔌 Probar token» ayuda a ver qué falla.</td></tr>`;
        gbody.innerHTML = `<tr><td colspan="5" class="small">—</td></tr>`;
      }
      return;
    }
  }
  if (cur() !== node || ui.activeTab !== "explorer") return;
  $("explorerOpening").textContent = data.opening ? `Lichess: ${data.opening.eco} · ${data.opening.name}` : "";
  explorerMoveRows(node, data.moves || []);
  const games = (data.topGames || []).concat(data.recentGames || []);
  gbody.innerHTML = games.length ? "" : `<tr><td colspan="5" class="small">Sin partidas destacadas.</td></tr>`;
  for (const g of games) {
    const tr = document.createElement("tr");
    const res = g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "½-½";
    tr.innerHTML = `<td>${esc(g.white && g.white.name || "?")} <span class="small">${esc(g.white && g.white.rating || "")}</span></td><td>${esc(g.black && g.black.name || "?")} <span class="small">${esc(g.black && g.black.rating || "")}</span></td><td><b>${res}</b></td><td>${esc(g.year || g.month || "")}</td><td><button class="sm-btn primary">Cargar</button></td>`;
    tr.querySelector("button").onclick = ev => { ev.stopPropagation(); loadRemoteGame(g.id, db); };
    tr.onclick = () => loadRemoteGame(g.id, db);
    gbody.append(tr);
  }
}
async function loadRemoteGame(id, db) {
  const url = db === "masters" ? `https://explorer.lichess.ovh/masters/pgn/${encodeURIComponent(id)}` : `https://lichess.org/game/export/${encodeURIComponent(id)}?clocks=false&evals=false`;
  try {
    toast("Descargando partida…");
    const res = await Lichess.fetch(url, { headers: Object.assign({ Accept: "application/x-chess-pgn" }, authHeaders()) });
    if (!res.ok) throw Error(res.status);
    const text = await res.text();
    const out = loadPgnText(text, { endAtEnd: false });
    if (out) { switchTab("study"); toast("Partida cargada."); }
  } catch (e) {
    if (e && e.status === 429) { toast(e.message, 4000); return; }
    window.open(`https://lichess.org/${encodeURIComponent(id)}`, "_blank", "noopener");
  }
}

/* ---------- B1. Almacén permanente (IndexedDB, con respaldo pequeño en localStorage) ---------- */
const TAB_ID = Math.random().toString(36).slice(2);
let libChannel = null;
try { libChannel = new BroadcastChannel("ajedrezbase-biblioteca"); } catch {}
const announceLibChange = () => { try { libChannel && libChannel.postMessage({ tab: TAB_ID }); } catch {} };
const DB = {
  kind: "none", db: null, mem: null,
  async open() {
    if (window.indexedDB) {
      try {
        this.db = await new Promise((res, rej) => {
          let req;
          try { req = indexedDB.open("ajedrezbase", 1); } catch (e) { rej(e); return; }
          req.onupgradeneeded = () => {
            const d = req.result;
            if (!d.objectStoreNames.contains("games")) d.createObjectStore("games", { keyPath: "id", autoIncrement: true });
            if (!d.objectStoreNames.contains("marks")) d.createObjectStore("marks", { keyPath: "id", autoIncrement: true });
          };
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
          req.onblocked = () => rej(Error("base bloqueada por otra pestaña"));
          setTimeout(() => rej(Error("tiempo de espera agotado")), 8000);
        });
        this.kind = "idb";
        return true;
      } catch (e) { console.warn("IndexedDB no disponible:", e); }
    }
    this.kind = "ls";
    this.mem = LS.get("ajedrezLibFallback", null) || { games: [], marks: [], next: 1 };
    return false;
  },
  _tx(store, mode, fn) {
    return new Promise((res, rej) => {
      let t;
      try { t = this.db.transaction(store, mode); } catch (e) { rej(e); return; }
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res(Array.isArray(r) ? r.map(x => x.result) : r ? r.result : undefined);
      t.onerror = () => rej(t.error || Error("error de escritura"));
      t.onabort = () => rej(t.error || Error("operación cancelada (¿sin espacio?)"));
    });
  },
  async all(store) {
    if (this.kind === "idb") return this._tx(store, "readonly", s => s.getAll());
    return this.mem[store].map(x => Object.assign({}, x));
  },
  async putMany(store, recs) {
    if (!recs.length) return [];
    if (this.kind === "idb") {
      const clean = recs.map(r => { const c = Object.assign({}, r); if (c.id == null) delete c.id; return c; });
      const ids = await this._tx(store, "readwrite", s => clean.map(r => s.put(r)));
      recs.forEach((r, i) => { r.id = ids[i]; });
      announceLibChange();
      return ids;
    }
    const arr = this.mem[store];
    const ids = recs.map(r => {
      if (r.id == null) r.id = this.mem.next++;
      const i = arr.findIndex(x => x.id === r.id);
      if (i >= 0) arr[i] = Object.assign({}, r); else arr.push(Object.assign({}, r));
      return r.id;
    });
    if (!LS.set("ajedrezLibFallback", this.mem)) throw Error("no queda espacio en el almacén de este navegador");
    return ids;
  },
  async put(store, rec) { return (await this.putMany(store, [rec]))[0]; },
  async delMany(store, ids) {
    if (!ids.length) return;
    if (this.kind === "idb") { await this._tx(store, "readwrite", s => { ids.forEach(id => s.delete(id)); return null; }); announceLibChange(); return; }
    const set = new Set(ids);
    this.mem[store] = this.mem[store].filter(x => !set.has(x.id));
    LS.set("ajedrezLibFallback", this.mem);
  }
};

/* ---------- B2. Biblioteca en memoria ---------- */
const Lib = { games: new Map(), marks: new Map(), ready: false, sel: new Set() };
const Coll = { games: [], bytes: 0, names: [], saved: new Set() };
let LocalIdx = null, LocalIdxBuilding = false;
const LIB_SOFT = () => (DB.kind === "ls" ? 4 * 1048576 : 100 * 1048576);   // recomendado (la biblioteca se carga entera al abrir)
const COLL_SOFT = 200 * 1048576;                                      // recomendado para un .pgn abierto en memoria
const COLL_HARD = 400 * 1048576;
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function fmtBytes(n) {
  if (n == null || isNaN(n)) return "–";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " KB";
  if (n < 1073741824) return (n / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " MB";
  return (n / 1073741824).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " GB";
}
function parseTags(txt) { return [...new Set(String(txt || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12); }
function defaultTitle(h) {
  const named = h.White && h.White !== "Blancas" && h.White !== "?";
  if (named) return `${h.White} – ${h.Black || "?"}${h.Event && h.Event !== "?" && h.Event !== "Estudio" ? ` (${h.Event})` : ""}`;
  if (h.Event && h.Event !== "Estudio" && h.Event !== "?") return h.Event;
  return "Estudio " + new Date().toLocaleDateString("es-ES");
}
function gameSig(g) {
  const h = g.headers;
  const line = Pgn.mainlineFrom(g.root).slice(0, 60).map(n => n.uci).join("");
  const start = Chess.toFen(g.root.state) === Chess.START_FEN ? "" : Chess.posKey(g.root.state);
  return `${norm(h.White)}|${norm(h.Black)}|${h.Date || ""}|${start}|${line}`;
}
function recordFromGame(g, extra = {}) {
  const h = g.headers, pgn = Pgn.exportPgn(g, { evals: true }), now = Date.now();
  return Object.assign({
    title: extra.title || defaultTitle(h), white: h.White || "", black: h.Black || "", event: h.Event || "", site: h.Site || "",
    date: h.Date || "", result: h.Result || "*", eco: h.ECO || "", whiteElo: h.WhiteElo || "", blackElo: h.BlackElo || "",
    pgn, sig: gameSig(g), plies: Pgn.mainlineFrom(g.root).length, size: pgn.length, timeControl: h.TimeControl || "",
    analysis: analysisOf(g), created: now, updated: now, fav: false, tags: [], srs: null
  }, extra, { title: extra.title || defaultTitle(h) });
}
function resolvePath(root, path, exact) {
  let n = root;
  for (const u of path || []) { const c = n.children.find(x => x.uci === u); if (!c) return exact ? null : n; n = c; }
  return n;
}
const marksOfGame = id => [...Lib.marks.values()].filter(m => m.gameId === id);
function libBytes() {
  let b = 0;
  for (const r of Lib.games.values()) b += (r.pgn || "").length + 400;
  for (const m of Lib.marks.values()) b += 300 + (m.note || "").length;
  return b;
}

/* ---------- B3. Guardar / abrir la partida actual ---------- */
let saving = null;
function updateSaveState() {
  const el = $("saveState"), btn = $("saveGame"), fav = $("favToggle");
  fav.textContent = ui.fav ? "★" : "☆";
  fav.classList.toggle("on", ui.fav);
  if (trainer.active && trainer.card) {
    el.className = "save-state"; el.textContent = "🧠 Tarjeta de entrenamiento (no se guarda)";
    btn.disabled = true; fav.disabled = true; return;
  }
  fav.disabled = false;
  const saved = ui.libId && Lib.games.has(ui.libId);
  if (ui.saveError) {
    el.className = "save-state dirty";
    el.textContent = "❌ No se ha podido guardar: " + ui.saveError + ". Pulsa 💾 para reintentarlo.";
    btn.textContent = "💾 Reintentar";
    btn.disabled = false;
    return;
  }
  if (saved) {
    el.className = "save-state saved" + (ui.dirty ? " dirty" : "");
    el.textContent = ui.dirty ? "⏳ Guardando los cambios…" : "✔ Está en tu biblioteca · los cambios se guardan solos";
    btn.textContent = ui.dirty ? "💾 Guardar ahora" : "✔ Guardada";
    btn.disabled = !ui.dirty;
  } else {
    el.className = "save-state" + (ui.dirty ? " dirty" : "");
    el.textContent = ui.dirty ? "● Tiene cambios y NO está guardada en la biblioteca" : "No está en la biblioteca (sólo se guarda si pulsas 💾)";
    btn.textContent = "💾 Guardar en biblioteca";
    btn.disabled = !Lib.ready;
  }
}
function markDirty() {
  if (trainer.active && trainer.card) return;
  ui.dirty = true;
  ui.rev++;
  updateSaveState();
  if (ui.libId && Lib.games.has(ui.libId)) scheduleLibSave();
  scheduleAutosave();
}
const scheduleLibSave = debounce(() => { if (ui.dirty && ui.libId && Lib.games.has(ui.libId)) saveToLibrary({ silent: true }); }, 1200);

/* Guarda la partida del tablero. La parte síncrona (exportar) ocurre antes de cualquier espera,
   así que es seguro llamarla justo antes de cambiar de partida. */
async function saveToLibrary(opts = {}) {
  if (!Lib.ready) { toast("La biblioteca aún se está cargando…"); return null; }
  if (trainer.active && trainer.card) return null;
  const g = game, rev = ui.rev;
  const title = $("gameName").value.trim() || defaultTitle(g.headers);
  const existing = ui.libId && Lib.games.get(ui.libId);
  if (existing && ui.recUpdated && existing.updated > ui.recUpdated && !opts.force) {
    const msg = "esta partida se ha modificado en otra pestaña";
    if (opts.silent || !confirm(`«${existing.title}» se ha modificado en otra pestaña o ventana después de abrirla aquí.\n\n¿Sustituir esos cambios por los de esta pestaña?`)) {
      if (g === game) { ui.saveError = msg + " (pulsa 💾 para sustituirla con la versión de esta pestaña, o vuelve a abrirla desde la biblioteca)"; updateSaveState(); }
      return null;
    }
  }
  let base;
  if (existing) base = Object.assign({}, existing);
  else {
    const sig = gameSig(g);
    const dup = [...Lib.games.values()].find(r => r.sig === sig);
    if (dup && !opts.force && !confirm(`Ya tienes en la biblioteca una partida igual («${dup.title}»).\n\n¿Guardar otra copia de todos modos?`)) return null;
    base = { created: Date.now(), srs: null };
  }
  const rec = Object.assign(base, recordFromGame(g, { title, fav: ui.fav, tags: ui.tags.slice(), created: base.created, srs: base.srs || null }));
  if (existing) rec.id = existing.id;
  const projected = libBytes() + rec.size - (existing ? existing.size || 0 : 0);
  if (!existing && projected > LIB_SOFT()) toast(`⚠ La biblioteca ocupa ${fmtBytes(projected)}: supera lo recomendado (${fmtBytes(LIB_SOFT())}). Considera exportar y borrar partidas antiguas.`, 6000);
  try { await DB.put("games", rec); }
  catch (e) {
    if (g === game) { ui.saveError = e.message || String(e); updateSaveState(); }
    toast("❌ No se pudo guardar: " + (e.message || e), 6000);
    return null;
  }
  Lib.games.set(rec.id, rec);
  LocalIdx = null;
  if (g === game) {
    ui.saveError = "";
    ui.recUpdated = rec.updated;
    ui.libId = rec.id;
    if (ui.rev === rev) ui.dirty = false;
    else scheduleLibSave();
    $("gameName").value = rec.title;
  }
  if (!opts.silent) toast(existing ? `💾 «${rec.title}» actualizada.` : `💾 «${rec.title}» guardada en tu biblioteca.`);
  refreshLibraryViews();
  scheduleAutosave();
  return rec;
}
function confirmLeave() {
  if (!ui.dirty || (trainer.active && trainer.card)) return true;
  if (ui.libId && Lib.games.has(ui.libId)) { saveToLibrary({ silent: true }); return true; }
  return confirm("La partida actual tiene cambios y no está guardada en la biblioteca.\n\nAceptar = descartarlos y continuar\nCancelar = volver para guardarla (💾)");
}
function openLibGame(id, path) {
  const rec = Lib.games.get(id);
  if (!rec) { toast("Esa partida ya no está en la biblioteca."); return false; }
  if (ui.libId === id && !trainer.active) { goTo(resolvePath(game.root, path)); return true; }
  if (!confirmLeave()) return false;
  const r = Pgn.parseGame(rec.pgn, { lang: "en" });
  r.game.analysis = rec.analysis || null;
  setGame(r.game, { noConfirm: true, libId: id, name: rec.title, fav: rec.fav, tags: rec.tags, current: resolvePath(r.game.root, path) });
  if (r.error) toast("⚠ Esta partida tenía un error de lectura en " + r.error.label, 4000);
  return true;
}

/* ---------- B4. Vista «Mis partidas» ---------- */
function libFiltered() {
  const q = norm($("libFilter").value).split(/\s+/).filter(Boolean);
  const tag = $("libTagFilter").value, now = Date.now();
  let arr = [...Lib.games.values()].filter(r => {
    if (tag === "*fav" && !r.fav) return false;
    if (tag === "*due" && !(r.srs && r.srs.due <= now)) return false;
    if (tag === "*marks" && !marksOfGame(r.id).length) return false;
    if (tag && !tag.startsWith("*") && !(r.tags || []).includes(tag)) return false;
    if (!q.length) return true;
    const hay = norm([r.title, r.white, r.black, r.event, r.site, r.date, r.eco, r.result, (r.tags || []).join(" ")].join(" "));
    return q.every(w => hay.includes(w));
  });
  const sort = $("libSort").value;
  if (sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title, "es"));
  else if (sort === "date") arr.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  else arr.sort((a, b) => b.updated - a.updated);
  return arr;
}
function renderTagOptions() {
  const tags = new Map();
  for (const r of Lib.games.values()) for (const t of r.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
  const sel = $("libTagFilter"), cur0 = sel.value;
  const nFav = [...Lib.games.values()].filter(r => r.fav).length;
  const nDue = [...Lib.games.values()].filter(r => r.srs && r.srs.due <= Date.now()).length;
  sel.innerHTML = `<option value="">Todas</option><option value="*fav">⭐ Favoritas (${nFav})</option><option value="*marks">📌 Con marcadores</option><option value="*due">📅 Repaso pendiente (${nDue})</option>` +
    [...tags.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([t, n]) => `<option value="${esc(t)}">🏷 ${esc(t)} (${n})</option>`).join("");
  sel.value = [...sel.options].some(o => o.value === cur0) ? cur0 : "";
  $("tagList").innerHTML = [...tags.keys()].map(t => `<option value="${esc(t)}">`).join("");
}
function renderLibrary() {
  const tbody = $("libBody");
  const arr = libFiltered();
  $("libCount").textContent = Lib.games.size;
  tbody.innerHTML = "";
  if (!Lib.ready) { tbody.innerHTML = `<tr><td colspan="6" class="small">Cargando la biblioteca…</td></tr>`; return; }
  if (!arr.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="small">${Lib.games.size ? "Ninguna partida coincide con el filtro." : "Tu biblioteca está vacía. Abre o importa una partida y pulsa «💾 Guardar en biblioteca», o guarda las que te interesen desde «🗂 Abrir .pgn»."}</td></tr>`;
  }
  const frag = document.createDocumentFragment();
  for (const r of arr.slice(0, 500)) {
    const tr = document.createElement("tr");
    if (r.id === ui.libId) tr.className = "current";
    const nMarks = marksOfGame(r.id).length;
    const due = r.srs && r.srs.due <= Date.now();
    const sub = [r.white && r.black ? `${r.white} – ${r.black}` : "", r.event, (r.date || "").replace(/\.\?\?/g, ""), r.eco, r.plies ? Math.ceil(r.plies / 2) + " jug." : ""].filter(x => x && x !== "?").join(" · ");
    tr.innerHTML = `<td><input type="checkbox" data-sel ${Lib.sel.has(r.id) ? "checked" : ""} aria-label="Seleccionar"></td>
      <td class="star-cell" data-fav title="Favorita">${r.fav ? "★" : "☆"}</td>
      <td><div class="lib-title">${esc(r.title)}${nMarks ? ` <span class="small" title="${nMarks} marcadores">📌${nMarks}</span>` : ""}${due ? ` <span class="srs-pill due">repasar</span>` : ""}</div><div class="lib-sub">${esc(sub)}</div></td>
      <td>${esc(r.result || "*")}</td>
      <td class="hide-sm">${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</td>
      <td class="row-actions"><button class="sm-btn" data-train title="Entrenar esta partida">🎯</button> <button class="sm-btn danger" data-del title="Borrar de la biblioteca">🗑</button></td>`;
    tr.querySelector("[data-sel]").onclick = e => { e.stopPropagation(); e.target.checked ? Lib.sel.add(r.id) : Lib.sel.delete(r.id); updateSelButtons(); };
    tr.querySelector("[data-fav]").onclick = async e => {
      e.stopPropagation();
      r.fav = !r.fav;
      try { await DB.put("games", r); }
      catch (err) { r.fav = !r.fav; toast("❌ No se pudo guardar la favorita: " + err.message, 5000); return; }
      if (r.id === ui.libId) { ui.fav = r.fav; updateSaveState(); }
      refreshLibraryViews();
    };
    tr.querySelector("[data-train]").onclick = e => { e.stopPropagation(); if (openLibGame(r.id)) startTraining({}); };
    tr.querySelector("[data-del]").onclick = e => { e.stopPropagation(); deleteLibGames([r.id]); };
    tr.onclick = () => { if (openLibGame(r.id)) switchTab("study"); };
    frag.append(tr);
  }
  tbody.append(frag);
  $("libStatus").textContent = arr.length > 500 ? `Mostrando 500 de ${arr.length}. Usa el buscador para afinar.` : arr.length ? `${arr.length} partida${arr.length === 1 ? "" : "s"}` : "";
  updateSelButtons();
}
function updateSelButtons() {
  for (const id of [...Lib.sel]) if (!Lib.games.has(id)) Lib.sel.delete(id);
  $("libDeleteSel").disabled = !Lib.sel.size;
  $("libDeleteSel").textContent = Lib.sel.size ? `🗑 Borrar seleccionadas (${Lib.sel.size})` : "🗑 Borrar seleccionadas";
}
async function deleteLibGames(ids) {
  if (!ids.length) return;
  const marks = [...Lib.marks.values()].filter(m => ids.includes(m.gameId));
  const label = ids.length === 1 ? `«${Lib.games.get(ids[0]).title}»` : `${ids.length} partidas`;
  if (!confirm(`¿Borrar ${label} de la biblioteca${marks.length ? ` y sus ${marks.length} marcadores` : ""}?\n\nNo se puede deshacer (salvo que tengas una copia de seguridad).`)) return;
  try {
    await DB.delMany("games", ids);
    await DB.delMany("marks", marks.map(m => m.id));
  } catch (e) { toast("❌ No se pudo borrar: " + e.message); return; }
  ids.forEach(id => { Lib.games.delete(id); Lib.sel.delete(id); });
  marks.forEach(m => Lib.marks.delete(m.id));
  if (ids.includes(ui.libId)) { ui.libId = null; ui.dirty = false; }
  LocalIdx = null;
  toast(`🗑 ${label} borrada${ids.length === 1 ? "" : "s"}.`);
  refreshLibraryViews();
  renderMoves();
  scheduleAutosave();
}

/* ---------- B5. Fichero .pgn abierto (sólo en memoria) ---------- */
function collRaw(g) { return Object.entries(g.headers).map(([k, v]) => `[${k} "${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`).join("\n") + "\n\n" + g.movetext.trim(); }
function setCollection(text, append, name) {
  const parts = Pgn.splitGames(text).filter(g => g.movetext.trim());
  if (!append) { Coll.games = []; Coll.bytes = 0; Coll.names = []; Coll.saved = new Set(); }
  for (const p of parts) Coll.games.push(p);
  Coll.bytes += text.length;
  if (name) Coll.names.push(name);
  LocalIdx = null;
  renderCollection();
  updateStorage();
  return parts.length;
}
function collFiltered() {
  const q = norm($("dbFilterInput").value).split(/\s+/).filter(Boolean);
  const rows = [];
  Coll.games.forEach((g, i) => {
    if (!q.length) { rows.push(i); return; }
    const h = g.headers;
    const hay = norm([h.White, h.Black, h.Event, h.Site, h.Date, h.ECO, h.Result, h.Opening].join(" "));
    if (q.every(w => hay.includes(w))) rows.push(i);
  });
  return rows;
}
function renderCollection() {
  const tbody = $("pgnDbBody");
  $("collCount").textContent = Coll.games.length;
  const rows = collFiltered();
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="small">${Coll.games.length ? "Ninguna partida coincide con el filtro." : "No hay ningún fichero abierto. Pulsa «📂 Abrir .pgn» o carga la antología de clásicos."}</td></tr>`;
  }
  const frag = document.createDocumentFragment();
  for (const i of rows.slice(0, 500)) {
    const h = Coll.games[i].headers;
    const tr = document.createElement("tr");
    const saved = Coll.saved.has(i);
    tr.innerHTML = `<td class="num">${i + 1}</td><td><b>${esc(h.White || "?")}</b>${h.WhiteElo ? ` <span class="small">${esc(h.WhiteElo)}</span>` : ""}</td><td><b>${esc(h.Black || "?")}</b>${h.BlackElo ? ` <span class="small">${esc(h.BlackElo)}</span>` : ""}</td><td>${esc(h.Result || "*")}</td><td class="hide-sm">${h.ECO ? `<span class="srs-pill">${esc(h.ECO)}</span> ` : ""}${esc(h.Event || "")}</td><td>${esc((h.Date || "").slice(0, 4))}</td>
      <td class="row-actions">${saved ? `<span class="small msg-ok" title="Ya está en tu biblioteca">✔</span>` : `<button class="sm-btn" data-save title="Guardar en la biblioteca">💾</button>`}</td>`;
    const sb = tr.querySelector("[data-save]");
    if (sb) sb.onclick = e => { e.stopPropagation(); saveCollGames([i]); };
    tr.onclick = () => loadCollGame(i);
    frag.append(tr);
  }
  tbody.append(frag);
  $("dbStatus").textContent = Coll.games.length
    ? `${Coll.names.length ? "«" + Coll.names.join("», «") + "» · " : ""}${Coll.games.length} partidas en memoria (${fmtBytes(Coll.bytes)})${rows.length > 500 ? ` · mostrando 500 de ${rows.length}` : ""}`
    : "";
  $("saveCollFilteredBtn").disabled = !rows.length;
  $("saveCollFilteredBtn").textContent = rows.length ? `💾 Guardar en la biblioteca las ${rows.length} partidas filtradas` : "💾 Guardar en la biblioteca las partidas filtradas";
}
function loadCollGame(i) {
  const g = Coll.games[i];
  if (!g) return;
  const r = Pgn.parseGame(g, { lang: "auto" });
  const ok = setGame(r.game, { name: defaultTitle(r.game.headers) });
  if (ok === false) return;
  importResultMsg(r);
  switchTab("study");
}
async function saveCollGames(list) {
  if (!Lib.ready || !list.length) return;
  const estBytes = list.reduce((a, i) => a + Coll.games[i].movetext.length + 300, 0);
  if (list.length > 1) {
    const projected = libBytes() + estBytes;
    let msg = `¿Guardar ${list.length} partidas en tu biblioteca (≈${fmtBytes(estBytes)})?`;
    if (projected > LIB_SOFT()) msg += `\n\n⚠ La biblioteca pasaría a ocupar ≈${fmtBytes(projected)}, más de lo recomendado (${fmtBytes(LIB_SOFT())}). Puede ir más lenta al abrir la página.`;
    if (!confirm(msg)) return;
  }
  const sigs = new Map([...Lib.games.values()].map(r => [r.sig, r.id]));
  const recs = [];
  let dup = 0, dupFile = 0, bad = 0;
  const btn = $("saveCollFilteredBtn");
  btn.disabled = true;
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    const r = Pgn.parseGame(Coll.games[i], { lang: "auto" });
    if (!r.count && r.error) { bad++; continue; }
    const rec = recordFromGame(r.game);
    if (sigs.has(rec.sig)) { if (sigs.get(rec.sig) === -1) dupFile++; else dup++; Coll.saved.add(i); continue; }
    sigs.set(rec.sig, -1);
    recs.push(rec);
    Coll.saved.add(i);
    if (k % 40 === 39) { $("dbStatus").textContent = `Preparando… ${k + 1} / ${list.length}`; await new Promise(r2 => setTimeout(r2, 0)); }
  }
  try {
    for (let k = 0; k < recs.length; k += 250) {
      await DB.putMany("games", recs.slice(k, k + 250));
      $("dbStatus").textContent = `Guardando… ${Math.min(recs.length, k + 250)} / ${recs.length}`;
    }
  } catch (e) { toast("❌ Error al guardar: " + e.message, 6000); }
  for (const r of recs) if (r.id != null) Lib.games.set(r.id, r);
  LocalIdx = null;
  btn.disabled = false;
  toast(`💾 ${recs.length} guardada${recs.length === 1 ? "" : "s"}${dup ? ` · ${dup} ya estaba${dup === 1 ? "" : "n"} en tu biblioteca` : ""}${dupFile ? ` · ${dupFile} repetida${dupFile === 1 ? "" : "s"} dentro del fichero` : ""}${bad ? ` · ${bad} ilegibles` : ""}.`, 4500);
  renderCollection();
  refreshLibraryViews();
}
async function openPgnFiles(files) {
  let total = 0;
  for (const [k, f] of files.entries()) {
    if (f.size > COLL_HARD) { toast(`«${f.name}» ocupa ${fmtBytes(f.size)}: es demasiado grande para abrirlo en el navegador (máx. ${fmtBytes(COLL_HARD)}). Divide el fichero.`, 7000); continue; }
    const after = Coll.bytes + f.size;
    if (after > COLL_SOFT && !confirm(`Abrir «${f.name}» (${fmtBytes(f.size)}) dejará ${fmtBytes(after)} de partidas en memoria, más de lo recomendado (${fmtBytes(COLL_SOFT)}). El navegador puede ir lento. ¿Continuar?`)) continue;
    const append = k > 0 || (Coll.games.length > 0 && confirm(`¿Añadir «${f.name}» al fichero que ya tienes abierto?\n\nAceptar = añadir · Cancelar = sustituirlo`));
    $("dbStatus").textContent = `Leyendo «${f.name}»…`;
    total += setCollection(await f.text(), append, f.name);
  }
  toast(`🗂 ${total} partidas abiertas en memoria. Guarda en la biblioteca sólo las que te interesen.`, 4500);
}

/* ---------- B6. Marcadores ---------- */
const CATS = {
  idea: { icon: "💡", name: "Idea" }, tactica: { icon: "⚔", name: "Táctica" }, error: { icon: "⚠", name: "Error típico" },
  plan: { icon: "🧭", name: "Plan" }, final: { icon: "♟", name: "Final" }, apertura: { icon: "📖", name: "Apertura" }, fav: { icon: "⭐", name: "Favorita" }
};
const DEFAULT_TRAIN = { error: "best", fav: "none" };
const markLabel = m => (m.num ? m.num + formatSan(m.san, settings.lang, m.color) : "Posición inicial");
function markedNodesOfCurrent() {
  const out = new Map();
  if (!ui.libId || trainer.card) return out;
  for (const m of marksOfGame(ui.libId)) { const n = resolvePath(game.root, m.path, true); if (n) out.set(n.id, m); }
  return out;
}
async function openMarkDialog() {
  if (editor.active) { toast("Cierra antes el editor de posición."); return; }
  if (quiz()) { toast("Termina antes el ejercicio."); return; }
  if (!Lib.ready) { toast("La biblioteca aún se está cargando…"); return; }
  const node = cur();
  if (!ui.libId || !Lib.games.has(ui.libId)) {
    if (!confirm("Para marcar posiciones, la partida tiene que estar en tu biblioteca.\n\n¿Guardarla ahora?")) return;
    if (!(await saveToLibrary({}))) return;
  } else if (ui.dirty) await saveToLibrary({ silent: true });
  const path = Pgn.pathTo(node).slice(1).map(n => n.uci);
  const existing = marksOfGame(ui.libId).find(m => m.path.join(" ") === path.join(" "));
  ui.markCtx = { node, path, existing, trainTouched: !!existing, cat: existing ? existing.cat : "idea" };
  const rec = Lib.games.get(ui.libId);
  $("markWhere").textContent = `${rec.title} · ${node.parent ? "tras " + numPrefix(node.parent.state) + dispSan(node) : "posición inicial"}`;
  $("markNote").value = existing ? existing.note : (node.comment || "");
  const sel = $("markTrain");
  sel.value = existing ? existing.train : (DEFAULT_TRAIN[ui.markCtx.cat] || "move");
  [...sel.options].forEach(o => { o.disabled = !node.parent && o.value !== "none"; });
  if (!node.parent) sel.value = "none";
  $("markDeleteBtn").hidden = !existing;
  $("markInfo").textContent = node.parent ? "" : "En la posición inicial no hay jugada que entrenar.";
  renderCatChips();
  openModal("markModal");
  setTimeout(() => $("markNote").focus(), 30);
}
function renderCatChips() {
  const box = $("markCats");
  box.innerHTML = "";
  for (const [k, c] of Object.entries(CATS)) {
    const b = document.createElement("button");
    b.className = "sm-btn cat-chip" + (ui.markCtx.cat === k ? " active" : "");
    b.textContent = `${c.icon} ${c.name}`;
    b.onclick = () => {
      ui.markCtx.cat = k;
      if (!ui.markCtx.trainTouched && ui.markCtx.node.parent) $("markTrain").value = DEFAULT_TRAIN[k] || "move";
      renderCatChips();
    };
    box.append(b);
  }
}
async function saveMark() {
  const ctx = ui.markCtx;
  if (!ctx) return;
  const node = ctx.node;
  let train = node.parent ? $("markTrain").value : "none", answer = null, info = "";
  const btn = $("markSaveBtn");
  if (train === "move") answer = node.uci;
  if (train === "best") {
    let best = node.parent.eval && (node.parent.eval.depth || 0) >= 8 ? node.parent.eval.best : null;
    if (!best) {
      btn.disabled = true;
      $("markInfo").textContent = "⏳ Preguntando al motor cuál era la mejor jugada…";
      const job = await Engine.analyse(node.parent, { purpose: "mark", movetime: 1500, multipv: 1 });
      btn.disabled = false;
      if (job) { storeEval(node.parent, job); best = job.best; }
    }
    if (!best) { train = "move"; answer = node.uci; info = "No se pudo consultar al motor: se entrenará la jugada marcada."; }
    else if (best === node.uci) { train = "move"; answer = node.uci; info = "El motor cree que la jugada marcada ya es la mejor: se entrenará como «encontrar la jugada marcada»."; }
    else answer = best;
  }
  const prev = ctx.existing;
  const rec = Object.assign(prev ? Object.assign({}, prev) : { created: Date.now(), srs: null }, {
    gameId: ui.libId, path: ctx.path, fen: Chess.toFen(node.state), fenBefore: node.parent ? Chess.toFen(node.parent.state) : null,
    san: node.san || "", num: node.parent ? numPrefix(node.parent.state) : "", color: node.parent ? node.parent.state.t : 1,
    cat: ctx.cat, note: $("markNote").value.trim(), train, answer, updated: Date.now()
  });
  if (prev && (prev.train !== train || prev.answer !== answer)) rec.srs = null;
  try { await DB.put("marks", rec); } catch (e) { toast("❌ No se pudo guardar el marcador: " + e.message); return; }
  Lib.marks.set(rec.id, rec);
  closeModals();
  toast(info || `📌 Marcador ${prev ? "actualizado" : "guardado"} (${CATS[rec.cat].icon} ${CATS[rec.cat].name}).`, info ? 5000 : 2600);
  refreshLibraryViews();
  renderMoves();
}
async function deleteMark(id, ask = true) {
  const m = Lib.marks.get(id);
  if (!m) return;
  if (ask && !confirm(`¿Borrar el marcador ${CATS[m.cat].icon} ${markLabel(m)}?`)) return;
  try { await DB.delMany("marks", [id]); } catch (e) { toast("❌ No se pudo borrar el marcador: " + e.message, 5000); return; }
  Lib.marks.delete(id);
  refreshLibraryViews();
  renderMoves();
}
function miniBoard(fen) {
  let s;
  try { s = Chess.parseFen(fen); } catch { return ""; }
  let html = "";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = s.b[r * 16 + c];
    html += `<span class="${(r + c) % 2 ? "d" : "l"}${p !== "." ? (p < "a" ? " w" : " b") : ""}">${p !== "." ? glyphUnicode[p.toUpperCase()] : ""}</span>`;
  }
  return `<div class="mini-board" aria-hidden="true">${html}</div>`;
}
function srsText(srs) {
  if (!srs) return "nueva";
  const d = Math.ceil((srs.due - Date.now()) / 864e5);
  return d <= 0 ? "pendiente hoy" : d === 1 ? "mañana" : `en ${d} días`;
}
function renderMarks() {
  const list = $("markList");
  const cat = $("markCatFilter").value, q = norm($("markFilter").value).split(/\s+/).filter(Boolean);
  $("markCount").textContent = Lib.marks.size;
  const arr = [...Lib.marks.values()].filter(m => {
    if (cat && m.cat !== cat) return false;
    if (!q.length) return true;
    const g = Lib.games.get(m.gameId);
    const hay = norm([m.note, g && g.title, markLabel(m), CATS[m.cat].name].join(" "));
    return q.every(w => hay.includes(w));
  }).sort((a, b) => b.updated - a.updated);
  list.innerHTML = "";
  if (!arr.length) {
    list.innerHTML = `<div class="small">${Lib.marks.size ? "Ningún marcador coincide." : "Aún no tienes marcadores. En cualquier jugada pulsa «📌 Marcar posición» para guardarla como idea, táctica, error típico…"}</div>`;
    return;
  }
  for (const m of arr.slice(0, 300)) {
    const g = Lib.games.get(m.gameId);
    const card = document.createElement("div");
    card.className = "mark-card";
    card.innerHTML = `${miniBoard(m.fen)}
      <div><div class="mark-head">${CATS[m.cat].icon} ${esc(CATS[m.cat].name)} · ${esc(markLabel(m))}</div>
      ${m.note ? `<div class="mark-note">${esc(m.note)}</div>` : ""}
      <div class="mark-meta">${esc(g ? g.title : "partida borrada")} · ${m.train === "none" ? "no se entrena" : "🧠 tarjeta: " + srsText(m.srs)}</div></div>
      <div class="mark-actions"><button class="sm-btn" data-edit title="Editar">✏</button><button class="sm-btn danger" data-del title="Borrar">🗑</button></div>`;
    card.querySelector("[data-edit]").onclick = e => { e.stopPropagation(); if (openLibGame(m.gameId, m.path)) { switchTab("study"); openMarkDialog(); } };
    card.querySelector("[data-del]").onclick = e => { e.stopPropagation(); deleteMark(m.id); };
    card.onclick = () => { if (openLibGame(m.gameId, m.path)) switchTab("study"); };
    list.append(card);
  }
}

/* ---------- B7. Buscar en comentarios y notas ---------- */
/* Normaliza conservando la correspondencia con las posiciones del texto original */
function normMap(t) {
  let n = "";
  const map = [];
  for (let i = 0; i < t.length;) {
    const ch = String.fromCodePoint(t.codePointAt(i));
    const nn = norm(ch);
    for (let k = 0; k < nn.length; k++) map.push(i);
    n += nn;
    i += ch.length;
  }
  map.push(t.length);
  return { n, map };
}
function highlight(text, q) {
  const t = String(text), { n, map } = normMap(t), i = n.indexOf(q);
  if (i < 0) return esc(t);
  const a = map[i], b = i + q.length < map.length ? map[i + q.length] : t.length;
  return esc(t.slice(0, a)) + "<mark>" + esc(t.slice(a, b)) + "</mark>" + esc(t.slice(b));
}
function snippet(text, q) {
  const t = String(text), { n, map } = normMap(t), ni = n.indexOf(q);
  const i = ni < 0 ? -1 : map[ni];
  if (t.length <= 220 || i < 0) return t.length > 220 ? t.slice(0, 217) + "…" : t;
  const a = Math.max(0, i - 80);
  return (a ? "…" : "") + t.slice(a, a + 220) + (a + 220 < t.length ? "…" : "");
}
async function searchComments() {
  const raw = $("commentSearch").value.trim().replace(/\s+/g, " "), q = norm(raw);
  const box = $("searchResults");
  if (q.length < 2) { box.innerHTML = `<div class="small">Escribe al menos 2 letras.</div>`; return; }
  box.innerHTML = `<div class="small">Buscando…</div>`;
  const results = [];
  let scanned = 0;
  for (const m of Lib.marks.values()) if (norm(m.note).includes(q)) results.push({ mark: m });
  for (const rec of Lib.games.values()) {
    if (++scanned % 100 === 0) await new Promise(r => setTimeout(r, 0));
    if (!norm(rec.pgn.replace(/\s+/g, " ")).includes(q)) continue;
    const r = Pgn.parseGame(rec.pgn, { lang: "en" });
    Pgn.walk(r.game.root, n => {
      if (n.comment && norm(n.comment).includes(q)) results.push({ rec, path: Pgn.pathTo(n).slice(1).map(x => x.uci), label: n.parent ? numPrefix(n.parent.state) + dispSan(n) : "Inicio", text: n.comment });
    });
    if (results.length > 400) break;
  }
  box.innerHTML = "";
  if (!results.length) { box.innerHTML = `<div class="small">No aparece «${esc(raw)}» en ningún comentario ni marcador de tu biblioteca.</div>`; return; }
  const head = document.createElement("div");
  head.className = "small";
  head.textContent = `${results.length > 400 ? "Más de 400" : results.length} resultado${results.length === 1 ? "" : "s"}`;
  box.append(head);
  for (const res of results.slice(0, 400)) {
    const div = document.createElement("div");
    div.className = "mark-card no-board";
    if (res.mark) {
      const m = res.mark, g = Lib.games.get(m.gameId);
      div.innerHTML = `<div><div class="mark-head">📌 ${CATS[m.cat].icon} ${esc(markLabel(m))}</div><div class="mark-note">${highlight(snippet(m.note, q), q)}</div><div class="mark-meta">${esc(g ? g.title : "")} · marcador</div></div><div></div>`;
      div.onclick = () => { if (openLibGame(m.gameId, m.path)) switchTab("study"); };
    } else {
      div.innerHTML = `<div><div class="mark-head">💬 ${esc(res.label)}</div><div class="mark-note">${highlight(snippet(res.text, q), q)}</div><div class="mark-meta">${esc(res.rec.title)}</div></div><div></div>`;
      div.onclick = () => { if (openLibGame(res.rec.id, res.path)) switchTab("study"); };
    }
    box.append(div);
  }
}

/* ---------- B8. Tarjetas de entrenamiento (de los marcadores) ---------- */
const Cards = { queue: [], stash: null, done: 0, ok: 0 };
function trainableMarks(all) {
  const now = Date.now();
  return [...Lib.marks.values()].filter(m => m.train !== "none" && m.answer && m.fenBefore && (all || !m.srs || m.srs.due <= now));
}
function startCards(all) {
  const q = trainableMarks(all);
  if (!q.length) { toast(all ? "No tienes marcadores entrenables. Marca posiciones con «📌 Marcar posición»." : "¡No tienes tarjetas pendientes hoy! 🎉", 4000); return; }
  if (!stashBoard()) return;
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  Cards.queue = q;
  Cards.done = 0;
  Cards.ok = 0;
  $("cardsBackBtn").hidden = false;
  nextCard();
}
function nextCard() {
  const m = Cards.queue.shift();
  if (!m) { endCards(); return; }
  let g;
  try { g = Pgn.newGame(m.fenBefore); } catch { nextCard(); return; }
  const mv = Chess.moveFromUci(g.root.state, m.answer);
  if (!mv) { nextCard(); return; }
  Pgn.addMove(g.root, mv);
  g.headers.Event = "Tarjeta";
  const src = Lib.games.get(m.gameId);
  setGame(g, { noConfirm: true, keepTrainer: false, name: `🧠 ${CATS[m.cat].icon} ${src ? src.title : "Tarjeta"}` });
  startTraining({ side: g.root.state.t, markId: m.id, card: true });
}
function endCards() {
  trainFeedback(`🧠 Repaso terminado: ${Cards.ok} de ${Cards.done} a la primera.<br><span class="small">Pulsa «↩ Volver a la partida» para seguir donde estabas.</span>`, Cards.ok === Cards.done ? "ok" : "");
}
function restoreStash() {
  const st = Cards.stash;
  Cards.stash = null;
  Cards.queue = [];
  $("cardsBackBtn").hidden = true;
  const onCard = (trainer.active && trainer.card) || game.headers.Event === "Tarjeta" || game.headers.Event === "Ejercicio";
  if (Retry.active && retryNode() && retryNode().__drill) retryEnd(true);
  if (!onCard && !confirmLeave()) { Cards.stash = st; $("cardsBackBtn").hidden = false; return; }
  if (trainer.active) stopTraining(true);
  if (!st) return;
  ui.flipped = !!st.flipped;
  setGame(st.game, { noConfirm: true, libId: st.libId && Lib.games.has(st.libId) ? st.libId : null, name: st.name, fav: st.fav, tags: st.tags, current: st.current });
  if (st.dirty) { ui.dirty = true; updateSaveState(); }
}
async function finishCard(perfect) {
  const m = Lib.marks.get(trainer.markId);
  Cards.done++;
  if (perfect) Cards.ok++;
  let msg = perfect ? "🏆 ¡Correcto a la primera!" : "✔ Tarjeta resuelta.";
  if (m) {
    m.srs = m.srs || { box: 0, due: Date.now(), reps: 0 };
    m.srs.reps++;
    m.srs.box = perfect ? Math.min(SRS_DAYS.length - 1, m.srs.box + 1) : 1;
    m.srs.due = Date.now() + SRS_DAYS[m.srs.box] * 864e5;
    try { await DB.put("marks", m); } catch {}
    const g = Lib.games.get(m.gameId);
    msg += ` ${CATS[m.cat].icon} ${esc(g ? g.title : "")}, ${esc(markLabel(m))}.`;
    if (m.note) msg += `<br>📝 ${esc(m.note)}`;
    msg += `<br><span class="small">Próximo repaso: ${srsText(m.srs)}.</span>`;
  }
  msg += Cards.queue.length ? `<br><button id="nextCardBtn" class="primary sm-btn" style="margin-top:6px">Siguiente tarjeta ▶ (quedan ${Cards.queue.length})</button>` : `<br><b>Fin del repaso:</b> ${Cards.ok} de ${Cards.done} a la primera.`;
  trainFeedback(msg, perfect ? "ok" : "");
  const nb = $("nextCardBtn");
  if (nb) nb.onclick = nextCard;
  refreshLibraryViews();
}

/* ---------- B9. Medidor de ocupación ---------- */
const updateStorage = debounce(async () => {
  const lb = libBytes(), soft = LIB_SOFT();
  const setMeter = (id, used, max) => {
    const el = $(id), pct = Math.min(100, (used / max) * 100);
    el.style.width = Math.max(used ? 1.5 : 0, pct) + "%";
    el.className = pct > 90 ? "bad" : pct > 60 ? "warn" : "";
  };
  setMeter("meterLib", lb, soft);
  $("meterLibTxt").textContent = `${fmtBytes(lb)} de ${fmtBytes(soft)} recomendados`;
  setMeter("meterColl", Coll.bytes, COLL_SOFT);
  $("meterCollTxt").textContent = Coll.games.length ? `${fmtBytes(Coll.bytes)} de ${fmtBytes(COLL_SOFT)}` : "ninguno abierto";
  const parts = [`${Lib.games.size} partidas y ${Lib.marks.size} marcadores guardados`];
  if (Coll.games.length) parts.push(`${Coll.games.length} partidas abiertas en memoria`);
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      parts.push(`Navegador: ${fmtBytes(e.usage)} usados de ${fmtBytes(e.quota)} disponibles para esta página`);
    }
  } catch {}
  if (performance.memory) parts.push(`Memoria de la página: ${fmtBytes(performance.memory.usedJSHeapSize)}`);
  let detail = parts.join(" · ") + ".";
  if (DB.kind === "ls") detail += " ⚠ Este navegador no permite la base interna (IndexedDB) aquí: la biblioteca usa un almacén pequeño de unos 5 MB. Ábrela directamente en Chrome, Edge o Firefox para tener más espacio.";
  if (lb > soft) detail += " ⚠ La biblioteca supera lo recomendado: exporta una copia y borra lo que no uses.";
  if (Coll.bytes > COLL_SOFT) detail += " ⚠ El fichero abierto ocupa mucho: ciérralo cuando acabes.";
  $("storageDetail").textContent = detail;
  try {
    if (navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      $("storagePersist").textContent = p ? "🔒 Datos protegidos" : "";
      $("persistBtn").hidden = p || !navigator.storage.persist;
    } else $("persistBtn").hidden = true;
  } catch { $("persistBtn").hidden = true; }
}, 250);

/* ---------- B10. Copias de seguridad, migración y arranque de la biblioteca ---------- */
function legacyStudyGame(it) {
  try {
    if (it.v === 2) return Pgn.parseGame(it.pgn || "").game;
    const r = Pgn.parseGame(it.pgn || "", { fen: it.base || Chess.START_FEN });
    const notes = it.notes || {};
    Pgn.walk(r.game.root, n => { const t = notes[Chess.toFen(n.state)]; if (t) n.comment = t; });
    return r.game;
  } catch { return null; }
}
function isSampleDb(raw) {
  const a = Pgn.splitGames(raw), b = Pgn.splitGames(SAMPLE_MULTI_PGN);
  return a.length === b.length && a.every((g, i) => g.headers.White === b[i].headers.White && g.headers.Black === b[i].headers.Black);
}
async function importRecords(games, marks) {
  const bySig = new Map([...Lib.games.values()].map(r => [r.sig, r.id]));
  const idMap = new Map(), fresh = [];
  let dup = 0;
  for (const g of games) {
    if (!g || !g.pgn) continue;
    const oldId = g.id;
    if (g.sig && bySig.has(g.sig)) { idMap.set(oldId, bySig.get(g.sig)); dup++; continue; }
    const rec = Object.assign({}, g);
    delete rec.id;
    if (!rec.sig) { const r = Pgn.parseGame(rec.pgn, { lang: "en" }); Object.assign(rec, recordFromGame(r.game, { title: rec.title, fav: rec.fav, tags: rec.tags || [], srs: rec.srs || null, created: rec.created || Date.now() })); }
    rec._old = oldId;
    fresh.push(rec);
    bySig.set(rec.sig, -1);
  }
  for (let k = 0; k < fresh.length; k += 250) await DB.putMany("games", fresh.slice(k, k + 250));
  for (const r of fresh) { idMap.set(r._old, r.id); delete r._old; Lib.games.set(r.id, r); }
  const freshMarks = [];
  const have = new Set([...Lib.marks.values()].map(m => m.gameId + "|" + m.path.join(" ")));
  for (const m of marks || []) {
    const gid = idMap.get(m.gameId);
    if (gid == null) continue;
    const key = gid + "|" + (m.path || []).join(" ");
    if (have.has(key)) continue;
    have.add(key);
    const rec = Object.assign({}, m, { gameId: gid });
    delete rec.id;
    freshMarks.push(rec);
  }
  if (freshMarks.length) await DB.putMany("marks", freshMarks);
  for (const m of freshMarks) Lib.marks.set(m.id, m);
  LocalIdx = null;
  return { games: fresh.length, dup, marks: freshMarks.length };
}
async function migrateLegacy() {
  if (LS.get("ajedrezMigratedV3", false)) return;
  const recs = [];
  let nStudies = 0, nBase = 0;
  const studies = LS.get("ajedrezStudioSaves", []);
  if (Array.isArray(studies)) for (const it of studies) {
    const g = legacyStudyGame(it);
    if (!g || !g.root.children.length) continue;
    recs.push(recordFromGame(g, { title: it.name || defaultTitle(g.headers), srs: it.srs && it.srs.reps > 0 ? it.srs : null, created: it.date || Date.now(), updated: it.date || Date.now() }));
    nStudies++;
  }
  const rawDb = LS.get("ajedrezStudioDb", null);
  if (typeof rawDb === "string" && rawDb.trim() && !isSampleDb(rawDb)) {
    for (const part of Pgn.splitGames(rawDb)) {
      const r = Pgn.parseGame(part);
      if (!r.count) continue;
      recs.push(recordFromGame(r.game, { tags: ["base antigua"] }));
      nBase++;
    }
  }
  try {
    const res = await importRecords(recs, []);
    try { localStorage.removeItem("ajedrezStudioSaves"); localStorage.removeItem("ajedrezStudioDb"); } catch {}
    LS.set("ajedrezMigratedV3", true);
    if (nStudies || nBase) toast(`📚 Biblioteca nueva: se han pasado ${nStudies} estudios${nBase ? ` y ${nBase} partidas de tu base PGN anterior (etiqueta «base antigua»)` : ""}${res.dup ? ` (${res.dup} duplicados omitidos)` : ""}.`, 7000);
  } catch (e) { console.warn("Migración pendiente:", e); }
}
/* Otra pestaña ha cambiado la biblioteca: se recarga lo guardado (no la partida del tablero) */
const reloadLibraryFromOtherTab = debounce(async () => {
  try {
    const games = await DB.all("games"), marks = await DB.all("marks");
    Lib.games = new Map(games.map(r => [r.id, r]));
    Lib.marks = new Map(marks.map(m => [m.id, m]));
  } catch { return; }
  LocalIdx = null;
  if (ui.libId && !Lib.games.has(ui.libId)) { ui.libId = null; toast("⚠ La partida del tablero se ha borrado de la biblioteca en otra pestaña.", 5000); }
  else if (ui.libId && ui.recUpdated && Lib.games.get(ui.libId).updated > ui.recUpdated) toast("⚠ Esta partida se ha modificado en otra pestaña. Vuelve a abrirla desde la biblioteca para ver esos cambios.", 6000);
  refreshLibraryViews();
  renderMoves();
}, 300);
if (libChannel) libChannel.onmessage = e => { if (e.data && e.data.tab !== TAB_ID && Lib.ready) reloadLibraryFromOtherTab(); };

async function initLibrary() {
  await DB.open();
  try {
    for (const r of await DB.all("games")) Lib.games.set(r.id, r);
    for (const m of await DB.all("marks")) Lib.marks.set(m.id, m);
  } catch (e) { toast("❌ No se pudo leer la biblioteca: " + e.message, 6000); }
  await migrateLegacy();
  Lib.ready = true;
  if (ui.libId && !Lib.games.has(ui.libId)) ui.libId = null;
  if (!ui.libId && ui.legacyStudy) {
    const r = [...Lib.games.values()].find(x => x.title === ui.legacyStudy);
    if (r) ui.libId = r.id;
  }
  if (ui.libId) { const r = Lib.games.get(ui.libId); ui.recUpdated = ui.recUpdated || r.updated; ui.fav = !!r.fav; if (!ui.tags.length) ui.tags = (r.tags || []).slice(); $("gameTags").value = ui.tags.join(", "); }
  refreshLibraryViews();
  renderMoves();
}
function refreshLibraryViews() {
  if (!Lib.ready) { updateSaveState(); return; }
  renderTagOptions();
  renderLibrary();
  renderMarks();
  const now = Date.now();
  const gDue = [...Lib.games.values()].filter(r => r.srs && r.srs.due <= now).length;
  $("gameDueBadge").textContent = `${gDue} pendiente${gDue === 1 ? "" : "s"}`;
  $("gameDueBadge").className = "srs-pill" + (gDue ? " due" : "");
  const cDue = trainableMarks(false).length;
  $("cardDueBadge").textContent = `${cDue} pendiente${cDue === 1 ? "" : "s"}`;
  $("cardDueBadge").className = "srs-pill" + (cDue ? " due" : "");
  updateSaveState();
  updateStorage();
  renderStatsSoon();
  renderDrillInfoSoon();
}
const renderDrillInfoSoon = debounce(() => renderDrillInfo(), 500);

/* ---------- B11. Explorador «Mi biblioteca + .pgn abierto» ---------- */
async function buildLocalIndex() {
  if (LocalIdxBuilding) return;
  LocalIdxBuilding = true;
  const idx = new Map();
  const sources = [...[...Lib.games.values()].map(r => ({ lib: r.id })), ...Coll.games.map((g, i) => ({ coll: i }))];
  for (let k = 0; k < sources.length; k++) {
    const src = sources[k];
    let r, h;
    if (src.lib != null) { const rec = Lib.games.get(src.lib); if (!rec) continue; r = Pgn.parseGame(rec.pgn, { lang: "en" }); }
    else r = Pgn.parseGame(Coll.games[src.coll], { lang: "auto" });
    h = r.game.headers;
    const res = (h.Result || "*").trim();
    const wElo = +h.WhiteElo || 0, bElo = +h.BlackElo || 0;
    let n = r.game.root;
    while (n.children.length) {
      const c = n.children[0];
      let e = idx.get(n.key);
      if (!e) { e = { moves: new Map(), games: [] }; idx.set(n.key, e); }
      let mv = e.moves.get(c.san);
      if (!mv) { mv = { san: c.san, white: 0, draws: 0, black: 0, elo: 0, eloN: 0 }; e.moves.set(c.san, mv); }
      if (res === "1-0") mv.white++; else if (res === "0-1") mv.black++; else mv.draws++;
      if (wElo && bElo) { mv.elo += (wElo + bElo) / 2; mv.eloN++; }
      if (e.games.length < 30 && (!e.games.length || e.games[e.games.length - 1].k !== k)) e.games.push(Object.assign({ h, k, path: Pgn.pathTo(n).slice(1).map(x => x.uci) }, src));
      n = c;
    }
    if (k % 25 === 24) {
      $("explorerMovesBody").innerHTML = `<tr><td colspan="4" class="small">Indexando: ${k + 1} / ${sources.length} partidas…</td></tr>`;
      await new Promise(r2 => setTimeout(r2, 0));
    }
  }
  LocalIdx = idx;
  LocalIdxBuilding = false;
}
async function renderLocalExplorer(node) {
  const tbody = $("explorerMovesBody"), gbody = $("explorerGamesBody");
  $("explorerHint").textContent = "Estadísticas de las partidas de tu biblioteca y del .pgn que tengas abierto. Funciona sin conexión.";
  $("explorerOpening").textContent = "";
  if (!Lib.games.size && !Coll.games.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="small">Tu biblioteca está vacía y no hay ningún .pgn abierto (pestaña «📚 Biblioteca»).</td></tr>`;
    gbody.innerHTML = `<tr><td colspan="5" class="small">—</td></tr>`;
    return;
  }
  if (!LocalIdx) await buildLocalIndex();
  if (cur() !== node || ui.activeTab !== "explorer" || $("explorerDbSelect").value !== "local") return;
  const e = LocalIdx && LocalIdx.get(node.key);
  const rows = e ? [...e.moves.values()].map(m => Object.assign({}, m, { averageRating: m.eloN ? Math.round(m.elo / m.eloN) : 0 })).sort((a, b) => (b.white + b.draws + b.black) - (a.white + a.draws + a.black)) : [];
  explorerMoveRows(node, rows);
  gbody.innerHTML = "";
  if (!e || !e.games.length) { gbody.innerHTML = `<tr><td colspan="5" class="small">Ninguna partida tuya pasa por aquí.</td></tr>`; return; }
  for (const src of e.games) {
    const h = src.h;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(h.White || "?")}</td><td>${esc(h.Black || "?")}</td><td><b>${esc(h.Result || "*")}</b></td><td>${esc((h.Date || "").slice(0, 4))}</td><td>${src.lib != null ? `<span class="srs-pill ok" title="En tu biblioteca">📚</span>` : `<span class="srs-pill" title="Del .pgn abierto">🗂</span>`}</td>`;
    tr.onclick = () => {
      if (src.lib != null) { if (openLibGame(src.lib, src.path)) switchTab("study"); }
      else loadCollGame(src.coll);
    };
    gbody.append(tr);
  }
}

function renderLocalEcoList() {
  const q = ($("ecoSearchInput").value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tbody = $("ecoLocalList");
  tbody.innerHTML = "";
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const item of ECO_BOOK.filter(x => x.ucis && (!q || norm(x.name).includes(q) || x.eco.toLowerCase().includes(q)))) {
    const tr = document.createElement("tr");
    const r = Pgn.parseGame(item.moves, { lang: "en" });
    const txt = Pgn.mainlineFrom(r.game.root).map(n => (n.parent.state.t === 1 ? n.parent.state.full + "." : "") + dispSan(n)).join(" ");
    tr.innerHTML = `<td><b>${esc(item.eco)}</b></td><td>${esc(item.name)}</td><td class="small">${esc(txt)}</td>`;
    tr.onclick = () => {
      const r2 = Pgn.parseGame(item.moves, { lang: "en" });
      r2.game.headers.Event = item.name;
      r2.game.headers.ECO = item.eco;
      setGame(r2.game, { name: item.name, current: Pgn.mainlineFrom(r2.game.root).pop() });
    };
    tbody.append(tr);
  }
}

/* ---------- 23. Finales: Syzygy ---------- */
const TB_SIDE = { win: "🏆 Ganan las {s}", "maybe-win": "Ganan las {s} (dudoso por la regla de 50)", "cursed-win": "Ganan las {s}, pero la regla de 50 jugadas lo deja en tablas", draw: "🟰 Tablas teóricas", "blessed-loss": "Pierden las {s}, pero se salvan por la regla de 50 jugadas", "maybe-loss": "Pierden las {s} (dudoso por la regla de 50)", loss: "❌ Pierden las {s}", unknown: "Desconocido" };
const TB_MOVE = { loss: "🏆 Gana", "maybe-loss": "Gana (dudoso)", "blessed-loss": "Gana, pero tablas por la regla de 50", draw: "🟰 Tablas", "cursed-win": "Pierde, pero tablas por la regla de 50", "maybe-win": "Pierde (dudoso)", win: "❌ Pierde", unknown: "?" };
function pieceCount(s) { let n = 0; for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (s.b[i] !== ".") n++; } return n; }
async function fetchTablebase(s) {
  const res = await Lichess.fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(Chess.toFen(s).replace(/ /g, "_"))}`);
  if (res.status === 429) throw Error("Demasiadas consultas; espera un minuto.");
  if (!res.ok) throw Error("Error " + res.status);
  return res.json();
}
async function querySyzygy() {
  const node = cur(), s = node.state;
  const tbody = $("syzygyTableBody"), status = $("syzygyStatusText");
  const n = pieceCount(s);
  if (n > 7) {
    status.textContent = `Hay ${n} piezas en el tablero; Syzygy cubre como máximo 7.`;
    tbody.innerHTML = `<tr><td colspan="4" class="small">Carga un final de abajo o simplifica la posición.</td></tr>`;
    return;
  }
  status.textContent = "Consultando la base Syzygy…";
  try {
    const data = await fetchTablebase(s);
    if (cur() !== node) return;
    const side = s.t === 1 ? "blancas" : "negras";
    let v = (TB_SIDE[data.category] || data.category).replace("{s}", side);
    if (data.checkmate) v = "Jaque mate";
    else if (data.stalemate) v = "Rey ahogado";
    if (data.dtm != null) v += ` · mate en ${Math.ceil(Math.abs(data.dtm) / 2)}`;
    status.textContent = v;
    tbody.innerHTML = "";
    for (const m of data.moves || []) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><b>${esc(formatSan(m.san, settings.lang, s.t))}</b></td><td>${TB_MOVE[m.category] || esc(m.category)}</td><td class="num">${m.dtz != null ? Math.abs(m.dtz) : "—"}</td><td class="num">${m.dtm != null ? Math.abs(m.dtm) : "—"}</td>`;
      tr.onclick = () => {
        if (cur() !== node || !canUserMove()) return;
        const mv = Chess.moveFromUci(s, m.uci);
        if (mv) playMove(mv, "user");
      };
      tbody.append(tr);
    }
    if (!(data.moves || []).length) tbody.innerHTML = `<tr><td colspan="4" class="small">No hay jugadas legales.</td></tr>`;
  } catch (e) {
    status.textContent = "No se pudo consultar Syzygy (" + (e.message || "sin conexión") + ").";
  }
}
const debouncedSyzygy = debounce(querySyzygy, 300);
async function tbReply() {
  const node = cur();
  if (gameStatus(node).over || pieceCount(node.state) > 7) { debouncedSyzygy(); return; }
  ui.cpu.thinking = true;
  renderStatus();
  try {
    const data = await fetchTablebase(node.state);
    ui.cpu.thinking = false;
    if (cur() !== node || !data.moves || !data.moves.length) { render(); return; }
    const mv = Chess.moveFromUci(node.state, data.moves[0].uci);
    if (mv) playMove(mv, "cpu");
  } catch (e) { ui.cpu.thinking = false; toast("Syzygy no responde: " + e.message); render(); }
}
function initEndgamePresets() {
  const box = $("endgamePresets");
  for (const eg of CLASSIC_ENDGAMES) {
    const b = document.createElement("button");
    b.className = "sm-btn";
    b.textContent = eg.name;
    b.onclick = () => {
      const g = Pgn.newGame(eg.fen);
      g.headers.Event = eg.name;
      g.root.comment = eg.note;
      setGame(g, { name: eg.name });
      $("endgameNote").hidden = false;
      $("endgameNote").textContent = eg.note;
      querySyzygy();
    };
    box.append(b);
  }
}

/* ---------- 24. Editor de posición ---------- */
function buildEditorPalettes() {
  const mk = (row, codes) => {
    row.innerHTML = "";
    for (const code of codes) {
      const b = document.createElement("button");
      b.className = "palette-btn" + (editor.tool === code ? " active" : "");
      b.title = code === "ERASE" ? "Goma: pulsa casillas para vaciarlas" : code === "MOVE" ? "Mano: mover piezas (arrastrando o con dos clics)" : cap(PIECE_LABEL[code]) + " (arrástrala al tablero o elígela y pulsa casillas)";
      b.innerHTML = code === "ERASE" ? "🗑" : code === "MOVE" ? "✋" : `<div class="pal-piece">${getPieceHTML(code, settings.pieceStyle)}</div>`;
      b.onclick = () => { editor.tool = code; editor.sel = null; ui.selected = null; buildEditorPalettes(); renderBoard(); };
      if (code !== "ERASE" && code !== "MOVE") {
        b.addEventListener("pointerdown", e => {
          if (e.button !== 0) return;
          e.preventDefault();
          ui.drag = { palette: true, from: null, piece: code, x0: e.clientX, y0: e.clientY, ghost: null, moved: false };
        });
      }
      row.append(b);
    }
  };
  mk($("paletteWhite"), ["MOVE", "K", "Q", "R", "B", "N", "P"]);
  mk($("paletteBlack"), ["ERASE", "k", "q", "r", "b", "n", "p"]);
}
function editorMsg(text, bad) { const m = $("edMsg"); m.textContent = text; m.className = "small" + (bad ? " msg-err" : ""); }
function editorChanged() {
  ui.selected = editor.sel;
  syncEditorForm();
  renderBoard();
  renderBars();
}
const backRank = i => i >> 4 === 0 || i >> 4 === 7;
function editorPlace(i, code) {
  const b = editor.state.b;
  if ((code === "P" || code === "p") && backRank(i)) { editorChanged(); editorMsg("⚠ Los peones no pueden estar en la 1ª u 8ª fila.", true); return; }
  if (code === "K" || code === "k") for (let x = 0; x < 128; x++) if (b[x] === code) b[x] = ".";
  b[i] = code;
  editorChanged();
}
function editorMovePiece(from, to) {
  const b = editor.state.b, p = b[from];
  if (p === ".") return;
  if (to == null) { b[from] = "."; editorChanged(); editorMsg(`${cap(PIECE_LABEL[p])} retirado del tablero.`); return; }
  if (to === from) { editorChanged(); return; }
  if ((p === "P" || p === "p") && backRank(to)) { editorChanged(); editorMsg("⚠ Los peones no pueden estar en la 1ª u 8ª fila.", true); return; }
  b[to] = p;
  b[from] = ".";
  editorChanged();
}
function editorClick(i) {
  const b = editor.state.b, t = editor.tool;
  if (t === "MOVE") {
    if (editor.sel == null) { if (b[i] !== ".") editor.sel = i; editorChanged(); return; }
    const from = editor.sel;
    editor.sel = null;
    if (from === i) { editorChanged(); return; }
    editorMovePiece(from, i);
    return;
  }
  if (t === "ERASE") { b[i] = "."; editorChanged(); return; }
  if (b[i] === t) { b[i] = "."; editorChanged(); return; }
  editorPlace(i, t);
}
function editorFenFromForm() {
  const s = editor.state;
  s.t = $("edTurn").value === "w" ? 1 : -1;
  s.c = ($("edCK").checked ? 1 : 0) | ($("edCQ").checked ? 2 : 0) | ($("edCk").checked ? 4 : 0) | ($("edCq").checked ? 8 : 0);
  s.ep = -1;
  try { editor.state = Chess.parseFen(Chess.toFen(s)); } catch {}
  syncEditorForm();
  renderBoard();
}
function syncEditorForm() {
  const s = editor.state;
  try { const sane = Chess.parseFen(Chess.toFen(s)); s.c = sane.c; } catch {}
  $("edTurn").value = s.t === 1 ? "w" : "b";
  $("edCK").checked = !!(s.c & 1); $("edCQ").checked = !!(s.c & 2); $("edCk").checked = !!(s.c & 4); $("edCq").checked = !!(s.c & 8);
  if (document.activeElement !== $("edFen")) $("edFen").value = Chess.toFen(s);
  $("edMsg").textContent = "";
}
function validatePosition(s) {
  const cnt = Chess.material(s);
  if ((cnt.K || 0) !== 1 || (cnt.k || 0) !== 1) return "Debe haber exactamente un rey de cada color.";
  if ((cnt.P || 0) > 8 || (cnt.p || 0) > 8) return "No puede haber más de 8 peones por bando.";
  for (let c = 0; c < 8; c++) if ("Pp".includes(s.b[c]) || "Pp".includes(s.b[112 + c])) return "Los peones no pueden estar en la 1ª u 8ª fila.";
  if (Chess.inCheck(s, -s.t)) return `El rey de las ${s.t === 1 ? "negras" : "blancas"} está en jaque pero no les toca mover: posición imposible.`;
  return null;
}
function openEditor() {
  if (trainer.active) stopTraining(true);
  if (ui.cpu.on) stopCpu(true);
  if (Guess.active) guessStop();
  if (Vis.active) visStop(true);
  stopAutoplay();
  Engine.cancel("live");
  editor.active = true;
  editor.state = Chess.clone(cur().state);
  editor.state.ep = -1;
  editor.state.half = 0;
  editor.origin = Chess.clone(editor.state);
  editor.sel = null;
  editor.tool = "MOVE";
  ui.selected = null;
  setEditorUi(true);
  buildEditorPalettes();
  syncEditorForm();
  render();
  editorMsg("");
  setTimeout(() => { const r = $("topBar").getBoundingClientRect(); if (r.top < 60 || r.top > innerHeight * 0.6) $("topBar").scrollIntoView({ block: "start", behavior: "smooth" }); }, 50);
}
function setEditorUi(on) {
  document.body.classList.toggle("editing", on);
  $("editorPanel").hidden = !on;
  $("toggleEditorModeBtn").textContent = on ? "✖ Cerrar editor" : "✏ Colocar piezas";
  $("editPosBtn").textContent = on ? "✖ Cerrar editor" : "✏ Colocar piezas";
}
function closeEditor() {
  editor.active = false;
  editor.sel = null;
  ui.selected = null;
  setEditorUi(false);
  render();
}
function applyEditor() {
  const err = validatePosition(editor.state);
  if (err) { editorMsg("⚠ " + err, true); return false; }
  if (!confirmLeave()) return false;
  const fen = Chess.toFen(editor.state);
  editor.active = false;
  editor.sel = null;
  setEditorUi(false);
  ui.dirty = false;
  loadFen(fen);
  return true;
}

/* ---------- 25. Entrenador con repetición espaciada ---------- */
const SRS_DAYS = [0, 1, 3, 7, 16, 35, 75];
function trainerUserTurn() { return trainer.side === 0 || cur().state.t === trainer.side; }
function trainFeedback(html, kind) {
  const el = $("trainFeedback");
  el.hidden = false;
  el.innerHTML = html;
  el.style.borderColor = kind === "ok" ? "var(--accent)" : kind === "bad" ? "var(--danger)" : "var(--border)";
}
function startTraining(opts = {}) {
  if (!game.root.children.length) { toast("Carga o crea antes una línea (con sus variantes) para entrenarla."); return; }
  if (editor.active) closeEditor();
  if (ui.cpu.on) stopCpu(true);
  if (Guess.active) guessStop();
  if (Vis.active) visStop(true);
  stopAutoplay();
  Object.assign(trainer, {
    active: true, side: opts.side != null ? opts.side : +$("trainSide").value, errors: 0, hints: 0, correct: 0, hintLevel: 0, hintArrow: null, hintSq: -1,
    libId: opts.card ? null : ui.libId, markId: opts.markId || null, card: !!opts.card, busy: false
  });
  ui.flipped = trainer.side === -1;
  game.current = game.root;
  Engine.cancel("live");
  $("trainStatusBadge").textContent = "Activo";
  $("trainStatusBadge").className = "srs-pill ok";
  $("hintTrainBtn").disabled = false;
  $("stopTrainBtn").disabled = false;
  $("startTrainBtn").disabled = true;
  switchTab("tools");
  render();
  trainerNext();
}
function trainerNext() {
  const node = cur();
  if (!node.children.length) { finishTraining(); return; }
  if (trainerUserTurn()) {
    if (trainer.card) {
      const m = Lib.marks.get(trainer.markId);
      trainFeedback(`🧠 Tarjeta${m ? ` · ${CATS[m.cat].icon} ${esc(CATS[m.cat].name)}` : ""}: juegan las ${node.state.t === 1 ? "blancas" : "negras"}. ¿Qué jugarías?${Cards.queue.length ? `<br><span class="small">Quedan ${Cards.queue.length} más.</span>` : ""}`);
    } else trainFeedback(`Tu turno (${node.state.t === 1 ? "blancas" : "negras"}): ¿qué jugarías aquí?`);
    return;
  }
  trainer.busy = true;
  renderBoard();
  setTimeout(() => {
    if (!trainer.active) return;
    const ch = node.children;
    const pick = ch.length === 1 || Math.random() < 0.5 ? ch[0] : ch[Math.floor(Math.random() * ch.length)];
    game.current = pick;
    trainer.busy = false;
    soundFor(pick);
    render();
    trainerNext();
  }, 500);
}
function trainerUserMove(move) {
  const node = cur();
  const hit = node.children.find(c => Pgn.sameMove(c.move, move));
  if (hit) {
    trainer.correct++;
    trainer.hintLevel = 0; trainer.hintArrow = null; trainer.hintSq = -1;
    game.current = hit;
    soundFor(hit);
    trainFeedback(`✔ ¡Correcto! ${esc(numPrefix(node.state))}${esc(dispSan(hit))}${hit.comment ? `<br><span class="small">${esc(hit.comment)}</span>` : ""}`, "ok");
    render();
    setTimeout(trainerNext, hit.children.length ? 250 : 0);
  } else {
    trainer.errors++;
    Sound.play("error");
    const L = Chess.legal(node.state), san = formatSan(Chess.san(node.state, move, L), settings.lang, node.state.t);
    trainFeedback(trainer.card ? `❌ ${esc(san)} no es la jugada buscada. Inténtalo otra vez o pulsa 💡 para una pista.` : `❌ ${esc(san)} no está en tu repertorio. Errores: ${trainer.errors}. Pulsa 💡 si necesitas una pista.`, "bad");
    renderBoard();
    const el = boardEl.querySelector(`.square[data-sq="${move.to}"]`);
    if (el) el.classList.add("flash-bad");
  }
}
function trainerHint() {
  if (!trainer.active || !trainerUserTurn()) return;
  const target = cur().children[0];
  if (!target) return;
  trainer.hints++;
  trainer.hintLevel++;
  trainer.hintSq = target.move.from;
  if (trainer.hintLevel >= 2) trainer.hintArrow = { from: target.move.from, to: target.move.to };
  trainFeedback(trainer.hintLevel >= 2 ? "💡 La flecha azul indica la jugada." : "💡 La pieza que debes mover está marcada en azul. Pulsa otra vez para ver la jugada.");
  renderBoard();
}
function finishTraining() {
  const perfect = trainer.errors === 0 && trainer.hints === 0;
  if (trainer.card) {
    Sound.play(perfect ? "ok" : "end");
    finishCard(perfect);
    trainer.active = false;
    stopTraining(false);
    return;
  }
  let srsMsg = "";
  const it = trainer.libId && Lib.games.get(trainer.libId);
  if (it) {
    it.srs = it.srs || { box: 0, due: Date.now(), reps: 0 };
    it.srs.reps++;
    it.srs.box = perfect ? Math.min(SRS_DAYS.length - 1, it.srs.box + 1) : 1;
    it.srs.due = Date.now() + SRS_DAYS[it.srs.box] * 864e5;
    DB.put("games", it).catch(() => {});
    refreshLibraryViews();
    srsMsg = `<br>Próximo repaso de «${esc(it.title)}»: ${SRS_DAYS[it.srs.box] === 1 ? "mañana" : "en " + SRS_DAYS[it.srs.box] + " días"}.`;
  } else srsMsg = `<br><span class="small">Guarda la partida en tu biblioteca para que se programen los repasos.</span>`;
  Sound.play(perfect ? "ok" : "end");
  trainFeedback(`${perfect ? "🏆 ¡Línea perfecta!" : "Fin de la línea."} Aciertos: ${trainer.correct} · errores: ${trainer.errors} · pistas: ${trainer.hints}.${srsMsg}<br><span class="small">Pulsa «Empezar» para repetir (el rival puede elegir otras variantes).</span>`, perfect ? "ok" : "");
  stopTraining(false);
}
function stopTraining(silent) {
  trainer.active = false;
  trainer.busy = false;
  trainer.card = false;
  trainer.hintArrow = null;
  trainer.hintSq = -1;
  $("trainStatusBadge").textContent = "Inactivo";
  $("trainStatusBadge").className = "srs-pill";
  $("hintTrainBtn").disabled = true;
  $("stopTrainBtn").disabled = true;
  $("startTrainBtn").disabled = false;
  if (silent) $("trainFeedback").hidden = true;
  render();
}

/* ---------- 27. Pestañas, modales y botones ---------- */
function switchTab(name) {
  ui.activeTab = name;
  document.querySelectorAll(".tab-btn").forEach(b => { b.classList.toggle("active", b.dataset.tab === name); b.setAttribute("aria-selected", b.dataset.tab === name); });
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
  if (name === "explorer") refreshExplorer();
  if (name === "library") { refreshLibraryViews(); if (ui.librarySub === "collection") renderCollection(); if (ui.librarySub === "position") renderPosTarget(); }
  if (name === "tools") renderDrillInfo();
  if (name === "endgames" && pieceCount(cur().state) <= 7) querySyzygy();
}
document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

function openModal(id) {
  if (id === "settingsModal") {
    $("setEngine").value = settings.engine;
    $("setAnalysisMs").value = settings.analysisMs;
    $("setMultipv").value = settings.multipv;
    $("setLiveMs").value = settings.liveMs;
    $("setToken").value = settings.token;
    $("tokenResult").textContent = "";
    $("setCoords").checked = settings.coords;
    $("setLegal").checked = settings.showLegal;
    $("setAutosave").checked = settings.autosave;
    $("setAnimate").checked = settings.animate;
    $("setWheel").checked = settings.wheel;
  }
  if (!document.querySelector(".modal-back.open")) ui.modalReturn = document.activeElement;
  $(id).classList.add("open");
  const f = $(id).querySelector("input, select, textarea, button");
  if (f) f.focus();
}
function closeModals() {
  const open = document.querySelectorAll(".modal-back.open");
  open.forEach(m => m.classList.remove("open"));
  if (open.length && ui.modalReturn && document.contains(ui.modalReturn)) { try { ui.modalReturn.focus(); } catch {} }
  ui.modalReturn = null;
}
document.addEventListener("keydown", e => {
  if (e.key !== "Tab") return;
  const m = document.querySelector(".modal-back.open");
  if (!m) return;
  const items = [...m.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])")].filter(x => !x.disabled && x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  else if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
});
document.querySelectorAll(".modal-back").forEach(m => {
  m.addEventListener("click", e => { if (e.target === m || e.target.hasAttribute("data-close")) closeModals(); });
});
$("settingsBtn").onclick = () => openModal("settingsModal");
$("licBtn").onclick = () => openModal("licModal");
$("helpBtn").onclick = () => openHelp();
$("setEngine").onchange = e => { settings.engine = e.target.value; saveSettings(); Engine.init(); };
$("setAnalysisMs").onchange = e => { settings.analysisMs = Math.max(200, Math.min(10000, +e.target.value || 1000)); saveSettings(); };
$("setMultipv").onchange = e => { settings.multipv = +e.target.value; saveSettings(); ui.liveNode = null; requestLive(); };
$("setLiveMs").onchange = e => { settings.liveMs = Math.max(500, Math.min(30000, +e.target.value || 4000)); saveSettings(); };
$("setToken").onchange = e => { settings.token = e.target.value.trim(); saveSettings(); explorerCache.clear(); refreshExplorer(); };
$("setCoords").onchange = e => { settings.coords = e.target.checked; saveSettings(); renderBoard(); };
$("setLegal").onchange = e => { settings.showLegal = e.target.checked; saveSettings(); renderBoard(); };
$("setAnimate").onchange = e => { settings.animate = e.target.checked; saveSettings(); };
$("setWheel").onchange = e => { settings.wheel = e.target.checked; saveSettings(); };
$("setAutosave").onchange = e => { settings.autosave = e.target.checked; saveSettings(); if (!settings.autosave) { try { localStorage.removeItem("ajedrezStudioCurrent"); } catch {} } };

$("pieceStyleSelect").onchange = e => { settings.pieceStyle = e.target.value; saveSettings(); buildEditorPalettes(); render(); };
$("displayLang").onchange = e => { settings.lang = e.target.value; saveSettings(); render(); renderLocalEcoList(); };
$("themeSelect").onchange = e => { settings.theme = e.target.value; saveSettings(); document.body.dataset.theme = settings.theme; };
$("soundToggle").onclick = () => { settings.sound = !settings.sound; saveSettings(); $("soundToggle").textContent = settings.sound ? "🔊" : "🔇"; if (settings.sound) Sound.play("move"); };
$("cpuLevel").onchange = e => { settings.cpuLevel = +e.target.value; saveSettings(); };
$("playCpuToggle").onclick = () => openCpuDialog();
$("cpuStartBtn").onclick = () => startCpuGame();
$("newGame").onclick = () => {
  if (!confirmLeave()) return;
  if (editor.active) closeEditor();
  setGame(Pgn.newGame(), { name: "", noConfirm: true });
};
$("liveToggle").onchange = e => { settings.live = e.target.checked; if (!ui.cpu.on) saveSettings(); ui.liveNode = null; render(); };
$("arrowToggle").onchange = e => { settings.arrow = e.target.checked; saveSettings(); renderShapes(); };
$("threatBtn").onclick = showThreat;
$("playBestMoveBtn").onclick = () => {
  const node = cur();
  const job = Engine.running && Engine.running.purpose === "live" && ui.liveNode === node ? Engine.running : null;
  const uci = job && job.lines[0] ? job.lines[0].pv[0] : node.eval && node.eval.best;
  if (!uci) { toast("Aún no hay sugerencia del motor para esta posición."); return; }
  const m = Chess.moveFromUci(node.state, uci);
  if (m && canUserMove()) playMove(m, "user");
};
$("cloudStockfishBtn").onclick = async () => {
  const node = cur();
  $("engineSourceBadge").textContent = "☁ Consultando la nube…";
  try {
    const res = await Lichess.fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(Chess.toFen(node.state))}&multiPv=3`, { headers: authHeaders() });
    if (res.status === 404) throw Error("Esta posición no está en la nube de Lichess (sólo guarda posiciones ya analizadas).");
    if (!res.ok) throw Error("La nube de Lichess no respondió (" + res.status + ").");
    const data = await res.json();
    const lines = (data.pvs || []).map(p => ({ depth: data.depth, cp: p.cp, mate: p.mate, pv: p.moves.split(" ") }));
    if (!lines.length) throw Error("Sin datos.");
    Engine.cancel("live");
    settings.live = false;
    node.eval = { cp: lines[0].cp, mate: lines[0].mate, depth: data.depth, best: lines[0].pv[0], pv: lines[0].pv.slice(0, 14), second: lines[1] ? { cp: lines[1].cp, mate: lines[1].mate } : null, source: "nube" };
    if (cur() === node) {
      showEngineFor(node, { lines, depth: data.depth, nps: 0 });
      $("engineMeta").textContent = `nube · prof. ${data.depth} · ${Math.round(data.knodes / 1000)} M nodos`;
    }
    setEngineBadge("☁ Stockfish (nube Lichess)", "");
    updateButtons();
    renderEvalChart();
    toast("Evaluación de la nube cargada (análisis continuo en pausa).");
  } catch (e) {
    setEngineBadge("⚙ " + (Engine.name || "Motor"), Engine.note);
    toast(e.message || "No se pudo consultar la nube.", 4200);
  }
};

$("startBtn").onclick = goStart;
$("backBtn").onclick = () => { stopAutoplay(); goBack(); };
$("forwardBtn").onclick = () => { stopAutoplay(); goForward(); };
$("endBtn").onclick = goEnd;
$("playBtn").onclick = toggleAutoplay;
$("flipBtn").onclick = () => { ui.flipped = !ui.flipped; render(); };
$("undoBtn").onclick = () => {
  const n = cur();
  if (!n.parent) return;
  const size = Pgn.countMoves(n) + 1;
  if (size > 6 && !confirm(`Se borrarán ${size} jugadas (esta y todo lo que sigue). ¿Continuar?`)) return;
  goTo(Pgn.deleteNode(n));
  markDirty();
};
$("promoteVarBtn").onclick = () => { Pgn.promote(cur()); markDirty(); render(); };
$("mainVarBtn").onclick = () => { Pgn.makeMain(cur()); markDirty(); render(); };
$("clearShapesBtn").onclick = () => { cur().shapes = []; markDirty(); render(); };

$("autoAnnotateBtn").onclick = () => analyseGame();
$("analyseVarBtn").onclick = () => analyseGame({ variation: true });
$("moveTyped").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const txt = e.target.value.trim();
  if (!txt) return;
  if (!canUserMove()) { toast(ui.cpu.thinking ? "La CPU está pensando…" : "Ahora no te toca mover."); return; }
  try {
    const lang = settings.notation === "en" ? "en" : settings.notation === "es" ? "es" : "auto";
    const { move } = Chess.parseMove(cur().state, txt, lang);
    e.target.value = "";
    playMove(move, "user");
  } catch (err) { Sound.play("error"); toast("«" + txt + "»: " + err.message.replace(/^Jugada ilegal o no reconocida: .*$/, "no es una jugada legal en esta posición."), 3500); }
});
$("cancelAnalysisBtn").onclick = () => { ui.cancelAnalysis = true; Engine.cancel("batch"); };
$("explainMoveBtn").onclick = explainCurrentMove;

$("notation").onchange = e => { settings.notation = e.target.value; saveSettings(); };
$("branchMode").onchange = e => { settings.branchMode = e.target.value; saveSettings(); };
$("importBtn").onclick = () => {
  const text = $("moveInput").value;
  if (!text.trim()) { toast("Escribe o pega jugadas, un PGN o una FEN."); return; }
  if (looksLikeFen(text)) { loadFen(text); return; }
  const parts = Pgn.splitGames(text);
  const r = Pgn.parseGame(parts[0] || text, { lang: $("notation").value });
  if (setGame(r.game, { name: defaultTitle(r.game.headers).startsWith("Estudio ") ? "" : defaultTitle(r.game.headers) }) === false) return;
  let extra = " Si te interesa, pulsa «💾 Guardar en biblioteca».";
  if (parts.length > 1) { setCollection(text, true, "texto pegado"); extra = ` El texto tenía ${parts.length} partidas: se muestra la primera y todas están en «📚 Biblioteca › 🗂 Abrir .pgn» (sin guardar).`; }
  importResultMsg(r, extra);
};
function graft(src, dst) {
  for (const c of src.children) {
    const d = Pgn.addMove(dst, c.move);
    if (c.nag) d.nag = c.nag;
    if (c.posNag) d.posNag = c.posNag;
    if (c.comment) d.comment = c.comment;
    if (c.shapes.length) d.shapes = c.shapes.slice();
    graft(c, d);
  }
}
$("appendBtn").onclick = () => {
  const text = $("moveInput").value.replace(/\[[^\]]*\]/g, " ");
  const node = cur();
  const r = Pgn.parseGame({ headers: {}, movetext: text }, { lang: $("notation").value, fen: Chess.toFen(node.state) });
  if (!r.count) { importResultMsg(r); return; }
  graft(r.game.root, node);
  const first = node.children.find(c => Pgn.sameMove(c.move, r.game.root.children[0].move));
  game.current = Pgn.mainlineFrom(first).pop() || first;
  importResultMsg(r);
  markDirty();
  render();
};
$("loadFenBtn").onclick = () => {
  const t = $("moveInput").value.trim();
  if (!looksLikeFen(t)) { toast("El texto no parece una FEN (ej.: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1)", 4500); return; }
  loadFen(t);
};
$("copyPgnBtn").onclick = async () => toast((await copyText(Pgn.exportPgn(game))) ? "📋 PGN copiado (con variantes, comentarios y flechas)." : "No se pudo copiar.");
$("downloadPgnBtn").onclick = () => download(safeName($("gameName").value || `${game.headers.White}_${game.headers.Black}`) + ".pgn", Pgn.exportPgn(game), "application/x-chess-pgn");
$("copyFenBtn").onclick = async () => toast((await copyText(Chess.toFen(viewState()))) ? "📋 FEN copiada." : "No se pudo copiar.");

$("annotation").addEventListener("input", debounce(() => {
  const n = cur();
  n.comment = $("annotation").value.trim();
  n.commentAuto = false;
  renderMoves();
  markDirty();
}, 250));
document.querySelectorAll(".nag-btn").forEach(btn => btn.onclick = () => {
  const n = cur();
  if (!n.parent) return;
  if (btn.dataset.nag === "") { n.nag = ""; n.posNag = ""; }
  else n.nag = n.nag === btn.dataset.nag ? "" : btn.dataset.nag;
  n.nagAuto = false;
  markDirty();
  render();
});
document.querySelectorAll(".posnag-btn").forEach(btn => btn.onclick = () => {
  const n = cur();
  if (!n.parent) return;
  n.posNag = n.posNag === btn.dataset.nag ? "" : btn.dataset.nag;
  markDirty();
  render();
});

$("explorerDbSelect").onchange = e => { settings.explorerDb = e.target.value; saveSettings(); fetchExplorer(); };
$("ecoSearchInput").oninput = debounce(renderLocalEcoList, 120);

$("loadSampleDbBtn").onclick = () => { const n = setCollection(SAMPLE_MULTI_PGN, false, "Antología de clásicos"); toast(`🗂 ${n} partidas clásicas abiertas (sin guardar).`); };
$("openPgnFileBtn").onclick = () => $("pgnFileInput").click();
$("pgnFileInput").onchange = async e => { const files = [...e.target.files]; e.target.value = ""; if (files.length) await openPgnFiles(files); };
/* Descargar las partidas públicas de un usuario de Lichess (sin token) a la colección en memoria */
async function downloadLichessGames() {
  const user = $("liUser").value.trim();
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(user)) { toast("Escribe un nombre de usuario de Lichess válido."); $("liUser").focus(); return; }
  const max = +$("liMax").value || 50, perf = $("liPerf").value || "ultraBullet,bullet,blitz,rapid,classical,correspondence";
  const q = new URLSearchParams({ max, perfType: perf, opening: "true", clocks: "false", evals: "true", sort: "dateDesc" });
  if ($("liRated").checked) q.set("rated", "true");
  if ($("liAnalysed").checked) q.set("analysed", "true");
  const btn = $("liBtn");
  btn.disabled = true;
  btn.textContent = "⏳ Descargando…";
  $("dbStatus").textContent = `Pidiendo a Lichess las partidas de ${user}… (hasta ${max}; puede tardar unos segundos)`;
  try {
    const res = await Lichess.fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${q}`, { headers: Object.assign({ Accept: "application/x-chess-pgn" }, authHeaders()) });
    if (res.status === 404) throw Error(`no existe el usuario «${user}» en Lichess`);
    if (res.status === 429) throw Error(`Lichess pide una pausa: inténtalo en ${Lichess.waitSeconds()} s`);
    if (!res.ok) throw Error("Lichess respondió con un error " + res.status);
    const text = await res.text();
    const n = Pgn.splitGames(text).filter(g => g.movetext.trim()).length;
    if (!n) { $("dbStatus").textContent = ""; toast(`${user} no tiene partidas que coincidan con esos filtros.`, 4500); return; }
    const append = Coll.games.length > 0 && confirm(`¿Añadir las ${n} partidas de ${user} a la lista que ya tienes abierta?\n\nAceptar = añadir · Cancelar = sustituirla`);
    settings.lichessUser = user;
    saveSettings();
    setCollection(text, append, `Lichess: ${user}`);
    $("dbFilterInput").value = "";
    renderCollection();
    toast(`☁ ${n} partidas de ${user} descargadas (sólo en memoria). Guarda las que quieras con 💾.`, 4500);
  } catch (e) {
    $("dbStatus").textContent = "";
    toast("No se pudieron descargar: " + (e.message && !/fetch/i.test(e.message) ? e.message : "sin conexión con Lichess"), 5000);
  } finally {
    btn.disabled = false;
    btn.textContent = "☁ Descargar";
  }
}
$("liBtn").onclick = downloadLichessGames;
$("liUser").addEventListener("keydown", e => { if (e.key === "Enter") downloadLichessGames(); });
$("closeCollBtn").onclick = () => { if (!Coll.games.length) return; setCollection("", false); toast("Fichero cerrado y memoria liberada."); };
$("dbFilterInput").oninput = debounce(renderCollection, 150);
$("saveCollFilteredBtn").onclick = () => saveCollGames(collFiltered());

$("saveGame").onclick = () => saveToLibrary({ force: !!ui.saveError });
$("gameName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (!ui.libId) saveToLibrary({}); else markDirty(); } });
$("gameName").addEventListener("change", () => { if (ui.libId) markDirty(); });
$("gameTags").addEventListener("change", () => { ui.tags = parseTags($("gameTags").value); $("gameTags").value = ui.tags.join(", "); if (ui.libId) markDirty(); });
$("favToggle").onclick = async () => {
  ui.fav = !ui.fav;
  if (ui.libId && Lib.games.has(ui.libId)) markDirty();
  else if (ui.fav && !(await saveToLibrary({}))) ui.fav = false;
  updateSaveState();
};
$("markBtn").onclick = openMarkDialog;
$("markBtn2").onclick = openMarkDialog;
$("markSaveBtn").onclick = saveMark;
$("markDeleteBtn").onclick = async () => { if (ui.markCtx && ui.markCtx.existing) { await deleteMark(ui.markCtx.existing.id, true); closeModals(); } };
$("markTrain").onchange = () => { if (ui.markCtx) ui.markCtx.trainTouched = true; };
$("markCatFilter").innerHTML = `<option value="">Todas las categorías</option>` + Object.entries(CATS).map(([k, c]) => `<option value="${k}">${c.icon} ${c.name}</option>`).join("");
$("markCatFilter").onchange = renderMarks;
$("markFilter").oninput = debounce(renderMarks, 150);
$("commentSearchBtn").onclick = searchComments;
$("commentSearch").addEventListener("keydown", e => { if (e.key === "Enter") searchComments(); });
document.querySelectorAll(".sub-btn").forEach(b => b.onclick = () => switchSub(b.dataset.sub));
function switchSub(name) {
  ui.librarySub = name;
  document.querySelectorAll(".sub-btn").forEach(b => b.classList.toggle("active", b.dataset.sub === name));
  document.querySelectorAll(".subpane").forEach(p => { p.hidden = p.id !== "sub-" + name; });
  if (name === "collection") renderCollection();
  if (name === "search") setTimeout(() => $("commentSearch").focus(), 30);
  if (name === "stats" && !Batch.running) renderStats();
  if (name === "position") renderPosTarget();
}
$("myNamesSave").onclick = saveMyNames;
$("myNames").onkeydown = e => { if (e.key === "Enter") saveMyNames(); };
["stPeriod", "stTc", "stColor", "stBatchMs"].forEach(id => $(id).onchange = () => renderStats());
$("drillType").onchange = renderDrillInfo;
$("drillMine").onchange = renderDrillInfo;
$("drillDueBtn").onclick = () => startDrills("due");
$("drillAllBtn").onclick = () => startDrills("all");
$("posMode").onchange = renderPosTarget;
$("posBtn").onclick = searchPosition;
$("libFilter").oninput = debounce(renderLibrary, 150);
$("libTagFilter").onchange = renderLibrary;
$("libSort").onchange = renderLibrary;
$("libSelectAll").onchange = e => { Lib.sel = new Set(e.target.checked ? libFiltered().map(r => r.id) : []); renderLibrary(); };
$("libDeleteSel").onclick = () => deleteLibGames([...Lib.sel]);
$("libExportPgn").onclick = () => {
  const list = Lib.sel.size ? [...Lib.sel].map(id => Lib.games.get(id)).filter(Boolean) : libFiltered();
  if (!list.length) { toast("No hay partidas que exportar."); return; }
  download(`biblioteca_${list.length}_partidas.pgn`, list.map(r => r.pgn.trim()).join("\n\n") + "\n", "application/x-chess-pgn");
};
$("libBackup").onclick = () => {
  const data = { app: "AjedrezBase", version: 3, exported: new Date().toISOString(), games: [...Lib.games.values()], marks: [...Lib.marks.values()] };
  download(`ajedrezbase_copia_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), "application/json");
};
$("libRestore").onclick = () => $("jsonFileInput").click();
$("jsonFileInput").onchange = async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    let res;
    if (Array.isArray(data)) {
      const recs = data.map(it => { const g = legacyStudyGame(it); return g && g.root.children.length ? recordFromGame(g, { title: it.name }) : null; }).filter(Boolean);
      res = await importRecords(recs, []);
    } else if (data && Array.isArray(data.games)) res = await importRecords(data.games, data.marks || []);
    else throw Error();
    refreshLibraryViews();
    toast(`⬆ Copia restaurada: ${res.games} partidas nuevas${res.dup ? `, ${res.dup} ya estaban` : ""}, ${res.marks} marcadores.`, 5000);
  } catch { toast("El archivo no es una copia válida de AjedrezBase."); }
};
$("persistBtn").onclick = async () => {
  try {
    const ok = await navigator.storage.persist();
    toast(ok ? "🔒 Hecho: el navegador no borrará tu biblioteca aunque le falte espacio." : "El navegador no ha concedido la protección (suele concederla si usas la página a menudo o la añades a marcadores).", 5000);
  } catch { toast("Este navegador no permite proteger los datos."); }
  updateStorage();
};
$("storageRefreshBtn").onclick = () => updateStorage();
$("cardsDueBtn").onclick = () => startCards(false);
$("cardsAllBtn").onclick = () => startCards(true);
$("cardsBackBtn").onclick = restoreStash;

$("querySyzygyBtn").onclick = querySyzygy;
$("tbPractice").onchange = e => { if (e.target.checked) toast("Haz tu jugada: la tabla responderá con la defensa perfecta."); };

$("toggleEditorModeBtn").onclick = () => (editor.active ? closeEditor() : openEditor());
$("editPosBtn").onclick = () => (editor.active ? closeEditor() : openEditor());
$("edCurrentBtn").onclick = () => { editor.state = Chess.clone(editor.origin); editor.sel = null; editorChanged(); };
$("edFlipBtn").onclick = () => { ui.flipped = !ui.flipped; renderBoard(); renderBars(); };
$("edPlayCpuBtn").onclick = () => { if (editor.active) { openCpuDialog(); $("cpuFrom").value = "here"; } };
$("edClearBoardBtn").onclick = () => { editor.state.b = Array(128).fill("."); editor.state.c = 0; editor.sel = null; editorChanged(); editorMsg("Tablero vacío: recuerda poner los dos reyes."); };
$("edKingsBtn").onclick = () => { editor.state.b = Array(128).fill("."); editor.state.b[Chess.sqIdx("e1")] = "K"; editor.state.b[Chess.sqIdx("e8")] = "k"; editor.state.c = 0; editor.sel = null; editorChanged(); };
$("edStartPosBtn").onclick = () => { editor.state = Chess.parseFen(Chess.START_FEN); editor.sel = null; editorChanged(); };
$("edApplyBtn").onclick = applyEditor;
$("edCancelBtn").onclick = closeEditor;
["edTurn", "edCK", "edCQ", "edCk", "edCq"].forEach(id => $(id).onchange = editorFenFromForm);
$("edFen").onchange = e => {
  try { editor.state = Chess.parseFen(e.target.value); editor.sel = null; editorChanged(); }
  catch (err) { $("edMsg").className = "small msg-err"; $("edMsg").textContent = "⚠ " + err.message; }
};

$("startTrainBtn").onclick = () => startTraining();
$("guessStartBtn").onclick = startGuess;
$("visStartBtn").onclick = startVis;
$("visMode").onchange = () => { $("visPlies").hidden = $("visMode").value !== "line"; };
$("blindBtn").onclick = () => setBlind(!ui.blind);
$("peekBtn").onclick = peekPieces;
$("blindCpuBtn").onclick = () => openCpuDialog(true);
$("stopTrainBtn").onclick = () => { stopTraining(false); trainFeedback("Entrenamiento detenido."); };
$("hintTrainBtn").onclick = trainerHint;
$("trainDueBtn").onclick = () => {
  const due = [...Lib.games.values()].filter(r => r.srs && r.srs.due <= Date.now()).sort((x, y) => x.srs.due - y.srs.due);
  if (!due.length) { toast("¡No tienes partidas pendientes de repaso hoy! 🎉 (Entrena una partida guardada para programarla.)", 4000); return; }
  if (openLibGame(due[0].id)) startTraining({});
};

/* ---------- B12. Resúmenes de análisis guardados y análisis por lotes ---------- */
const hasPgnEvals = rec => /\[%eval /.test(rec.pgn || "");
const triedSummary = new Set();
function summaryFromPgn(rec) {
  const r = Pgn.parseGame(rec.pgn, { lang: "en" });
  const nodes = [r.game.root, ...Pgn.mainlineFrom(r.game.root)];
  for (const n of nodes) if (!n.eval) { const t = terminalEval(n); if (t) n.eval = t; }
  if (!nodes[0].eval && Chess.toFen(nodes[0].state) === Chess.START_FEN) nodes[0].eval = { cp: 20, depth: 0, source: "pgn" };
  if (nodes.length < 3 || nodes.filter(n => n.eval).length < nodes.length * 0.7) return null;
  return analysisSummary(buildGameReport(nodes, r.game.headers), r.game.root, "pgn");
}
/* Las partidas con evaluaciones en el PGN (analizadas en versiones anteriores o por Lichess) se resumen una vez */
async function ensureSummaries(recs) {
  const changed = [];
  let k = 0;
  for (const rec of recs) {
    if (rec.analysis || !hasPgnEvals(rec)) continue;
    const tag = rec.id + ":" + rec.updated;
    if (triedSummary.has(tag)) continue;
    triedSummary.add(tag);
    let a = null;
    try { a = summaryFromPgn(rec); } catch (e) { console.warn("Resumen del análisis:", e); }
    if (a) { rec.analysis = a; changed.push(rec); }
    if (++k % 15 === 0) await new Promise(r => setTimeout(r, 0));
  }
  if (changed.length) { try { await DB.putMany("games", changed); } catch (e) { console.warn("No se pudieron guardar los resúmenes:", e); } }
  return changed.length;
}
const Batch = { running: false, cancel: false, done: 0, total: 0, status: "" };
async function analyseRecordHeadless(rec, ms, onPos) {
  const r = Pgn.parseGame(rec.pgn, { lang: "en" });
  const g = r.game, nodes = [g.root, ...Pgn.mainlineFrom(g.root)];
  for (let i = 0; i < nodes.length; i++) {
    if (Batch.cancel) return false;
    const n = nodes[i], term = terminalEval(n);
    if (term) n.eval = term;
    else if (!(n.eval && n.eval.source !== "pgn" && (n.eval.depth || 0) >= 10)) {
      let job = await Engine.analyse(n, { purpose: "batch", movetime: ms, multipv: Engine.kind === "stockfish" ? 2 : 1 });
      if (!job && !Batch.cancel) job = await Engine.analyse(n, { purpose: "batch", movetime: ms, multipv: Engine.kind === "stockfish" ? 2 : 1 });
      if (job) storeEval(n, job, true);
    }
    onPos && onPos(i + 1, nodes.length);
  }
  annotateNodes(nodes);
  g.analysis = analysisSummary(buildGameReport(nodes, g.headers), g.root, "motor");
  const fresh = Lib.games.get(rec.id);
  if (!fresh || fresh.updated !== rec.updated || fresh.id === ui.libId) return false;   // cambió mientras tanto
  const upd = Object.assign({}, fresh, recordFromGame(g, { title: fresh.title, fav: fresh.fav, tags: fresh.tags || [], created: fresh.created, srs: fresh.srs || null }));
  upd.id = fresh.id;
  upd.drills = fresh.drills;
  await DB.put("games", upd);
  Lib.games.set(upd.id, upd);
  return true;
}
async function analysePending(recs) {
  if (ui.analysing || Batch.running) { toast("Ya hay un análisis en marcha."); return; }
  if (quiz()) { toast("Termina antes el ejercicio."); return; }
  const list = recs.filter(r => r.id !== ui.libId);
  if (!list.length) { toast("La partida que tienes abierta se analiza con «🤖 Analizar y comentar»."); return; }
  const ms = +$("stBatchMs").value;
  Object.assign(Batch, { running: true, cancel: false, done: 0, total: list.length });
  ui.analysing = true;
  Engine.cancel("live");
  renderStatsBatch();
  let ok = 0;
  for (const rec of list) {
    if (Batch.cancel) break;
    try {
      const res = await analyseRecordHeadless(rec, ms, (i, n) => { Batch.status = `«${rec.title}»: posición ${i} de ${n}`; renderStatsBatch(); });
      if (res) ok++;
    } catch (e) { console.warn("Análisis por lotes:", e); }
    Batch.done++;
    renderStatsBatch();
  }
  const cancelled = Batch.cancel;
  Object.assign(Batch, { running: false, cancel: false, status: "" });
  ui.analysing = false;
  LocalIdx = null;
  toast(`${cancelled ? "⏹ Análisis detenido" : "✔ Análisis terminado"}: ${ok} partida${ok === 1 ? "" : "s"} analizada${ok === 1 ? "" : "s"} con ${Engine.name}.`, 5000);
  refreshLibraryViews();
  requestLive();
}

/* ---------- B13. Estadísticas personales ---------- */
const TC_CATS = { bullet: "Bala", blitz: "Blitz", rapid: "Rápidas", classical: "Clásicas", corr: "Correspondencia" };
const THEMES = {
  material: { name: "Perder material (táctica)", icon: "♟", drill: "material" },
  mateMissed: { name: "Mates que se te escaparon", icon: "🎯", drill: "mateMissed" },
  mateAllowed: { name: "Mates que permitiste", icon: "🛡", drill: "mateAllowed" },
  wasted: { name: "Ventajas ganadoras desperdiciadas", icon: "🏁", drill: "wasted" },
  positional: { name: "Errores de planteamiento", icon: "🧭", drill: "positional" }
};
function myNameList() {
  // Separados por «;»: los nombres de los PGN suelen llevar coma («Kasparov, Garry»)
  return String(settings.myNames || settings.lichessUser || "").split(";").map(x => norm(x).trim()).filter(Boolean);
}
function colorOfMe(rec, names) {
  if (!names.length) return 0;
  const w = norm(rec.white).trim(), b = norm(rec.black).trim();
  return names.includes(w) ? 1 : names.includes(b) ? -1 : 0;
}
function timeCat(rec) {
  let tc = rec.timeControl;
  if (!tc) { const m = /\[TimeControl "([^"]*)"\]/.exec(rec.pgn || ""); tc = m ? m[1] : ""; }
  if (tc === "-") return "corr";
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc);
  if (m) { const est = +m[1] + 40 * (+m[2] || 0); return est < 180 ? "bullet" : est < 480 ? "blitz" : est < 1500 ? "rapid" : "classical"; }
  const ev = norm(rec.event);
  if (/bullet|bala/.test(ev)) return "bullet";
  if (/blitz/.test(ev)) return "blitz";
  if (/rapid|rapida/.test(ev)) return "rapid";
  if (/classical|clasica/.test(ev)) return "classical";
  if (/correspondence|correspondencia/.test(ev)) return "corr";
  return "";
}
function gameTime(rec) {
  const m = /^(\d{4})\.(\d{2}|\?\?)?\.?(\d{2}|\?\?)?/.exec(rec.date || "");
  if (m && +m[1] > 1000) return new Date(+m[1], m[2] && m[2] !== "??" ? +m[2] - 1 : 0, m[3] && m[3] !== "??" ? +m[3] : 1).getTime();
  return rec.created || 0;
}
let ECO_NAMES = null;
function ecoName(code) {
  if (!ECO_NAMES) { ECO_NAMES = new Map(); for (const e of ECO_BOOK) if (!ECO_NAMES.has(e.eco)) ECO_NAMES.set(e.eco, e.name.split(" · ")[0]); }
  return ECO_NAMES.get(code) || "";
}
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (x, n) => (n ? Math.round((x / n) * 100) : null);
function scoreOf(res, c) { return res === "1-0" ? (c === 1 ? 1 : 0) : res === "0-1" ? (c === -1 ? 1 : 0) : res === "1/2-1/2" ? 0.5 : null; }
function computeStats(f) {
  const names = myNameList(), since = f.period ? Date.now() - f.period * 864e5 : 0;
  const blank = () => ({ games: 0, w: 0, d: 0, l: 0, pts: 0, fin: 0, accs: [] });
  const S = Object.assign(blank(), { analysed: 0, byColor: { 1: blank(), "-1": blank() }, ph: { apertura: [], medio: [], final: [] }, phErr: { apertura: 0, medio: 0, final: 0 },
    th: {}, counts: { "?!": 0, "?": 0, "??": 0 }, thGames: {}, openings: new Map(), months: new Map(), pending: [], names });
  const add = (o, sc, acc) => { o.games++; if (sc != null) { o.fin++; o.pts += sc; sc === 1 ? o.w++ : sc === 0 ? o.l++ : o.d++; } if (acc != null) o.accs.push(acc); };
  for (const rec of Lib.games.values()) {
    const c = colorOfMe(rec, names);
    if (!c || (f.color && c !== f.color)) continue;
    if (f.tc && timeCat(rec) !== f.tc) continue;
    const t = gameTime(rec);
    if (t < since) continue;
    const sc = scoreOf(rec.result, c), a = rec.analysis, my = a && a.p && a.p[c];
    const acc = my && my.acc != null ? my.acc : null;
    add(S, sc, acc);
    add(S.byColor[c], sc, acc);
    if (acc != null) {
      S.analysed++;
      for (const ph of ["apertura", "medio", "final"]) { if (my.ph && my.ph[ph] != null) S.ph[ph].push(my.ph[ph]); S.phErr[ph] += (my.phErr && my.phErr[ph]) || 0; }
      for (const k of ["?!", "?", "??"]) S.counts[k] += (my.c && my.c[k]) || 0;
      for (const [k, v] of Object.entries(my.th || {})) { S.th[k] = (S.th[k] || 0) + v; S.thGames[k] = (S.thGames[k] || 0) + 1; }
    } else S.pending.push(rec);
    const code = rec.eco || (a && a.eco) || "";
    const okey = (code || "—") + "|" + c;
    if (!S.openings.has(okey)) S.openings.set(okey, Object.assign(blank(), { code, c }));
    add(S.openings.get(okey), sc, acc);
    const d = new Date(t), mkey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (!S.months.has(mkey)) S.months.set(mkey, blank());
    add(S.months.get(mkey), sc, acc);
  }
  return S;
}
function statsConclusions(S) {
  const out = [], phAcc = {};
  for (const ph of ["apertura", "medio", "final"]) { const v = avg(S.ph[ph]); if (v != null && S.ph[ph].length >= 3) phAcc[ph] = Math.round(v); }
  const phs = Object.entries(phAcc).sort((a, b) => a[1] - b[1]);
  const phName = { apertura: "la apertura", medio: "el medio juego", final: "el final" };
  if (phs.length >= 2 && phs[phs.length - 1][1] - phs[0][1] >= 5) {
    const tip = { apertura: "repasa tus líneas con el explorador y el entrenador de repertorio", medio: "entrena táctica y planes con «🎯 Errores de tus partidas»", final: "practica en «👑 Finales» contra la tabla perfecta" }[phs[0][0]];
    out.push(`Tu fase más floja es ${phName[phs[0][0]]} (${phs[0][1]} % de precisión, frente a ${phs[phs.length - 1][1]} % en ${phName[phs[phs.length - 1][0]]}): ${tip}.`);
  }
  const th = Object.entries(S.thGames).sort((a, b) => b[1] - a[1])[0];
  if (th && S.analysed >= 3) {
    const every = S.analysed / th[1];
    out.push(`Tu error más habitual: ${THEMES[th[0]].name.toLowerCase()}, ${every <= 1.2 ? "en casi todas las partidas" : `en 1 de cada ${Math.round(every)} partidas`}. Entrénalo con el botón 🎯 de esa fila.`);
  }
  const W = S.byColor[1], B = S.byColor[-1];
  if (W.fin >= 3 && B.fin >= 3) {
    const sw = pct(W.pts, W.fin), sb = pct(B.pts, B.fin);
    if (Math.abs(sw - sb) >= 12) out.push(`Con ${sw < sb ? "blancas" : "negras"} puntúas bastante menos (${Math.min(sw, sb)} % frente a ${Math.max(sw, sb)} %).`);
  }
  const ops = [...S.openings.values()].filter(o => o.code && o.fin >= 3);
  if (ops.length >= 2) {
    ops.sort((a, b) => a.pts / a.fin - b.pts / b.fin);
    const worst = ops[0], best = ops[ops.length - 1];
    const lbl = o => `${o.code} ${ecoName(o.code)} con ${o.c === 1 ? "blancas" : "negras"}`.replace("  ", " ");
    if (worst.pts / worst.fin < 0.45) out.push(`La apertura que peor te va: ${lbl(worst)} (${String(worst.pts).replace(".", ",")} de ${worst.fin} puntos).`);
    if (best.pts / best.fin > 0.55 && best !== worst) out.push(`Tu mejor apertura: ${lbl(best)} (${String(best.pts).replace(".", ",")} de ${best.fin} puntos).`);
  }
  const months = [...S.months.entries()].sort((a, b) => a[0].localeCompare(b[0])).filter(([, m]) => m.accs.length);
  if (months.length >= 4) {
    const half = Math.floor(months.length / 2);
    const before = avg(months.slice(0, half).flatMap(([, m]) => m.accs)), after = avg(months.slice(half).flatMap(([, m]) => m.accs));
    if (Math.abs(after - before) >= 3) out.push(`Tu precisión ${after > before ? "sube" : "baja"}: de ${Math.round(before)} % a ${Math.round(after)} % en los meses más recientes.`);
  }
  if (!out.length && S.analysed) out.push("No se ve ningún punto débil claro: sigue analizando partidas para afinar las conclusiones.");
  return out;
}
function statsChart(S) {
  const months = [...S.months.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  if (months.length < 2) return "";
  const W = 560, H = 190, L = 34, R = 48, T = 12, Bm = 26, iw = W - L - R, ih = H - T - Bm;
  const x = i => L + (months.length === 1 ? iw / 2 : (i * iw) / (months.length - 1)), y = v => T + ih - (v / 100) * ih;
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const lab = k => MES[+k.slice(5) - 1] + " " + k.slice(2, 4);
  const series = [
    { name: "Precisión", color: "#1e88e5", val: m => (m.accs.length ? avg(m.accs) : null), dash: "" },
    { name: "Puntuación", color: "#d06c0a", val: m => (m.fin ? (m.pts / m.fin) * 100 : null), dash: "5 3" }
  ];
  let svg = `<svg class="st-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución mensual de la precisión y la puntuación">`;
  for (const v of [0, 25, 50, 75, 100]) svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="st-grid"/><text x="${L - 5}" y="${y(v) + 3.5}" class="st-ax" text-anchor="end">${v}</text>`;
  const step = Math.ceil(months.length / 7);
  months.forEach(([k], i) => { if (i % step === 0 || i === months.length - 1) svg += `<text x="${x(i)}" y="${H - 8}" class="st-ax" text-anchor="middle">${lab(k)}</text>`; });
  const ends = [];
  for (const s of series) {
    const pts = months.map(([k, m], i) => ({ i, k, m, v: s.val(m) })).filter(p => p.v != null);
    if (!pts.length) continue;
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash}" stroke-linejoin="round" points="${pts.map(p => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}"/>`;
    for (const p of pts) svg += `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--panel)" stroke-width="2"><title>${lab(p.k)} · ${s.name}: ${Math.round(p.v)} % (${p.m.games} partida${p.m.games === 1 ? "" : "s"})</title></circle>`;
    const last = pts[pts.length - 1];
    ends.push({ x: x(last.i) + 8, y: y(last.v) + 4, txt: `${Math.round(last.v)} %`, color: s.color });
  }
  // Valor final junto a cada línea; si los dos coinciden en altura, se separan
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 16) {
    const [hi, lo] = ends[0].y <= ends[1].y ? ends : [ends[1], ends[0]];
    const mid = (hi.y + lo.y) / 2;
    hi.y = mid - 8; lo.y = mid + 8;
    if (hi.y < 12) { hi.y = 12; lo.y = 28; }
  }
  for (const e of ends) svg += `<text x="${e.x}" y="${e.y}" class="st-lbl" fill="${e.color}" style="fill:${e.color}">${e.txt}</text>`;
  svg += `</svg>`;
  const legend = `<div class="st-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}${s.dash ? " (discontinua)" : ""}</span>`).join("")}</div>`;
  const table = `<details class="st-table"><summary>Ver los datos en una tabla</summary><table class="rep-phases"><thead><tr><th>Mes</th><th>Partidas</th><th>Puntuación</th><th>Precisión</th></tr></thead><tbody>${months.map(([k, m]) => `<tr><td>${lab(k)}</td><td>${m.games}</td><td>${m.fin ? pct(m.pts, m.fin) + "%" : "–"}</td><td>${m.accs.length ? Math.round(avg(m.accs)) + "%" : "–"}</td></tr>`).join("")}</tbody></table></details>`;
  return `<h3>📈 Evolución por meses</h3>${legend}${svg}${table}`;
}
function renderNameChips() {
  const freq = new Map();
  for (const r of Lib.games.values()) for (const n of [r.white, r.black]) { const k = String(n || "").trim(); if (k && k !== "?" && k !== "Blancas" && k !== "Negras") freq.set(k, (freq.get(k) || 0) + 1); }
  const mine = myNameList();
  const top = [...freq.entries()].filter(([k]) => !mine.includes(norm(k).trim())).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const box = $("nameChips");
  box.innerHTML = top.length ? `Los que más aparecen en tu biblioteca: ` + top.map(([k, n]) => `<button class="sm-btn" data-name="${esc(k)}">+ ${esc(k)} (${n})</button>`).join(" ") : "";
  box.querySelectorAll("[data-name]").forEach(b => b.onclick = () => {
    const cur0 = $("myNames").value.split(";").map(x => x.trim()).filter(Boolean);
    cur0.push(b.dataset.name);
    $("myNames").value = cur0.join("; ");
    saveMyNames();
  });
}
function saveMyNames() {
  settings.myNames = $("myNames").value.split(";").map(x => x.trim()).filter(Boolean).join("; ");
  saveSettings();
  renderStats();
  renderDrillInfo();
}
function renderStatsBatch() {
  const box = $("statsBatch");
  if (!Batch.running) return;
  box.hidden = false;
  box.innerHTML = `<b>🤖 Analizando tus partidas con ${esc(Engine.name)}…</b> ${Batch.done} de ${Batch.total} terminadas.<div class="small">${esc(Batch.status)}</div>
    <div class="progress show"><div style="width:${((Batch.done / Math.max(1, Batch.total)) * 100).toFixed(1)}%"></div></div>
    <div class="controls"><button class="sm-btn danger" id="stBatchStop">⏹ Detener</button><span class="small">Puedes seguir usando la aplicación; el motor queda ocupado hasta que termine.</span></div>`;
  $("stBatchStop").onclick = () => { Batch.cancel = true; Engine.cancel("batch"); };
}
let statsSeq = 0;
async function renderStats() {
  if (!Lib.ready) return;
  const seq = ++statsSeq, out = $("statsOut");
  if (document.activeElement !== $("myNames")) $("myNames").value = settings.myNames || settings.lichessUser || "";
  renderNameChips();
  const names = myNameList();
  if (!names.length) {
    out.innerHTML = `<div class="note-box">Escribe arriba tu nombre (o tus nombres) tal como aparece en tus partidas, por ejemplo tu usuario de Lichess, y pulsa «Guardar». Las estadísticas se calculan con las partidas de tu biblioteca en las que juegas tú.</div>`;
    return;
  }
  const mine = [...Lib.games.values()].filter(r => colorOfMe(r, names));
  if (mine.some(r => !r.analysis && hasPgnEvals(r))) {
    out.innerHTML = `<p class="small">⏳ Preparando los análisis guardados…</p>`;
    await ensureSummaries(mine);
    if (seq !== statsSeq) return;
  }
  const f = { period: +$("stPeriod").value, tc: $("stTc").value, color: +$("stColor").value };
  const S = computeStats(f);
  if (!S.games) {
    out.innerHTML = `<div class="note-box">No hay partidas tuyas ${mine.length ? "con estos filtros" : "en la biblioteca"}. ${mine.length ? "" : "Comprueba que el nombre coincide con el de las cabeceras (Blancas / Negras) y guarda tus partidas en la biblioteca, por ejemplo descargándolas de Lichess desde «🗂 Abrir .pgn»."}</div>`;
    return;
  }
  const fmtSc = o => (o.fin ? `${pct(o.pts, o.fin)} %` : "–");
  const fmtAcc = o => (o.accs.length ? Math.round(avg(o.accs)) + " %" : "–");
  const perGame = k => (S.analysed ? (S.counts[k] / S.analysed).toLocaleString("es-ES", { maximumFractionDigits: 1 }) : "–");
  let html = `<div class="st-tiles">
    <div class="st-tile"><span>Partidas</span><b>${S.games}</b><small>${S.analysed} analizada${S.analysed === 1 ? "" : "s"}</small></div>
    <div class="st-tile"><span>Resultados</span><b>+${S.w} =${S.d} −${S.l}</b><small>${S.games - S.fin ? `${S.games - S.fin} sin terminar` : "ganadas · tablas · perdidas"}</small></div>
    <div class="st-tile"><span>Puntuación</span><b>${fmtSc(S)}</b><small>de los puntos posibles</small></div>
    <div class="st-tile"><span>Precisión media</span><b>${fmtAcc(S)}</b><small>en las analizadas</small></div>
    <div class="st-tile"><span>Errores por partida</span><b>${perGame("??")} <small>??</small> · ${perGame("?")} <small>?</small></b><small>${perGame("?!")} imprecisiones</small></div>
  </div>`;
  const conc = statsConclusions(S);
  if (conc.length) html += `<h3>💡 Conclusiones</h3><ul class="st-conc">${conc.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`;
  html += `<h3>♔ Por color</h3><table class="rep-phases"><thead><tr><th></th><th>Partidas</th><th>+ = −</th><th>Puntuación</th><th>Precisión</th></tr></thead><tbody>` +
    [[1, "Con blancas"], [-1, "Con negras"]].map(([c, l]) => { const o = S.byColor[c]; return `<tr><td>${l}</td><td>${o.games}</td><td>+${o.w} =${o.d} −${o.l}</td><td>${fmtSc(o)}</td><td>${fmtAcc(o)}</td></tr>`; }).join("") + `</tbody></table>`;
  if (S.analysed) {
    html += `<h3>⏱ Por fases</h3><table class="rep-phases"><thead><tr><th></th><th>Precisión</th><th>Errores (? y ??) por partida</th></tr></thead><tbody>` +
      PHASES.map(([k, l]) => `<tr><td>${l}</td><td>${S.ph[k].length ? Math.round(avg(S.ph[k])) + " %" : "–"}</td><td>${(S.phErr[k] / S.analysed).toLocaleString("es-ES", { maximumFractionDigits: 2 })}</td></tr>`).join("") + `</tbody></table>`;
    const ths = Object.keys(THEMES).filter(k => S.thGames[k]).sort((a, b) => S.thGames[b] - S.thGames[a]);
    html += `<h3>🔍 Tus errores más frecuentes</h3>`;
    if (ths.length) {
      const maxG = Math.max(...ths.map(k => S.thGames[k]));
      html += `<div class="st-bars">` + ths.map(k => `<div class="st-bar-row"><span class="st-bar-lbl">${THEMES[k].icon} ${esc(THEMES[k].name)}</span>
        <span class="st-bar"><i style="width:${((S.thGames[k] / maxG) * 100).toFixed(0)}%"></i></span>
        <span class="st-bar-val">${S.thGames[k]} de ${S.analysed} partidas</span>
        <button class="sm-btn" data-drill="${THEMES[k].drill}" title="Entrenar estas posiciones">🎯 Entrenar</button></div>`).join("") + `</div>`;
    } else html += `<p class="small">Sin errores (? ni ??) en tus partidas analizadas. ¡Muy bien!</p>`;
  }
  const ops = [...S.openings.values()].sort((a, b) => b.games - a.games).slice(0, 12);
  html += `<h3>📖 Aperturas</h3><div class="cb-table-wrap" style="max-height:300px"><table class="cb-table"><thead><tr><th>Apertura</th><th>Color</th><th class="num">Partidas</th><th>+ = −</th><th class="num">Puntos</th><th class="num">Precisión</th></tr></thead><tbody>` +
    ops.map(o => `<tr ${o.code ? `data-eco="${esc(o.code)}" title="Ver estas partidas en «Mis partidas»"` : ""}><td>${o.code ? `<span class="srs-pill">${esc(o.code)}</span> ${esc(ecoName(o.code))}` : `<span class="small">sin código ECO</span>`}</td><td>${o.c === 1 ? "♔" : "♚"}</td><td class="num">${o.games}</td><td>+${o.w} =${o.d} −${o.l}</td><td class="num">${fmtSc(o)}</td><td class="num">${fmtAcc(o)}</td></tr>`).join("") + `</tbody></table></div>`;
  html += statsChart(S);
  const pend = S.pending.filter(r => r.plies > 4);
  if (pend.length && !Batch.running) {
    const ms = +$("stBatchMs").value || 300;
    const secs = pend.reduce((a, r) => a + (r.plies + 1) * (ms / 1000 + 0.05), 0);
    html += `<div class="note-box st-pending"><b>🤖 ${pend.length} partida${pend.length === 1 ? "" : "s"} tuya${pend.length === 1 ? "" : "s"} sin analizar.</b> Las estadísticas de precisión y errores sólo cuentan las analizadas.
      <div class="controls"><button class="sm-btn primary" id="stBatchBtn">🤖 Analizarlas ahora</button><span class="small">Tardará unos ${secs < 90 ? Math.max(1, Math.round(secs)) + " s" : Math.round(secs / 60) + " min"} con el ritmo elegido.</span></div></div>`;
  }
  out.innerHTML = html;
  out.querySelectorAll("[data-drill]").forEach(b => b.onclick = () => { $("drillType").value = b.dataset.drill; startDrills("due"); });
  out.querySelectorAll("[data-eco]").forEach(tr => tr.onclick = () => { $("libFilter").value = tr.dataset.eco; switchSub("games"); renderLibrary(); });
  const bb = $("stBatchBtn");
  if (bb) bb.onclick = () => analysePending(pend);
  if (!Batch.running) $("statsBatch").hidden = true;
}
const renderStatsSoon = debounce(() => { if (ui.activeTab === "library" && ui.librarySub === "stats" && !Batch.running) renderStats(); }, 400);

/* ---------- B14. Ejercicios con los errores de tus partidas ---------- */
const DRILL_TYPES = { "": "Todos los errores", material: "Táctica: pérdidas de material", mateMissed: "Encuentra el mate", mateAllowed: "Defensa: mates permitidos", wasted: "Convertir la ventaja", positional: "Errores de planteamiento", apertura: "Errores en la apertura", final: "Errores en el final" };
function drillPool() {
  const names = myNameList(), onlyMine = $("drillMine").checked && names.length, type = $("drillType").value, out = [];
  for (const rec of Lib.games.values()) {
    const a = rec.analysis;
    if (!a || !a.err || !a.err.length) continue;
    const c = colorOfMe(rec, names);
    for (const e of a.err) {
      if (onlyMine && e.mover !== c) continue;
      if (type === "apertura" || type === "final" ? e.ph !== type : type && e.th !== type) continue;
      const key = e.ply + e.uci;
      out.push({ rec, e, key, srs: rec.drills && rec.drills[key] });
    }
  }
  return out;
}
let drillInfoSeq = 0;
async function renderDrillInfo() {
  if (!Lib.ready) return;
  const seq = ++drillInfoSeq;
  await ensureSummaries([...Lib.games.values()]);
  if (seq !== drillInfoSeq) return;
  const names = myNameList();
  $("drillMine").disabled = !names.length;
  $("drillMineLbl").title = names.length ? "" : "Configura tus nombres en «📚 Biblioteca › 📊 Estadísticas»";
  const pool = drillPool(), now = Date.now();
  const due = pool.filter(x => !x.srs || x.srs.due <= now).length;
  $("drillBadge").textContent = `${due} pendiente${due === 1 ? "" : "s"}`;
  $("drillBadge").className = "srs-pill" + (due ? " due" : "");
  const games = new Set(pool.map(x => x.rec.id)).size;
  $("drillInfo").textContent = pool.length
    ? `${pool.length} ${pool.length === 1 ? "posición" : "posiciones"} de ${games} partida${games === 1 ? "" : "s"} analizada${games === 1 ? "" : "s"}${$("drillMine").checked && names.length ? " (sólo tus jugadas)" : ""}; ${due} pendiente${due === 1 ? "" : "s"} de repaso.`
    : `No hay ejercicios de este tipo. Salen de los ? y ?? de las partidas de tu biblioteca analizadas con «🤖 Analizar y comentar» (o desde «📊 Estadísticas › Analizarlas ahora»).`;
}
function drillNode(item) {
  const { rec, e } = item;
  let g;
  try { g = Pgn.newGame(e.fen); } catch { return null; }
  const mv = Chess.moveFromUci(g.root.state, e.uci);
  if (!mv) return null;
  g.headers.Event = "Ejercicio";
  g.headers.White = rec.white || "Blancas";
  g.headers.Black = rec.black || "Negras";
  g.root.eval = Object.assign({ depth: 0, source: "pgn" }, e.ev || { cp: 0 }, e.best ? { best: e.best, pv: e.pv || [e.best] } : {});
  const node = Pgn.addMove(g.root, mv);
  node.nag = e.cls;
  node.eval = Object.assign({ depth: 0, source: "pgn" }, e.evAfter || { cp: 0 });
  node.__game = g;
  node.__drill = { recId: rec.id, key: item.key, e, title: rec.title, date: rec.date };
  return node;
}
function startDrills(mode) {
  if (!Lib.ready) return;
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  const pool = drillPool(), now = Date.now();
  if (!pool.length) { toast("No hay ejercicios de ese tipo: analiza antes tus partidas guardadas.", 4000); switchTab("tools"); return; }
  let list = mode === "due" ? pool.filter(x => !x.srs || x.srs.due <= now) : pool.slice();
  if (!list.length) { toast("¡No tienes ejercicios pendientes hoy! 🎉 Pulsa «Al azar» para repasar igualmente.", 4000); return; }
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  if (mode === "due") list.sort((a, b) => (a.srs ? a.srs.due : now) - (b.srs ? b.srs.due : now));
  const q = list.slice(0, +$("drillCount").value).map(drillNode).filter(Boolean);
  if (!q.length) return;
  if (!stashBoard()) return;
  $("cardsBackBtn").hidden = false;
  if (Retry.active) retryEnd(true);
  startRetry(0, q);
}
async function drillRecord(node, ok) {
  const d = node.__drill, rec = d && Lib.games.get(d.recId);
  if (!rec) return;
  rec.drills = rec.drills || {};
  const s = rec.drills[d.key] || { box: 0, reps: 0 };
  s.reps++;
  s.box = ok ? Math.min(SRS_DAYS.length - 1, s.box + 1) : 1;
  s.due = Date.now() + SRS_DAYS[s.box] * 864e5;
  s.ok = ok;
  rec.drills[d.key] = s;
  try { await DB.put("games", rec); } catch (e) { console.warn("No se pudo guardar el repaso:", e); }
  renderDrillInfo();
}
async function prepareDrill(node) {
  // Partidas con evaluaciones de un PGN: no se sabe cuál era la buena; la calcula el motor
  const p = node.parent;
  Retry.state = "preparing";
  retryPanel();
  const job = await Engine.analyse(p, { purpose: "retry", movetime: Math.max(800, +settings.analysisMs), multipv: 1 });
  if (!Retry.active || retryNode() !== node) return false;
  if (job) storeEval(p, job, true);
  return !!(p.eval && p.eval.best);
}
function pathOfPly(rec, ply) {
  const r = Pgn.parseGame(rec.pgn, { lang: "en" });
  return Pgn.mainlineFrom(r.game.root).slice(0, ply).map(n => n.uci);
}

/* ---------- B15. Buscar la posición, la estructura de peones o el material ---------- */
function pawnKey(s) {
  const w = [], b = [];
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (s.b[i] === "P") w.push(i); else if (s.b[i] === "p") b.push(i); }
  return w.join(",") + "|" + b.join(",");
}
function materialKey(s) {
  const cnt = {};
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (p !== "." && p.toLowerCase() !== "k") cnt[p] = (cnt[p] || 0) + 1; }
  return "QRBNPqrbnp".split("").map(p => p + (cnt[p] || 0)).join("");
}
function materialText(s) {
  const cnt = {};
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (p !== ".") cnt[p] = (cnt[p] || 0) + 1; }
  const side = up => "KQRBNP".split("").map(p => glyphUnicode[p].repeat(cnt[up ? p : p.toLowerCase()] || 0)).join("");
  return side(true) + " contra " + side(false);
}
const PosSearch = { running: false, cancel: false };
async function searchPosition() {
  if (PosSearch.running) { PosSearch.cancel = true; return; }
  const mode = $("posMode").value, s = viewState(), node = cur();
  const target = mode === "exact" ? node.key : mode === "pawns" ? pawnKey(s) : materialKey(s);
  const keyOf = mode === "exact" ? n => n.key : mode === "pawns" ? n => pawnKey(n.state) : n => materialKey(n.state);
  if (mode === "pawns" && target === "|") { toast("En esta posición no quedan peones: busca por material."); return; }
  const sources = [...[...Lib.games.values()].filter(r => r.id !== ui.libId).map(r => ({ lib: r.id })), ...($("posColl").checked ? Coll.games.map((g, i) => ({ coll: i })) : [])];
  if (!sources.length) { toast("No hay partidas en las que buscar: tu biblioteca está vacía y no hay ningún .pgn abierto."); return; }
  Object.assign(PosSearch, { running: true, cancel: false });
  $("posBtn").textContent = "⏹ Detener";
  const list = $("posResults"), found = [];
  list.innerHTML = "";
  const tally = { w: 0, d: 0, b: 0 }, names = myNameList(), me = { games: 0, pts: 0, fin: 0 };
  for (let k = 0; k < sources.length && !PosSearch.cancel; k++) {
    const src = sources[k];
    let r;
    try { r = src.lib != null ? Pgn.parseGame(Lib.games.get(src.lib).pgn, { lang: "en" }) : Pgn.parseGame(Coll.games[src.coll], { lang: "auto" }); } catch { continue; }
    let n = r.game.root, ply = 0, hit = null;
    for (;;) {
      if (ply >= (mode === "exact" ? 0 : 2) && keyOf(n) === target) { hit = n; break; }
      if (!n.children.length) break;
      n = n.children[0]; ply++;
    }
    if (hit) {
      const h = r.game.headers, res = (h.Result || "*").trim();
      if (res === "1-0") tally.w++; else if (res === "0-1") tally.b++; else if (res === "1/2-1/2") tally.d++;
      if (src.lib != null) { const c = colorOfMe(Lib.games.get(src.lib), names); if (c) { me.games++; const sc = scoreOf(res, c); if (sc != null) { me.fin++; me.pts += sc; } } }
      found.push(Object.assign({ h, path: Pgn.pathTo(hit).slice(1).map(x => x.uci), label: hit.parent ? `${numPrefix(hit.parent.state)}${dispSan(hit)}` : "posición inicial", fen: Chess.toFen(hit.state) }, src));
    }
    if (k % 20 === 19) {
      $("posStatus").textContent = `Buscando: ${k + 1} de ${sources.length} partidas · ${found.length} encontradas…`;
      await new Promise(res => setTimeout(res, 0));
    }
  }
  const stopped = PosSearch.cancel;
  Object.assign(PosSearch, { running: false, cancel: false });
  $("posBtn").textContent = "🔍 Buscar";
  const what = { exact: "la misma posición", pawns: "la misma estructura de peones", material: "el mismo material" }[mode];
  const tot = tally.w + tally.d + tally.b;
  $("posStatus").innerHTML = `${stopped ? "⏹ Búsqueda detenida. " : ""}<b>${found.length}</b> partida${found.length === 1 ? "" : "s"} con ${what}` +
    (tot ? ` · resultados: blancas ${tally.w}, tablas ${tally.d}, negras ${tally.b} (las blancas puntúan ${pct(tally.w + tally.d / 2, tot)} %)` : "") +
    (me.fin ? ` · tú: ${String(me.pts).replace(".", ",")} de ${me.fin} puntos en ${me.games} partida${me.games === 1 ? "" : "s"}` : "") + ".";
  const frag = document.createDocumentFragment();
  for (const f of found.slice(0, 200)) {
    const div = document.createElement("div");
    div.className = "mark-card";
    div.tabIndex = 0;
    div.innerHTML = `${miniBoard(f.fen)}<div><div><b>${esc(f.h.White || "?")} – ${esc(f.h.Black || "?")}</b> <span class="small">${esc(f.h.Result || "*")} · ${esc((f.h.Date || "").slice(0, 4))}${f.h.Event && f.h.Event !== "?" ? " · " + esc(f.h.Event) : ""}</span></div>
      <div class="small">${f.lib != null ? "📚 Biblioteca" : "🗂 .pgn abierto"} · aparece tras <b>${esc(f.label)}</b></div></div>`;
    const open = () => {
      if (f.lib != null) { if (openLibGame(f.lib, f.path)) switchTab("study"); }
      else { loadCollGame(f.coll); if (Coll.games[f.coll]) goTo(resolvePath(game.root, f.path)); }
    };
    div.onclick = open;
    div.onkeydown = e => { if (e.key === "Enter") open(); };
    frag.append(div);
  }
  list.append(frag);
  if (found.length > 200) list.insertAdjacentHTML("beforeend", `<p class="small">Se muestran las 200 primeras.</p>`);
}
function renderPosTarget() {
  const s = viewState(), mode = $("posMode").value;
  $("posTarget").innerHTML = `${miniBoard(Chess.toFen(s))}<div class="small">${mode === "exact" ? "Busca partidas que pasen exactamente por la posición del tablero (mismas piezas en las mismas casillas y mismo turno)." :
    mode === "pawns" ? "Busca partidas con los mismos peones en las mismas casillas, aunque las piezas estén en otro sitio: ideal para estudiar planes típicos de una estructura." :
      `Busca partidas que lleguen al mismo material: ${esc(materialText(s))}. Muy útil para finales (por ejemplo, torre y peón contra torre).`}</div>`;
}

/* ---------- Tablero en SVG: imagen PNG, impresión y minitablero ---------- */
function boardSvg(state, opts = {}) {
  const cs = getComputedStyle(document.body);
  const light = cs.getPropertyValue("--light").trim() || "#f0d9b5", dark = cs.getPropertyValue("--dark").trim() || "#b58863";
  const flip = !!opts.flipped, S = 100;
  const X = i => (flip ? 7 - (i & 7) : i & 7) * S, Y = i => (flip ? 7 - (i >> 4) : i >> 4) * S;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="${opts.size || 800}" height="${opts.size || 800}">`;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const i = r * 16 + c;
    out += `<rect x="${X(i)}" y="${Y(i)}" width="${S}" height="${S}" fill="${(r + c) % 2 ? dark : light}"/>`;
    if (opts.last && (opts.last.from === i || opts.last.to === i)) out += `<rect x="${X(i)}" y="${Y(i)}" width="${S}" height="${S}" fill="rgba(255,235,59,0.42)"/>`;
  }
  if (opts.coords !== false) for (let k = 0; k < 8; k++) {
    const file = "abcdefgh"[flip ? 7 - k : k], rank = flip ? k + 1 : 8 - k;
    out += `<text x="${k * S + 92}" y="794" font-size="15" font-weight="700" text-anchor="end" font-family="sans-serif" fill="${k % 2 ? light : dark}">${file}</text>`;
    out += `<text x="4" y="${k * S + 17}" font-size="15" font-weight="700" font-family="sans-serif" fill="${k % 2 ? light : dark}">${rank}</text>`;
  }
  const style = settings.pieceStyle === "unicode" ? "staunton" : settings.pieceStyle;
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = state.b[i];
    if (p === ".") continue;
    const svg = getPieceHTML(p, style).replace(/<svg class="piece-svg" viewBox="0 0 45 45">/, `<svg x="${X(i) + 6}" y="${Y(i) + 6}" width="88" height="88" viewBox="0 0 45 45">`);
    out += svg;
  }
  for (const sh of opts.shapes || []) {
    const col = SHAPE_COLORS[sh.color] || SHAPE_COLORS.green;
    const x1 = X(sh.from) + 50, y1 = Y(sh.from) + 50, x2 = X(sh.to) + 50, y2 = Y(sh.to) + 50;
    if (sh.from === sh.to) { out += `<circle cx="${x1}" cy="${y1}" r="44" fill="none" stroke="${col}" stroke-width="7"/>`; continue; }
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const ex = x2 - ux * 30, ey = y2 - uy * 30, px = -uy, py = ux;
    out += `<line x1="${x1}" y1="${y1}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${col}" stroke-width="15" stroke-linecap="round"/>`;
    out += `<polygon points="${(x2 - ux * 6).toFixed(1)},${(y2 - uy * 6).toFixed(1)} ${(ex + px * 22).toFixed(1)},${(ey + py * 22).toFixed(1)} ${(ex - px * 22).toFixed(1)},${(ey - py * 22).toFixed(1)}" fill="${col}"/>`;
  }
  return out + "</svg>";
}
function nodeShapes(node) { return (node.shapes || []).map(sh => ({ color: sh.color, from: Chess.sqIdx(sh.from), to: Chess.sqIdx(sh.to) })); }
function positionLabel(node) { return node.parent ? `Tras ${numPrefix(node.parent.state)}${dispSan(node)}${node.nag || ""}` : "Posición inicial"; }

/* Minitablero al pasar el ratón por una jugada (lista de jugadas y líneas del motor) */
const hoverTip = document.createElement("div");
hoverTip.className = "hover-board";
hoverTip.hidden = true;
document.body.append(hoverTip);
function showHoverBoard(e, state, last) {
  hoverTip.innerHTML = boardSvg(state, { size: 184, coords: false, last, flipped: ui.flipped });
  hoverTip.hidden = false;
  const x = Math.min(innerWidth - 196, e.clientX + 14), y = e.clientY + 200 > innerHeight ? e.clientY - 196 : e.clientY + 14;
  hoverTip.style.left = x + "px";
  hoverTip.style.top = y + "px";
}
if (window.matchMedia && matchMedia("(hover: hover)").matches) {
  document.addEventListener("mouseover", e => {
    const pv = e.target.closest && e.target.closest(".pv-mv");
    if (pv) { try { showHoverBoard(e, Chess.parseFen(pv.dataset.fen), { from: +pv.dataset.from, to: +pv.dataset.to }); } catch {} return; }
    const mv = e.target.closest && e.target.closest("#moves .mv");
    if (mv && !quiz()) { const n = ui.nodeMap.get(+mv.dataset.id); if (n && n !== cur()) { showHoverBoard(e, n.state, n.move); return; } }
    hoverTip.hidden = true;
  });
  document.addEventListener("scroll", () => { hoverTip.hidden = true; }, true);
  document.addEventListener("mouseout", e => { if (e.target.closest && e.target.closest(".pv-mv, #moves .mv")) hoverTip.hidden = true; });
}

/* Rueda del ratón sobre el tablero: avanzar y retroceder */
let wheelLast = 0;
$("boardWrap").addEventListener("wheel", e => {
  if (!settings.wheel || editor.active || quiz() || document.querySelector(".modal-back.open")) return;
  e.preventDefault();
  const now = Date.now();
  if (now - wheelLast < 80 || Math.abs(e.deltaY) < 4) return;
  wheelLast = now;
  stopAutoplay();
  if (e.deltaY > 0) goForward(); else goBack();
}, { passive: false });

/* Exportar la posición como imagen PNG (descarga y, si se puede, copia al portapapeles) */
function positionPng() {
  const node = cur(), W = 800, H = 860;
  const svg = boardSvg(viewState(), { last: editor.active ? null : node.move, shapes: editor.active ? [] : nodeShapes(node), flipped: ui.flipped });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#0b0e14"; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, W);
      ctx.fillStyle = "#eef2f8"; ctx.font = "600 22px system-ui, sans-serif"; ctx.textBaseline = "middle";
      const h = game.headers;
      const title = h.White && h.White !== "Blancas" ? `${h.White} – ${h.Black}` : ($("gameName").value || "AjedrezBase");
      ctx.fillText(`${title} · ${positionLabel(node)}`.slice(0, 70), 14, W + 30);
      ctx.fillStyle = "#94a3b8"; ctx.font = "16px system-ui, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(viewState().t === 1 ? "Juegan blancas" : "Juegan negras", W - 14, W + 30);
      c.toBlob(b => (b ? resolve(b) : reject(Error("sin imagen"))), "image/png");
    };
    img.onerror = () => reject(Error("No se pudo dibujar el tablero"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
$("pngBtn").onclick = async () => {
  const pngP = positionPng();
  let copied = false;
  try { if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ "image/png": pngP })]); copied = true; } } catch {}
  try {
    const blob = await pngP;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safeName($("gameName").value || "posicion") + ".png";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(copied ? "🖼 Imagen descargada y copiada al portapapeles." : "🖼 Imagen descargada.");
  } catch (e) { toast("No se pudo crear la imagen: " + e.message); }
};

/* Imprimir (o guardar como PDF) la partida comentada con diagramas */
function buildPrintView() {
  const v = $("printView"), h = game.headers;
  const marked = Lib.ready ? markedNodesOfCurrent() : new Map();
  const diag = new Set();
  for (const n of Pgn.mainlineFrom(game.root)) if (marked.has(n.id) || ["??", "?", "!!"].includes(n.nag)) diag.add(n.id);
  const ml = Pgn.mainlineFrom(game.root);
  if (ml.length) diag.add(ml[ml.length - 1].id);
  let count = 0;
  const diagram = n => {
    if (count >= 16) return "";
    count++;
    const mk = marked.get(n.id);
    return `<figure class="pv-diagram">${boardSvg(n.state, { size: 260, last: n.move, shapes: nodeShapes(n) })}<figcaption>${esc(positionLabel(n))}${mk ? ` · ${CATS[mk.cat].icon} ${esc(mk.note || CATS[mk.cat].name)}` : ""}</figcaption></figure>`;
  };
  const moveTxt = (n, force) => `${n.parent.state.t === 1 || force ? `<span class="pnum">${n.parent.state.full}${n.parent.state.t === 1 ? "." : "…"}</span>` : ""}<b>${esc(dispSan(n))}${esc(n.nag || "")}</b>${n.posNag ? " " + esc(n.posNag) : ""}`;
  const varText = (node, force) => {
    let out = "", c = node, f = force;
    out += moveTxt(c, f) + " ";
    if (c.comment) { out += `<i>${esc(c.comment)}</i> `; f = true; } else f = false;
    while (c.children.length) {
      const m = c.children[0];
      out += moveTxt(m, f) + " ";
      f = false;
      if (m.comment) { out += `<i>${esc(m.comment)}</i> `; f = true; }
      for (const alt of c.children.slice(1)) { out += "(" + varText(alt, true).trim() + ") "; f = true; }
      c = m;
    }
    return out;
  };
  let body = "", para = "", f = true;
  let c = game.root;
  if (c.comment) body += `<p><i>${esc(c.comment)}</i></p>`;
  while (c.children.length) {
    const m = c.children[0];
    para += moveTxt(m, f) + " ";
    f = false;
    if (m.comment) { para += `<i>${esc(m.comment)}</i> `; f = true; }
    for (const alt of c.children.slice(1)) { para += "(" + varText(alt, true).trim() + ") "; f = true; }
    if (diag.has(m.id)) { body += `<p>${para}</p>${diagram(m)}`; para = ""; f = true; }
    c = m;
  }
  if (para) body += `<p>${para}</p>`;
  const meta = [h.Event, h.Site, (h.Date || "").replace(/\.\?\?/g, ""), h.Round && h.Round !== "-" ? "Ronda " + h.Round : "", h.ECO].filter(x => x && x !== "?").join(" · ");
  v.innerHTML = `<h1>${esc(h.White || "Blancas")}${h.WhiteElo ? ` (${esc(h.WhiteElo)})` : ""} – ${esc(h.Black || "Negras")}${h.BlackElo ? ` (${esc(h.BlackElo)})` : ""} <span class="pres">${esc(h.Result || "*")}</span></h1>
    <div class="pmeta">${esc(meta)}</div>${game.root.state && Chess.toFen(game.root.state) !== Chess.START_FEN ? `<figure class="pv-diagram">${boardSvg(game.root.state, { size: 260 })}<figcaption>Posición inicial</figcaption></figure>` : ""}
    <div class="pmoves">${body}</div>${ui.report ? printReportHtml() : ""}<div class="pfoot">AjedrezBase · rkarillo-tech.github.io/ajedrezbase</div>`;
}
function printReportHtml() {
  const R = ui.report, h = game.headers;
  const nm = c => esc(c === 1 ? h.White || "Blancas" : h.Black || "Negras");
  return `<div class="preport"><h2>Informe de la partida</h2><p>${esc(R.summary)}</p>` +
    (R.key.length ? `<p><b>Momentos clave:</b></p><ol>${R.key.map(x => `<li><b>${esc(numPrefix(x.n.parent.state) + dispSan(x.n) + (x.n.nag || ""))}</b>: ${esc(x.theme.txt)} (${esc(fmtEval(x.n.parent.eval))} → ${esc(fmtEval(x.info.after || x.n.eval))}).</li>`).join("")}</ol>` : "") +
    `<table><tr><th></th><th>${nm(1)}</th><th>${nm(-1)}</th></tr>${PHASES.map(([k, l]) => `<tr><td>${l}</td><td>${R.phases[k + 1] == null ? "–" : R.phases[k + 1] + "%"}</td><td>${R.phases[k + -1] == null ? "–" : R.phases[k + -1] + "%"}</td></tr>`).join("")}</table>` +
    R.players.map(pl => `<p><b>${esc(pl.verdict)}</b>${pl.practice.length ? "<br>Practicar: " + pl.practice.map(esc).join(" · ") : ""}</p>`).join("") + `</div>`;
}
$("printBtn").onclick = () => { buildPrintView(); setTimeout(() => window.print(), 60); };

/* Enlace para compartir la partida (hasta donde estás) */
const WEB_URL = "https://rkarillo-tech.github.io/ajedrezbase/";
function shareLink() {
  const base = /^https?:$/.test(location.protocol) ? location.href.split("#")[0] : WEB_URL;
  const line = [...Pgn.pathTo(cur()).slice(1), ...Pgn.mainlineFrom(cur())];
  const ply = Pgn.pathTo(cur()).length - 1;
  const q = new URLSearchParams();
  const fen = Chess.toFen(game.root.state);
  if (fen !== Chess.START_FEN) q.set("fen", fen);
  if (line.length) q.set("m", line.map(n => n.uci).join(" "));
  if (ply) q.set("n", ply);
  const h = game.headers;
  if (h.White && h.White !== "Blancas") q.set("w", h.White);
  if (h.Black && h.Black !== "Negras") q.set("b", h.Black);
  return base + "#" + q.toString();
}
$("linkBtn").onclick = async () => {
  const url = shareLink();
  toast((await copyText(url)) ? `🔗 Enlace copiado (${url.length > 1800 ? "largo: " : ""}${Pgn.pathTo(cur()).length - 1 ? "abre la partida en esta jugada" : "abre la partida"}). Pégalo donde quieras.` : "No se pudo copiar el enlace.", 4500);
};
function openSharedLink() {
  const h = location.hash.slice(1);
  if (!/(^|&)(m|fen)=/.test(h)) return false;
  const q = new URLSearchParams(h);
  let g;
  try { g = Pgn.newGame(q.get("fen") || undefined); } catch { toast("El enlace tiene una posición no válida."); return false; }
  let node = g.root, target = null;
  const n = +(q.get("n") || 0);
  (q.get("m") || "").split(/[\s,]+/).filter(Boolean).forEach((u, i) => {
    const mv = Chess.moveFromUci(node.state, u);
    if (!mv) return;
    node = Pgn.addMove(node, mv);
    if (i + 1 === n) target = node;
  });
  if (q.get("w")) g.headers.White = q.get("w");
  if (q.get("b")) g.headers.Black = q.get("b");
  const ok = setGame(g, { name: q.get("w") ? `${q.get("w")} – ${q.get("b") || "?"}` : "Partida compartida", current: target || (n ? node : g.root) });
  try { history.replaceState(null, "", location.href.split("#")[0]); } catch {}
  if (ok !== false) toast("🔗 Partida abierta desde un enlace. Si te interesa, pulsa «💾 Guardar en biblioteca».", 5000);
  return ok !== false;
}
window.addEventListener("hashchange", () => openSharedLink());

$("moveViewBtn").onclick = () => { settings.moveView = settings.moveView === "sheet" ? "list" : "sheet"; saveSettings(); $("moveViewBtn").textContent = settings.moveView === "sheet" ? "📜 Ver como lista" : "📋 Ver como planilla"; renderMoves(); };

/* ---------- Ayuda ---------- */
function openHelp(sectionId) {
  openModal("helpModal");
  if (sectionId) {
    const el = $(sectionId);
    const det = el && (el.tagName === "DETAILS" ? el : el.closest("details"));
    if (det) { det.open = true; setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 40); }
  }
}
$("helpSearch").oninput = debounce(() => {
  const q = norm($("helpSearch").value.trim());
  let any = false;
  document.querySelectorAll("#helpBody > details").forEach(d => {
    const hit = !q || norm(d.textContent).includes(q);
    d.hidden = !hit;
    if (q && hit) d.open = true;
    any = any || hit;
  });
  $("helpNoResults").hidden = any;
}, 150);
$("helpExpand").onclick = () => document.querySelectorAll("#helpBody > details").forEach(d => { d.open = true; });
$("helpCollapse").onclick = () => document.querySelectorAll("#helpBody > details").forEach(d => { d.open = false; });
document.addEventListener("click", e => {
  const a = e.target.closest(".help-link");
  if (!a) return;
  e.preventDefault();
  closeModals();
  openHelp(a.dataset.help);
});
$("testTokenBtn").onclick = async () => {
  const out = $("tokenResult");
  const tok = $("setToken").value.trim();
  if (!tok) { out.className = "small msg-err"; out.textContent = "Pega primero el token."; return; }
  if (!/^lip_/.test(tok)) { out.className = "small msg-err"; out.textContent = "Los tokens de Lichess empiezan por «lip_». Revisa que lo hayas copiado entero."; return; }
  settings.token = tok; saveSettings(); explorerCache.clear();
  out.className = "small"; out.textContent = "Probando…";
  try {
    const res = await Lichess.fetch(`https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(Chess.START_FEN)}&moves=1&topGames=0`, { headers: authHeaders() });
    if (res.ok) { out.className = "small msg-ok"; out.textContent = "✔ Funciona: el explorador de Lichess ya está disponible."; refreshExplorer(); }
    else if (res.status === 401 || res.status === 403) { out.className = "small msg-err"; out.textContent = "❌ Lichess rechaza este token (no válido o borrado). Crea uno nuevo."; }
    else if (res.status === 429) { out.className = "small msg-err"; out.textContent = "Lichess pide esperar un minuto (demasiadas consultas)."; }
    else { out.className = "small msg-err"; out.textContent = "Lichess respondió con un error " + res.status + ". Prueba más tarde."; }
  } catch (e) {
    out.className = "small msg-err";
    if (e && e.status === 429) { out.textContent = e.message; return; }
    out.textContent = "No se pudo conectar con Lichess: comprueba la conexión. Si tienes internet y aun así falla, puede que el navegador bloquee la consulta desde un archivo local; prueba con la versión web: https://rkarillo-tech.github.io/ajedrezbase/";
  }
};

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModals(); if ($("promoModal").classList.contains("open")) $("cancelPromo").click(); return; }
  const tag = document.activeElement && document.activeElement.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector(".modal-back.open")) return;
  const k = e.key;
  if (editor.active && !["f", "F", "?"].includes(k)) return;
  if (quiz() && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", " ", "x", "X"].includes(k)) return;
  if (k === "ArrowLeft") { stopAutoplay(); goBack(); }
  else if (k === "ArrowRight") { stopAutoplay(); goForward(); }
  else if (k === "ArrowUp") goSibling(-1);
  else if (k === "ArrowDown") goSibling(1);
  else if (k === "Home") goStart();
  else if (k === "End") goEnd();
  else if (k === " ") toggleAutoplay();
  else if (k === "f" || k === "F") $("flipBtn").click();
  else if (k === "e" || k === "E") { $("liveToggle").checked = !$("liveToggle").checked; $("liveToggle").dispatchEvent(new Event("change")); }
  else if (k === "?") openHelp();
  else if (k === "m" || k === "M") openMarkDialog();
  else if (k === "x" || k === "X") showThreat();
  else if (k === "b" || k === "B") setBlind(!ui.blind);
  else return;
  e.preventDefault();
});

/* ---------- Aplicación instalable (sólo cuando se sirve por http/https) ---------- */
(function pwa() {
  if (!/^https?:$/.test(location.protocol)) return;
  const link = (rel, href) => { const l = document.createElement("link"); l.rel = rel; l.href = href; document.head.append(l); };
  link("manifest", "manifest.webmanifest");
  link("apple-touch-icon", "assets/icon-180.png");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("installBtn").hidden = false; });
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; toast("✔ AjedrezBase instalada: ya puedes abrirla como una aplicación, también sin conexión.", 5000); });
  $("installBtn").onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    deferred = null;
    $("installBtn").hidden = true;
  };
})();

/* ---------- 28. Arranque ---------- */
(function boot() {
  document.body.dataset.theme = settings.theme;
  $("pieceStyleSelect").value = settings.pieceStyle;
  $("displayLang").value = settings.lang;
  $("themeSelect").value = settings.theme;
  $("soundToggle").textContent = settings.sound ? "🔊" : "🔇";
  $("notation").value = settings.notation;
  $("branchMode").value = settings.branchMode;
  $("explorerDbSelect").value = settings.explorerDb;
  buildEditorPalettes();
  renderLocalEcoList();
  initEndgamePresets();
  renderCollection();

  let restored = false;
  const saved = settings.autosave ? LS.get("ajedrezStudioCurrent", null) : null;
  if (saved && saved.pgn) {
    try {
      const r = Pgn.parseGame(saved.pgn, { lang: "en" });
      let node = r.game.root;
      for (const u of saved.path || []) { const c = node.children.find(x => x.uci === u); if (!c) break; node = c; }
      ui.flipped = !!saved.flipped;
      setGame(r.game, { noConfirm: true, current: node, libId: saved.libId || null, fav: saved.fav, tags: saved.tags || [], name: saved.name || saved.study || "" });
      if (saved.dirty) ui.dirty = true;
      if (!saved.libId && saved.study) ui.legacyStudy = saved.study;
      restored = true;
    } catch (e) { console.warn("No se pudo restaurar la sesión anterior:", e); }
  }
  if (!restored) {
    const r = Pgn.parseGame($("moveInput").value, { lang: "auto" });
    setGame(r.game, { name: "", noConfirm: true });
  }
  $("moveViewBtn").textContent = settings.moveView === "sheet" ? "📜 Ver como lista" : "📋 Ver como planilla";
  $("liUser").value = settings.lichessUser || "";
  Engine.init();
  initLibrary().then(() => openSharedLink());
})();
