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
/* ⏱ Tiempos de reloj guardados en la partida ([%clk]): lo que le quedaba a cada bando tras cada jugada */
function tcOf(h) { const m = /^(\d+)(?:\+(\d+))?$/.exec((h && h.TimeControl) || ""); return m ? { base: +m[1], inc: +(m[2] || 0) } : null; }
function gameHasClocks(g = game) { let n = g.root, k = 0, c = 0; while (n.children.length && k < 40) { n = n.children[0]; k++; if (n.clk != null) c++; } return c >= 2; }
function clockAt(node, c) {
  for (let n = node; n && n.parent; n = n.parent) if (n.parent.state.t === c && n.clk != null) return n.clk;
  const tc = tcOf(game.headers);
  return tc ? tc.base : null;
}
/* Segundos que tardó el bando en hacer la jugada que lleva a este nodo */
function spentOn(node) {
  if (!node || !node.parent || node.clk == null) return null;
  const tc = tcOf(game.headers), gp = node.parent.parent;
  if (gp && gp.parent) return gp.clk == null ? null : Math.max(0, gp.clk + (tc ? tc.inc : 0) - node.clk);
  return tc ? Math.max(0, tc.base - node.clk) : null;   // primera jugada de ese bando
}
const fmtSecs = sec => (sec < 60 ? `${Math.round(sec)} s` : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`);
function renderClocks() {
  const top = ui.flipped ? 1 : -1;
  const statics = !Clock.shown && gameHasClocks();
  for (const [id, c] of [["topClock", top], ["bottomClock", -top]]) {
    const el = $(id);
    el.hidden = !Clock.shown && !statics;
    if (statics) {
      const left = clockAt(cur(), c), tc = tcOf(game.headers);
      el.textContent = left == null ? "–" : fmtClock(left * 1000);
      el.classList.remove("running");
      el.classList.toggle("low", left != null && left < Math.max(20, tc ? tc.base * 0.1 : 0));
      el.title = "Tiempo que le quedaba en el reloj en esta posición (guardado en la partida)";
      continue;
    }
    el.title = "";
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
const parseCpuLevel = v => (v === "a" ? "a" : /^h\d+$/.test(v) ? v : +v || 8);
const humanElo = v => (/^h(\d+)$/.test(String(v)) ? +String(v).slice(1) : 0);
/* ---------- 👤 Rival humano: juega como una persona de un Elo dado ----------
   Apertura: las jugadas que se hacen a ese nivel (explorador de Lichess por Elo, con token; si no, libro ECO y tus partidas).
   Después: Stockfish da varias candidatas y se elige como lo haría una persona: casi siempre una jugada buena y natural,
   a veces una peor y, de vez en cuando (más con poco tiempo o en posiciones con mucha táctica), un error claro. */
const HUMAN_BANDS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
function humanParams(elo) {
  const t = Math.max(0, Math.min(1, (elo - 800) / 1400));   // 0 = 800, 1 = 2200
  return {
    temp: 9 - 7.6 * t,                    // tolerancia (en % de probabilidad de ganar) al elegir entre candidatas
    blunder: 0.13 - 0.12 * t,             // probabilidad base de un error claro
    bookPlies: Math.round(6 + 14 * t),    // hasta dónde sigue «la teoría» de su nivel
    seeMate: 0.55 + 0.45 * t              // probabilidad de ver un mate que tiene
  };
}
/* Lo natural que le parece una jugada a una persona (multiplica su probabilidad) */
function humanNatural(s, m, prev) {
  const pc = m.piece.toLowerCase(), cap = m.captured && m.captured !== "." ? m.captured.toLowerCase() : "";
  const after = Chess.apply(s, m);
  let w = 1;
  if (cap) w *= 1.5;
  if (prev && prev.move && cap && m.to === prev.move.to) w *= 1.8;             // recapturar
  if (Chess.inCheck(after)) w *= 1.3;
  if (m.flag === "castle") w *= 1.6;
  const backRank = (m.from >> 4) === (s.t === 1 ? 7 : 0);
  if (s.full <= 12 && backRank && (pc === "n" || pc === "b")) w *= 1.5;        // desarrollar
  const fwd = s.t === 1 ? (m.from >> 4) - (m.to >> 4) : (m.to >> 4) - (m.from >> 4);
  if (fwd < 0 && !cap) w *= 0.75;                                                // las retiradas se ven menos
  if (pc === "k" && m.flag !== "castle" && Chess.nonPawnCount(s) > 6) w *= 0.4;
  if (pc === "p" && [0, 7].includes(m.from & 7) && s.full <= 15) w *= 0.6;       // peones de torre al principio
  return w;
}
function humanBookMoves(node, P) {
  const path = Pgn.pathTo(node).slice(1);
  if (path.length >= P.bookPlies || Chess.toFen(game.root.state) !== Chess.START_FEN) return [];
  const ucis = path.map(n => n.uci), next = new Map();
  for (const e of ECO_BOOK) {
    if (!e.ucis || e.ucis.length <= ucis.length) continue;
    let ok = true;
    for (let i = 0; i < ucis.length; i++) if (e.ucis[i] !== ucis[i]) { ok = false; break; }
    if (ok) next.set(e.ucis[ucis.length], (next.get(e.ucis[ucis.length]) || 0) + 1);
  }
  return [...next].map(([uci, n]) => ({ uci, n }));
}
async function humanOpeningMove(node, elo, P) {
  const path = Pgn.pathTo(node).slice(1);
  if (path.length >= P.bookPlies) return null;
  const s = node.state;
  let moves = [];
  if (settings.token) {
    const band = HUMAN_BANDS.filter(b => b <= elo).pop() || 0;
    const url = `https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=${band}&fen=${encodeURIComponent(Chess.toFen(s))}&moves=12&topGames=0&recentGames=0`;
    let data = explorerCache.get(url);
    if (!data) {
      try {
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await Lichess.fetch(url, { headers: authHeaders(), signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) { data = await res.json(); explorerCache.set(url, data); }
      } catch {}
    }
    if (data && data.moves) {
      const tot = data.white + data.draws + data.black;
      if (tot >= 15) moves = data.moves.map(m => { const x = (() => { try { return Chess.parseMove(s, m.san, "en").move; } catch { return null; } })(); return x ? { uci: Chess.uci(x), n: m.white + m.draws + m.black } : null; }).filter(m => m && m.n / tot >= 0.03);
    }
  }
  if (!moves.length) {
    const local = localMoveIndex().get(Chess.posKey(s));
    if (local) { const arr = [...local.values()], tot = arr.reduce((a, m) => a + m.n, 0); if (tot >= 3) moves = arr.map(m => { try { return { uci: Chess.uci(Chess.parseMove(s, m.san, "en").move), n: m.n }; } catch { return null; } }).filter(Boolean); }
  }
  if (!moves.length) moves = humanBookMoves(node, P);
  if (!moves.length) return null;
  const tot = moves.reduce((a, m) => a + m.n, 0);
  let r = Math.random() * tot;
  for (const m of moves) { r -= m.n; if (r <= 0) return m.uci; }
  return moves[0].uci;
}
function humanPick(node, lines, elo, rnd = Math.random) {
  const s = node.state, P = humanParams(elo), L = Chess.legal(s), me = s.t;
  const cands = [];
  for (const l of lines || []) {
    const u = l && l.pv && l.pv[0];
    if (!u || cands.some(c => c.uci === u)) continue;
    const m = Chess.moveFromUci(s, u, L);
    if (m) cands.push({ uci: u, m, w: me === 1 ? winPct(l) : 100 - winPct(l), mate: l.mate });
  }
  if (!cands.length) return null;
  const best = cands.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.mate != null && best.w >= 100 && rnd() < P.seeMate) return best.uci;
  // Más errores con poco tiempo en el reloj y en posiciones con muchas capturas posibles
  let blunder = P.blunder;
  if (Clock.running && Clock.base) { const left = clockLeft(me); if (left < Math.max(15000, Clock.base * 0.1)) blunder *= 2; }
  if (L.filter(m => m.captured && m.captured !== ".").length >= 4) blunder *= 1.4;
  if (rnd() < blunder) {
    // Un error «humano»: una jugada natural que no está entre las buenas del motor
    const others = L.filter(m => !cands.some(c => c.uci === Chess.uci(m)));
    if (others.length) {
      const ws = others.map(m => humanNatural(s, m, node)), tot = ws.reduce((a, b) => a + b, 0);
      let r = rnd() * tot;
      for (let i = 0; i < others.length; i++) { r -= ws[i]; if (r <= 0) return Chess.uci(others[i]); }
    }
  }
  const ws = cands.map(c => Math.exp(-(best.w - c.w) / P.temp) * humanNatural(s, c.m, node));
  const tot = ws.reduce((a, b) => a + b, 0);
  let r = rnd() * tot;
  for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i].uci; }
  return best.uci;
}
/* Cuánto «piensa» el rival humano: algo de tiempo siempre y, con reloj, como una persona que administra su tiempo */
function humanThinkMs() {
  if (!Clock.running) return 500 + Math.random() * 900;
  const left = clockLeft(ui.cpu.side);
  return Math.max(250, Math.min(8000, (left / 35 + Clock.inc * 0.6) * (0.5 + Math.random())));
}
async function humanCpuMove(node) {
  const elo = ui.cpu.human, P = humanParams(elo), t0 = Date.now(), wait = humanThinkMs();
  const done = u => {
    const play = () => {
      ui.cpu.thinking = false;
      if (cur() !== node || !ui.cpu.on || ui.cpu.over) { render(); return; }
      const m = u && Chess.moveFromUci(node.state, u);
      if (m) playMove(m, "cpu"); else render();
    };
    setTimeout(play, Math.max(0, wait - (Date.now() - t0)));
  };
  let u = null;
  try { u = await humanOpeningMove(node, elo, P); } catch {}
  if (u) { done(u); return; }
  if (cur() !== node || !ui.cpu.on || ui.cpu.over) { ui.cpu.thinking = false; render(); return; }
  const strong = Engine.kind === "stockfish";
  const job = await Engine.analyse(node, { purpose: "cpu", movetime: Math.min(900, Math.max(200, wait * 0.6)), multipv: strong ? 5 : 1, skill: strong ? 20 : ui.cpu.level });
  if (!job || !job.best) { ui.cpu.thinking = false; render(); return; }
  if (job.lines[0]) ui.cpu.lastEval = job.lines[0];
  done(strong ? humanPick(node, job.lines, elo) || job.best : job.best);
}
function cpuLevelName(level) {
  if (ui.cpu.human) return `humano ~${ui.cpu.human}`;
  if (ui.cpu.adaptive) return `nivel adaptativo ${fmtAdaptive(level)}`;
  const opts = [...$("cpuLevel").options], i = opts.findIndex(o => +o.value === +level);
  return "nivel " + (i >= 0 ? i : level);
}
/* 🎯 CPU adaptativa: un nivel interno (0-20) que sube cuando ganas y baja cuando pierdes, para que siempre sea un rival a tu medida */
const ADAPT_KEY = "ajedrezCpuAdaptativa";
const fmtAdaptive = x => (Math.round(x * 10) / 10).toString().replace(".", ",");
function adaptiveState() {
  const st = LS.get(ADAPT_KEY, null);
  if (st) return st;
  // Primera vez: se parte del nivel en los problemas, si lo hay; si no, de un nivel intermedio-bajo
  const R = puzRating();
  return { a: R.n >= 5 ? Math.max(1, Math.min(14, (R.r - 700) / 70)) : 5, games: [] };
}
function adaptiveUpdate(score) {
  const st = adaptiveState(), n = st.games.length;
  // Saltos grandes al principio para encontrar tu nivel y más finos después
  const step = Math.max(0.6, 3 / Math.sqrt(1 + n / 2));
  const before = st.a;
  st.a = Math.max(0, Math.min(20, st.a + step * (score - 0.5) * 2));
  st.games.push({ t: Date.now(), a: Math.round(before * 10) / 10, s: score, b: Math.round(st.a * 10) / 10 });
  st.games = st.games.slice(-100);
  LS.set(ADAPT_KEY, st);
  return { before, after: st.a };
}
function adaptiveSummary() {
  const st = adaptiveState(), g = st.games;
  if (!g.length) return `Empezará en el nivel ${fmtAdaptive(st.a)} de 20${puzRating().n >= 5 ? " (según tu nivel en los problemas)" : ""} y se ajustará tras cada partida.`;
  const last = g.slice(-10), pts = last.reduce((s, x) => s + x.s, 0);
  const trend = g.length >= 4 ? g[g.length - 1].b - g[Math.max(0, g.length - 6)].a : 0;
  const bars = g.slice(-20).map(x => `<span title="${esc(new Date(x.t).toLocaleDateString("es-ES"))}: ${x.s === 1 ? "victoria" : x.s === 0 ? "derrota" : "tablas"} → nivel ${fmtAdaptive(x.b)}" style="display:inline-block;width:7px;margin-right:2px;vertical-align:bottom;height:${Math.max(3, Math.round(x.b * 2))}px;background:${x.s === 1 ? "var(--accent)" : x.s === 0 ? "var(--danger)" : "var(--muted)"}"></span>`).join("");
  return `Nivel actual: <b>${fmtAdaptive(st.a)}</b> de 20 · ${g.length} partida${g.length === 1 ? "" : "s"} · en las últimas ${last.length}: ${String(pts).replace(".", ",")} puntos${g.length >= 4 ? ` · tendencia ${trend > 0.4 ? "↑ subiendo: estás mejorando" : trend < -0.4 ? "↓ bajando" : "→ estable"}` : ""}
    <div style="margin-top:4px;height:42px;display:flex;align-items:flex-end" aria-label="Evolución del nivel">${bars}</div>`;
}
function cpuName() { return ui.cpu.two ? "" : ui.cpu.human ? `Rival humano ~${ui.cpu.human}` : `CPU ${cpuLevelName(ui.cpu.level)} (${CPU_STYLES[ui.cpu.style].replace(/^\S+ /, "").toLowerCase()})`; }
const cpuStyleText = () => (ui.cpu.human ? "👤 juega como una persona" : CPU_STYLES[ui.cpu.style]);
const ODDS_TEXT = { p: "sin el peón de f", n: "sin un caballo", r: "sin una torre", q: "sin la dama" };
/* Posición inicial con ventaja de material: quita la pieza al bando que da la ventaja */
function oddsFen(odds, user) {
  const m = /^(cpu|me):([pnrq])$/.exec(odds || "");
  if (!m) return null;
  const color = m[1] === "cpu" ? -user : user, s = Chess.parseFen(Chess.START_FEN);
  const rank = color === 1 ? 7 : 0, pawnRank = color === 1 ? 6 : 1;
  const sq = { p: pawnRank * 16 + 5, n: rank * 16 + 1, r: rank * 16 + 0, q: rank * 16 + 3 }[m[2]];
  s.b[sq] = ".";
  if (m[2] === "r") s.c &= color === 1 ? ~2 : ~8;   // ya no puede enrocar largo
  return Chess.toFen(s);
}
function oddsLabel(odds, user) {
  const m = /^(cpu|me):([pnrq])$/.exec(odds || "");
  return m ? `${m[1] === "cpu" ? "la CPU" : "tú"} ${ODDS_TEXT[m[2]]}` : "";
}
function cpuDialogSync() {
  const two = $("cpuOpponent").value === "two";
  $("cpuOddsWrap").hidden = two;
  $("cpuFlipWrap").hidden = !two;
  $("cpuLevel").disabled = two;
  $("cpuStyle").disabled = two || !!humanElo($("cpuLevel").value);
  $("cpuColorLabel").textContent = two ? "Abajo en el tablero" : "Juegas con";
  $("cpuStartBtn").textContent = two ? "▶ Empezar la partida" : "▶ Empezar a jugar";
  $("cpuNote").textContent = two ? "Dos personas juegan por turnos en este dispositivo, con reloj si queréis. Sin reloj se puede deshacer la última jugada." : "Mientras juegas, el motor y la evaluación se ocultan. Con reloj no se pueden deshacer jugadas, y si se te acaba el tiempo pierdes (salvo que el rival no tenga material para dar mate).";
  if (two) $("cpuAdaptiveInfo").hidden = true; else renderAdaptiveInfo();
}
function cpuThinkMs() {
  const level = ui.cpu.level, base = 250 + level * 70;
  if (!Clock.running) return base;
  const left = clockLeft(ui.cpu.side);
  return Math.round(Math.max(60, Math.min(base, left / 40 + Clock.inc * 0.4)));
}
function maybeCpuMove() {
  if (!ui.cpu.on || ui.cpu.thinking || ui.cpu.over || ui.cpu.two) return;
  const node = cur();
  if (node.state.t !== ui.cpu.side || gameStatus(node).over) return;
  ui.cpu.thinking = true;
  Engine.cancel("live");
  renderStatus(); renderBoard();
  const { level, style } = ui.cpu;
  if (ui.cpu.human) { humanCpuMove(node); return; }
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
  if (Clock.running) child.clk = Math.round(Clock.ms[child.parent.state.t] / 100) / 10;   // queda guardado en el PGN ([%clk])
  const st = gameStatus(child);
  if (st.over) { cpuGameOver(st.result, st.text); return; }
  cpuPanel();
  if (ui.cpu.two) { if (ui.cpu.autoFlip) { ui.flipped = child.state.t === -1; render(); } return; }
  if (who === "user") setTimeout(maybeCpuMove, 60);
}
function openCpuDialog(blind) {
  if (ui.cpu.on) { stopCpu(false); return; }
  $("cpuLevel").value = String(settings.cpuLevel);
  if ($("cpuLevel").selectedIndex < 0) $("cpuLevel").value = "8";
  renderAdaptiveInfo();
  $("cpuStyle").value = settings.cpuStyle in CPU_STYLES ? settings.cpuStyle : "balanced";
  $("cpuClock").value = settings.cpuClock;
  if ($("cpuClock").selectedIndex < 0) $("cpuClock").value = "";
  $("cpuColor").value = settings.cpuColor;
  if ($("cpuColor").selectedIndex < 0) $("cpuColor").value = "board";
  $("cpuFrom").value = editor.active ? "here" : settings.cpuFrom;
  $("cpuBlind").checked = blind != null ? blind : ui.blind;
  $("cpuOpponent").value = settings.cpuOpponent === "two" ? "two" : "cpu";
  $("cpuOdds").value = settings.cpuOdds || "";
  if ($("cpuOdds").selectedIndex < 0) $("cpuOdds").value = "";
  $("cpuAutoFlip").checked = settings.cpuAutoFlip !== false;
  cpuDialogSync();
  openModal("cpuModal");
}
function startCpuGame(opts = {}) {
  if (Batch.running) { toast("El motor está analizando tus partidas de la biblioteca: espera a que termine o detenlo en «📊 Estadísticas»."); return false; }
  Object.assign(settings, { cpuLevel: parseCpuLevel($("cpuLevel").value), cpuStyle: $("cpuStyle").value, cpuClock: $("cpuClock").value, cpuColor: $("cpuColor").value, cpuFrom: $("cpuFrom").value, cpuOpponent: $("cpuOpponent").value, cpuOdds: $("cpuOdds").value, cpuAutoFlip: $("cpuAutoFlip").checked });
  saveSettings();
  const two = settings.cpuOpponent === "two";
  const c = settings.cpuColor;
  const user = opts.color || (c === "r" ? (Math.random() < 0.5 ? 1 : -1) : c === "board" ? (ui.flipped ? -1 : 1) : +c);
  const odds = two || settings.cpuFrom !== "new" ? "" : settings.cpuOdds;
  if (editor.active && settings.cpuFrom === "here" && !applyEditor()) return false;
  if (settings.cpuFrom === "new") {
    if (!confirmLeave()) return false;
    leaveModes();
    setGame(Pgn.newGame(oddsFen(odds, user) || undefined), { name: "", noConfirm: true });
  } else leaveModes();
  if (gameStatus(cur()).over) { toast("La partida ya ha terminado en esta posición."); return false; }
  closeModals();
  ui.flipped = user === -1;
  const tc = parseTc(settings.cpuClock);
  const adaptive = settings.cpuLevel === "a", human = humanElo(settings.cpuLevel);
  Object.assign(ui.cpu, { on: true, side: -user, thinking: false, over: false, helped: 0, two, odds, autoFlip: two && settings.cpuAutoFlip, adaptive: adaptive && !two, human: two ? 0 : human, level: adaptive ? Math.round(adaptiveState().a) : human ? Math.max(0, Math.min(20, Math.round((human - 700) / 75))) : settings.cpuLevel, style: settings.cpuStyle, tc: settings.cpuClock, prevLive: settings.live, startNode: cur(), lastEval: null, blind: $("cpuBlind").checked });
  settings.live = false;
  if (!game.root.children.length && game.headers.Event === "Estudio") {
    const d = new Date();
    Object.assign(game.headers, {
      Event: two ? "Partida entre dos jugadores" : "Partida contra la CPU" + (odds ? ` (ventaja: ${oddsLabel(odds, user)})` : ""), Date: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
      White: two ? "Blancas" : user === 1 ? "Tú" : cpuName(), Black: two ? "Negras" : user === 1 ? cpuName() : "Tú"
    });
    if (tc) game.headers.TimeControl = `${tc.base / 1000}+${tc.inc / 1000}`;
    syncHeaderForm();
  }
  if (ui.cpu.blind !== !!ui.blind) setBlind(ui.cpu.blind);
  if (tc) clockStart(tc); else { clockStop(); Clock.shown = false; renderClocks(); }
  if (two) toast(`👥 Partida entre dos jugadores${tc ? `, ${settings.cpuClock}` : ""}. Empiezan las ${cur().state.t === 1 ? "blancas" : "negras"}.`, 3500);
  else toast(`Juegas con ${user === 1 ? "blancas" : "negras"} contra ${ui.cpu.human ? `un rival humano de unos ${ui.cpu.human} de Elo` : `la CPU (${cpuLevelName(ui.cpu.level)}, ${CPU_STYLES[ui.cpu.style]}`}${tc ? `, ${settings.cpuClock}` : ""}${ui.cpu.human ? "" : ")"}.`, 3500);
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
  logActivity("cpu");
  const user = -ui.cpu.side;
  if (ui.cpu.adaptive) {
    const plies = Pgn.pathTo(cur()).length - Pgn.pathTo(ui.cpu.startNode).length, sc = scoreOf(result, user);
    if (sc != null && ui.cpu.helped) text += ` 🎯 Partida con ayuda (${ui.cpu.helped} ${ui.cpu.helped === 1 ? "vez" : "veces"}): no cambia el nivel adaptativo.`;
    else if (sc != null && plies >= 6) {
      const { before, after } = adaptiveUpdate(sc);
      const d = Math.round((after - before) * 10) / 10;
      text += ` 🎯 Nivel adaptativo: ${fmtAdaptive(before)} → ${fmtAdaptive(after)}${d > 0 ? " (sube: la próxima será más difícil)" : d < 0 ? " (baja: la próxima será más asequible)" : ""}.`;
    } else if (sc != null) text += " 🎯 Partida demasiado corta: no cambia el nivel adaptativo.";
  }
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
  if (ui.cpu.two) cpuPanel(result === "1-0" ? "🏆 Ganan las blancas" : result === "0-1" ? "🏆 Ganan las negras" : "🟰 Tablas", text);
  else cpuPanel(sc === 1 ? "🏆 ¡Has ganado!" : sc === 0 ? "❌ Has perdido." : "🟰 Tablas.", text);
  render();
}
/* 📋 Informe del entrenador: tras la partida contra la CPU, tus errores más caros y un ejercicio con cada uno */
async function coachReport() {
  const box = $("cpuBox"), user = -ui.cpu.side, desc = `${cpuLevelName(ui.cpu.level)} · ${cpuStyleText()}`;
  if (Pgn.mainlineFrom(game.root).filter(n => n.parent.state.t === user).length < 3) { toast("La partida es demasiado corta para hacer un informe."); return; }
  box.innerHTML = `<div class="retry-head">📋 Informe del entrenador</div><div class="small">⏳ El motor está analizando la partida (verás el avance en «📖 Estudio»)…</div>`;
  await analyseGame();
  if (!ui.report || ui.analysing) { cpuPanel("Partida terminada", ""); return; }
  const nodes = (ui.analysedLine || []).slice(1).filter(n => n.parent.state.t === user);
  const rows = nodes.map(n => ({ n, c: classifyMove(n) })).filter(x => x.c);
  const acc = rows.length ? Math.round(rows.reduce((s, x) => s + x.c.acc, 0) / rows.length) : null;
  const count = k => rows.filter(x => x.c.cls === k).length;
  const worst = rows.filter(x => ["??", "?", "?!"].includes(x.c.cls) && x.n.parent.eval && x.n.parent.eval.best && x.n.parent.eval.best !== x.n.uci)
    .sort((a, b) => b.c.loss - a.c.loss).slice(0, 3);
  const phase = n => { const ply = Pgn.pathTo(n).length - 1; return PHASES.find(([k]) => k === phaseOfNode(n, ply))[1].toLowerCase(); };
  const phases = worst.map(x => phase(x.n));
  const advice = !worst.length ? "¡Partida muy limpia! Prueba a subir el nivel de la CPU."
    : phases.filter(f => f === "apertura").length >= 2 ? "Tus errores llegan pronto: repasa los principios y tus aperturas en «📘 Cursos»."
    : phases.filter(f => f === "final").length >= 2 ? "Los errores aparecen en el final: te vendrá bien el curso de finales."
    : worst.some(x => x.c.cls === "??") ? "Hay errores graves: antes de cada jugada, comprueba qué piezas quedan sin defender y qué amenaza el rival. Los «🧩 Problemas de táctica» entrenan justo eso."
    : "Son imprecisiones más que errores: compara tus jugadas con las del motor (⚖) para ver qué planes eran mejores.";
  const items = worst.map((x, i) => {
    const p = x.n.parent, b = Chess.moveFromUci(p.state, p.eval.best);
    const bestSan = b ? formatSan(Chess.san(p.state, b), settings.lang, p.state.t) : p.eval.best;
    return `<li><a href="#" data-go="${i}"><b>${esc(numPrefix(p.state) + dispSan(x.n) + (x.n.nag || x.c.cls))}</b></a> (${esc(phase(x.n))}): de ${esc(fmtEval(p.eval))} a ${esc(fmtEval(x.c.after))}. Era mejor <b>${esc(bestSan)}</b>.</li>`;
  }).join("");
  box.hidden = false;
  box.innerHTML = `<div class="retry-head">📋 Informe del entrenador</div>
    <div>Tu precisión: <b>${acc != null ? acc + " %" : "–"}</b> · ${count("??")} error${count("??") === 1 ? "" : "es"} grave${count("??") === 1 ? "" : "s"}, ${count("?")} error${count("?") === 1 ? "" : "es"} y ${count("?!")} imprecisi${count("?!") === 1 ? "ón" : "ones"} <span class="small">(CPU ${esc(desc)})</span></div>
    ${worst.length ? `<div class="retry-msg"><b>Tus ${worst.length === 1 ? "momento más caro" : worst.length + " momentos más caros"}:</b><ol style="margin:4px 0 0 18px; padding:0">${items}</ol></div>` : ""}
    <div class="retry-msg">💡 ${esc(advice)}</div>
    <div class="controls">${worst.length ? `<button class="sm-btn primary" data-k="retry">🎯 Practicar ${worst.length === 1 ? "este error" : "estos errores"}</button>` : ""}<button class="sm-btn" data-k="save">💾 Guardar la partida</button><button class="sm-btn info-btn" data-k="rematch">🔁 Revancha</button><button class="sm-btn" data-k="close">Cerrar</button></div>`;
  box.querySelectorAll("[data-go]").forEach(a => a.onclick = e => { e.preventDefault(); goTo(worst[+a.dataset.go].n); });
  const act = { retry: () => { box.hidden = true; startRetry(0, worst.map(x => x.n)); }, save: () => saveToLibrary({}), rematch: () => cpuAction("rematch"), close: () => { box.hidden = true; } };
  box.querySelectorAll("[data-k]").forEach(b => b.onclick = act[b.dataset.k]);
}
function cpuUndo() {
  if (Clock.running) return;
  if (ui.cpu.two) {
    if (cur() === ui.cpu.startNode || !cur().parent) { toast("No hay jugadas que deshacer."); return; }
    game.current = cur().parent; ui.selected = null;
    if (ui.cpu.autoFlip) ui.flipped = cur().state.t === -1;
    render(); cpuPanel(); return;
  }
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
  if (ui.cpu.two) { if (confirm("¿Estáis de acuerdo los dos en hacer tablas?")) cpuGameOver("1/2-1/2", "Tablas de mutuo acuerdo."); return; }
  const l = ui.cpu.lastEval, plies = Pgn.pathTo(cur()).length - Pgn.pathTo(ui.cpu.startNode).length;
  const w = l ? (ui.cpu.side === 1 ? winPct(l) : 100 - winPct(l)) : 100;
  if (plies >= 20 && w <= 56) cpuGameOver("1/2-1/2", "La CPU acepta las tablas.");
  else toast(plies < 20 ? "La CPU rechaza las tablas: es pronto para eso." : "La CPU rechaza las tablas: cree que va mejor.", 3200);
}
function cpuPanel(head, text) {
  const box = $("cpuBox");
  const desc = ui.cpu.two ? `👥 dos jugadores${ui.cpu.tc ? ` · ⏱ ${ui.cpu.tc}` : ""}${ui.cpu.blind ? " · 🙈 a ciegas" : ""}`
    : `${cpuLevelName(ui.cpu.level)} · ${cpuStyleText()}${ui.cpu.odds ? ` · ventaja: ${oddsLabel(ui.cpu.odds)}` : ""}${ui.cpu.tc ? ` · ⏱ ${ui.cpu.tc}` : ""}${ui.cpu.blind ? " · 🙈 a ciegas" : ""}`;
  box.hidden = false;
  if (ui.cpu.two) {
    const toMove = cur().state.t === 1 ? "las blancas" : "las negras";
    box.innerHTML = ui.cpu.over || head
      ? `<div class="retry-head">🏁 ${esc(head || "Partida terminada")}</div><div>${esc(text || "")}</div>
        <div class="controls"><button class="sm-btn primary" data-c="analyse" title="El motor analiza la partida y comenta los errores de los dos">🤖 Analizar la partida</button><button class="sm-btn" data-c="save">💾 Guardar</button><button class="sm-btn info-btn" data-c="rematch">🔁 Otra partida</button><button class="sm-btn" data-c="close">Cerrar</button></div>`
      : `<div class="retry-head">👥 Partida entre dos jugadores</div><div class="small">${esc(desc)} · juegan ${toMove}</div>
        <div class="controls">${ui.cpu.tc ? "" : `<button class="sm-btn" data-c="undo" title="Deshace la última jugada">↶ Deshacer</button>`}<button class="sm-btn" data-c="draw">½ Tablas</button><button class="sm-btn danger" data-c="resign" title="Se rinde el bando al que le toca mover">🏳 Rendirse (${toMove})</button><button class="sm-btn" data-c="stop" title="Deja la partida sin resultado y vuelve al análisis">⏹ Terminar</button></div>`;
    box.querySelectorAll("[data-c]").forEach(b => b.onclick = () => cpuAction(b.dataset.c));
    return;
  }
  if (ui.cpu.over || head) {
    box.innerHTML = `<div class="retry-head">🏁 ${esc(head || "Partida terminada")}</div><div>${esc(text || "")} <span class="small">(CPU ${esc(desc)})</span></div>
      <div class="controls"><button class="sm-btn primary" data-c="coach" title="El motor analiza la partida y te enseña tus errores más caros, para practicarlos">📋 Informe del entrenador</button><button class="sm-btn" data-c="save">💾 Guardar</button><button class="sm-btn info-btn" data-c="rematch">🔁 Revancha</button><button class="sm-btn" data-c="close">Cerrar</button></div>`;
  } else {
    box.innerHTML = `<div class="retry-head">🤖 Partida contra la CPU</div><div class="small">${esc(desc)}${ui.cpu.helped ? ` · 💡 ayuda pedida ${ui.cpu.helped} ${ui.cpu.helped === 1 ? "vez" : "veces"}${ui.cpu.adaptive ? " (no cuenta para el nivel adaptativo)" : ""}` : ""}</div>
      <div class="controls"><button class="sm-btn primary" data-c="think" title="Cuando te toca: el motor explica la mejor jugada, las alternativas, qué amenaza el rival y por qué (tecla T)">🧠 Piensa conmigo</button><button class="sm-btn" data-c="scan" title="Cuando te toca: lee el tablero antes de calcular (tecla L)">🔎 Lee el tablero</button><button class="sm-btn info-btn" data-c="talk" title="Cuando te toca: qué pieza está más a disgusto y adónde querría ir (tecla H)">🗣 Habla con tus piezas</button></div>
      <div class="controls">${ui.cpu.tc ? "" : `<button class="sm-btn" data-c="undo" title="Deshace tu última jugada y la respuesta de la CPU">↶ Deshacer</button>`}<button class="sm-btn" data-c="draw">½ Ofrecer tablas</button><button class="sm-btn danger" data-c="resign">🏳 Rendirse</button><button class="sm-btn" data-c="stop" title="Deja la partida sin resultado y vuelve al análisis">⏹ Terminar</button></div>`;
  }
  box.querySelectorAll("[data-c]").forEach(b => b.onclick = () => cpuAction(b.dataset.c));
}
function cpuAction(a) {
  if (a === "think") thinkWithMe();
  else if (a === "talk") talkToPieces();
  else if (a === "scan") readBoard();
  else if (a === "undo") cpuUndo();
  else if (a === "draw") cpuOfferDraw();
  else if (a === "resign") {
    if (ui.cpu.two) { const t = cur().state.t, w = t === 1 ? "blancas" : "negras"; if (confirm(`¿Se rinden las ${w}?`)) cpuGameOver(t === 1 ? "0-1" : "1-0", `Se rinden las ${w}.`); }
    else if (confirm("¿Seguro que quieres rendirte?")) cpuGameOver(ui.cpu.side === 1 ? "1-0" : "0-1", "Te has rendido.");
  }
  else if (a === "stop") stopCpu(false);
  else if (a === "analyse") { $("cpuBox").hidden = true; switchTab("study"); analyseGame(); }
  else if (a === "coach") coachReport();
  else if (a === "save") saveToLibrary({});
  else if (a === "close") { $("cpuBox").hidden = true; Clock.shown = false; renderClocks(); }
  else if (a === "rematch") {
    const prev = -ui.cpu.side;
    $("cpuOpponent").value = ui.cpu.two ? "two" : "cpu"; $("cpuOdds").value = ui.cpu.odds || ""; $("cpuAutoFlip").checked = !!ui.cpu.autoFlip || !ui.cpu.two;
    $("cpuLevel").value = ui.cpu.adaptive ? "a" : ui.cpu.human ? "h" + ui.cpu.human : String(ui.cpu.level); $("cpuStyle").value = ui.cpu.style; $("cpuClock").value = ui.cpu.tc || ""; $("cpuFrom").value = "new"; $("cpuBlind").checked = ui.cpu.blind;
    startCpuGame({ color: -prev });
  }
}

