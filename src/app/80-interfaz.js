/* ---------- 27. Pestañas, modales y botones ---------- */
function switchTab(name) {
  if (ui.full && name !== ui.activeTab) fullBoard(false);   // lo que se abre está en el otro panel
  ui.activeTab = name;
  document.querySelectorAll(".tab-btn[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  ariaTabsSync(".tab-btn[data-tab]", b => b.dataset.tab === name);
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
  if (name === "explorer") { refreshExplorer(); renderOpeningBrief(); }
  if (name === "library") { refreshLibraryViews(); if (ui.librarySub === "collection") renderCollection(); if (ui.librarySub === "position") renderPosTarget(); }
  if (name === "tools") { renderDrillInfo(); renderPuzzleInfo(); renderPuzzleStats(); renderExamInfo(); renderRushInfo(); renderToday(); renderMyReps(); }
  if (name === "courses") renderCourses();
  if (name === "endgames" && pieceCount(cur().state) <= 7) querySyzygy();
}
/* Pestañas accesibles: cada pestaña dice qué panel controla (y el panel, qué pestaña lo nombra), sólo la activa
   está en el orden de tabulación, y con el foco en ellas ← → Inicio Fin cambian de pestaña en vez de jugada */
function ariaTabs(list, btnSel, paneOf) {
  const btns = [...list.querySelectorAll(btnSel)];
  btns.forEach(b => {
    const pane = paneOf(b);
    if (!pane) return;
    b.setAttribute("role", "tab");
    b.type = "button";
    if (!b.id) b.id = "tabbtn-" + pane.id;
    b.setAttribute("aria-controls", pane.id);
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-labelledby", b.id);
  });
  list.addEventListener("keydown", e => {
    const i = btns.indexOf(document.activeElement);
    if (i < 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = btns.length, j = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    btns[j].focus();
    btns[j].click();
  });
}
function ariaTabsSync(btnSel, isActive) {
  document.querySelectorAll(btnSel).forEach(b => { const on = !!isActive(b); b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
}
ariaTabs(document.querySelector(".mode-tabs"), ".tab-btn[data-tab]", b => $("tab-" + b.dataset.tab));
ariaTabsSync(".tab-btn[data-tab]", b => b.classList.contains("active"));
/* En el móvil en vertical las pestañas son una barra fija abajo: al pulsar una se lleva su contenido a la vista, y «♟ Tablero» vuelve arriba */
const phoneLayout = matchMedia("(max-width: 640px) and (orientation: portrait)");
document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => btn.addEventListener("click", () => {
  if (btn.dataset.tab === "tools" && ui.activeTab === "tools") openTrainSection(null);   // pulsar «Entrenar» estando ya en ella vuelve al menú
  switchTab(btn.dataset.tab);
  if (phoneLayout.matches) $("tab-" + btn.dataset.tab).scrollIntoView({ block: "start" });
}));
$("tabBoardBtn").onclick = () => scrollTo({ top: 0 });
$("moreBtn").onclick = () => {
  const open = document.querySelector(".board-side").classList.toggle("more-open");
  $("moreBtn").setAttribute("aria-expanded", open);
};

/* ---------- 27a. Pestaña «Entrenar»: menú de actividades; cada tarjeta abre sólo su sección ---------- */
function openTrainSection(id) {
  const view = id || "menu";
  ui.trainView = view;
  document.querySelectorAll("#tab-tools [data-train]").forEach(el => { el.hidden = el.dataset.train !== view; });
  $("trainBack").hidden = view === "menu";
  const r = $("tab-tools").getBoundingClientRect();
  if ($("tab-tools").classList.contains("active") && r.top < 0) $("tab-tools").scrollIntoView({ block: "start" });
}
function syncTrainBadge(card) {
  const src = $(card.dataset.badgeOf), txt = src.textContent.trim();
  card.textContent = txt;
  card.className = src.className + " tc-badge";
  card.hidden = !txt || /^0 /.test(txt);
}
document.querySelectorAll("#trainMenu [data-train-open]").forEach(b => b.addEventListener("click", () => { openTrainSection(b.dataset.trainOpen); if (b.dataset.trainOpen === "coach") coachRenderStart(); }));
document.querySelectorAll("#trainMenu [data-badge-of]").forEach(card => {
  syncTrainBadge(card);
  new MutationObserver(() => syncTrainBadge(card)).observe($(card.dataset.badgeOf), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
});
$("trainBackBtn").onclick = () => openTrainSection(null);
// «Pista» y «Salir» sirven para cualquier entrenamiento: sólo se ven mientras hay uno en marcha
new MutationObserver(() => { $("trainSessionBtns").hidden = ($("stopTrainBtn").disabled && $("hintTrainBtn").disabled) || trainer.puzzle; })
  .observe($("trainSessionBtns"), { attributes: true, attributeFilter: ["disabled"], subtree: true });
openTrainSection(null);

/* ---------- 27b. Tablero a pantalla completa ----------
   Es una disposición propia (el panel del tablero ocupa toda la ventana) y, además, se pide al navegador la pantalla completa de verdad
   donde existe (ordenador, Android, iPad). En el iPhone, que no la tiene, queda a ventana completa: instalada como aplicación ocupa toda la pantalla.
   Mientras dura, la pantalla no se apaga sola. */
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
function fullBoard(on) {
  on = !!on;
  if (on === !!ui.full) return;
  if (on && editor.active) { toast("Cierra antes el editor de posición."); return; }
  ui.full = on;
  if (Coach.active) placeCoachBox();
  document.body.classList.toggle("board-full", on);
  const btn = $("fullBtn"), label = on ? "Salir de la pantalla completa (Esc o tecla P)" : "Tablero a pantalla completa (tecla P)";
  btn.setAttribute("aria-pressed", String(on));
  btn.title = label;
  btn.setAttribute("aria-label", label);
  if (typeof onLayout === "function") onLayout();
  const root = document.documentElement;
  try {
    if (on) {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req && !fsElement()) { ui.fullNative = true; const p = req.call(root, { navigationUI: "hide" }); if (p && p.catch) p.catch(() => { ui.fullNative = false; }); }
    } else if (ui.fullNative) {
      ui.fullNative = false;
      ui.fullIn = false;
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit && fsElement()) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
    }
  } catch { ui.fullNative = false; }
  fullWake(on);
  if (on) document.querySelector(".board-side").scrollTop = 0; else scrollTo({ top: 0 });
  if (B3.active) board3dResize();
}
async function fullWake(on) {
  try {
    if (on) { if (navigator.wakeLock && !ui.wake) { const w = await navigator.wakeLock.request("screen"); if (!ui.full) { w.release(); return; } ui.wake = w; w.addEventListener("release", () => { if (ui.wake === w) ui.wake = null; }); } }
    else if (ui.wake) { const w = ui.wake; ui.wake = null; await w.release(); }
  } catch {}
}
document.addEventListener("visibilitychange", () => { if (ui.full && document.visibilityState === "visible") fullWake(true); });
/* Si se sale de la pantalla completa del navegador (Esc, gesto «atrás»), se vuelve a la vista normal; salvo que la haya cerrado
   un cuadro de confirmación del propio navegador, que entonces se sigue con el tablero a ventana completa */
for (const k of ["confirm", "alert", "prompt"]) {
  const native = window[k];
  if (typeof native !== "function") continue;
  window[k] = function (...a) { ui.dialogAt = Infinity; try { return native.apply(window, a); } finally { ui.dialogAt = Date.now(); } };
}
for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, () => {
  // Sólo cuenta como «salir» si de verdad se había entrado (un cambio tardío de una salida anterior no debe cerrar la nueva)
  if (fsElement()) { ui.fullIn = true; return; }
  const was = ui.fullIn;
  ui.fullIn = false;
  if (!was || !ui.full || !ui.fullNative) return;
  ui.fullNative = false;
  if (Date.now() - (ui.dialogAt || 0) > 1500) fullBoard(false);
});
$("fullBtn").onclick = () => fullBoard(!ui.full);

function openModal(id) {
  if (id === "settingsModal") {
    settingsTab(SetTabs.cur);
    syncEngineSpeed();
    $("setEngine").value = settings.engine;
    $("setAnalysisMs").value = settings.analysisMs;
    $("setMultipv").value = settings.multipv;
    $("setLiveMs").value = settings.liveMs;
    $("setToken").value = settings.token;
    $("tokenResult").textContent = "";
    $("setCoords").checked = settings.coords;
    $("setBoard3d").checked = !!settings.board3d;
    $("setBoard3dLook").value = B3_LOOKS[settings.board3dLook] || settings.board3dLook === "custom" ? settings.board3dLook : "wood";
    { const L = b3Look(); for (const k of ["pw", "pb", "sl", "sd"]) $("b3c_" + k).value = L[k] || "#888888"; }
    $("b3Custom").hidden = settings.board3dLook !== "custom";
    board3dApplyLight();
    $("setLegal").checked = settings.showLegal;
    $("setMoveColors").checked = !!settings.moveColors;
    $("setRadar").checked = !!settings.radar;
    $("setVoiceAuto").checked = !!settings.voiceAuto;
    $("setExplainLevel").value = EXPLAIN_LEVELS[settings.explainLevel] ? settings.explainLevel : "club";
    $("setAutosave").checked = settings.autosave;
    $("setAnimate").checked = settings.animate;
    $("setWheel").checked = settings.wheel;
    renderEngineStatus();
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
$("engineSourceBadge").onclick = () => openSettings("motor");
$("engineSourceBadge").onkeydown = e => { if (e.key === "Enter") openSettings("motor"); };
/* Abre los ajustes en una pestaña concreta */
function openSettings(tab) { if (tab) SetTabs.cur = tab; openModal("settingsModal"); }
/* Herramientas de análisis plegadas (1.53): lo esencial del motor siempre a la vista y el resto a un clic; se recuerda abierto o cerrado */
function setEngineTools(open) {
  $("engineTools").hidden = !open;
  $("engineToolsBtn").setAttribute("aria-expanded", String(open));
}
$("engineToolsBtn").onclick = () => { settings.engineTools = $("engineTools").hidden; saveSettings(); setEngineTools(settings.engineTools); };
setEngineTools(!!settings.engineTools);
/* Importar / exportar plegable en Estudio: cerrado deja sitio al comentario; se recuerda */
$("importDetails").open = !!settings.importOpen;
$("importDetails").addEventListener("toggle", () => { if (settings.importOpen !== $("importDetails").open) { settings.importOpen = $("importDetails").open; saveSettings(); } });
$("engineHelpBtn").onclick = () => { const h = $("engineHelp"); h.hidden = !h.hidden; $("engineHelpBtn").setAttribute("aria-expanded", !h.hidden); };
$("retryEngineBtn").onclick = () => { if (settings.engine !== "auto") { settings.engine = "auto"; saveSettings(); $("setEngine").value = "auto"; } Engine.init(); renderEngineStatus(); toast("🔄 Cargando Stockfish 19…"); };
/* Abierta sin conexión (o sin poder descargar Stockfish): cuando vuelve la conexión se reintenta Stockfish 19 solo,
   si no hay nada en marcha; si lo hay (un análisis, una partida, un ejercicio), sólo se avisa de cómo hacerlo */
window.addEventListener("online", () => {
  if (settings.engine !== "auto" || Engine.kind !== "internal" || !(Engine.fails || []).length) return;
  if (ui.analysing || ui.cpu.on || quiz() || Batch.running || Coach.active) { toast("🌐 Ha vuelto la conexión. Para usar Stockfish 19: ⚙ Ajustes › Motor › «🔄 Reintentar Stockfish 19».", 6000); return; }
  toast("🌐 Ha vuelto la conexión: se carga Stockfish 19…", 4000);
  Engine.init();
});
$("versionsBtn").onclick = openVersions;
$("copyGameBtn").onclick = () => saveToLibrary({ copy: true, force: true });
$("licBtn").onclick = () => openModal("licModal");
$("helpBtn").onclick = () => openHelp();
$("setEngine").onchange = e => { settings.engine = e.target.value; saveSettings(); Engine.init(); };
$("setAnalysisMs").onchange = e => { settings.analysisMs = Math.max(200, Math.min(10000, +e.target.value || 1000)); saveSettings(); syncEngineSpeed(); };
$("setMultipv").onchange = e => { settings.multipv = +e.target.value; saveSettings(); ui.liveNode = null; requestLive(); };
$("setLiveMs").onchange = e => { settings.liveMs = Math.max(500, Math.min(30000, +e.target.value || 4000)); saveSettings(); syncEngineSpeed(); };
/* 1.57: «Profundidad del análisis» en palabras; los milisegundos exactos quedan en 🔧 Avanzado */
const ENGINE_SPEEDS = { fast: { analysisMs: 500, liveMs: 2000 }, balanced: { analysisMs: 1000, liveMs: 4000 }, deep: { analysisMs: 2500, liveMs: 10000 } };
function syncEngineSpeed() {
  const k = Object.keys(ENGINE_SPEEDS).find(x => ENGINE_SPEEDS[x].analysisMs === +settings.analysisMs && ENGINE_SPEEDS[x].liveMs === +settings.liveMs) || "custom";
  $("setEngineSpeed").value = k;
}
$("setEngineSpeed").onchange = e => {
  const v = ENGINE_SPEEDS[e.target.value];
  if (!v) return;
  Object.assign(settings, v);
  saveSettings();
  $("setAnalysisMs").value = settings.analysisMs;
  $("setLiveMs").value = settings.liveMs;
};
/* 1.57: los ajustes, por categorías (pestañas dentro del cuadro); se recuerda la última que miraste */
const SetTabs = { cur: (() => { try { return localStorage.getItem("ajedrezAjustesPestana") || "aspecto"; } catch { return "aspecto"; } })() };
function settingsTab(k) {
  if (!document.querySelector(`.set-sec[data-set="${k}"]`)) k = "aspecto";
  SetTabs.cur = k;
  try { localStorage.setItem("ajedrezAjustesPestana", k); } catch {}
  document.querySelectorAll(".set-sec").forEach(x => x.classList.toggle("set-on", x.dataset.set === k));
  ariaTabsSync(".set-tab", b => b.dataset.setTab === k);
}
/* Enseña la pestaña de los ajustes en la que está un control (el buscador y los enlaces de la ayuda) */
function settingsReveal(id) {
  const el = typeof id === "string" ? $(id) : id, sec = el && el.closest(".set-sec");
  if (sec) settingsTab(sec.dataset.set);
}
ariaTabs(document.querySelector(".set-tabs"), ".set-tab", b => $("setSec-" + b.dataset.setTab));
document.querySelectorAll(".set-tab").forEach(b => b.onclick = () => settingsTab(b.dataset.setTab));
settingsTab(SetTabs.cur);
$("setToken").onchange = e => { settings.token = e.target.value.trim(); saveSettings(); explorerCache.clear(); refreshExplorer(); };
$("setCoords").onchange = e => { settings.coords = e.target.checked; saveSettings(); renderBoard(); };
$("setBoard3d").onchange = e => { settings.board3d = e.target.checked; B3.failed = false; saveSettings(); renderBoard(); };
$("setBoard3dLook").onchange = e => {
  // Al pasar a «personalizado» se parte de los colores del aspecto que había
  if (e.target.value === "custom" && settings.board3dLook !== "custom") { const L = b3Look(), css = getComputedStyle(document.body); settings.board3dColors = { pw: L.pw, pb: L.pb, sl: L.sl || css.getPropertyValue("--light").trim(), sd: L.sd || css.getPropertyValue("--dark").trim() }; }
  settings.board3dLook = e.target.value; saveSettings();
  { const L = b3Look(); for (const k of ["pw", "pb", "sl", "sd"]) $("b3c_" + k).value = L[k] || "#888888"; }
  $("b3Custom").hidden = e.target.value !== "custom";
  board3dApplyLook();
};
for (const k of ["pw", "pb", "sl", "sd"]) $("b3c_" + k).oninput = e => { settings.board3dColors = Object.assign({}, b3Look(), settings.board3dColors || {}, { [k]: e.target.value }); saveSettings(); board3dApplyLook(); };
$("setB3Light").oninput = e => board3dSetLight("light", e.target.value);
$("setB3Gloss").oninput = e => board3dSetLight("gloss", e.target.value);
function setMoveColors(on) {
  settings.moveColors = !!on;
  saveSettings();
  $("setMoveColors").checked = $("moveColorsToggle").checked = settings.moveColors;
  if (on && !settings.showLegal) { settings.showLegal = true; $("setLegal").checked = true; saveSettings(); }   // los colores van en los puntos de las jugadas legales
  moveQReset();
  renderBoard();
  if (typeof cpuPanel === "function" && ui.cpu.on) cpuPanel();
  toast(on ? "🎨 Colores activados: elige una pieza y verás lo buena que es cada jugada." : "🎨 Colores desactivados.");
}
$("setMoveColors").onchange = e => setMoveColors(e.target.checked);
$("moveColorsToggle").onchange = e => setMoveColors(e.target.checked);
$("moveColorsToggle").checked = !!settings.moveColors;
$("setRadar").onchange = e => setRadar(e.target.checked);
$("radarToggle").onchange = e => setRadar(e.target.checked);
$("radarToggle").checked = !!settings.radar;
$("setExplainLevel").onchange = e => setExplainLevel(e.target.value);
$("setVoiceAuto").onchange = e => { settings.voiceAuto = e.target.checked; saveSettings(); if (!e.target.checked) stopSpeaking(); else toast("🔊 Se leerá en voz alta cada explicación nueva."); };
$("setLegal").onchange = e => { settings.showLegal = e.target.checked; saveSettings(); renderBoard(); };
$("setAnimate").onchange = e => { settings.animate = e.target.checked; saveSettings(); };
$("setWheel").onchange = e => { settings.wheel = e.target.checked; saveSettings(); };
/* Tamaño del tablero: porcentaje del tamaño automático (el más grande que cabe), de 60 a 130 */
function applyBoardSize() {
  const v = Math.max(60, Math.min(130, +settings.boardSize || 100));
  document.documentElement.style.setProperty("--bs", String(v / 100));
  $("setBoardSize").value = v;
  $("boardSizeVal").textContent = v === 100 ? "automático (100 %)" : v + " %";
}
$("setAutoSpeed").value = String(autoplayMs());
$("setAutoSpeed").onchange = e => setAutoplaySpeed(+e.target.value);
$("autoSpeed").onchange = e => setAutoplaySpeed(+e.target.value);
$("setBoardSize").oninput = e => { settings.boardSize = +e.target.value; applyBoardSize(); };
$("setBoardSize").onchange = () => saveSettings();
$("boardSizeReset").onclick = () => { settings.boardSize = 100; applyBoardSize(); saveSettings(); };
applyBoardSize();
/* Aspecto de la aplicación: oscuro, claro o automático (según el modo del sistema) */
const lightQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: light)") : null;
function applyUiTheme() {
  const want = settings.uiTheme || "dark";
  const light = want === "light" || (want === "auto" && lightQuery && lightQuery.matches);
  if (light) document.documentElement.setAttribute("data-ui", "light"); else document.documentElement.removeAttribute("data-ui");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = light ? "#f2f4f7" : "#0b0e14";
  $("setUiTheme").value = want;
}
$("setUiTheme").onchange = e => { settings.uiTheme = e.target.value; saveSettings(); applyUiTheme(); };
if (lightQuery) (lightQuery.addEventListener ? lightQuery.addEventListener("change", applyUiTheme) : lightQuery.addListener(applyUiTheme));
applyUiTheme();
$("setAutosave").onchange = e => { settings.autosave = e.target.checked; saveSettings(); if (!settings.autosave) { try { localStorage.removeItem("ajedrezStudioCurrent"); } catch {} } };

$("pieceStyleSelect").onchange = e => { settings.pieceStyle = e.target.value; saveSettings(); buildEditorPalettes(); render(); };
$("displayLang").onchange = e => { settings.lang = e.target.value; saveSettings(); render(); renderLocalEcoList(); };
$("themeSelect").onchange = e => { settings.theme = e.target.value; saveSettings(); document.body.dataset.theme = settings.theme; if (B3.active) board3dDraw(); };
$("soundToggle").onclick = () => { settings.sound = !settings.sound; saveSettings(); $("soundToggle").textContent = settings.sound ? "🔊" : "🔇"; if (settings.sound) Sound.play("move"); };
$("cpuLevel").onchange = e => { settings.cpuLevel = parseCpuLevel(e.target.value); saveSettings(); cpuDialogSync(); };
$("cpuOpponent").onchange = () => cpuDialogSync();
function renderAdaptiveInfo() {
  const el = $("cpuAdaptiveInfo"), v = $("cpuLevel").value, elo = humanElo(v);
  el.hidden = v !== "a" && !elo;
  $("cpuStyle").disabled = !!elo;
  if (v === "a") el.innerHTML = "🎯 " + adaptiveSummary();
  else if (elo) el.innerHTML = `👤 <b>Juega como una persona de unos ${elo} de Elo</b> (el estilo no se usa). En la apertura elige lo que se juega a ese nivel: con tu token de Lichess, las jugadas reales de partidas de jugadores de ese Elo; sin él, las del libro de aperturas y tus partidas. Después piensa como una persona de su nivel: casi nunca ve las jugadas «de máquina», prefiere las naturales (capturas, recapturas, jaques, desarrollo) y comete los errores típicos de ese nivel${elo <= 1400 ? ", incluido dejarse alguna pieza" : ""}, más aún con poco tiempo en el reloj y en posiciones complicadas.`;
}
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
$("thinkBtn").onclick = () => thinkWithMe();
$("talkBtn").onclick = () => talkToPieces();
$("scanBtn").onclick = () => readBoard();
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
    node.eval = { cp: lines[0].cp, mate: lines[0].mate, depth: data.depth, best: lines[0].pv[0], pv: lines[0].pv.slice(0, 14), second: lines[1] ? { cp: lines[1].cp, mate: lines[1].mate } : null, source: "nube", engine: "Stockfish (nube de Lichess)", ms: 0 };
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
    toast(isNetErr(e) ? `No se pudo consultar la nube de Lichess: ${netMsg()}.` : e.message || "No se pudo consultar la nube.", 4200);
  }
};

