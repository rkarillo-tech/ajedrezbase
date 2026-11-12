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
  if (Guess.n) logActivity("guess");
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
/* Geometría del tablero: el caballo y el alfil sobre un tablero vacío, sin tocar la partida
   (ui.visBoard es la posición que se dibuja mientras dura el ejercicio) */
const onBoard = sq => !(sq & 0x88);
const sqIsLight = sq => ((sq >> 4) + (sq & 7)) % 2 === 0;
function bishopRays(bsq) { const out = new Set(); for (const d of TALK_B) for (let t = bsq + d; onBoard(t); t += d) out.add(t); return out; }
/* Búsqueda en anchura de los saltos del caballo; «blocked» son las casillas prohibidas */
function knightBfs(from, blocked) {
  const prev = new Map([[from, -1]]), q = [from];
  while (q.length) {
    const x = q.shift();
    for (const d of TALK_N) { const t = x + d; if (!onBoard(t) || prev.has(t) || (blocked && blocked.has(t))) continue; prev.set(t, x); q.push(t); }
  }
  return prev;
}
function knightPath(prev, to) { if (!prev.has(to)) return null; const p = []; for (let x = to; x !== -1; x = prev.get(x)) p.unshift(x); return p; }
/* Casillas donde rebota un alfil que sale de sq en la dirección d, hasta volver a sq en esa misma dirección */
function bishopCircuit(sq, d) {
  const f0 = sq & 15, r0 = sq >> 4, dr0 = Math.round(d / 16), df0 = d - 16 * dr0, out = [];
  let f = f0, r = r0, dr = dr0, df = df0;
  for (let k = 0; k < 200; k++) {
    let ch = false;
    if (f + df < 0 || f + df > 7) { df = -df; ch = true; }
    if (r + dr < 0 || r + dr > 7) { dr = -dr; ch = true; }
    if (k > 0 && f === f0 && r === r0 && df === df0 && dr === dr0) break;
    if (ch) out.push(r * 16 + f);
    f += df; r += dr;
  }
  return out;
}
function visSetBoard(pieces, shapes) {
  const st = Chess.parseFen("8/8/8/8/8/8/8/8 w - - 0 1");
  for (const [sq, p] of pieces) if (sq >= 0) st.b[sq] = p;
  ui.visBoard = st;
  ui.visShapes = shapes || [];
}
/* Ruta del caballo (más larga según avanzas) y, con alfil, sin pisar sus casillas */
function visKnightQ(dodge) {
  const n = Vis.n, [lo, hi] = dodge ? [3, 5] : n < 3 ? [2, 3] : n < 7 ? [3, 4] : [4, 6];
  for (let t = 0; t < 600; t++) {
    let bsq = -1, blocked = null;
    if (dodge) { bsq = randomSq(); blocked = bishopRays(bsq); blocked.add(bsq); }
    const from = randomSq();
    if (blocked && blocked.has(from)) continue;
    const prev = knightBfs(from, blocked);
    const cands = [...prev.keys()].filter(x => { const d = knightPath(prev, x).length - 1; return d >= lo && d <= hi; });
    if (!cands.length) continue;
    const to = cands[Math.floor(Math.random() * cands.length)], path = knightPath(prev, to);
    // Casi siempre, que el alfil obligue a dar un rodeo: si no, sería la ruta normal
    if (dodge && t < 500 && knightPath(knightBfs(from), to).length === path.length && Math.random() < 0.8) continue;
    return { from, to, bsq, blocked, path, dist: path.length - 1, route: [] };
  }
  return null;
}
function visBishopQ() {
  for (;;) {
    const sq = randomSq(), f = sq & 7, r = sq >> 4;
    if ((f === 0 || f === 7) && (r === 0 || r === 7)) continue;
    const ds = TALK_B.filter(d => onBoard(sq + d)), d = ds[Math.floor(Math.random() * ds.length)];
    return { sq, d, bounces: bishopCircuit(sq, d), got: [] };
  }
}
function visFlash(ok, bad) {
  Vis.marks = { ok, bad };
  renderBoard();
  clearTimeout(Vis.markTimer);
  Vis.markTimer = setTimeout(() => { if (Vis.state === "ask") { Vis.marks = {}; renderBoard(); } }, 600);
}
function visKnightClick(v) {
  const q = Vis.q, N = Chess.sqName;
  if (v === "undo") { q.route.pop(); Vis.msg = ""; visPanel(); return; }
  if (v === "give") { visKnightEnd(false, "Te enseño una ruta."); return; }
  if (typeof v !== "number") return;
  const pos = q.route.length ? q.route[q.route.length - 1] : q.from;
  if (v === pos) return;
  if (!TALK_N.includes(v - pos)) { Vis.msg = `El caballo no puede saltar de ${N(pos)} a ${N(v)}.`; visFlash(undefined, v); visPanel(); return; }
  if (v === q.bsq) { Vis.msg = "No vale comerse el alfil: hay que esquivarlo."; visFlash(undefined, v); visPanel(); return; }
  q.route.push(v);
  Vis.msg = "";
  if (q.blocked && q.blocked.has(v)) { visKnightEnd(false, `❌ En ${N(v)} el alfil se come al caballo.`); return; }
  const k = q.route.length;
  if (v === q.to) { visKnightEnd(k === q.dist, k === q.dist ? `✔ <b>¡Correcto!</b> ${q.dist} saltos, el mínimo.` : `❌ Llegas en ${k} saltos, pero se puede en ${q.dist}.`); return; }
  if (k >= q.dist) { visKnightEnd(false, `❌ Con ${q.dist} salto${q.dist === 1 ? "" : "s"} ya tendrías que estar en ${N(q.to)}.`); return; }
  Sound.play("move");
  visPanel();
}
function visKnightEnd(ok, txt) {
  const q = Vis.q, N = Chess.sqName, sol = q.path, shapes = [{ color: "green", from: q.to, to: q.to }];
  Vis.n++;
  if (ok) Vis.ok++; else Vis.bad++;
  Vis.state = "answered";
  if (!ok) { let a = q.from; for (const x of q.route) { shapes.push({ color: "red", from: a, to: x }); a = x; } }
  for (let i = 1; i < sol.length; i++) shapes.push({ color: "green", from: sol[i - 1], to: sol[i] });
  ui.visShapes = shapes;
  Vis.marks = {};
  const same = sqIsLight(q.from) === sqIsLight(q.to);
  Vis.msg = txt + (ok ? "" : ` La más corta, en ${q.dist} saltos: <b>${sol.map(N).join(" → ")}</b> (flechas verdes${q.route.length ? "; la tuya, en rojo" : ""}).`) +
    `<br><span class="small">💡 El caballo cambia de color en cada salto: ${N(q.from)} y ${N(q.to)} son ${same ? "del mismo color, así que el número de saltos es par" : "de distinto color, así que el número de saltos es impar"}.</span>`;
  Sound.play(ok ? "ok" : "error");
  renderBoard();
  visPanel();
}
function visBishopClick(v) {
  const q = Vis.q, N = Chess.sqName;
  if (v === "give") { visBishopEnd(false, "Este es el recorrido."); return; }
  if (typeof v !== "number") return;
  const want = q.bounces[q.got.length];
  if (v === want) {
    q.got.push(v);
    if (q.got.length === q.bounces.length) { visBishopEnd(true, `✔ <b>¡Correcto!</b> Y vuelve a ${N(q.sq)}.`); return; }
    Sound.play("move");
    visFlash(v);
    visPanel();
    return;
  }
  visBishopEnd(false, `❌ Desde ${N(q.got.length ? q.got[q.got.length - 1] : q.sq)} rebota en <b>${N(want)}</b>, no en ${N(v)}.`, v);
}
function visBishopEnd(ok, txt, bad) {
  const q = Vis.q, N = Chess.sqName, pts = [q.sq, ...q.bounces, q.sq], shapes = [];
  Vis.n++;
  if (ok) Vis.ok++; else Vis.bad++;
  Vis.state = "answered";
  for (let i = 1; i < pts.length; i++) shapes.push({ color: "green", from: pts[i - 1], to: pts[i] });
  ui.visShapes = shapes;
  Vis.marks = bad != null ? { bad } : {};
  Vis.msg = `${txt} El recorrido: <b>${pts.map(N).join(" → ")}</b>.<br><span class="small">💡 Todas esas casillas son ${sqIsLight(q.sq) ? "claras" : "oscuras"}, como la del alfil: un alfil nunca cambia de color.</span>`;
  Sound.play(ok ? "ok" : "error");
  clearTimeout(Vis.markTimer);
  renderBoard();
  visPanel();
}
function startVis() {
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  const mode = $("visMode").value;
  if (mode === "blindpz") { startBlindPuzzles(+$("visSecs").value); return; }
  if (mode === "line" && !stashBoard()) return;
  leaveModes();
  Object.assign(Vis, { active: true, mode, state: "", n: 0, ok: 0, bad: 0, total: mode === "line" || mode === "knight" || mode === "dodge" || mode === "bishop" || mode === "fork" ? 10 : mode === "forcing" ? 5 : mode === "color" ? 20 : 0, q: null, t0: Date.now(), msg: "", marks: {}, plies: +$("visPlies").value });
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
  } else if (Vis.mode === "knight" || Vis.mode === "dodge") {
    const q = visKnightQ(Vis.mode === "dodge");
    if (!q) { visFinish(); return; }
    Vis.q = q;
    visSetBoard([[q.from, "N"], [q.bsq, "b"]], [{ color: "green", from: q.to, to: q.to }]);
    renderBoard(); renderStatus();
  } else if (Vis.mode === "bishop") {
    const q = Vis.q = visBishopQ();
    visSetBoard([[q.sq, "B"]], [{ color: "blue", from: q.sq, to: q.sq + q.d }]);
    renderBoard(); renderStatus();
  } else if (Vis.mode === "forcing") {
    const q = Vis.q = visForcingQ();
    if (!q) { visFinish(); return; }
    ui.visBoard = Chess.clone(q.st);
    ui.visShapes = [];
    ui.flipped = q.st.t === -1;
    renderBoard(); renderStatus();
  } else if (Vis.mode === "fork") {
    const q = Vis.q = visForkQ();
    if (!q) { visFinish(); return; }
    ui.flipped = false;
    visSetBoard([[q.from, q.pc], [q.k, "k"], [q.o, q.other]], []);
    renderBoard(); renderStatus();
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
  let html = "", extra = "";
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
  } else if (Vis.mode === "knight" || Vis.mode === "dodge") {
    const N = Chess.sqName, dodge = Vis.mode === "dodge";
    html = `<div class="retry-head">${dodge ? "🐴 Caballo esquivando al alfil" : "🐴 Ruta del caballo"} · ${Vis.state === "answered" ? Vis.n : Vis.n + 1} de ${Vis.total} · aciertos ${Vis.ok}</div>
      <div>Lleva el caballo de <b>${N(q.from)}</b> a <b>${N(q.to)}</b> (círculo verde) por el camino más corto${dodge ? `, <b>sin pisar ninguna casilla que controle el alfil negro de ${N(q.bsq)}</b>` : ""}.</div>
      ${Vis.state === "ask" ? `<div class="small">Pulsa en orden las casillas por las que salta; la última es ${N(q.to)}. El caballo no se mueve en el tablero: imagina sus saltos.</div>` : ""}
      <div class="vis-line">${[N(q.from), ...q.route.map(N)].join(" → ")}${Vis.state === "ask" ? " → …" : ""}</div>`;
    if (Vis.state === "ask") extra = `${q.route.length ? `<button class="sm-btn" data-v="undo">↶ Deshacer</button>` : ""}<button class="sm-btn" data-v="give">🏳 Ver la solución</button>`;
  } else if (Vis.mode === "bishop") {
    const N = Chess.sqName;
    html = `<div class="retry-head">🔁 Rebotes del alfil · ${Vis.state === "answered" ? Vis.n : Vis.n + 1} de ${Vis.total} · aciertos ${Vis.ok}</div>
      <div>El alfil de <b>${N(q.sq)}</b> sale hacia <b>${N(q.sq + q.d)}</b> (flecha azul) y rebota en los bordes como una bola de billar. Pulsa en orden las <b>${q.bounces.length} casillas donde rebota</b> hasta volver a ${N(q.sq)}.</div>
      <div class="vis-line">${[N(q.sq), ...q.got.map(N)].join(" → ")}${Vis.state === "ask" ? " → …" : ""}</div>`;
    if (Vis.state === "ask") extra = `<button class="sm-btn" data-v="give">🏳 Ver la solución</button>`;
  } else if (Vis.mode === "forcing") {
    html = visForcingPanel();
    if (Vis.state === "ask") extra = `<button class="sm-btn" data-v="done" title="Muestra las que te faltan">✔ Ya están todas</button>`;
  } else if (Vis.mode === "fork") {
    html = visForkPanel();
  } else {
    html = `<div class="retry-head">🙈 Encuentra la casilla · ⏱ <span id="visClock">${Math.ceil((Vis.end - Date.now()) / 1000)} s</span> · ✔ ${Vis.ok} ✖ ${Vis.bad}</div>
      <div class="vis-big">${Chess.sqName(q.sq)}</div><div class="small" style="text-align:center">Pulsa esa casilla en el tablero (${ui.flipped ? "negras" : "blancas"} abajo).</div>`;
  }
  if (Vis.msg) html += `<div class="retry-msg">${Vis.msg}</div>`;
  html += `<div class="controls">${extra}${Vis.state === "answered" ? `<button class="sm-btn primary" data-v="next">${Vis.n >= Vis.total ? "Ver resultado ▶" : "Siguiente ▶"}</button>` : ""}<button class="sm-btn danger" data-v="end">⏹ Terminar</button></div>`;
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
  if (Vis.mode === "knight" || Vis.mode === "dodge") { visKnightClick(v); return; }
  if (Vis.mode === "bishop") { visBishopClick(v); return; }
  if (Vis.mode === "forcing") { if (v === "done") { visForcingEnd(); visPanel(); } else visForcingClick(v); return; }
  if (Vis.mode === "fork") { visForkClick(v); return; }
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
  ui.visBoard = null;
  ui.visShapes = [];
  if (!silent) renderBoard();
}
function visFinish() {
  if (!Vis.active) return;
  if (Vis.n || Vis.ok) logActivity("vis");
  const mode = Vis.mode, secs = Math.round((Date.now() - Vis.t0) / 1000);
  visStop(false);
  let res;
  if (mode === "coords") {
    const recs = LS.get("ajedrezVisRecords", {}), key = "coords" + (ui.flipped ? "B" : "W"), prev = recs[key] || 0;
    if (Vis.ok > prev) { recs[key] = Vis.ok; LS.set("ajedrezVisRecords", recs); }
    res = `${Vis.ok} casilla${Vis.ok === 1 ? "" : "s"} en 30 s${Vis.bad ? ` (${Vis.bad} fallo${Vis.bad === 1 ? "" : "s"})` : ""}. ${Vis.ok > prev ? "🏆 ¡Nuevo récord!" : `Tu récord con las ${ui.flipped ? "negras" : "blancas"} abajo: ${prev}.`}`;
  } else if (mode === "color") res = `${Vis.ok} de ${Vis.n} aciertos en ${secs} s.`;
  else if (mode !== "line") res = `${Vis.ok} de ${Vis.n} aciertos.`;
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

