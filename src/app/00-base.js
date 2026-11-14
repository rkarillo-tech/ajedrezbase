"use strict";
/* =========================================================================
   APLICACIÓN
   ========================================================================= */

/* ---------- 0. Utilidades ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  /* raw: no avisa a la sincronización (lo usa ella misma al aplicar lo que llega de otro dispositivo) */
  set(k, v, raw) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { return false; }
    try { if (!raw && syncState === "ok" && SYNC_LS[k]) syncTouch(); } catch {}
    return true;
  }
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
  cpuStyle: "balanced", cpuClock: "", cpuColor: "board", cpuFrom: "new", goalPuzzles: 5, boardSize: 100, uiTheme: "dark", cpuOpponent: "cpu", cpuOdds: "", cpuAutoFlip: true, autoplayMs: 2000, board3d: false, board3dLook: "wood", board3dColors: null, board3dLight: 100, board3dGloss: 30
};
const settings = Object.assign({}, DEFAULTS, LS.get("ajedrezSettings", {}));
try { const legacy = localStorage.getItem("ajedrezPieceStyle"); if (legacy && !localStorage.getItem("ajedrezSettings")) settings.pieceStyle = legacy; } catch {}
const saveSettings = () => { settings._m = Date.now(); return LS.set("ajedrezSettings", settings); };

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
const trainer = { active: false, side: 1, errors: 0, hints: 0, correct: 0, hintLevel: 0, hintArrow: null, hintSq: -1, libId: null, markId: null, card: false, puzzle: false, busy: false };
const editor = { active: false, state: null, tool: "MOVE", sel: null, origin: null };
const cur = () => game.current;
/* ¿Estamos en un ejercicio o jugando contra la CPU? Entonces se oculta el motor y no se navega por la partida */
const quiz = () => trainer.active || Retry.active || Guess.active || Vis.active || ui.cpu.on;
/* En una partida contra la CPU (sin otro ejercicio en marcha) se pueden pedir «Piensa conmigo» y «Habla con tus piezas» */
const cpuHelpMode = () => ui.cpu.on && !trainer.active && !Retry.active && !Guess.active && !Vis.active;
/* Por qué no se puede pedir ayuda ahora (o null si se puede) */
function helpBlocked() {
  if (editor.active) return "Cierra antes el editor de posición.";
  if (cpuHelpMode()) {
    if (ui.cpu.thinking) return "Espera a que juegue la CPU.";
    if (!ui.cpu.two && cur().state.t === ui.cpu.side) return "Te ayudo cuando te toque mover.";
    return null;
  }
  return quiz() ? "Termina antes el ejercicio o la partida." : null;
}
/* Apunta que en esta partida contra la CPU se ha pedido ayuda (entonces no cuenta para el nivel adaptativo) */
function noteCpuHelp() { if (cpuHelpMode()) { ui.cpu.helped = (ui.cpu.helped || 0) + 1; cpuPanel(); } }
const viewState = () => (editor.active ? editor.state : ui.visBoard || game.current.state);   // ui.visBoard: tablero propio de los ejercicios de geometría

