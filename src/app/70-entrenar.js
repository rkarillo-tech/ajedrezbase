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
    libId: opts.card || opts.puzzle ? null : ui.libId, markId: opts.markId || null, card: !!opts.card, puzzle: !!opts.puzzle, busy: false
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
  // Que se vea el tablero (y, en el móvil, el mensaje del entrenador, que va debajo)
  setTimeout(() => { const tb = $("topBar").getBoundingClientRect(), bb = $("bottomBar").getBoundingClientRect(); if (tb.top < 0 || bb.bottom > innerHeight) (wideLayout.matches ? scrollTo({ top: 0, behavior: "smooth" }) : $("topBar").scrollIntoView({ block: "start", behavior: "smooth" })); }, 60);
}
function trainerNext() {
  const node = cur();
  if (!node.children.length) { finishTraining(); return; }
  if (trainerUserTurn()) {
    if (trainer.puzzle) { puzzlePrompt(); return; }
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
  let hit = node.children.find(c => Pgn.sameMove(c.move, move));
  // En los problemas vale cualquier jugada que dé mate
  if (!hit && trainer.puzzle) { const after = Chess.apply(node.state, move); if (!Chess.legal(after).length && Chess.inCheck(after)) { hit = Pgn.addMove(node, move); hit.children = []; } }
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
    const inLesson = ui.lesson && ui.lesson.game === game && !courseLessons(ui.lesson.course)[ui.lesson.i].repertoire;
    trainFeedback(trainer.card || trainer.puzzle || inLesson ? `❌ ${esc(san)} no es la jugada buscada. Inténtalo otra vez o pulsa 💡 para una pista.` : `❌ ${esc(san)} no está en tu repertorio. Errores: ${trainer.errors}. Pulsa 💡 si necesitas una pista.`, "bad");
    if (trainer.puzzle && Puz.exam) { finishPuzzle(false); return; }
    if (trainer.puzzle) { $("trainFeedback").insertAdjacentHTML("beforeend", puzzleButtons()); wirePuzzleButtons(); }
    renderBoard();
    const el = boardEl.querySelector(`.square[data-sq="${move.to}"]`);
    if (el) el.classList.add("flash-bad");
  }
}
function trainerHint() {
  if (!trainer.active || !trainerUserTurn() || (trainer.puzzle && Puz.exam)) return;
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
  if (trainer.puzzle) { finishPuzzle(perfect); return; }
  const L = ui.lesson && ui.lesson.game === game ? ui.lesson : null;
  if (L) {
    const l = courseLessons(L.course)[L.i];
    if (l.repertoire) {
      const all = repSrs(), key = L.course + ":" + l.round, s = all[key] || { box: 0, reps: 0 };
      s.reps++;
      s.box = perfect ? Math.min(SRS_DAYS.length - 1, s.box + 1) : 1;
      s.due = Date.now() + SRS_DAYS[s.box] * 864e5;
      all[key] = s;
      LS.set("ajedrezRepasos", all);
      logActivity("rep");
      if (perfect) markLessonDone(L.course, l.round); else renderCourses();
      Sound.play(perfect ? "ok" : "end");
      trainFeedback(`${perfect ? "🏆 ¡Línea perfecta!" : `✔ Línea terminada con ${trainer.errors} error${trainer.errors === 1 ? "" : "es"} y ${trainer.hints} pista${trainer.hints === 1 ? "" : "s"}.`} Próximo repaso del repertorio: ${SRS_DAYS[s.box] === 1 ? "mañana" : "en " + SRS_DAYS[s.box] + " días"}.<br><span class="small">Cada vez el rival elige otras respuestas: repite para recorrer todo el árbol.</span><br><button id="repAgainBtn" class="sm-btn primary" style="margin-top:6px">🔁 Otra línea</button> <button id="backToCoursesBtn" class="sm-btn" style="margin-top:6px">📘 Volver a los cursos</button>`, perfect ? "ok" : "");
      $("backToCoursesBtn").onclick = () => switchTab("courses");
      $("repAgainBtn").onclick = () => startTraining({ side: l.black ? -1 : 1 });
      stopTraining(false);
      return;
    }
    if (perfect) markLessonDone(L.course, l.round);
    Sound.play(perfect ? "ok" : "end");
    trainFeedback(`${perfect ? "🏆 ¡Perfecto! Has jugado toda la lección sin errores ni pistas." : `✔ Lección practicada: ${trainer.errors} error${trainer.errors === 1 ? "" : "es"} y ${trainer.hints} pista${trainer.hints === 1 ? "" : "s"}. Repítela hasta hacerla perfecta.`}<br><button id="backToCoursesBtn" class="sm-btn primary" style="margin-top:6px">📘 Volver a los cursos</button>`, perfect ? "ok" : "");
    $("backToCoursesBtn").onclick = () => switchTab("courses");
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
    if (isRepRec(it)) logActivity("rep");
  } else srsMsg = `<br><span class="small">Guarda la partida en tu biblioteca para que se programen los repasos.</span>`;
  Sound.play(perfect ? "ok" : "end");
  trainFeedback(`${perfect ? "🏆 ¡Línea perfecta!" : "Fin de la línea."} Aciertos: ${trainer.correct} · errores: ${trainer.errors} · pistas: ${trainer.hints}.${srsMsg}<br><span class="small">Pulsa «Empezar» para repetir (el rival puede elegir otras variantes).</span>`, perfect ? "ok" : "");
  stopTraining(false);
}
function stopTraining(silent) {
  trainer.active = false;
  trainer.busy = false;
  trainer.card = false;
  trainer.puzzle = false;
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

/* ---------- 26. Problemas de táctica (cursos/problemas.json, generados con Stockfish) ---------- */
const PUZZLES = /*__PUZZLES__*/[];
const PUZZLE_THEMES = {
  mateIn1: "Mate en 1", mateIn2: "Mate en 2", mateIn3: "Mate en 3", mateIn4: "Mate en 4", fork: "Horquilla", pin: "Clavada",
  discoveredAttack: "Ataque a la descubierta", doubleCheck: "Jaque doble", hangingPiece: "Pieza colgada", sacrifice: "Sacrificio",
  backRankMate: "Mate del pasillo", smotheredMate: "Mate de la coz", promotion: "Coronación", endgame: "Final", short: "Una sola jugada",
  // Temas que sólo traen los paquetes descargables (base de problemas de Lichess)
  mateIn5: "Mate en 5", skewer: "Enfilada", deflection: "Desviación", attraction: "Atracción", capturingDefender: "Eliminar al defensor",
  trappedPiece: "Pieza atrapada", intermezzo: "Jugada intermedia", clearance: "Despeje", interference: "Interferencia",
  quietMove: "Jugada tranquila", defensiveMove: "Jugada defensiva", zugzwang: "Zugzwang"
};
const PUZZLE_LEVELS = [[0, 1100, "Fácil"], [1100, 1500, "Medio"], [1500, 1900, "Difícil"], [1900, 9999, "Muy difícil"]];
const puzzleLevelOf = r => PUZZLE_LEVELS.findIndex(([a, b]) => r >= a && r < b);
const Puz = { queue: [], cur: null, done: 0, ok: 0, total: 0, delta: 0, exam: null };
const puzSrs = () => LS.get("ajedrezProblemas", {});
const puzRating = () => LS.get("ajedrezNivelProblemas", { r: 1200, n: 0 });
function puzzleThemesText(p) { return p.themes.filter(x => PUZZLE_THEMES[x]).map(x => PUZZLE_THEMES[x]).join(", ") || "Táctica"; }
function puzzlePool() {
  const th = $("puzzleTheme").value, lv = $("puzzleLevel").value, weak = th === "weak" ? weakThemes().map(x => x.k) : null;
  return PUZZLES.filter(p => (!th || (weak ? p.themes.some(x => weak.includes(x.startsWith("mateIn") ? "mate" : x)) : p.themes.includes(th) || (th === "mate" && p.themes.some(x => x.startsWith("mateIn"))))) && (lv === "" || puzzleLevelOf(p.rating) === +lv));
}
/* Temas de un problema para las estadísticas: los mates van juntos y «una sola jugada» no cuenta como tema */
function puzzleThemeKeys(p) {
  const keys = [...new Set(p.themes.map(x => (x.startsWith("mateIn") ? "mate" : x)))].filter(k => k === "mate" || (PUZZLE_THEMES[k] && k !== "short"));
  return keys.length ? keys : ["other"];
}
const puzzleThemeName = k => (k === "mate" ? "Mates" : k === "other" ? "Otros temas" : PUZZLE_THEMES[k] || k);
/* Aciertos por tema, a partir de todos los intentos guardados */
function themeStats() {
  const s = puzSrs(), byId = new Map(PUZZLES.map(p => [p.id, p])), out = {};
  for (const [id, st] of Object.entries(s)) {
    const p = byId.get(id);
    if (!p) continue;
    const tries = st.tries || st.reps || 0, fails = st.fails != null ? st.fails : st.ok ? 0 : 1;
    for (const k of puzzleThemeKeys(p)) {
      out[k] = out[k] || { k, tries: 0, fails: 0 };
      out[k].tries += tries; out[k].fails += fails;
    }
  }
  return Object.values(out).map(x => Object.assign(x, { pct: x.tries ? Math.round(100 * (x.tries - x.fails) / x.tries) : 0, name: x.k === "mate" ? "Mates" : x.k === "other" ? "Otros temas" : PUZZLE_THEMES[x.k] }));
}
const weakThemes = () => themeStats().filter(x => x.tries >= 3 && x.pct < 80 && x.k !== "other").sort((a, b) => a.pct - b.pct).slice(0, 3);
function renderPuzzleStats() {
  const box = $("puzzleStats");
  if (!box) return;
  const st = themeStats().filter(x => x.k !== "short").sort((a, b) => b.tries - a.tries);
  const weak = weakThemes();
  const opt = $("puzzleTheme").querySelector('option[value="weak"]');
  if (weak.length && !opt) $("puzzleTheme").insertAdjacentHTML("afterbegin", `<option value="weak">⚠ Mis temas flojos</option>`);
  if (opt) opt.textContent = weak.length ? `⚠ Mis temas flojos (${weak.map(x => x.name).join(", ")})` : "⚠ Mis temas flojos";
  if (!st.length) { box.innerHTML = `<span class="small">Aún no has hecho problemas: aquí verás tu porcentaje de acierto en cada tema.</span>`; return; }
  box.innerHTML = `<table class="theme-table">${st.map(x => `<tr${weak.includes(x) ? ' class="weak"' : ""}><td>${esc(x.name)}</td><td class="small">${x.tries} intento${x.tries === 1 ? "" : "s"}</td><td><div class="meter"><div style="width:${x.pct}%"></div></div></td><td><b>${x.pct} %</b></td></tr>`).join("")}</table>
    ${weak.length ? `<div class="small">⚠ Tus temas más flojos: <b>${weak.map(x => esc(x.name)).join(", ")}</b>. Elige «⚠ Mis temas flojos» en el tema para entrenarlos.</div>` : ""}`;
}
function initPuzzleFilters() {
  const count = k => PUZZLES.filter(p => k === "mate" ? p.themes.some(x => x.startsWith("mateIn")) : p.themes.includes(k)).length;
  const opts = [["", `Todos los temas (${PUZZLES.length})`], ["mate", `Todos los mates (${count("mate")})`]]
    .concat(Object.entries(PUZZLE_THEMES).map(([k, v]) => [k, `${v} (${count(k)})`]).filter(([k]) => count(k) > 0));
  $("puzzleTheme").innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  $("puzzleLevel").innerHTML = `<option value="">Todas las dificultades</option>` + PUZZLE_LEVELS.map(([a, b, n], i) => `<option value="${i}">${n} (${b > 3000 ? "más de " + a : a + "–" + b})</option>`).join("");
}
/* ---------- 26p. Paquetes de problemas descargables (problemas/*.json, de la base de Lichess, CC0) ----------
   Se descargan a petición del usuario y se guardan en una base IndexedDB propia («ajedrezbase-problemas»),
   aparte de la biblioteca, para no tocar su esquema. Al arrancar se añaden al banco PUZZLES. */
const PUZZLE_PACKS = /*__PACKS__*/[];
const PACKS_URL = "https://rkarillo-tech.github.io/ajedrezbase/problemas/";
const Packs = {
  db: null, have: new Set(), busy: "",
  open() {
    return new Promise(res => {
      if (!window.indexedDB) { res(false); return; }
      let req;
      try { req = indexedDB.open("ajedrezbase-problemas", 1); } catch { res(false); return; }
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("packs")) req.result.createObjectStore("packs", { keyPath: "id" }); };
      req.onsuccess = () => { this.db = req.result; res(true); };
      req.onerror = req.onblocked = () => res(false);
    });
  },
  tx(mode, fn) {
    return new Promise((res, rej) => {
      if (!this.db) { res(mode === "readonly" ? [] : undefined); return; }
      const t = this.db.transaction("packs", mode), r = fn(t.objectStore("packs"));
      t.oncomplete = () => res(r && r.result);
      t.onerror = t.onabort = () => rej(t.error || Error("no se pudo guardar (¿sin espacio?)"));
    });
  }
};
/* Sólo entran problemas bien formados y que no estén ya en el banco */
function addPackPuzzles(id, list) {
  const ids = new Set(PUZZLES.map(p => p.id));
  let n = 0;
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p.id !== "string" || ids.has(p.id) || typeof p.fen !== "string" || !Array.isArray(p.moves) || p.moves.length < 2 || p.moves.length % 2 || !Array.isArray(p.themes) || !(p.rating > 0)) continue;
    if (!p.moves.every(u => typeof u === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u))) continue;
    PUZZLES.push({ id: p.id, fen: p.fen, moves: p.moves, themes: p.themes.filter(x => typeof x === "string"), rating: +p.rating, pack: id });
    ids.add(p.id); n++;
  }
  if (n) Packs.have.add(id);
  return n;
}
function refreshPuzzleBank() {
  const th = $("puzzleTheme").value, lv = $("puzzleLevel").value;
  initPuzzleFilters();
  if ([...$("puzzleTheme").options].some(o => o.value === th)) $("puzzleTheme").value = th;
  $("puzzleLevel").value = lv;
  renderPacks(); renderPuzzleInfo(); renderToday();
}
async function initPacks() {
  renderPacks();
  if (!(await Packs.open())) return;
  try {
    const recs = await Packs.tx("readonly", s => s.getAll());
    (recs || []).forEach(r => addPackPuzzles(r.id, r.puzzles));
  } catch (e) { console.warn("No se pudieron leer los paquetes de problemas:", e); }
  if (Packs.have.size) refreshPuzzleBank();
}
async function downloadPack(id) {
  if (Packs.busy) return;
  Packs.busy = id; renderPacks();
  try {
    const res = await fetch((/^https?:$/.test(location.protocol) ? "problemas/" : PACKS_URL) + id + ".json", { cache: "no-cache" });
    if (!res.ok) throw Error("el servidor respondió " + res.status);
    const data = await res.json();
    const n = addPackPuzzles(id, data && data.puzzles);
    if (!n) throw Error("el paquete no trae problemas nuevos");
    let saved = true;
    try { await Packs.tx("readwrite", s => s.put({ id, puzzles: data.puzzles, date: Date.now() })); saved = !!Packs.db; } catch (e) { console.warn(e); saved = false; }
    toast(saved ? `📦 ${n} problemas añadidos. Quedan guardados en este navegador y funcionan sin conexión.` : `📦 ${n} problemas añadidos, pero este navegador no ha podido guardarlos: habrá que descargarlos otra vez al volver.`, 6000);
  } catch (e) {
    toast(`No se pudo descargar el paquete (${e.message || e}). Hace falta conexión a internet.`, 6000);
  }
  Packs.busy = "";
  refreshPuzzleBank();
}
async function removePack(id) {
  if (trainer.active && trainer.puzzle) { toast("Termina antes la sesión de problemas."); return; }
  for (let i = PUZZLES.length - 1; i >= 0; i--) if (PUZZLES[i].pack === id) PUZZLES.splice(i, 1);
  Packs.have.delete(id);
  try { await Packs.tx("readwrite", s => s.delete(id)); } catch (e) { console.warn(e); }
  toast("Paquete quitado. Tu historial de aciertos se conserva por si lo vuelves a descargar.", 5000);
  refreshPuzzleBank();
}
function renderPacks() {
  const box = $("packList");
  if (!box) return;
  const extra = PUZZLES.filter(p => p.pack).length;
  $("packBadge").textContent = extra ? `+${extra}` : "";
  $("packBadge").hidden = !extra;
  box.innerHTML = PUZZLE_PACKS.map(k => {
    const have = Packs.have.has(k.id), busy = Packs.busy === k.id;
    return `<div class="pack-row"><span><b>${esc(k.name)}</b> <span class="small">nivel ${k.min}–${k.max} · ${k.count} problemas · ${k.kb} KB</span></span>
      ${have ? `<span class="srs-pill ok">✔ Descargado</span><button class="sm-btn danger" data-pack-del="${esc(k.id)}">Quitar</button>`
             : `<button class="sm-btn primary" data-pack-get="${esc(k.id)}"${Packs.busy ? " disabled" : ""}>${busy ? "⏳ Descargando…" : "⬇ Descargar"}</button>`}</div>`;
  }).join("");
  box.querySelectorAll("[data-pack-get]").forEach(b => b.onclick = () => downloadPack(b.dataset.packGet));
  box.querySelectorAll("[data-pack-del]").forEach(b => b.onclick = () => removePack(b.dataset.packDel));
}

