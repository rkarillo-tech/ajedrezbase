/* ---------- 26e. 🧑‍🏫 Entrenador IA: una sesión de entrenamiento guiada ----------
   El entrenador mira tus datos (los errores de tus partidas analizadas, tu acierto por temas en los problemas y tu
   nivel), elige qué toca trabajar y prepara una sesión con posiciones de tus propias partidas y problemas del tema.
   En cada posición te pregunta qué jugarías (y, si quieres, por qué); Stockfish comprueba tu jugada; si fallas te da
   pistas de menos a más sin decirte la solución, y al acertar te explica la idea. La dificultad de los problemas se
   adapta a cómo te va, y al final hay un resumen con qué entrenar después.
   Con el profesor IA configurado, la IA pone las palabras (presentación, pistas, explicaciones y resumen) a partir de
   los datos del motor, sin poder inventar jugadas: las pistas se comprueban para que no revelen la solución y las
   jugadas no comprobadas se marcan con ⚠. Sin IA, el entrenador funciona igual con textos propios. */
const COACH_FOCUS = {
  material: { name: "Táctica: no perder material", icon: "♟", drill: "material", puzzles: ["hangingPiece", "fork", "pin", "skewer", "discoveredAttack", "trappedPiece"] },
  mateMissed: { name: "Encontrar el mate", icon: "🎯", drill: "mateMissed", puzzles: ["mateIn1", "mateIn2", "mateIn3", "backRankMate", "smotheredMate"] },
  mateAllowed: { name: "Defensa: ver las amenazas de mate", icon: "🛡", drill: "mateAllowed", puzzles: ["defensiveMove", "backRankMate", "mateIn1", "mateIn2"] },
  wasted: { name: "Convertir la ventaja", icon: "🏁", drill: "wasted", puzzles: ["endgame", "promotion", "sacrifice"] },
  positional: { name: "Planteamiento: la jugada correcta en posiciones tranquilas", icon: "🧭", drill: "positional", puzzles: ["quietMove", "defensiveMove"] },
  tactics: { name: "Táctica general", icon: "⚔", drill: null, puzzles: [] }
};
const COACH_HINT_THEMES = {
  material: "Antes de mover, mira qué piezas están atacadas y mal defendidas (las tuyas y las del rival).",
  mateMissed: "Busca jaques: el rey rival tiene pocas casillas. ¿Qué jaque deja al rey sin escapatoria?",
  mateAllowed: "¿Qué amenaza el rival? Imagina que puede jugar dos veces seguidas: ¿cómo daría mate?",
  wasted: "Vas mejor: busca la forma más sencilla de asegurar la ventaja (cambiar piezas, frenar el contrajuego, avanzar el peón pasado).",
  positional: "No hay táctica inmediata: ¿cuál es tu pieza peor colocada? ¿Y qué quiere hacer el rival?",
  tactics: "Revisa jaques, capturas y amenazas, en ese orden, para los dos bandos."
};

/* ---------- Diagnóstico y plan ---------- */
function coachDrillItems() {
  const names = myNameList(), out = [];
  if (!Lib.ready) return out;
  for (const rec of Lib.games.values()) {
    const a = rec.analysis;
    if (!a || !a.err || !a.err.length) continue;
    const c = colorOfMe(rec, names);
    for (const e of a.err) {
      if (names.length && c && e.mover !== c) continue;
      out.push({ rec, e, key: e.ply + e.uci, srs: rec.drills && rec.drills[e.ply + e.uci] });
    }
  }
  return out;
}
function coachProfile() {
  const drills = coachDrillItems(), byTheme = {}, byPhase = {};
  for (const d of drills) { if (d.e.th) byTheme[d.e.th] = (byTheme[d.e.th] || 0) + 1; if (d.e.ph) byPhase[d.e.ph] = (byPhase[d.e.ph] || 0) + 1; }
  let weak = [];
  try { weak = weakThemes(); } catch {}
  const R = puzRating();
  return { drills, byTheme, byPhase, weak, rating: Math.round(R.r || 1200), rated: (R.n || 0) > 0, games: new Set(drills.map(d => d.rec.id)).size };
}
/* Elige el tema: el error más repetido en tus partidas (si hay bastantes) o tu tema más flojo en los problemas */
function coachChooseFocus(P) {
  const top = Object.entries(P.byTheme).filter(([k]) => COACH_FOCUS[k]).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) return { key: top[0], why: `es lo que más se repite en tus partidas: ${top[1]} errores de este tipo` };
  const w = P.weak[0];
  if (w) {
    const key = Object.keys(COACH_FOCUS).find(k => COACH_FOCUS[k].puzzles.includes(w.k) || (w.k === "mate" && k === "mateMissed"));
    if (key) return { key, why: `en los problemas de «${w.name}» aciertas sólo el ${w.pct} %`, puzzleTheme: w.k };
  }
  if (top) return { key: top[0], why: `es el error que más aparece en tus partidas (${top[1]})` };
  return { key: "tactics", why: "todavía no tengo datos tuyos: empezamos con táctica variada para conocerte" };
}
function coachProfileText(P, focus) {
  const lines = [];
  lines.push(`Partidas analizadas con errores: ${P.games}. Errores por tipo: ${Object.entries(P.byTheme).map(([k, n]) => `${(THEMES[k] || {}).name || k}: ${n}`).join("; ") || "ninguno"}.`);
  if (Object.keys(P.byPhase).length) lines.push(`Errores por fase: ${Object.entries(P.byPhase).map(([k, n]) => `${k}: ${n}`).join("; ")}.`);
  lines.push(P.weak.length ? `Temas flojos en los problemas: ${P.weak.map(w => `${w.name} (${w.pct} % de acierto)`).join("; ")}.` : "Aún no hay temas flojos claros en los problemas.");
  lines.push(`Nivel aproximado en problemas: ${P.rating}${P.rated ? "" : " (estimado, todavía sin problemas resueltos)"}.`);
  lines.push(`Tema elegido para hoy: ${COACH_FOCUS[focus.key].name}, porque ${focus.why}.`);
  return lines.join("\n");
}
/* La sesión: posiciones de tus partidas con ese error (las pendientes primero) y problemas del tema, que se eligen
   en el momento según la dificultad del momento */
