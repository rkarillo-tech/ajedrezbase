/* ---------- 26e. 🧑‍🏫 Entrenador: una sesión de entrenamiento guiada ----------
   El entrenador mira tus datos (los errores de tus partidas analizadas, tu acierto por temas en los problemas y tu
   nivel), elige qué toca trabajar y prepara una sesión con posiciones de tus propias partidas y problemas del tema.
   En cada posición te pregunta qué jugarías (y, si quieres, por qué); Stockfish comprueba tu jugada; si fallas te da
   pistas de menos a más sin decirte la solución, y al acertar te explica la idea. La dificultad de los problemas se
   adapta a cómo te va, y al final hay un resumen con qué entrenar después.
   Todo sale de Stockfish y de las reglas (los motivos tácticos de 29-motivos.js): no hay textos inventados. */
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

/* ---------- Memoria entre clases (1.56) ----------
   Cada clase deja un resumen (qué tema, cuántas a la primera y el acierto por tema) y las posiciones falladas pasan
   a una lista de «para repetir» que vuelven a la clase al cabo de 3 días; al acertarlas a la primera, salen. Así el
   entrenador recuerda qué te cuesta de una clase a otra, no sólo lo que hay en tus partidas analizadas. Se guarda
   con el resto del progreso (copia de seguridad y sincronización); lo resuelto se marca, no se borra, para que la
   sincronización no lo resucite desde otro dispositivo. */