function renderPuzzleInfo() {
  if (!$("puzzleInfo")) return;
  const pool = puzzlePool(), s = puzSrs(), now = Date.now(), R = puzRating();
  const due = pool.filter(p => s[p.id] && s[p.id].due <= now).length, seen = pool.filter(p => s[p.id]).length;
  $("puzzleInfo").textContent = `${pool.length} problemas · ${seen} hechos · ${due} para repasar hoy`;
  $("puzzleBadge").textContent = R.n ? `Tu nivel: ${Math.round(R.r)}` : "Nivel inicial: 1200";
  $("puzzleBadge").className = "srs-pill" + (due ? " due" : "");
}
function startPuzzles() {
  if (!PUZZLES.length) { toast("No hay problemas en esta versión."); return; }
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  const pool = puzzlePool(), s = puzSrs(), now = Date.now(), R = puzRating().r;
  if (!pool.length) { toast("No hay problemas con ese tema y esa dificultad."); return; }
  const n = +$("puzzleCount").value;
  // Primero los que toca repasar; después, nuevos de dificultad parecida a tu nivel
  const due = pool.filter(p => s[p.id] && s[p.id].due <= now).sort((a, b) => s[a.id].due - s[b.id].due);
  const fresh = pool.filter(p => !s[p.id]).map(p => ({ p, k: Math.abs(p.rating - R) + Math.random() * 300 })).sort((a, b) => a.k - b.k).map(x => x.p);
  let list = due.concat(fresh).slice(0, n);
  if (!list.length) list = pool.slice().sort(() => Math.random() - 0.5).slice(0, n);   // todos hechos: repaso al azar
  if (!stashBoard()) return;
  leaveModes();
  Object.assign(Puz, { queue: list, done: 0, ok: 0, total: list.length, delta: 0, blind: 0 });
  nextPuzzle();
}
function nextPuzzle() {
  const p = Puz.queue.shift();
  if (!p) { endPuzzles(); return; }
  Puz.cur = p;
  if (Puz.blind) { clearInterval(Puz.blindTimer); Puz.blindPhase = "wait"; Puz.peeks0 = ui.peeks || 0; if (ui.blind) setBlind(false); }
  const g = Pgn.newGame(p.fen);
  let n = g.root;
  for (const u of p.moves) { const m = Chess.moveFromUci(n.state, u); if (!m) break; n = Pgn.addMove(n, m); }
  g.headers.Event = "Problema";
  g.headers.Site = "AjedrezBase";
  const side = -g.root.state.t;
  ui.flipped = side === -1;
  setGame(g, { noConfirm: true, name: Puz.blind ? `🙈 Problema a ciegas ${Puz.done + 1} de ${Puz.total}` : `🧩 Problema ${Puz.done + 1} de ${Puz.total} · ${PUZZLE_LEVELS[puzzleLevelOf(p.rating)][2]}` });
  startTraining({ side, puzzle: true });
}
function puzzlePrompt() {
  const p = Puz.cur, side = trainer.side === 1 ? "blancas" : "negras";
  if (Puz.blind) { blindPuzzlePrompt(side); return; }
  if (Puz.exam) {
    trainFeedback(`📏 <b>Examen</b> · problema ${Puz.exam.i} de ${EXAM_N} · juegan las <b>${side}</b> · ⏱ <b id="examClock">${Math.max(0, Math.ceil((Puz.exam.deadline - Date.now()) / 1000))}</b> s<br>El rival acaba de jugar ${esc(numPrefix(cur().parent.state) + dispSan(cur()))}: encuentra la mejor jugada. Sin pistas: una jugada equivocada cuenta como fallo.${trainer.correct ? " ¡Bien! Sigue." : ""}<div class="controls"><button class="sm-btn danger" data-pz="end">⏹ Abandonar el examen</button></div>`);
    wirePuzzleButtons();
    return;
  }
  trainFeedback(`🧩 Problema ${Puz.done + 1} de ${Puz.total} · ${PUZZLE_LEVELS[puzzleLevelOf(p.rating)][2]} (${p.rating}) · juegan las <b>${side}</b>.<br>El rival acaba de jugar ${esc(numPrefix(cur().parent.state) + dispSan(cur()))}: encuentra la mejor jugada.${trainer.correct ? " ¡Bien! Sigue." : ""}` + puzzleButtons());
  wirePuzzleButtons();
}
const puzzleButtons = () => `<div class="controls">${Puz.blind && Puz.blindPhase === "hidden" ? `<button class="sm-btn" data-pz="peek">👁 Ojear 2 s</button>` : ""}<button class="sm-btn" data-pz="hint">💡 Pista</button><button class="sm-btn danger" data-pz="end">⏹ Terminar</button></div>`;
function wirePuzzleButtons() {
  $("trainFeedback").querySelectorAll("[data-pz]").forEach(b => b.onclick = () => {
    if (b.dataset.pz === "end") endPuzzles();
    else if (b.dataset.pz === "peek") peekPieces();
    else if (b.dataset.pz === "hide") { Puz.blindLeft = 0; blindPuzzleTick(); }
    else { trainerHint(); $("trainFeedback").insertAdjacentHTML("beforeend", puzzleButtons()); wirePuzzleButtons(); }
  });
}
function finishPuzzle(perfect) {
  if (Puz.exam) { finishExamPuzzle(perfect); return; }
  if (Puz.blind) { finishBlindPuzzle(perfect); return; }
  const p = Puz.cur, all = puzSrs(), st = all[p.id] || { box: 0, reps: 0 };
  st.tries = (st.tries || 0) + 1;
  st.fails = (st.fails || 0) + (perfect ? 0 : 1);
  st.reps++;
  st.box = perfect ? Math.min(SRS_DAYS.length - 1, st.box + 1) : 1;
  st.due = Date.now() + SRS_DAYS[st.box] * 864e5;
  st.ok = perfect;
  all[p.id] = st;
  LS.set("ajedrezProblemas", all);
  // Nivel aproximado al estilo Elo: sube si resuelves problemas de tu nivel o superiores
  const R = puzRating(), K = R.n < 20 ? 48 : 24;
  const exp = 1 / (1 + Math.pow(10, (p.rating - R.r) / 400)), d = Math.round(K * ((perfect ? 1 : 0) - exp));
  R.r = Math.max(400, R.r + d); R.n++;
  LS.set("ajedrezNivelProblemas", R);
  Puz.done++; if (perfect) Puz.ok++; Puz.delta += d;
  logPuzzleResult(p, perfect);
  logActivity("puzzle");
  Sound.play(perfect ? "ok" : "end");
  const left = Puz.queue.length;
  trainFeedback(`${perfect ? "✔ <b>¡Resuelto!</b>" : `Resuelto con ${trainer.errors} error${trainer.errors === 1 ? "" : "es"} y ${trainer.hints} pista${trainer.hints === 1 ? "" : "s"}: volverá mañana.`} Tema: ${esc(puzzleThemesText(p))}.<br>Tu nivel: <b>${Math.round(R.r)}</b> (${d >= 0 ? "+" : ""}${d}).<br>
    ${left ? `<button id="nextPuzzleBtn" class="sm-btn primary" style="margin-top:6px">Siguiente problema ▶ (quedan ${left})</button>` : `<button id="nextPuzzleBtn" class="sm-btn primary" style="margin-top:6px">Ver resumen ▶</button>`}
    <button id="stopPuzzlesBtn" class="sm-btn" style="margin-top:6px">⏹ Terminar</button>`, perfect ? "ok" : "");
  $("nextPuzzleBtn").onclick = nextPuzzle;
  $("stopPuzzlesBtn").onclick = endPuzzles;
  trainer.active = false;
  stopTraining(false);
  renderPuzzleInfo();
  renderPuzzleStats();
}
/* 🙈 Problemas a ciegas: ves la posición unos segundos, se ocultan las piezas y lo resuelves de memoria.
   No cuentan para tu nivel de problemas ni para el repaso: es un ejercicio de visualización. */
