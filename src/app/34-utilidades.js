/* ---------- 19d. Utilidades del motor y de las partidas modelo ----------
   Funciones pequeñas que usan el entrenador, las estructuras de peones y el buscador. Vivían en los módulos del
   profesor IA, que se quitaron en la 1.68.0: las explicaciones salen ahora sólo del motor y de las reglas. */
/* Probabilidad de ganar (0-100) de un bando con una evaluación */
const winFor = (ev, color) => (color === 1 ? winPct(ev) : 100 - winPct(ev));
/* La evaluación de una línea del motor (sin la línea) */
const lineEv = l => (l ? { cp: l.cp, mate: l.mate, winner: l.winner, wdl: l.wdl } : null);
/* Las posiciones por las que pasa una línea (como mucho n jugadas) */
function lineStates(state, ucis, n = 4) {
  const out = [];
  let s = state;
  for (let i = 0; i < Math.min(n, (ucis || []).length); i++) { const m = Chess.moveFromUci(s, ucis[i]); if (!m) break; s = Chess.apply(s, m); out.push(s); }
  return out;
}
/* Una jugada en la notación del usuario, sin el número */
const sanOf = (state, uci) => lineText(state, [uci], 1).replace(/^\d+\.(\.\.)?/, "");
const clipText = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
/* Cursos con partidas modelo para las estructuras de peones */
const MODEL_COURSES = ["partidas", "planes", "estrategia", "aperturas", "trampas", "decisiones", "finales"];
/* Abre una partida modelo en el momento en que llega a la posición */
function openModelGame(g) {
  if (g.lib != null) { if (openLibGame(g.lib, g.path)) switchTab("study"); return; }
  if (g.coll != null) { loadCollGame(g.coll); if (Coll.games[g.coll]) goTo(resolvePath(game.root, g.path)); return; }
  const idx = COURSES.findIndex(c => c.id === g.course);
  if (idx < 0) return;
  switchTab("courses");
  if (openLesson(g.course, g.i)) goTo(resolvePath(game.root, g.path));
}
/* Jugadas que se mencionan en un texto («¿y si juego Ae3?», «¿por qué no Dxd5?») */
const MOVE_MENTION_RE = /(\d+\.(?:\.\.)?\s?)?(O-O-O|O-O|0-0-0|0-0|[RDTACKQBN♔-♟][a-h]?[1-8]?x?[a-h][1-8](?:=[DTACQRBN])?|[a-h]x[a-h][1-8](?:=[DTACQRBN])?|[a-h][1-8](?:=[DTACQRBN])?)([+#]?)/g;
/* Esas jugadas, valoradas por el motor desde la posición dada (para contestar preguntas con datos) */
async function movesInQuestion(node, question, bestEv) {
  const s = node.state, items = [], seen = new Set();
  for (const m of String(question).matchAll(MOVE_MENTION_RE)) {
    let move = null;
    for (const tok of [m[2], m[2].replace(/^R/, "K")]) { try { move = Chess.parseMove(s, tok, "auto").move; break; } catch {} }
    if (!move) continue;
    const uci = Chess.uci(move);
    if (seen.has(uci) || items.length >= 3) continue;
    seen.add(uci);
    const after = Chess.apply(s, move);
    let ev = terminalEval({ state: after }), reply = null;
    if (!ev) { const r = await evalState(after, Engine.kind === "stockfish" ? 1000 : 1300, 1); const l = r && r.lines && r.lines[0]; ev = lineEv(l); reply = l && l.pv && l.pv.length ? l.pv.slice(0, 6) : null; }
    if (!ev) continue;
    const loss = bestEv ? Math.max(0, winFor(bestEv, s.t) - winFor(ev, s.t)) : null;
    const san = lineText(s, [uci], 1);
    const verdict = loss == null ? "" : loss < 3 ? "buena (casi tan buena como la mejor)" : loss < 8 ? "jugable" : loss < 15 ? "dudosa" : "un error";
    const text = `${san}: valoración ${fmtEval(ev)}${verdict ? `, ${verdict}` : ""}${loss != null && loss >= 1 ? ` (pierde ${Math.round(loss)} puntos de probabilidad de ganar respecto a la mejor)` : ""}${reply ? `; lo que seguiría según el motor: ${lineText(after, reply, 6)}` : ""}.`;
    items.push({ uci, after, reply, ev, loss, text });
  }
  return { items, text: items.map(i => i.text).join("\n") };
}