function coachBuildQueue(P, focus, n) {
  const F = COACH_FOCUS[focus.key], now = Date.now();
  let drills = P.drills.filter(d => !F.drill || d.e.th === F.drill);
  drills.sort((a, b) => (a.srs ? a.srs.due : 0) - (b.srs ? b.srs.due : 0) || Math.random() - 0.5);
  drills = drills.filter(d => !d.srs || d.srs.due <= now).concat(drills.filter(d => d.srs && d.srs.due > now));
  const nd = Math.min(drills.length, Math.ceil(n / 2));
  const q = drills.slice(0, nd).map(d => ({ kind: "drill", d }));
  while (q.length < n) q.push({ kind: "puzzle", themes: focus.puzzleTheme ? [focus.puzzleTheme].concat(F.puzzles) : F.puzzles });
  // Alterna: tus partidas y problemas mezclados, empezando por un problema (calienta)
  const ds = q.filter(x => x.kind === "drill"), ps = q.filter(x => x.kind === "puzzle"), out = [];
  while (ds.length || ps.length) { if (ps.length) out.push(ps.shift()); if (ds.length) out.push(ds.shift()); }
  return out;
}
function coachPickPuzzle(themes) {
  const s = puzSrs(), used = new Set(Coach.results.map(r => r.ex && r.ex.pid).concat(Coach.queue.map(x => x.pid)).filter(Boolean));
  const matches = p => !themes || !themes.length || p.themes.some(t => themes.includes(t) || (themes.includes("mate") && t.startsWith("mateIn")));
  let pool = PUZZLES.filter(p => matches(p) && !used.has(p.id));
  if (pool.length < 3) pool = PUZZLES.filter(p => !used.has(p.id));
  if (!pool.length) return null;
  const T = Coach.target;
  return pool.map(p => ({ p, k: Math.abs(p.rating - T) + (s[p.id] ? 150 : 0) + Math.random() * 200 })).sort((a, b) => a.k - b.k)[0].p;
}