$("startBtn").onclick = goStart;
$("backBtn").onclick = () => { stopAutoplay(); goBack(); };
$("forwardBtn").onclick = () => { stopAutoplay(); goForward(); };
$("endBtn").onclick = goEnd;
$("playBtn").onclick = toggleAutoplay;
$("flipBtn").onclick = () => { ui.flipped = !ui.flipped; render(); };
/* ✂ Cortar: dice qué se elimina (la variante o la continuación, cuántas jugadas y comentarios) y se puede deshacer
   (↩ en el aviso o Ctrl+Z) mientras no cambies de partida. */
function cutDescription(n) {
  let plies = 0, notes = 0;
  Pgn.walk(n, x => { plies++; if (x.comment || x.shapes.length) notes++; });
  const p = n.parent, first = numPrefix(p.state) + dispSan(n);
  const what = p.children[0] !== n ? `la variante ${first}` : Pgn.isMainline(n) ? `${first} y lo que sigue` : `${first} y lo que sigue en esta variante`;
  const vars = []; Pgn.walk(n, x => { if (x.children.length > 1) vars.push(x.children.length - 1); });
  const nVars = vars.reduce((a, b) => a + b, 0);
  return { plies, notes, vars: nVars,
    text: `${what} · ${plies} jugada${plies === 1 ? "" : "s"}${nVars ? `, ${nVars} variante${nVars === 1 ? "" : "s"}` : ""}${notes ? `, ${notes} con comentarios o dibujos` : ""}` };
}
function cutNode(n) {
  if (!n || !n.parent) return;
  const d = cutDescription(n);
  if ((d.plies > 6 || d.notes) && !confirm(`¿Eliminar ${d.text}?\n\nPodrás deshacerlo con «↩ Deshacer» o Ctrl+Z mientras no cambies de partida.`)) return;
  const p = n.parent;
  ui.lastCut = { node: n, parent: p, idx: p.children.indexOf(n), game, text: d.text };
  goTo(Pgn.deleteNode(n));
  markDirty();
  toast(`✂ Eliminada ${d.text}.`, 8000, { label: "↩ Deshacer", run: undoCut });
}
function undoCut() {
  const c = ui.lastCut;
  ui.lastCut = null;
  if (!c || c.game !== game) { toast("No hay nada que deshacer."); return false; }
  let attached = false;
  for (let x = c.parent; x; x = x.parent) if (x === game.root) attached = true;
  if (!attached) { toast("No se puede deshacer: la jugada de la que salía también se ha eliminado."); return false; }
  if (c.parent.children.some(x => Pgn.sameMove(x.move, c.node.move))) { toast("No se puede deshacer: has vuelto a jugar esa misma jugada desde ahí."); return false; }
  c.parent.children.splice(Math.min(c.idx, c.parent.children.length), 0, c.node);
  goTo(c.node);
  markDirty();
  toast(`↩ Recuperada ${c.text}.`);
  return true;
}
$("undoBtn").onclick = () => cutNode(cur());
$("promoteVarBtn").onclick = () => { Pgn.promote(cur()); markDirty(); render(); };
$("mainVarBtn").onclick = () => { Pgn.makeMain(cur()); markDirty(); render(); };
$("clearShapesBtn").onclick = () => { cur().shapes = []; markDirty(); render(); };
/* Modo dibujo para pantallas táctiles */
function setDrawMode(on) {
  ui.drawMode = !!on;
  $("drawToggle").setAttribute("aria-pressed", String(ui.drawMode));
  $("drawToggle").textContent = ui.drawMode ? "✏ Dibujando: pulsa para volver a mover" : "✏ Dibujar flechas";
  $("drawTools").hidden = !ui.drawMode;
  $("boardWrap").classList.toggle("drawing", ui.drawMode);
  if (ui.drawMode) { ui.selected = null; renderBoard(); }
}
ui.drawColor = "green";
$("drawToggle").onclick = () => setDrawMode(!ui.drawMode);
document.querySelectorAll(".draw-color").forEach(b => b.onclick = () => {
  ui.drawColor = b.dataset.color;
  document.querySelectorAll(".draw-color").forEach(x => x.classList.toggle("on", x === b));
});
$("drawClear").onclick = () => { cur().shapes = []; markDirty(); render(); };

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
    // 📜 Descriptiva (P4R, C3AR, PxP): si así se ha elegido, o si no es una jugada algebraica y lo parece
    let move = null, err0 = null;
    if (settings.notation !== "desc") { try { move = Chess.parseMove(cur().state, txt, lang).move; } catch (x) { err0 = x; } }
    if (!move && (settings.notation === "desc" || Pgn.looksDesc(txt.toUpperCase()))) {
      const d = descTyped(txt);
      if (d === null) { e.target.value = ""; return; }   // varias lecturas: se elige en el tablero
      if (d) move = d;
    }
    if (!move) throw err0 || Error("Jugada ilegal o no reconocida: " + txt);
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
  if (lichessLink(text)) { importLichessLink(text); return; }
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
    if (c.posNag) { d.posNag = c.posNag; d.posNagCode = c.posNagCode || 0; }
    if (c.nags && c.nags.length) d.nags = c.nags.slice();
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
  if (btn.dataset.nag === "") { n.nag = ""; n.posNag = ""; n.posNagCode = 0; n.nags = []; }
  else n.nag = n.nag === btn.dataset.nag ? "" : btn.dataset.nag;
  n.nagAuto = false;
  markDirty();
  render();
});
document.querySelectorAll(".posnag-btn").forEach(btn => btn.onclick = () => {
  const n = cur();
  if (!n.parent) return;
  n.posNag = n.posNag === btn.dataset.nag ? "" : btn.dataset.nag;
  n.posNagCode = 0;
  markDirty();
  render();
});