function startBlindPuzzles(secs) {
  if (!PUZZLES.length) { toast("No hay problemas en esta versión."); return; }
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  const easy = PUZZLES.filter(p => p.rating < 1300 && p.moves.length <= 4);
  if (!stashBoard()) return;
  leaveModes();
  Object.assign(Puz, { queue: shuffle(easy.slice()).slice(0, 5), done: 0, ok: 0, total: 5, delta: 0, exam: null, blind: secs, peeksAll: 0 });
  nextPuzzle();
}
function blindPuzzlePrompt(side) {
  const head = `🙈 Problema a ciegas ${Puz.done + 1} de ${Puz.total} · juegan las <b>${side}</b>`;
  if (Puz.blindPhase === "wait") {
    Puz.blindPhase = "look";
    Puz.blindLeft = Puz.blind;
    clearInterval(Puz.blindTimer);
    Puz.blindTimer = setInterval(blindPuzzleTick, 1000);
  }
  if (Puz.blindPhase === "look") {
    trainFeedback(`${head}.<br>El rival acaba de jugar ${esc(numPrefix(cur().parent.state) + dispSan(cur()))}. <b>Memoriza la posición</b>: las piezas se ocultan en <b id="blindClock">${Puz.blindLeft}</b> s.<div class="controls"><button class="sm-btn" data-pz="hide">🙈 Ya la tengo: ocultar</button><button class="sm-btn danger" data-pz="end">⏹ Terminar</button></div>`);
  } else {
    trainFeedback(`${head}.<br>Las piezas están ocultas: <b>encuentra la mejor jugada de memoria</b> pulsando las casillas (o arrastrando desde la casilla de la pieza).${trainer.correct ? " ¡Bien! Sigue." : ""}<div class="controls"><button class="sm-btn" data-pz="peek">👁 Ojear 2 s</button><button class="sm-btn" data-pz="hint">💡 Pista</button><button class="sm-btn danger" data-pz="end">⏹ Terminar</button></div>`);
  }
  wirePuzzleButtons();
}
function blindPuzzleTick() {
  if (!trainer.active || !trainer.puzzle || !Puz.blind || Puz.blindPhase !== "look") { clearInterval(Puz.blindTimer); return; }
  Puz.blindLeft = Math.max(0, Puz.blindLeft - 1);
  const el = $("blindClock");
  if (el && Puz.blindLeft > 0) { el.textContent = Puz.blindLeft; return; }
  if (Puz.blindLeft > 0) return;
  clearInterval(Puz.blindTimer);
  Puz.blindPhase = "hidden";
  setBlind(true);
  puzzlePrompt();
}
function finishBlindPuzzle(perfect) {
  clearInterval(Puz.blindTimer);
  const peeks = (ui.peeks || 0) - Puz.peeks0;
  Puz.peeksAll += peeks;
  Puz.done++;
  if (perfect && !peeks) Puz.ok++;
  setBlind(false);
  Sound.play(perfect ? "ok" : "end");
  const left = Puz.queue.length;
  trainFeedback(`${perfect ? (peeks ? `✔ Resuelto, ojeando ${peeks} ${peeks === 1 ? "vez" : "veces"}.` : "✔ <b>¡Resuelto a ciegas!</b>") : `Resuelto con ${trainer.errors} error${trainer.errors === 1 ? "" : "es"} y ${trainer.hints} pista${trainer.hints === 1 ? "" : "s"}.`} Ya ves las piezas otra vez: compara con lo que imaginabas. Tema: ${esc(puzzleThemesText(Puz.cur))}.<br>
    <button id="nextPuzzleBtn" class="sm-btn primary" style="margin-top:6px">${left ? `Siguiente ▶ (quedan ${left})` : "Ver resumen ▶"}</button>
    <button id="stopPuzzlesBtn" class="sm-btn" style="margin-top:6px">⏹ Terminar</button>`, perfect && !peeks ? "ok" : "");
  $("nextPuzzleBtn").onclick = nextPuzzle;
  $("stopPuzzlesBtn").onclick = endPuzzles;
  trainer.active = false;
  stopTraining(false);
}
function endBlindPuzzles() {
  clearInterval(Puz.blindTimer);
  if (Puz.done) logActivity("vis");
  const secs = Puz.blind;
  Puz.blind = 0;
  if (ui.blind) setBlind(false);
  trainFeedback(`🙈 Problemas a ciegas: <b>${Puz.ok}</b> de ${Puz.done} resueltos a la primera y sin ojear (${secs} s para memorizar).${Puz.peeksAll ? ` Has ojeado ${Puz.peeksAll} ${Puz.peeksAll === 1 ? "vez" : "veces"}.` : ""}<br>
    <span class="small">${Puz.ok === Puz.done && Puz.done ? "¡Muy bien! Prueba con menos segundos." : "Truco: antes de que se oculten, nombra en voz baja dónde está cada pieza (rey g1, dama d1…)."}</span><br>
    <button id="blindPzAgain" class="sm-btn primary" style="margin-top:6px">🔁 Otra vez</button> <button id="puzzlesBackBtn" class="sm-btn" style="margin-top:6px">↩ Volver a tu partida</button>`, Puz.ok === Puz.done && Puz.done ? "ok" : "");
  $("blindPzAgain").onclick = () => startBlindPuzzles(secs);
  $("puzzlesBackBtn").onclick = () => { restoreStash(); };
}
function endPuzzles() {
  if (Puz.exam) { endExam(true); return; }
  if (trainer.active && trainer.puzzle) stopTraining(true);
  Puz.queue = [];
  if (Puz.blind) { endBlindPuzzles(); return; }
  const R = puzRating();
  trainFeedback(`🧩 Sesión terminada: <b>${Puz.ok}</b> de ${Puz.done} resueltos a la primera. Tu nivel: <b>${Math.round(R.r)}</b> (${Puz.delta >= 0 ? "+" : ""}${Puz.delta} en esta sesión).<br>
    <span class="small">Los que has fallado vuelven mañana; los acertados se espacian (3, 7, 16… días).</span><br>
    <button id="puzzlesBackBtn" class="sm-btn" style="margin-top:6px">↩ Volver a tu partida</button>`, Puz.ok === Puz.done ? "ok" : "");
  $("puzzlesBackBtn").onclick = () => { restoreStash(); };
  renderPuzzleInfo();
}

