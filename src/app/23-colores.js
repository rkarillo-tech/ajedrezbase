/* ---------- 9c. 🎨 Colores en las jugadas de la pieza elegida (ayuda opcional, como en los tableros electrónicos) ----------
   Al elegir una pieza, sus casillas de destino se colorean según lo buena que es cada jugada: verde la mejor, verde claro
   las buenas, amarillo las imprecisiones, naranja los errores y rojo los errores graves. La escala es la misma que usa el
   análisis de partidas (?!, ?, ??): lo que baja la probabilidad de ganar respecto a la mejor jugada de la posición.
   Con Stockfish se valoran todas las jugadas de la pieza en una sola búsqueda (MultiPV + searchmoves); con el motor
   interno, que no sabe hacerlo, se valoran una a una. Se activa en ⚙ Ajustes o con el interruptor «🎨 Colores». */
const MoveQ = { key: "", from: null, node: null, map: new Map(), base: null, busy: false, token: 0, depth: 0, done: false };
const MOVEQ_CLASSES = ["q-best", "q-good", "q-inacc", "q-mistake", "q-blunder"];
const MOVEQ_LABEL = { "q-best": "la mejor", "q-good": "buena", "q-inacc": "imprecisión (?!)", "q-mistake": "error (?)", "q-blunder": "error grave (??)" };
const MOVEQ_COLOR = { "q-best": "#1b8a3a", "q-good": "#7cb342", "q-inacc": "#f2b705", "q-mistake": "#ef6c00", "q-blunder": "#d32f2f" };
/* ¿Se puede usar ahora? En los ejercicios destriparía la solución; contra la CPU sí, y cuenta como ayuda */
function moveQAllowed() {
  if (!settings.moveColors || editor.active || ui.visBoard || ui.blind) return false;
  if (quiz() && !cpuHelpMode()) return false;
  return Engine.ready;
}
/* Clase de color de una jugada a partir de las valoraciones (desde el punto de vista del que mueve) */
function moveQClass(lossPct, isBest) {
  if (isBest || lossPct < 1) return "q-best";
  return lossPct >= 15 ? "q-blunder" : lossPct >= 10 ? "q-mistake" : lossPct >= 5 ? "q-inacc" : "q-good";
}
/* Lo que se pinta: casilla de destino → { cls, title } (la mejor de las coronaciones si hay varias) */
function moveQualityFor(node, from) {
  if (!moveQAllowed() || MoveQ.node !== node || MoveQ.from !== from) return null;
  return MoveQ.map;
}
function moveQReset() { if (MoveQ.busy) { Engine.cancel("colors"); MoveQ.busy = false; } MoveQ.token++; MoveQ.key = ""; MoveQ.node = null; MoveQ.from = null; MoveQ.map = new Map(); MoveQ.done = false; MoveQ.depth = 0; }
/* Pide las valoraciones si hace falta (lo llama renderBoard al elegir una pieza) */
function requestMoveQuality() {
  const node = cur(), from = ui.selected;
  if (from == null || !moveQAllowed()) { if (MoveQ.busy) { Engine.cancel("colors"); MoveQ.busy = false; } return; }
  const key = node.id + ":" + from;
  if (MoveQ.key === key) return;
  moveQReset();
  Object.assign(MoveQ, { key, node, from });
  const L = Chess.legal(node.state), mine = L.filter(m => m.from === from);
  if (!mine.length) return;
  noteCpuHelpOnce(key);
  const token = MoveQ.token;
  if (Engine.kind === "stockfish") moveQStockfish(node, L, mine, token);
  else moveQInternal(node, L, mine, token);
}
/* Contra la CPU, cada posición en la que se miran los colores cuenta como una ayuda */
function noteCpuHelpOnce(key) {
  if (!cpuHelpMode()) return;
  const k = "colors:" + key.split(":")[0];
  ui.cpu.helpKeys = ui.cpu.helpKeys || new Set();
  if (ui.cpu.helpKeys.has(k)) return;
  ui.cpu.helpKeys.add(k);
  noteCpuHelp();
}
/* La mejor jugada conocida de la posición (del análisis en vivo o de la valoración guardada), para saber cuánto pierde cada una */
function moveQKnownBest(node) {
  const run = Engine.running && Engine.running.purpose === "live" && ui.liveNode === node && Engine.running.lines[0] && Engine.running.depth >= 8 ? Engine.running.lines[0] : null;
  if (run && run.pv[0]) return run.pv[0];
  return node.eval && node.eval.best && (node.eval.depth || 0) >= 8 ? node.eval.best : null;
}
function moveQStockfish(node, L, mine, token) {
  const ucis = mine.map(Chess.uci), best = moveQKnownBest(node);
  // Si no se sabe cuál es la mejor jugada de la posición, se valoran todas (así sale también la mejor)
  const search = best ? [...new Set(ucis.concat(best))] : L.map(Chess.uci);
  MoveQ.busy = true;
  const path = Pgn.pathTo(node), stm = node.state.t;
  const apply = job => {
    if (MoveQ.token !== token) return;
    const got = job.lines.filter(Boolean);
    if (!got.length) return;
    const w = l => (stm === 1 ? winPct(l) : 100 - winPct(l));
    const top = Math.max(...got.map(w));
    const byTo = new Map();
    for (const l of got) {
      const u = l.pv[0];
      if (!u || !ucis.includes(u)) continue;
      const to = Chess.sqIdx(u.slice(2, 4)), loss = Math.max(0, top - w(l)), prev = byTo.get(to);
      if (prev && prev.loss <= loss) continue;
      byTo.set(to, { loss, cls: moveQClass(loss, w(l) >= top - 0.01), ev: l });
    }
    MoveQ.map = byTo;
    MoveQ.depth = job.depth || 0;
    moveQPaint();
  };
  Engine.start({
    purpose: "colors", fen: Chess.toFen(path[0].state), moves: path.slice(1).map(n => n.uci), stm, movetime: 900,
    multipv: Math.min(search.length, 60), searchmoves: search,
    onInfo: throttle(j => { if (!j.cancelled && (j.depth || 0) >= 6) apply(j); }, 120),
    onDone: j => { apply(j); moveQFinish(token); },
    resolve: j => { if (!j) moveQFinish(token); }
  });
}
/* Motor interno: una búsqueda corta por cada jugada (la valoración que devuelve es la del rival, por eso se invierte) */
async function moveQInternal(node, L, mine, token) {
  MoveQ.busy = true;
  const path = Pgn.pathTo(node), stm = node.state.t, base = { fen: Chess.toFen(path[0].state), moves: path.slice(1).map(n => n.uci) };
  const evalAfter = u => new Promise(res => Engine.start({ purpose: "colors", fen: base.fen, moves: base.moves.concat(u), stm: -stm, movetime: 250, multipv: 1, resolve: res }));
  const best = moveQKnownBest(node);
  const list = mine.map(Chess.uci);
  if (best && !list.includes(best)) list.push(best);
  const results = new Map();
  for (const u of list) {
    if (MoveQ.token !== token) return;
    const after = Chess.apply(node.state, Chess.moveFromUci(node.state, u));
    let ev;
    if (!Chess.legal(after).length) ev = Chess.inCheck(after) ? { mate: 0, winner: stm } : { cp: 0 };
    else { const j = await evalAfter(u); if (MoveQ.token !== token) return; ev = j && j.lines[0] ? j.lines[0] : null; }
    if (ev) results.set(u, ev);
  }
  if (MoveQ.token !== token) return;
  const w = ev => (stm === 1 ? winPct(ev) : 100 - winPct(ev));
  if (!results.size) { moveQFinish(token); return; }
  const top = Math.max(...[...results.values()].map(w));
  const byTo = new Map();
  for (const m of mine) {
    const u = Chess.uci(m), ev = results.get(u);
    if (!ev) continue;
    const loss = Math.max(0, top - w(ev)), to = m.to, prev = byTo.get(to);
    if (prev && prev.loss <= loss) continue;
    byTo.set(to, { loss, cls: moveQClass(loss, w(ev) >= top - 0.01), ev });
  }
  MoveQ.map = byTo;
  moveQPaint();
  moveQFinish(token);
}
function moveQFinish(token) {
  if (MoveQ.token !== token) return;   // la canceló otra petición (otra pieza): esa sigue su curso
  MoveQ.done = true;
  MoveQ.busy = false;
  moveQPaint();
  ui.liveNode = null;
  requestLive();
}
/* Repinta sólo las casillas (sin rehacer todo el tablero) y el 3D */
function moveQPaint() {
  const map = moveQualityFor(cur(), ui.selected);
  boardEl.querySelectorAll(".square.target").forEach(el => {
    const q = map && map.get(+el.dataset.sq);
    for (const c of MOVEQ_CLASSES) el.classList.toggle(c, !!q && q.cls === c);
    if (q) el.title = `Esta jugada: ${MOVEQ_LABEL[q.cls]}${q.cls !== "q-best" ? ` (pierde ${Math.round(q.loss)} % de probabilidad de ganar)` : ""}`;
    else el.removeAttribute("title");
  });
  const legend = $("moveQLegend");
  if (legend) {
    const on = ui.selected != null && moveQAllowed();
    legend.hidden = !on;
    if (on) legend.querySelector(".mq-state").textContent = MoveQ.done ? "" : " · calculando…";
  }
  if (B3.active) board3dDraw();
}