/* ---------- La sesión ---------- */
function coachRenderStart() {
  const box = $("coachDiag");
  if (!box) return;
  const P = coachProfile(), f = coachChooseFocus(P);
  const sel = $("coachFocus");
  if (sel && !sel.options.length) sel.innerHTML = `<option value="">🧑‍🏫 Lo que el entrenador vea mejor (recomendado)</option>` + Object.entries(COACH_FOCUS).map(([k, v]) => `<option value="${k}">${v.icon} ${esc(v.name)}</option>`).join("");
  const errs = Object.entries(P.byTheme).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${(THEMES[k] || {}).icon || "•"} ${esc((THEMES[k] || {}).name || k)}: <b>${n}</b>`).join(" · ");
  box.innerHTML = `<div><b>Lo que veo de ti:</b> ${P.games ? `${P.drills.length} errores en ${P.games} partida${P.games === 1 ? "" : "s"} analizada${P.games === 1 ? "" : "s"}${errs ? ` (${errs})` : ""}` : "aún no hay partidas tuyas analizadas"}${P.weak.length ? ` · temas flojos en problemas: ${P.weak.map(w => `${esc(w.name)} (${w.pct} %)`).join(", ")}` : ""} · nivel en problemas ≈ <b>${P.rating}</b>.</div>
    <div>Hoy propongo: <b>${COACH_FOCUS[f.key].icon} ${esc(COACH_FOCUS[f.key].name)}</b>, porque ${esc(f.why)}.</div>
    ${!P.games ? `<div class="small">Para que el entrenador use tus propias partidas, guárdalas en la biblioteca, analízalas (📊 Estadísticas › Analizarlas ahora) y pon tu nombre en 📊 Estadísticas.</div>` : ""}
    <div class="small">${aiProvider() ? `🤖 Las explicaciones las pone la IA (${esc(AI_PROVIDERS[aiProvider()].name.split(" (")[0])}); las jugadas, siempre Stockfish.` : "Sin IA configurada, el entrenador usa sus propias explicaciones. Con el 🤖 profesor IA (⚙ Ajustes) te hablará como un entrenador."}</div>`;
}
async function coachStart() {
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  if (!PUZZLES.length && !coachDrillItems().length) { toast("No hay posiciones para entrenar en esta versión."); return; }
  if (!stashBoard()) return;
  leaveModes();
  const P = coachProfile();
  let focus = coachChooseFocus(P);
  const chosen = $("coachFocus").value;
  if (chosen && chosen !== focus.key) focus = { key: chosen, why: "lo has elegido tú" };
  const n = +$("coachLen").value || 6;
  Object.assign(Coach, { active: true, busy: false, state: "intro", queue: coachBuildQueue(P, focus, n), i: 0, ex: null, results: [], arrows: [], hintSq: -1, hint: 0, attempts: 0,
    token: Coach.token + 1, target: Math.max(600, P.rating - 100), streak: 0, focus, profile: P, msg: "", intro: "" });
  document.body.classList.add("coaching");
  placeCoachBox();
  $("coachBox").hidden = false;
  logActivity("coach");
  const tok = Coach.token;
  coachPanel(`⏳ Preparando la sesión…`);
  const base = `Hoy vamos a trabajar <b>${esc(COACH_FOCUS[focus.key].name)}</b>, porque ${esc(focus.why)}. Son ${Coach.queue.length} posiciones: en cada una, encuentra la mejor jugada (y, si quieres, escribe por qué). Si fallas, te daré pistas sin decirte la solución.`;
  Coach.intro = base;
  if (aiProvider()) {
    try {
      const t = await aiCall(coachSystem(), `${coachProfileText(P, focus)}\n\nEscribe la presentación de la sesión en 2 o 3 frases: qué vamos a entrenar hoy, por qué (con los datos) y un consejo para empezar. Sin jugadas concretas.`);
      if (tok === Coach.token) Coach.intro = aiFormat(t);
    } catch (e) { if (tok === Coach.token) Coach.intro = base + `<div class="small">(La IA no ha respondido: ${esc(e.message || String(e))}.)</div>`; }
  }
  if (tok !== Coach.token || !Coach.active) return;
  coachShow();
}
function coachSystem() {
  const lvl = { basic: "INICIACIÓN: tono cálido y sencillo, sin cifras ni términos técnicos sin explicar.", club: "CLUB: terminología precisa pero accesible.", advanced: "AVANZADO: concreto, con variantes y matices." }[settings.explainLevel] || "";
  return `Eres el entrenador de ajedrez de AjedrezBase y estás dando una clase particular. Hablas siempre en español de España, de tú, con frases cortas, cercano y exigente a la vez (unas 80 palabras como máximo).
Nivel del alumno: ${lvl}
Reglas estrictas:
1. Las únicas jugadas que puedes citar son las que aparecen en los datos (calculadas por el motor). No inventes jugadas ni variantes. No inventes jugadas.
2. Escribe las jugadas en notación algebraica española (R rey, D dama, T torre, A alfil, C caballo; por ejemplo Cf3, Axc6, O-O). Nunca uses las letras inglesas (K, Q, B, N, ni R para la torre).
3. Enseña el porqué (amenazas, piezas sueltas, rey, plan), no sólo la jugada.
4. Nada de tablas ni bloques de código; como mucho **negritas**.`;
}
async function coachShow() {
  if (!Coach.active) return;
  if (Coach.i >= Coach.queue.length) { coachSummary(); return; }
  const item = Coach.queue[Coach.i];
  let ex = null;
  if (item.kind === "drill") {
    const { rec, e } = item.d;
    try {
      const g = Pgn.newGame(e.fen);
      g.headers.Event = "Ejercicio"; g.headers.White = rec.white || "Blancas"; g.headers.Black = rec.black || "Negras";
      ex = { kind: "drill", g, node: g.root, best: e.best || null, wrong: e.uci, theme: e.th, title: `📚 De tu partida «${rec.title}»${rec.date && !/^\?/.test(rec.date) ? ` (${rec.date.slice(0, 4)})` : ""}`, d: item.d };
    } catch { ex = null; }
  } else {
    const p = item.pid ? PUZZLES.find(x => x.id === item.pid) : coachPickPuzzle(item.themes);
    if (p) {
      item.pid = p.id;
      const g = Pgn.newGame(p.fen);
      let n = g.root;
      const m0 = Chess.moveFromUci(n.state, p.moves[0]);
      if (m0) n = Pgn.addMove(n, m0);
      g.headers.Event = "Problema"; g.headers.Site = "AjedrezBase";
      ex = { kind: "puzzle", g, node: n, best: p.moves[1] || null, sol: p.moves.slice(1), theme: puzzleThemeKeys(p)[0], p, pid: p.id, title: `🧩 Problema · ${puzzleThemesText(p)} · nivel ${p.rating}` };
    }
  }
  if (!ex) { Coach.i++; coachShow(); return; }
  Object.assign(Coach, { ex, state: "preparing", busy: true, arrows: [], hintSq: -1, hint: 0, attempts: 0, msg: "", tries: [], hintText: "", ideaText: "", ideaHelp: false });
  ui.flipped = ex.node.state.t === -1;
  setGame(ex.g, { noConfirm: true, name: `🧑‍🏫 Entrenador · ${Coach.i + 1} de ${Coach.queue.length}`, current: ex.node });
  if (ex.kind === "drill") Coach.arrows = [{ color: "threat", from: Chess.moveFromUci(ex.node.state, ex.wrong).from, to: Chess.moveFromUci(ex.node.state, ex.wrong).to }];
  render();
  coachPanel(`⏳ ${Engine.name || "El motor"} estudia la posición…`);
  // La mejor jugada y su valoración, siempre del motor (el problema o el análisis guardado pueden no tener la línea)
  const tok = Coach.token;
  await coachWaitEngine();
  const r = await evalState(ex.node.state, Engine.kind === "stockfish" ? 1500 : 2000, 2);
  if (tok !== Coach.token || Coach.ex !== ex) return;
  const lines = ((r && r.lines) || []).filter(l => l && l.pv && l.pv.length);
  ex.lines = lines;
  if (!ex.best && lines[0]) ex.best = lines[0].pv[0];
  if (!ex.best) { Coach.i++; Coach.busy = false; coachShow(); return; }
  const same = lines.find(l => l.pv[0] === ex.best);
  ex.bestEv = aiEv(same || lines[0]);
  ex.line = same ? same.pv : ex.sol || [ex.best];
  Coach.busy = false;
  Coach.state = "ask";
  coachPanel();
  coachIntoView();
}
const coachWaitEngine = () => new Promise(res => { const t0 = Date.now(); const k = () => (Engine.ready || Date.now() - t0 > 20000 ? res() : setTimeout(k, 200)); k(); });
const coachSide = () => (Coach.ex && Coach.ex.node.state.t === 1 ? "las blancas" : "las negras");
const coachSan = (state, uci) => { try { const L = Chess.legal(state), m = Chess.moveFromUci(state, uci, L); return m ? formatSan(Chess.san(state, m, L), settings.lang, state.t) : uci; } catch { return uci; } };

async function coachMove(move) {
  const ex = Coach.ex;
  if (!ex || Coach.busy || Coach.state !== "ask") return;
  const s = ex.node.state, u = Chess.uci(move), san = coachSan(s, u);
  if (ex.kind === "drill" && u === ex.wrong) { Coach.attempts++; Coach.tries.push(san); Coach.msg = `❌ <b>${esc(san)}</b> es justo lo que se jugó en la partida, el error. Busca otra.`; Sound.play("error"); coachPanel(); return; }
  let loss = 0, ev = ex.bestEv, reply = null;
  if (u !== ex.best) {
    Coach.busy = true; Coach.state = "checking"; coachPanel();
    const after = Chess.apply(s, move);
    ev = terminalEval({ state: after });
    if (!ev) {
      const r = await evalState(after, Engine.kind === "stockfish" ? 1000 : 1400, 1);
      const l = r && r.lines && r.lines[0];
      ev = aiEv(l);
      reply = l && l.pv && l.pv.length ? l.pv : null;
    }
    Coach.busy = false;
    if (Coach.ex !== ex) return;
    if (!ev) { Coach.state = "ask"; Coach.msg = "No he podido comprobar la jugada: inténtalo otra vez."; coachPanel(); return; }
    loss = Math.max(0, aiWinFor(ex.bestEv, s.t) - aiWinFor(ev, s.t));
  }
  if (loss <= 5) { coachSolved(move, san, loss); return; }
  // Fallo: la jugada no se hace; se marca en rojo y llega la siguiente pista
  Coach.attempts++;
  Coach.tries.push(san);
  Coach.state = "ask";
  Coach.arrows = (ex.kind === "drill" ? Coach.arrows.filter(a => a.color === "threat") : []).concat([{ color: "red", from: move.from, to: move.to }]);
  Sound.play("error");
  const refut = reply ? lineText(Chess.apply(s, move), reply, 4) : "";
  Coach.msg = `❌ Con <b>${esc(san)}</b> la valoración sería ${esc(fmtEval(ev))}${refut ? ` (por ejemplo, ${esc(refut)})` : ""}.`;
  renderShapes();
  coachPanel();
  await coachHint({ wrong: san, refut, auto: true });
}
async function coachHint(o = {}) {
  const ex = Coach.ex;
  if (!ex || Coach.state !== "ask") return;
  Coach.hint++;
  const level = Coach.hint;
  if (level >= 4) { coachShowSolution(); return; }
  const bestMove = Chess.moveFromUci(ex.node.state, ex.best);
  const generic = COACH_HINT_THEMES[COACH_FOCUS[ex.theme] ? ex.theme : Coach.focus.key] || COACH_HINT_THEMES.tactics;
  let text = "";
  if (level === 1) text = generic;
  if (level === 2) { Coach.hintSq = bestMove.from; text = `La pieza que hay que mover está marcada. ¿Adónde puede ir con más fuerza?`; renderBoard(); }
  if (level === 3) { Coach.hintSq = bestMove.from; Coach.arrows = Coach.arrows.filter(a => a.color !== "red"); text = `Última pista: piensa en la jugada más forzante de esa pieza (un jaque, una captura o una amenaza directa).`; renderBoard(); }
  Coach.hintText = `💡 ${esc(text)}`;
  coachPanel();
  if (!aiProvider() || level > 2) return;
  // La IA formula la pista como una pregunta, sin decir la jugada; si la dice, se queda la pista propia
  const tok = Coach.token, at = Coach.hint;
  Coach.hintText += ` <span class="small">⏳ el entrenador piensa…</span>`;
  coachPanel();
  try {
    const t = await aiCall(coachSystem(), `${coachFacts(ex, true)}\n${o.wrong ? `El alumno ha probado ${o.wrong}, que es un error${o.refut ? `; la refutación del motor: ${o.refut}` : ""}.` : ""}${Coach.tries.length > 1 ? ` Antes probó: ${Coach.tries.slice(0, -1).join(", ")}.` : ""}\n\nDa la pista número ${level} de 3 en una o dos frases${o.wrong ? " (empieza explicando en pocas palabras por qué falla su jugada)" : ""}: guía con una pregunta, sin decir la jugada buena, ni la pieza que se mueve${level === 1 ? "" : " (ya está marcada en el tablero)"}, ni su casilla de destino.`);
    if (tok !== Coach.token || Coach.ex !== ex || Coach.hint !== at || Coach.state !== "ask") return;
    const safe = coachHintIsSafe(t, ex);
    Coach.hintText = safe ? `💡 ${aiFormat(t)}` : `💡 ${esc(text)}`;
  } catch { if (Coach.hint === at) Coach.hintText = `💡 ${esc(text)}`; }
  coachPanel();
}
/* ¿La pista de la IA deja ver la solución? (la jugada en cualquier notación o su casilla de destino) */
function coachHintIsSafe(t, ex) {
  const s = ex.node.state, L = Chess.legal(s), m = Chess.moveFromUci(s, ex.best, L);
  if (!m) return true;
  const en = Chess.san(s, m, L).replace(/[+#]/g, ""), es = formatSan(en, "es", s.t), to = Chess.sqName(m.to);
  const txt = String(t).replace(/[+#!?]/g, "");
  return ![en, es].some(x => txt.includes(x)) && !new RegExp(`\\b${to}\\b`).test(txt);
}
function coachFacts(ex, secret) {
  const s = ex.node.state;
  const lines = (ex.lines || []).map((l, i) => `${i + 1}. ${fmtEval(aiEv(l))}: ${lineText(s, l.pv, 8)}`).join("\n");
  return [aiPositionText(cur()),
    ex.kind === "drill" ? `Es una posición de una partida del alumno: allí jugó ${coachSan(s, ex.wrong)}, que fue un error.` : `Es un problema de táctica (tema: ${ex.p ? puzzleThemesText(ex.p) : "táctica"}).`,
    `Mejor jugada según el motor${secret ? " (NO la reveles)" : ""}: ${coachSan(s, ex.best)}; línea: ${lineText(s, ex.line, 8)}; valoración ${fmtEval(ex.bestEv)}.`,
    lines ? `Líneas del motor:\n${lines}` : ""].filter(Boolean).join("\n");
}
async function coachSolved(move, san, loss) {
  const ex = Coach.ex, s = ex.node.state;
  const perfect = Coach.attempts === 0 && Coach.hint === 0 && !Coach.ideaHelp;
  Coach.state = "solved";
  Coach.hintSq = -1;
  const child = Pgn.addMove(ex.node, move);
  game.current = child;
  Coach.arrows = Chess.uci(move) !== ex.best ? [{ color: "blue", from: Chess.moveFromUci(s, ex.best).from, to: Chess.moveFromUci(s, ex.best).to }] : [];
  Sound.play("ok");
  coachRecord(perfect);
  Coach.streak = perfect ? Coach.streak + 1 : 0;
  if (ex.kind === "puzzle") Coach.target += perfect ? (Coach.streak >= 2 ? 150 : 75) : Coach.hint >= 2 ? -150 : -50;
  render();
  const bestSan = coachSan(s, ex.best), line = lineText(s, ex.line, 8);
  Coach.msg = loss === 0 ? `✔ <b>¡Exacto!</b> ${esc(san)} era la mejor jugada.${perfect ? " A la primera y sin pistas. 👏" : ""}` : `✔ <b>¡Bien!</b> ${esc(san)} también vale. La del motor era ${esc(bestSan)} (flecha azul).`;
  Coach.explain = `Línea: ${esc(line)} (${esc(fmtEval(ex.bestEv))}).`;
  coachPanel();
  await coachExplain(`El alumno ha encontrado ${san}${loss ? `, que también vale (casi tan buena como ${bestSan})` : ", la mejor"}${Coach.hint ? ` tras ${Coach.hint} pista${Coach.hint === 1 ? "" : "s"}` : ""}.`);
}
function coachShowSolution() {
  const ex = Coach.ex, s = ex.node.state;
  if (!ex || Coach.state === "solved" || Coach.state === "shown") return;
  Coach.state = "shown";
  Coach.hintSq = -1;
  const m = Chess.moveFromUci(s, ex.best);
  Coach.arrows = [{ color: "green", from: m.from, to: m.to }];
  coachRecord(false);
  Coach.streak = 0;
  if (ex.kind === "puzzle") Coach.target -= 150;
  Coach.msg = `👁 La buena era <b>${esc(coachSan(s, ex.best))}</b> (flecha verde).`;
  Coach.explain = `Línea: ${esc(lineText(s, ex.line, 8))} (${esc(fmtEval(ex.bestEv))}).`;
  renderShapes();
  coachPanel();
  coachExplain(`El alumno no la ha encontrado${Coach.tries.length ? ` (probó ${Coach.tries.join(", ")})` : ""}; se le ha enseñado la solución.`);
}
async function coachExplain(what) {
  const ex = Coach.ex;
  const why = ($("coachWhy") && $("coachWhy").value.trim()) || Coach.why || "";
  if (!aiProvider()) {
    if (why) { Coach.explain += `<div class="small">💭 Tu idea: «${esc(why)}». Compárala con la línea del motor: ¿coincide el plan?</div>`; coachPanel(); }
    return;
  }
  const tok = Coach.token;
  Coach.explain += ` <span class="small">⏳ el entrenador prepara la explicación…</span>`;
  coachPanel();
  try {
    const facts = coachFacts(ex, false);
    const t = await aiCall(coachSystem(), `${facts}\n${what}${why ? `\nSu razonamiento: «${why}».` : ""}\n\nExplica en 2 a 4 frases por qué funciona la mejor jugada (usa la línea del motor)${why ? " y comenta su razonamiento: qué vio bien y qué se le escapó" : ""}. Termina con una idea para recordar.`);
    if (tok !== Coach.token || Coach.ex !== ex) return;
    const allowed = aiAllowedMoves([facts]), stats = {};
    const resolver = aiMoveResolver(ex.node, [{ state: ex.node.state, ucis: ex.line }, ...(ex.lines || []).map(l => ({ state: ex.node.state, ucis: l.pv }))]);
    Coach.explain = aiFormat(t, h => aiMoveMarkup(h, allowed, resolver, stats)) + `<div class="small">Línea del motor: ${esc(lineText(ex.node.state, ex.line, 8))}</div>`;
  } catch (e) { if (tok === Coach.token) Coach.explain = Coach.explain.replace(/ <span class="small">⏳[^<]*<\/span>/, ""); }
  coachPanel();
}
/* Lo resuelto cuenta para los repasos: los errores de tus partidas y los problemas (con tu nivel) */
function coachRecord(perfect) {
  const ex = Coach.ex;
  Coach.results.push({ ex, ok: perfect, solved: Coach.state === "solved", hints: Coach.hint, tries: Coach.tries.slice(), theme: ex.theme });
  if (ex.kind === "drill") drillRecord({ __drill: { recId: ex.d.rec.id, key: ex.d.key } }, perfect);
  else if (ex.p) {
    const p = ex.p, all = puzSrs(), st = all[p.id] || { box: 0, reps: 0 };
    st.tries = (st.tries || 0) + 1; st.fails = (st.fails || 0) + (perfect ? 0 : 1);
    srsStep(st, perfect); st.ok = perfect; all[p.id] = st;
    LS.set("ajedrezProblemas", all);
    const R = puzRating();
    puzzleRatingStep(R, p.rating, perfect);
    LS.set("ajedrezNivelProblemas", R);
    logPuzzleResult(p, perfect);
    logActivity("puzzle");
  }
}
/* «💬 Valorar mi idea» (o Intro en la casilla): si empieza por una jugada legal, se juega con el resto como
   razonamiento; si no, el profesor IA dice si va por buen camino sin revelar la solución (cuenta como una ayuda) */
async function coachIdea() {
  const ex = Coach.ex, w = $("coachWhy");
  if (!ex || Coach.state !== "ask" || Coach.busy || !w) return;
  const txt = w.value.trim();
  if (!txt) { w.focus(); toast("Escribe primero tu idea (o tu jugada y por qué)."); return; }
  const first = txt.split(/\s+/)[0].replace(/[,.;:]+$/, "");
  try {
    const { move } = Chess.parseMove(ex.node.state, first, "auto");
    if (move) { Coach.why = txt.slice(first.length).replace(/^[\s,.;:-]*(porque|ya que|pues)?\s*/i, "") || txt; coachMove(move); return; }
  } catch {}
  Coach.why = txt;
  if (!aiProvider()) { Coach.ideaText = `📝 Anotado. Ahora haz tu jugada en el tablero: al comprobarla verás tu idea junto a la línea del motor.`; coachPanel(); return; }
  const tok = Coach.token;
  Coach.ideaHelp = true;
  Coach.ideaText = `💬 <span class="small">⏳ el entrenador valora tu idea…</span>`;
  coachPanel();
  try {
    const t = await aiCall(coachSystem(), `${coachFacts(ex, true)}\n\nEl alumno todavía no ha movido. Su idea: «${txt}».\nValora su idea en una o dos frases: dile si va por buen camino comparándola con lo que muestra el motor y qué debería mirar, sin decir la jugada buena, ni la pieza que se mueve, ni su casilla de destino. Termina pidiéndole que haga su jugada.`);
    if (tok !== Coach.token || Coach.ex !== ex || Coach.state !== "ask") return;
    Coach.ideaText = coachHintIsSafe(t, ex) ? `💬 ${aiFormat(t)}` : `💬 He anotado tu idea; para no darte la solución, la comentaré cuando hagas la jugada. Haz ahora tu jugada en el tablero.`;
  } catch (e) { if (tok === Coach.token) Coach.ideaText = `💬 No he podido valorar tu idea (${esc(e.message || String(e))}). Haz tu jugada y la comentaré al comprobarla.`; }
  coachPanel();
}
function coachNext() { Coach.i++; Coach.why = ""; if ($("coachWhy")) $("coachWhy").value = ""; coachShow(); }

async function coachSummary() {
  Coach.state = "summary";
  Coach.arrows = []; Coach.hintSq = -1;
  const R = Coach.results, ok = R.filter(r => r.ok).length, solved = R.filter(r => r.solved).length;
  const F = COACH_FOCUS[Coach.focus.key];
  const failedThemes = {};
  R.filter(r => !r.ok).forEach(r => { failedThemes[r.theme] = (failedThemes[r.theme] || 0) + 1; });
  const next = ok >= R.length * 0.8 ? "subir la dificultad: prueba el examen de nivel o los problemas difíciles" : solved >= R.length / 2 ? `repetir mañana el mismo tema (${F.name})` : `repasar las posiciones falladas como tarjetas y hacer problemas fáciles de ${F.name.toLowerCase()}`;
  setTimeout(coachIntoView, 50);
  Coach.summary = `<b>${ok} de ${R.length}</b> a la primera y sin pistas, ${solved} resuelta${solved === 1 ? "" : "s"} en total. Nivel de los problemas al terminar: ≈ ${Math.round(Coach.target)}.<br>Mi consejo: ${esc(next)}.`;
  renderShapes();
  coachPanel();
  if (aiProvider() && R.length) {
    const tok = Coach.token;
    const data = R.map((r, i) => `${i + 1}. ${r.ex.kind === "drill" ? "posición de su partida" : "problema"} (${r.ex.kind === "puzzle" && r.ex.p ? puzzleThemesText(r.ex.p) : (THEMES[r.theme] || {}).name || r.theme || "táctica"}): ${r.ok ? "a la primera" : r.solved ? `resuelta con ${r.hints} pista(s)` : "no resuelta"}${r.tries.length ? `; intentos fallidos: ${r.tries.join(", ")}` : ""}`).join("\n");
    try {
      const t = await aiCall(coachSystem(), `${coachProfileText(Coach.profile, Coach.focus)}\n\nResultados de la sesión:\n${data}\n\nHaz el resumen de la clase en 3 o 4 frases: qué ha ido bien, qué patrón se repite en los fallos y qué debe entrenar después en AjedrezBase (por ejemplo: ${next}). No cites jugadas.`);
      if (tok === Coach.token && Coach.state === "summary") { Coach.summary += `<div class="coach-ai">${aiFormat(t)}</div>`; coachPanel(); }
    } catch {}
  }
}
function coachEnd(silent) {
  Coach.token++;
  Coach.active = false;
  Coach.state = "";
  Coach.arrows = []; Coach.hintSq = -1;
  $("coachBox").hidden = true;
  document.body.classList.remove("coaching");
  if (!silent) { if (Cards.stash) restoreStash(); else render(); }
}

/* ---------- El recuadro ---------- */
function coachPanel(wait) {
  const box = $("coachBox");
  if (!box || !Coach.active) return;
  const n = Coach.queue.length, ex = Coach.ex;
  let html = `<div class="retry-head">🧑‍🏫 Entrenador${Coach.state !== "summary" && ex ? ` · ${Coach.i + 1} de ${n}` : ""} <span class="small">· ${esc(COACH_FOCUS[Coach.focus.key].icon)} ${esc(COACH_FOCUS[Coach.focus.key].name)}</span></div>`;
  if (Coach.state === "summary") {
    html += `<div class="coach-msg">${Coach.summary}</div><div class="controls"><button class="sm-btn primary" data-co="again">🔁 Otra sesión</button><button class="sm-btn" data-co="end">${Cards.stash ? "↩ Volver a tu partida" : "✔ Terminar"}</button></div>`;
  } else {
    if (Coach.i === 0 && Coach.intro && (Coach.state === "ask" || Coach.state === "preparing" || Coach.state === "intro")) html += `<div class="coach-intro">${Coach.intro}</div>`;
    if (ex) html += `<div class="small">${esc(ex.title)}</div>`;
    if (wait) html += `<div class="small">${esc(wait)}</div>`;
    if (ex && (Coach.state === "ask" || Coach.state === "checking")) {
      html += `<div class="retry-q">Juegan <b>${coachSide()}</b>. ${ex.kind === "drill" ? "En tu partida se jugó la flecha roja discontinua, que fue un error. ¿Qué era mejor?" : `El rival acaba de jugar ${esc(numPrefix(ex.node.parent.state) + dispSan(ex.node))}. ¿Qué jugarías?`} Haz la jugada en el tablero.</div>
        <div class="coach-why-row"><input id="coachWhy" class="coach-why" placeholder="Tu idea (opcional): «quiero atacar f7…» o «Cf3 porque…»" aria-label="Tu idea o tu jugada y por qué" autocomplete="off" value="${esc(Coach.why || "")}"><button class="sm-btn" data-co="idea" title="El entrenador valora tu idea sin decirte la solución (o juega la jugada si empiezas por ella)">💬 Valorar mi idea</button></div>`;
    }
    if (Coach.msg) html += `<div class="retry-msg">${Coach.msg}</div>`;
    if (Coach.ideaText && Coach.state === "ask") html += `<div class="coach-hint coach-idea">${Coach.ideaText}</div>`;
    if (Coach.hintText && Coach.state === "ask") html += `<div class="coach-hint">${Coach.hintText}</div>`;
    if (Coach.state === "checking") html += `<div class="small">⏳ Comprobando tu jugada con ${esc(Engine.name || "el motor")}…</div>`;
    if ((Coach.state === "solved" || Coach.state === "shown") && Coach.explain) html += `<div class="coach-msg">${Coach.explain}</div>`;
    html += `<div class="controls">`;
    if (Coach.state === "ask") html += `<button class="sm-btn" data-co="hint">💡 Pista${Coach.hint ? ` (${Coach.hint + 1}/3)` : ""}</button><button class="sm-btn" data-co="show">👁 Solución</button><button class="sm-btn" data-co="skip">⏭ Saltar</button>`;
    if (Coach.state === "solved" || Coach.state === "shown") html += `<button class="sm-btn primary" data-co="next">${Coach.i + 1 < n ? "Siguiente ▶" : "Ver el resumen ▶"}</button>`;
    html += `<button class="sm-btn danger" data-co="end">⏹ Terminar</button></div>`;
  }
  const keepFocus = document.activeElement && document.activeElement.id === "coachWhy";
  box.innerHTML = html;
  box.querySelectorAll("[data-co]").forEach(b => b.onclick = () => coachLessonAction(b.dataset.co));
  const w = $("coachWhy");
  if (w) { w.oninput = () => { Coach.why = w.value; }; w.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); coachIdea(); } }; if (keepFocus) { w.focus(); w.setSelectionRange(w.value.length, w.value.length); } }
}
function coachLessonAction(a) {
  if (a === "idea") coachIdea();
  else if (a === "hint") coachHint();
  else if (a === "show") coachShowSolution();
  else if (a === "skip") { if (Coach.state === "ask") { coachRecord(false); Coach.streak = 0; } coachNext(); }
  else if (a === "next") coachNext();
  else if (a === "again") { coachEnd(true); switchTab("tools"); openTrainSection("coach"); coachRenderStart(); }
  else if (a === "end") coachEnd(false);
}
$("coachStartBtn").onclick = coachStart;
/* Dónde va el recuadro: en pantallas anchas, arriba de la columna derecha y fijo al desplazarse (junto al tablero);
   en el móvil y la tableta en vertical, justo debajo del tablero. Al empezar, se lleva a la vista */
const coachHome = { parent: $("coachBox").parentElement, next: $("coachBox").nextElementSibling };
function placeCoachBox() {
  const box = $("coachBox"), side = sideLayout();
  if (side && box.parentElement !== $("toolsPanel")) $("toolsPanel").prepend(box);
  if (!side && box.parentElement !== coachHome.parent) coachHome.parent.insertBefore(box, coachHome.next);
  box.classList.toggle("side", side);
}
function coachIntoView() {
  if (!Coach.active) return;
  const box = $("coachBox"), board = $("boardWrap").getBoundingClientRect(), r = box.getBoundingClientRect();
  if (sideLayout()) { if (board.top < 0 || board.bottom > innerHeight) $("topBar").scrollIntoView({ block: "start", behavior: "smooth" }); return; }
  // En el móvil: que se vean el tablero y el principio del recuadro; si no caben, manda el recuadro
  if (r.top < 0 || r.top > innerHeight - 120 || board.top < 0) {
    const y = scrollY + Math.min(board.top - 8, r.top - Math.max(0, innerHeight - r.height - 16));
    scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }
}