/* ---------- 26a. 📏 Examen: mide tu nivel con problemas que se adaptan a ti ---------- */
const EXAM_N = 15, EXAM_SECS = 90;
const examHistory = () => LS.get("ajedrezExamenes", []);
function startExam() {
  if (PUZZLES.length < EXAM_N) { toast("No hay problemas suficientes para el examen."); return; }
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  if (!stashBoard()) return;
  leaveModes();
  const last = examHistory().slice(-1)[0], R = puzRating();
  Object.assign(Puz, { queue: [], done: 0, ok: 0, total: EXAM_N, delta: 0, blind: 0, exam: { est: last ? last.r : R.n ? R.r : 1200, i: 0, res: [], used: new Set(), timer: null, deadline: 0 } });
  nextExamPuzzle();
}
function nextExamPuzzle() {
  const E = Puz.exam;
  if (!E) return;
  if (E.i >= EXAM_N) { endExam(false); return; }
  // El siguiente problema, de dificultad parecida a tu nivel estimado en este momento
  const cands = PUZZLES.filter(p => !E.used.has(p.id)).map(p => ({ p, d: Math.abs(p.rating - E.est) })).sort((a, b) => a.d - b.d).slice(0, 4);
  const p = cands[Math.floor(Math.random() * cands.length)].p;
  E.used.add(p.id);
  E.i++;
  Puz.queue = [p];
  E.deadline = Date.now() + EXAM_SECS * 1000 + 700;   // + la jugada del rival
  clearInterval(E.timer);
  E.timer = setInterval(() => {
    const el = $("examClock"), left = Math.ceil((E.deadline - Date.now()) / 1000);
    if (el) el.textContent = Math.max(0, left);
    if (left <= 0 && trainer.active && trainer.puzzle) { toast("⏱ Se acabó el tiempo."); finishPuzzle(false); }
  }, 250);
  nextPuzzle();
}
function finishExamPuzzle(ok) {
  const E = Puz.exam, p = Puz.cur;
  clearInterval(E.timer);
  const node = cur(), rest = Pgn.mainlineFrom(game.root);
  // La solución (si se ha fallado), para aprender de ella
  const sol = rest.find(n => n.parent.state.t === trainer.side && !Pgn.pathTo(node).includes(n));
  const secs = Math.round((Date.now() - (E.deadline - EXAM_SECS * 1000)) / 1000);
  // Estimación del nivel: cada respuesta mueve la estimación, menos a medida que avanza el examen
  const K = Math.max(40, Math.round(220 / (1 + (E.i - 1) / 2))), exp = 1 / (1 + Math.pow(10, (p.rating - E.est) / 400));
  E.est = Math.max(400, Math.min(2600, E.est + K * ((ok ? 1 : 0) - exp)));
  E.res.push({ id: p.id, rating: p.rating, ok, themes: p.themes, secs });
  // Cuenta para tus estadísticas por tema
  const all = puzSrs(), st = all[p.id] || { box: 0, reps: 0, due: Date.now() };
  st.tries = (st.tries || 0) + 1; st.fails = (st.fails || 0) + (ok ? 0 : 1);
  if (!ok) { st.box = 1; st.due = Date.now() + 864e5; }
  all[p.id] = st;
  LS.set("ajedrezProblemas", all);
  Puz.done++; if (ok) Puz.ok++;
  Sound.play(ok ? "ok" : "error");
  trainer.active = false;
  stopTraining(false);
  if (!ok && sol) { const m = sol.move; if (m) { trainer.hintArrow = null; ui.selected = null; } }
  trainFeedback(`📏 Examen · ${E.i} de ${EXAM_N}: ${ok ? "✔ <b>¡Correcto!</b>" : `❌ ${sol ? `La buena era <b>${esc(numPrefix(sol.parent.state) + dispSan(sol))}</b>.` : "Fallado."}`} Tema: ${esc(puzzleThemesText(p))}.<br>Nivel estimado ahora: <b>${Math.round(E.est)}</b>
    <div class="controls"><button id="examNextBtn" class="sm-btn primary">${E.i >= EXAM_N ? "Ver resultado ▶" : "Siguiente ▶"}</button><button id="examStopBtn" class="sm-btn danger">⏹ Abandonar</button></div>`, ok ? "ok" : "bad");
  $("examNextBtn").onclick = nextExamPuzzle;
  $("examStopBtn").onclick = () => endExam(true);
  if (!ok && sol) { goTo(sol); }
  renderPuzzleStats();
}
function endExam(aborted) {
  const E = Puz.exam;
  if (!E) return;
  clearInterval(E.timer);
  if (trainer.active && trainer.puzzle) stopTraining(true);
  Puz.exam = null;
  Puz.queue = [];
  const n = E.res.length, ok = E.res.filter(x => x.ok).length;
  if (!n) { trainFeedback("📏 Examen cancelado."); restoreStash(); return; }
  const hist = examHistory(), prev = hist.slice(-1)[0], r = Math.round(E.est);
  if (!aborted || n >= 8) { hist.push({ t: Date.now(), r, ok, n }); LS.set("ajedrezExamenes", hist.slice(-30)); }
  logActivity("exam");
  // Temas: los que más fallaste en el examen
  const th = {};
  E.res.forEach(x => new Set(x.themes.map(k => (k.startsWith("mateIn") ? "mate" : k))).forEach(k => { if (k === "short" || (!PUZZLE_THEMES[k] && k !== "mate")) return; th[k] = th[k] || { ok: 0, n: 0 }; th[k].n++; if (x.ok) th[k].ok++; }));
  const name = k => (k === "mate" ? "Mates" : PUZZLE_THEMES[k]);
  const good = Object.entries(th).filter(([, v]) => v.n >= 2 && v.ok === v.n).map(([k]) => name(k));
  const bad = Object.entries(th).filter(([, v]) => v.ok < v.n).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).slice(0, 3).map(([k]) => name(k));
  const chart = hist.slice(-10).map(h => `<span title="${esc(new Date(h.t).toLocaleDateString("es-ES"))}: ${h.r}" style="display:inline-block;width:14px;margin-right:3px;vertical-align:bottom;background:var(--accent);height:${Math.max(4, Math.round((h.r - 400) / 25))}px"></span>`).join("");
  trainFeedback(`📏 <b>Resultado del examen</b>${aborted ? " (incompleto)" : ""}: <b>${ok}</b> de ${n} resueltos.<br>
    Tu nivel estimado en táctica: <b style="font-size:1.15rem">${r}</b>${prev ? ` (${r - prev.r >= 0 ? "+" : ""}${r - prev.r} desde el examen anterior)` : ""}.<br>
    ${good.length ? `💪 Puntos fuertes: ${esc(good.join(", "))}.<br>` : ""}${bad.length ? `⚠ Para trabajar: ${esc(bad.join(", "))} (los encontrarás en «⚠ Mis temas flojos»).<br>` : ""}
    <span class="small">Es una estimación con pocos problemas: repite el examen cada semana o dos para ver tu evolución.</span>
    ${hist.length > 1 ? `<div style="margin-top:6px;height:${Math.max(...hist.slice(-10).map(h => Math.round((h.r - 400) / 25))) + 4}px">${chart}</div><span class="small">Tus últimos exámenes</span>` : ""}
    <div class="controls"><button id="examBackBtn" class="sm-btn primary">↩ Volver a tu partida</button></div>`, "ok");
  $("examBackBtn").onclick = () => restoreStash();
  renderPuzzleInfo(); renderPuzzleStats(); renderExamInfo();
}
function renderExamInfo() {
  const el = $("examInfo");
  if (!el) return;
  const h = examHistory(), last = h.slice(-1)[0];
  el.textContent = last ? `Último examen: ${last.r} (${new Date(last.t).toLocaleDateString("es-ES")})${h.length > 1 ? ` · mejor: ${Math.max(...h.map(x => x.r))}` : ""}` : "Aún no has hecho ningún examen.";
}