const COACH_MEM = "ajedrezEntrenador", COACH_RETRY_DAYS = 3;
const coachMem = () => { const m = LS.get(COACH_MEM, null) || {}; return { sessions: Array.isArray(m.sessions) ? m.sessions : [], retry: m.retry && typeof m.retry === "object" ? m.retry : {} }; };
function coachMemSave(m) {
  const old = Date.now() - 60 * 864e5;
  for (const [k, r] of Object.entries(m.retry)) if (r.done && (r.t || 0) < old) delete m.retry[k];
  m.sessions = m.sessions.slice(-80);
  LS.set(COACH_MEM, m);
}
/* El tema del entrenador al que pertenece un ejercicio (los de tus partidas ya lo traen; los problemas, por sus temas) */
function coachFocusOf(ex) {
  if (ex.kind === "drill") return COACH_FOCUS[ex.theme] ? ex.theme : "tactics";
  const ts = ex.p ? puzzleThemeKeys(ex.p) : [ex.theme];
  return Object.keys(COACH_FOCUS).find(k => COACH_FOCUS[k].puzzles.some(t => ts.includes(t) || (t.startsWith("mateIn") && ts.includes("mate")))) || "tactics";
}
const coachRetryKey = ex => (ex.kind === "drill" ? `d:${ex.d.rec.id}:${ex.d.key}` : `p:${ex.pid}`);
/* Lo que recuerda: clases de los últimos 30 días, acierto por tema y los ejercicios que toca repetir */
function coachMemSummary(now = Date.now()) {
  const m = coachMem(), since = now - 30 * 864e5, recent = m.sessions.filter(x => x.t >= since), by = {};
  for (const ses of recent) for (const [k, v] of Object.entries(ses.th || {})) { const x = by[k] = by[k] || { k, tries: 0, ok: 0 }; x.tries += v[0] || 0; x.ok += v[1] || 0; }
  const themes = Object.values(by).filter(x => COACH_FOCUS[x.k]).map(x => Object.assign(x, { pct: Math.round(100 * x.ok / x.tries) }));
  const weak = themes.filter(x => x.tries >= 4 && x.pct < 60).sort((a, b) => a.pct - b.pct || b.tries - a.tries);
  const retry = Object.entries(m.retry).filter(([, r]) => !r.done).map(([key, r]) => Object.assign({ key }, r));
  return { sessions: recent.length, total: m.sessions.length, last: m.sessions.length ? m.sessions[m.sessions.length - 1] : null, themes, weak, retry, due: retry.filter(r => r.due <= now).sort((a, b) => a.due - b.due) };
}
function coachMemRecord(ex, perfect) {
  const m = coachMem(), key = coachRetryKey(ex), now = Date.now(), r = m.retry[key];
  if (perfect) { if (r && !r.done) m.retry[key] = Object.assign(r, { done: true, t: now }); }
  else m.retry[key] = { kind: ex.kind, pid: ex.pid || null, recId: ex.kind === "drill" ? ex.d.rec.id : null, dkey: ex.kind === "drill" ? ex.d.key : null,
    focus: coachFocusOf(ex), fails: ((r && !r.done && r.fails) || 0) + 1, due: now + COACH_RETRY_DAYS * 864e5, t: now };
  coachMemSave(m);
}
function coachMemSession() {
  const R = Coach.results;
  if (!R.length) return;
  const m = coachMem(), th = {};
  for (const r of R) { const k = coachFocusOf(r.ex), x = th[k] = th[k] || [0, 0]; x[0]++; if (r.ok) x[1]++; }
  m.sessions.push({ t: Date.now(), focus: Coach.focus.key, n: R.length, ok: R.filter(r => r.ok).length, solved: R.filter(r => r.solved).length, th });
  coachMemSave(m);
}
const coachIn = t => { const d = Math.ceil((t - Date.now()) / 864e5); return d <= 0 ? "hoy" : d === 1 ? "mañana" : `dentro de ${d} días`; };
const coachDays = t => { const d = Math.round((Date.now() - t) / 864e5); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };

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
  return { drills, byTheme, byPhase, weak, rating: Math.round(R.r || 1200), rated: (R.n || 0) > 0, games: new Set(drills.map(d => d.rec.id)).size, mem: coachMemSummary() };
}
/* Elige el tema: el error más repetido en tus partidas (si hay bastantes) o tu tema más flojo en los problemas */
function coachChooseFocus(P) {
  const mw = P.mem && P.mem.weak[0];
  if (mw) return { key: mw.k, why: `en tus últimas clases aciertas a la primera sólo el ${mw.pct} % de las posiciones de este tema (${mw.ok} de ${mw.tries})` };
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
/* La sesión: posiciones de tus partidas con ese error (las pendientes primero) y problemas del tema, que se eligen
   en el momento según la dificultad del momento */
function coachBuildQueue(P, focus, n) {
  const F = COACH_FOCUS[focus.key], now = Date.now();
  // Primero, hasta la mitad de la clase, las posiciones falladas en clases anteriores que ya toca repetir
  const again = [];
  for (const r of (P.mem ? P.mem.due : [])) {
    if (again.length >= Math.ceil(n / 2)) break;
    if (r.kind === "puzzle" && r.pid && PUZZLES.some(p => p.id === r.pid)) again.push({ kind: "puzzle", pid: r.pid, again: true });
    else if (r.kind === "drill") { const d = P.drills.find(x => x.rec.id === r.recId && x.key === r.dkey); if (d) again.push({ kind: "drill", d, again: true }); }
  }
  n -= again.length;
  const skip = new Set(again.filter(x => x.d).map(x => x.d));
  let drills = P.drills.filter(d => (!F.drill || d.e.th === F.drill) && !skip.has(d));
  drills.sort((a, b) => (a.srs ? a.srs.due : 0) - (b.srs ? b.srs.due : 0) || Math.random() - 0.5);
  drills = drills.filter(d => !d.srs || d.srs.due <= now).concat(drills.filter(d => d.srs && d.srs.due > now));
  const nd = Math.min(drills.length, Math.ceil(n / 2));
  const q = drills.slice(0, nd).map(d => ({ kind: "drill", d }));
  while (q.length < n) q.push({ kind: "puzzle", themes: focus.puzzleTheme ? [focus.puzzleTheme].concat(F.puzzles) : F.puzzles });
  // Alterna: tus partidas y problemas mezclados, empezando por un problema (calienta)
  const ds = q.filter(x => x.kind === "drill"), ps = q.filter(x => x.kind === "puzzle"), out = [];
  while (ds.length || ps.length) { if (ps.length) out.push(ps.shift()); if (ds.length) out.push(ds.shift()); }
  return again.concat(out);
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
    ${coachMemHtml(P.mem)}
    <div>Hoy propongo: <b>${COACH_FOCUS[f.key].icon} ${esc(COACH_FOCUS[f.key].name)}</b>, porque ${esc(f.why)}.</div>
    ${!P.games ? `<div class="small">Para que el entrenador use tus propias partidas, guárdalas en la biblioteca, analízalas (📊 Estadísticas › Analizarlas ahora) y pon tu nombre en 📊 Estadísticas.</div>` : ""}
    <div class="small">Las jugadas y las explicaciones salen de Stockfish y de las reglas del ajedrez.</div>`;
}
/* «Lo que recuerdo de tus clases»: lo que el entrenador sabe de las anteriores */
function coachMemHtml(M) {
  if (!M || !M.total) return `<div><b>Lo que recuerdo de tus clases:</b> todavía ninguna; a partir de la primera recordaré qué te cuesta y repetiremos lo que falles.</div>`;
  const th = M.themes.slice().sort((a, b) => a.pct - b.pct).slice(0, 3).map(x => `${COACH_FOCUS[x.k].icon} ${esc(COACH_FOCUS[x.k].name)}: ${x.pct} %`).join(" · ");
  const next = M.retry.length && !M.due.length ? Math.min(...M.retry.map(r => r.due)) : 0;
  return `<div><b>Lo que recuerdo de tus clases:</b> ${M.sessions} en los últimos 30 días (la última, ${coachDays(M.last.t)}: ${M.last.ok} de ${M.last.n} a la primera)${th ? ` · acierto a la primera: ${th}` : ""}.
    ${M.due.length ? `<b>🔁 Hoy repetimos ${M.due.length} ${M.due.length === 1 ? "posición" : "posiciones"} que fallaste.</b>` : next ? (M.retry.length === 1 ? `La posición que fallaste volverá ${coachIn(next)}.` : `Las ${M.retry.length} posiciones que fallaste volverán ${coachIn(next)}.`) : ""}</div>`;
}
async function coachStart(opts = {}) {
  routeEvent("coach-start");
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  if (!PUZZLES.length && !coachDrillItems().length) { toast("No hay posiciones para entrenar en esta versión."); return; }
  if (!stashBoard()) return;
  leaveModes();
  const P = coachProfile();
  let focus = coachChooseFocus(P);
  const chosen = opts.n ? "" : $("coachFocus").value;   // la clase del día la elige siempre el entrenador
  if (chosen && chosen !== focus.key) focus = { key: chosen, why: "lo has elegido tú" };
  const n = opts.n || +$("coachLen").value || 6;
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
  if (tok !== Coach.token || !Coach.active) return;
  coachShow();
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
  Object.assign(Coach, { ex, state: "preparing", busy: true, arrows: [], hintSq: -1, hint: 0, attempts: 0, msg: "", tries: [], hintText: "", ideaText: "", chat: [], chatBusy: false });
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
  ex.bestEv = lineEv(same || lines[0]);
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
      ev = lineEv(l);
      reply = l && l.pv && l.pv.length ? l.pv : null;
    }
    Coach.busy = false;
    if (Coach.ex !== ex) return;
    if (!ev) { Coach.state = "ask"; Coach.msg = "No he podido comprobar la jugada: inténtalo otra vez."; coachPanel(); return; }
    loss = Math.max(0, winFor(ex.bestEv, s.t) - winFor(ev, s.t));
  }
  if (loss <= 5) { coachSolved(move, san, loss); return; }
  // Fallo: la jugada no se hace; se marca en rojo y llega la siguiente pista
  Coach.attempts++;
  Coach.tries.push(san);
  Coach.state = "ask";
  Coach.arrows = (ex.kind === "drill" ? Coach.arrows.filter(a => a.color === "threat") : []).concat([{ color: "red", from: move.from, to: move.to }]);
  Sound.play("error");
  const refut = reply ? lineText(Chess.apply(s, move), reply, 4) : "";
  const whyBad = reply ? motifBad(s, move, reply, ev) : "";
  Coach.msg = `❌ Con <b>${esc(san)}</b> la valoración sería ${esc(fmtEval(ev))}${refut ? ` (por ejemplo, ${esc(refut)})` : ""}.${whyBad ? ` ${esc(whyBad)}` : ""}`;
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
  if (level === 1) text = motifHint(ex.node.state, ex.line, ex.bestEv) || generic;   // el tipo de motivo (horquilla, clavada…), sin la jugada
  if (level === 2) { Coach.hintSq = bestMove.from; text = `La pieza que hay que mover está marcada. ¿Adónde puede ir con más fuerza?`; renderBoard(); }
  if (level === 3) { Coach.hintSq = bestMove.from; Coach.arrows = Coach.arrows.filter(a => a.color !== "red"); text = `Última pista: piensa en la jugada más forzante de esa pieza (un jaque, una captura o una amenaza directa).`; renderBoard(); }
  Coach.hintText = `💡 ${esc(text)}`;
  coachPanel();
}
/* Ejercicio resuelto. Las explicaciones usan siempre la posición DEL EJERCICIO (antes de la jugada del alumno), no la
   del tablero, que tras acertar ya tiene la jugada hecha */
async function coachSolved(move, san, loss) {
  const ex = Coach.ex, s = ex.node.state;
  const perfect = Coach.attempts === 0 && Coach.hint === 0;
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
  Coach.explain = coachWhyGood(ex) + `Línea: ${esc(line)} (${esc(fmtEval(ex.bestEv))}).`;
  coachPanel();
  coachExplain();
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
  Coach.explain = coachWhyGood(ex) + `Línea: ${esc(lineText(s, ex.line, 8))} (${esc(fmtEval(ex.bestEv))}).`;
  renderShapes();
  coachPanel();
  coachExplain();
}
/* Por qué funciona la mejor jugada (29-motivos.js) */
function coachWhyGood(ex) {
  const g = motifGood(ex.node.state, ex.line, ex.bestEv);
  return g ? `<b>${esc(coachSan(ex.node.state, ex.best))}</b> — ${esc(g)}. ` : "";
}
/* Al resolver o ver la solución: si el alumno escribió su idea, se le pide compararla con la línea del motor */
function coachExplain() {
  const why = String(Coach.why || ($("coachWhy") && $("coachWhy").value) || "").trim();
  if (why) { Coach.explain += `<div class="small">💭 Tu idea: «${esc(why)}». Compárala con la línea del motor: ¿coincide el plan?</div>`; coachPanel(); }
}
/* Lo resuelto cuenta para los repasos: los errores de tus partidas y los problemas (con tu nivel) */
function coachRecord(perfect) {
  const ex = Coach.ex;
  Coach.results.push({ ex, ok: perfect, solved: Coach.state === "solved", hints: Coach.hint, tries: Coach.tries.slice(), theme: ex.theme, again: !!(Coach.queue[Coach.i] && Coach.queue[Coach.i].again) });
  coachMemRecord(ex, perfect);
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
/* «📝 Anotar mi idea» (o Intro en la casilla): si empieza por una jugada legal, se juega con el resto como
   razonamiento; si no, se anota y se enseña junto a la línea del motor al comprobar la jugada */
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
  Coach.ideaText = `📝 Anotado. Ahora haz tu jugada en el tablero: al comprobarla verás tu idea junto a la línea del motor.`;
  coachPanel();
}
/* Seguir preguntando al terminar un ejercicio: el motor valora las jugadas que se mencionan («¿y si juego Ae3?») */
async function coachFollow(q) {
  const ex = Coach.ex;
  q = String(q || "").trim();
  if (!ex || !q || Coach.chatBusy || !["solved", "shown"].includes(Coach.state)) { if (!q && $("coachAsk")) $("coachAsk").focus(); return; }
  const tok = Coach.token;
  Coach.chatBusy = true;
  coachPanel();
  try {
    const alt = await movesInQuestion(ex.node, q, ex.bestEv);
    if (tok !== Coach.token || Coach.ex !== ex) return;
    const html = alt.items.length ? alt.items.map(a => esc(a.text)).join("<br>") : "Puedo valorarte jugadas concretas con el motor: escribe por ejemplo «¿y si juego Cf3?» o «¿por qué no Dxd5?».";
    Coach.chat.push({ q, a: html, plain: html.replace(/<[^>]+>/g, " ") });
  } catch (e) { if (tok === Coach.token) Coach.chat.push({ q, a: `<span class="msg-err">No he podido responder: ${esc(e.message || String(e))}.</span>`, plain: "" }); }
  finally { if (tok === Coach.token) { Coach.chatBusy = false; coachPanel(); const a = $("coachAsk"); if (a) a.focus(); } }
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
  coachMemSession();
  const back = R.filter(r => !r.ok).length, rep = R.filter(r => r.again), repOk = rep.filter(r => r.ok).length;
  Coach.summary = `<b>${ok} de ${R.length}</b> a la primera y sin pistas, ${solved} resuelta${solved === 1 ? "" : "s"} en total. Nivel de los problemas al terminar: ≈ ${Math.round(Coach.target)}.<br>Mi consejo: ${esc(next)}.`
    + (rep.length ? (rep.length === 1 ? `<br>🔁 La posición que repetías de otra clase ${repOk ? "ya te sale" : "todavía no te sale"} a la primera.` : `<br>🔁 De las ${rep.length} posiciones que repetías de otras clases, ${repOk} ya te ${repOk === 1 ? "sale" : "salen"} a la primera.`) : "")
    + (back ? (back === 1 ? `<br>📅 La que no te ha salido a la primera volverá dentro de ${COACH_RETRY_DAYS} días.` : `<br>📅 Las ${back} que no te han salido a la primera volverán dentro de ${COACH_RETRY_DAYS} días.`) : "");
  renderShapes();
  coachPanel();
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
  if (typeof renderActivity === "function") setTimeout(renderActivity, 0);   // 1.57: la etiqueta «qué estás haciendo», al día
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
        <div class="coach-why-row"><input id="coachWhy" class="coach-why" placeholder="Tu idea (opcional): «quiero atacar f7…» o «Cf3 porque…»" aria-label="Tu idea o tu jugada y por qué" autocomplete="off" value="${esc(Coach.why || "")}"><button class="sm-btn" data-co="idea" title="Anota tu idea para compararla con la línea del motor al comprobar (o juega la jugada si empiezas por ella)">📝 Anotar mi idea</button></div>`;
    }
    if (Coach.msg) html += `<div class="retry-msg">${Coach.msg}</div>`;
    if (Coach.ideaText && Coach.state === "ask") html += `<div class="coach-hint coach-idea">${Coach.ideaText}</div>`;
    if (Coach.hintText && Coach.state === "ask") html += `<div class="coach-hint">${Coach.hintText}</div>`;
    if (Coach.state === "checking") html += `<div class="small">⏳ Comprobando tu jugada con ${esc(Engine.name || "el motor")}…</div>`;
    if ((Coach.state === "solved" || Coach.state === "shown") && Coach.explain) html += `<div class="coach-msg">${Coach.explain}</div>`;
    if (Coach.state === "solved" || Coach.state === "shown") {
      for (const c of Coach.chat || []) html += `<div class="coach-q small">❓ ${esc(c.q)}</div><div class="coach-msg coach-answer">${c.a}</div>`;
      if (Coach.chatBusy) html += `<div class="small">⏳ El motor estudia la jugada…</div>`;
      const chips = [["¿Qué otras jugadas valían?", "¿Qué otras jugadas valían en esta posición y por qué?"], ["¿Cómo sigue?", "¿Cómo sigue la partida después de la mejor jugada? ¿Cuál es el plan?"]]
        .concat((Coach.tries || []).slice(-2).map(t => [`¿Por qué no ${t}?`, `¿Por qué no era buena ${t}?`]));
      html += `<div class="coach-follow"><div class="coach-chips">${chips.map(([l, q]) => `<button class="sm-btn" data-co-q="${esc(q)}">${esc(l)}</button>`).join("")}</div>
        <div class="coach-why-row"><input id="coachAsk" class="coach-why" placeholder="Pregunta al entrenador sobre esta posición: «¿y si juego Ae3?», «¿por qué no Dxd5?»…" aria-label="Pregunta al entrenador sobre esta posición" autocomplete="off"><button class="sm-btn" data-co="ask"${Coach.chatBusy ? " disabled" : ""}>Preguntar</button></div></div>`;
    }
    html += `<div class="controls">`;
    if (Coach.state === "ask") html += `<button class="sm-btn" data-co="hint">💡 Pista${Coach.hint ? ` (${Coach.hint + 1}/3)` : ""}</button><button class="sm-btn" data-co="show">👁 Solución</button><button class="sm-btn" data-co="skip">⏭ Saltar</button>`;
    if (Coach.state === "solved" || Coach.state === "shown") html += `<button class="sm-btn primary" data-co="next">${Coach.i + 1 < n ? "Siguiente ▶" : "Ver el resumen ▶"}</button>`;
    html += `<button class="sm-btn danger" data-co="end">⏹ Terminar</button></div>`;
  }
  const keepFocus = document.activeElement && document.activeElement.id === "coachWhy";
  box.innerHTML = html;
  box.querySelectorAll("[data-co]").forEach(b => b.onclick = () => coachLessonAction(b.dataset.co));
  box.querySelectorAll("[data-co-q]").forEach(b => b.onclick = () => coachFollow(b.dataset.coQ));
  const ask = $("coachAsk");
  if (ask) ask.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); coachFollow(ask.value); } };
  const w = $("coachWhy");
  if (w) { w.oninput = () => { Coach.why = w.value; }; w.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); coachIdea(); } }; if (keepFocus) { w.focus(); w.setSelectionRange(w.value.length, w.value.length); } }
}
function coachLessonAction(a) {
  if (a === "ask") coachFollow($("coachAsk") && $("coachAsk").value);
  else if (a === "idea") coachIdea();
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