$("surpriseBtn").onclick = () => findSurprises();
$("rivalBtn").onclick = () => prepareRival();
$("rivalUser").addEventListener("keydown", e => { if (e.key === "Enter") prepareRival(); });
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
  const q = new URLSearchParams({ max, perfType: perf, opening: "true", clocks: "true", evals: "true", sort: "dateDesc" });
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
ariaTabs(document.querySelector(".subtabs"), ".sub-btn", b => $("sub-" + b.dataset.sub));
ariaTabsSync(".sub-btn", b => b.classList.contains("active"));
function switchSub(name) {
  ui.librarySub = name;
  document.querySelectorAll(".sub-btn").forEach(b => b.classList.toggle("active", b.dataset.sub === name));
  ariaTabsSync(".sub-btn", b => b.dataset.sub === name);
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
setupAdvFilter("lib", renderLibrary);
setupAdvFilter("db", renderCollection);
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
$("libBackup").onclick = async () => {
  await syncEnsureUids();
  const data = syncPayload();   // partidas, marcadores, progreso y ajustes: lo mismo que viaja al sincronizar
  download(`ajedrezbase_copia_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), "application/json");
};
$("libRestore").onclick = () => $("jsonFileInput").click();
$("jsonFileInput").onchange = async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) await restoreBackupFile(f);
};
async function restoreBackupFile(f) {
  try {
    const data = JSON.parse(await f.text());
    let res;
    if (Array.isArray(data)) {
      const recs = data.map(it => { const g = legacyStudyGame(it); return g && g.root.children.length ? recordFromGame(g, { title: it.name }) : null; }).filter(Boolean);
      res = await importRecords(recs, []);
    } else if (data && data.sync && Array.isArray(data.games)) {
      // Copia completa (1.32 o posterior): se combina con lo que hay, sin borrar nada
      const r = await syncApply(data, { restore: true });
      syncTouch();
      const t = syncStatsText(r.stats);
      toast(t ? "⬆ Copia restaurada: " + t + "." : "⬆ La copia no trae nada que no tengas ya.", 5000);
      return;
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
$("puzzleStartBtn").onclick = startPuzzles;
$("examStartBtn").onclick = startExam;
$("rushBtn3").onclick = () => startRush(180);
$("rushBtn5").onclick = () => startRush(300);
renderRushInfo();
$("repCompareBtn").onclick = compareWithRepertoire;
["puzzleTheme", "puzzleLevel"].forEach(id => $(id).onchange = renderPuzzleInfo);
$("visStartBtn").onclick = startVis;
$("visMode").onchange = () => { $("visPlies").hidden = $("visMode").value !== "line"; $("visSecs").hidden = $("visMode").value !== "blindpz"; };
$("blindBtn").onclick = () => setBlind(!ui.blind);
$("peekBtn").onclick = peekPieces;
$("blindCpuBtn").onclick = () => openCpuDialog(true);
$("stopTrainBtn").onclick = exitTraining;
$("hintTrainBtn").onclick = trainerHint;
$("repNewBtn").onclick = () => createMyRep(null);
$("repNewName").onkeydown = e => { if (e.key === "Enter") createMyRep(null); };
$("repFromCourse").onchange = e => { const v = e.target.value; e.target.value = ""; if (v !== "") createMyRep(v); };
$("repReviewCourse").onchange = e => {
  const v = e.target.value; e.target.value = "";
  if (v === "") return;
  const l = courseLessons("repertorios")[+v];
  reviewRepertoire({ l, i: +v, title: l.title, g: Pgn.parseGame(l.g, { lang: "en" }).game, side: l.black ? -1 : 1 });
};
$("courseImportBtn").onclick = () => $("courseFileInput").click();
$("courseFileInput").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (f) await importCourseFile(f); };
$("trainDueBtn").onclick = () => {
  const due = [...Lib.games.values()].filter(r => r.srs && r.srs.due <= Date.now()).sort((x, y) => x.srs.due - y.srs.due);
  if (!due.length) { toast("¡No tienes partidas pendientes de repaso hoy! 🎉 (Entrena una partida guardada para programarla.)", 4000); return; }
  if (openLibGame(due[0].id)) startTraining({});
};