/* ---------- 26c. Tus partidas frente a tu repertorio ---------- */
/* Repertorios: los tuyos (partidas de la biblioteca con la etiqueta «repertorio») primero y después los del curso */
const isRepRec = r => (r.tags || []).some(t => norm(t) === "repertorio");
const repSideOf = r => (/\[Orientation "black"\]/i.test(r.pgn || "") ? -1 : 1);
const myRepRecs = () => (Lib.ready ? [...Lib.games.values()].filter(isRepRec).sort((a, b) => (a.title || "").localeCompare(b.title || "", "es")) : []);
function repertoireTrees() {
  const mine = myRepRecs().map(rec => { try { return { lib: rec.id, title: rec.title, g: Pgn.parseGame(rec.pgn, { lang: "en" }).game, side: repSideOf(rec) }; } catch { return null; } }).filter(Boolean);
  return mine.concat(courseLessons("repertorios").map((l, i) => ({ l, i, title: l.title, g: Pgn.parseGame(l.g, { lang: "en" }).game, side: l.black ? -1 : 1 })));
}
/* Abre la línea de un repertorio (tuyo o del curso) en una posición */
function openRepertoireAt(tree, path) {
  if (tree.lib) {
    if (!openLibGame(tree.lib, path)) return false;
    ui.flipped = tree.side === -1;
    switchTab("study");
    render();
    return true;
  }
  switchTab("courses");
  if (!openLesson("repertorios", tree.i)) return false;
  goTo(resolvePath(game.root, path));
  return true;
}
/* Compara tus partidas con un árbol de repertorio: hasta dónde lo sigues y quién se sale primero */
function matchGameToTree(line, tree, c) {
  let node = tree.g.root, dev = null, depth = 0;
  for (const n of line) {
    const ch = node.children.find(x => x.uci === n.uci);
    if (!ch) { dev = { ply: depth, mine: n.parent.state.t === c, n, rep: node }; break; }
    node = ch; depth++;
    if (!node.children.length) break;
  }
  return { dev, depth, path: line.slice(0, depth + (dev ? 1 : 0)).map(n => n.uci) };
}
function myGameLines(names) {
  const out = [];
  for (const rec of Lib.games.values()) {
    if (isRepRec(rec)) continue;
    const c = colorOfMe(rec, names);
    if (!c) continue;
    let g;
    try { g = Pgn.parseGame(rec.pgn, { lang: "en" }).game; } catch { continue; }
    const line = Pgn.mainlineFrom(g.root);
    if (!line.length || g.headers.SetUp === "1") continue;
    out.push({ rec, c, line });
  }
  return out;
}
function compareWithRepertoire() {
  const out = $("repCompareOut"), names = myNameList();
  if (!names.length) { out.innerHTML = `<span class="small">Primero pon tu nombre (tal como sale en tus partidas) en <b>📚 Biblioteca › 📊 Estadísticas</b>.</span>`; return; }
  const trees = repertoireTrees(), rows = [];
  for (const { rec, c, line } of myGameLines(names)) {
    // Tus repertorios mandan: si alguno empieza como la partida, se compara sólo con los tuyos; si no, con los del curso.
    // Entre varios, el que más jugadas sigue.
    const fits = trees.filter(tree => tree.side === c && tree.g.root.children.some(ch => ch.uci === line[0].uci));
    const pool = fits.some(t => t.lib) ? fits.filter(t => t.lib) : fits;
    let best = null;
    for (const tree of pool) {
      const m = matchGameToTree(line, tree, c);
      if (!best || m.depth > best.depth) best = Object.assign({ tree }, m);
    }
    if (best) rows.push(Object.assign({ rec, c }, best));
  }
  if (!rows.length) { out.innerHTML = `<span class="small">No hay partidas tuyas que empiecen como tus repertorios (los tuyos de «🗂 Mis repertorios» o los del curso: 1.e4 con blancas; 1.e4 o 1.d4 con negras).</span>`; return; }
  const mine = rows.filter(r => r.dev && r.dev.mine), rival = rows.filter(r => r.dev && !r.dev.mine), full = rows.filter(r => !r.dev);
  const avg = Math.round(rows.reduce((s, r) => s + r.depth, 0) / rows.length / 2 * 10) / 10;
  // Dónde te sales más a menudo
  const spots = {};
  mine.forEach(r => { const k = r.path.slice(0, -1).join(" "); spots[k] = spots[k] || { n: 0, r }; spots[k].n++; });
  const top = Object.values(spots).sort((a, b) => b.n - a.n)[0];
  const sanOf = (st, uci) => { const m = Chess.moveFromUci(st, uci); return m ? numPrefix(st) + formatSan(Chess.san(st, m), settings.lang, st.t) : uci; };
  const item = (r, i) => {
    const d = r.dev, date = (r.rec.date || "").slice(0, 10).replace(/\?\?/g, "").replace(/\.$/, "");
    let what;
    if (!d) what = `✔ Seguiste el repertorio hasta el final (${Math.ceil(r.depth / 2)} jugadas).`;
    else if (d.mine) what = `❌ Te saliste en <b>${esc(numPrefix(d.n.parent.state) + dispSan(d.n))}</b>; tu repertorio dice <b>${esc(d.rep.children.map(x => sanOf(d.rep.state, x.uci)).join(" o "))}</b>.`;
    else what = `🆕 El rival se salió en <b>${esc(numPrefix(d.n.parent.state) + dispSan(d.n))}</b>: una línea que tu repertorio no cubre.`;
    return `<div class="mark-card" style="grid-template-columns:1fr"><div><b>${esc(r.rec.title)}</b> <span class="small">${esc(date)} · con ${r.c === 1 ? "blancas" : "negras"} · ${r.tree.lib ? "🗂" : "📘"} ${esc(r.tree.title)}</span><br>${what}</div>
      <div class="controls" style="margin-top:4px"><button class="sm-btn" data-open="${i}">📖 Abrir en esa jugada</button>${d && d.mine ? `<button class="sm-btn info-btn" data-rep="${i}">🗂 Repasar esa línea</button>` : ""}${d && !d.mine && r.tree.lib ? `<button class="sm-btn primary" data-add="${i}" title="Abre tu repertorio en esa posición con la jugada del rival: sólo te falta añadir tu respuesta">➕ Prepararla en tu repertorio</button>` : ""}</div></div>`;
  };
  const list = rows.slice().sort((a, b) => (b.rec.date || "").localeCompare(a.rec.date || "")).slice(0, 40);
  out.innerHTML = `<div class="note-box">${rows.length} partida${rows.length === 1 ? "" : "s"} tuyas con tus repertorios: de media sigues el repertorio <b>${avg}</b> jugadas.
      <br>❌ Te saliste tú en <b>${mine.length}</b> · 🆕 se salió el rival en <b>${rival.length}</b> · ✔ completas: <b>${full.length}</b>.
      ${top && top.n > 1 ? `<br>📍 Donde más te sales (${top.n} veces): tras <b>${esc(lineText(top.r.tree.g.root.state, top.r.path.slice(0, -1), 30))}</b>.` : ""}</div>
    ${list.map((r, i) => item(r, i)).join("")}`;
  out.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { const r = list[+b.dataset.open]; if (openLibGame(r.rec.id, r.path)) switchTab("study"); });
  out.querySelectorAll("[data-rep]").forEach(b => b.onclick = () => {
    const r = list[+b.dataset.rep];
    if (openRepertoireAt(r.tree, r.path.slice(0, -1))) toast("🗂 Esta es la posición: mira qué dice tu repertorio y por qué.");
  });
  out.querySelectorAll("[data-add]").forEach(b => b.onclick = () => { const r = list[+b.dataset.add]; prepareRivalMove(r.tree, r.path.slice(0, -1), r.dev.n.uci); });
}
/* Abre tu repertorio en una posición y hace la jugada del rival que falta: sólo queda añadir tu respuesta */
function prepareRivalMove(tree, path, uci) {
  if (!openRepertoireAt(tree, path)) return;
  const node = cur(), m = Chess.moveFromUci(node.state, uci);
  if (!m || resolvePath(game.root, path, true) !== node) { toast("No se ha encontrado esa posición en tu repertorio."); return; }
  playMove(m, "user");
  toast(`➕ Añadida la jugada del rival (${numPrefix(node.state)}${formatSan(Chess.san(node.state, m), settings.lang, node.state.t)}). Ahora juega tu respuesta: se guarda sola en tu repertorio.`, 5500);
}

