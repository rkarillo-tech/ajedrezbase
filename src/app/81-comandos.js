/* ---------- 27c. 🔎 Buscador de comandos (Ctrl + K o /) ----------
   Escribe en lugar de buscar: encuentra cualquier función, ajuste, apartado de la ayuda, lección, apertura o partida
   (de la biblioteca o del .pgn abierto: «carlsen nakamura»), y también juega una jugada («Cf3») o carga una FEN.
   El índice se arma al abrirlo con lo que hay en la página, así que las funciones nuevas aparecen solas; las más
   usadas tienen además un nombre claro, palabras clave y su atajo. Todo funciona sin conexión. */
const Cmd = { items: [], shown: [], sel: 0 };
const cmdNorm = s => norm(s).replace(/[^\p{L}\p{N}\s.+#=\/-]/gu, " ").replace(/\s+/g, " ").trim();

/* Hace visible un elemento esté donde esté: su pestaña, subpestaña, sección de «Entrenar», recuadro o modal */
function revealEl(el) {
  if (!el) return false;
  if (!el.closest(".modal-back")) closeModals();
  const pane = el.closest(".tab-pane");
  if (pane) switchTab(pane.id.replace(/^tab-/, ""));
  const sub = el.closest(".subpane");
  if (sub) switchSub(sub.id.replace(/^sub-/, ""));
  const tr = el.closest("[data-train]");
  if (tr && tr.dataset.train !== "menu") openTrainSection(tr.dataset.train);
  const modal = el.closest(".modal-back");
  if (modal && !modal.classList.contains("open")) openModal(modal.id);
  for (let d = el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
  if (el.closest(".board-side") && !el.offsetParent) document.querySelector(".board-side").classList.add("more-open");
  return true;
}
function flashEl(el) {
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("cmd-flash"); void el.offsetWidth; el.classList.add("cmd-flash");
  setTimeout(() => el.classList.remove("cmd-flash"), 1800);
}
/* Pulsa un botón (o enseña un ajuste) después de hacerlo visible; si en este momento no se puede usar, lo dice */
function cmdUse(id, click = true) {
  const el = $(id);
  if (!el || !revealEl(el)) return;
  setTimeout(() => {
    const target = el.closest("label") || el;
    if (!el.offsetParent || el.disabled) { toast("Esa función no está disponible ahora mismo (por ejemplo, durante una partida o un ejercicio)."); return; }
    if (click && el.tagName === "BUTTON") el.click();
    else { flashEl(target); try { el.focus({ preventScroll: true }); } catch {} }
  }, 60);
}
const cmdToggle = id => () => { const el = $(id); el.checked = !el.checked; el.dispatchEvent(new Event("change")); toast(`${el.closest("label") ? el.closest("label").textContent.trim() : id}: ${el.checked ? "activado" : "desactivado"}`); };

/* Las funciones principales, con un nombre claro, palabras clave y su atajo */
function cmdCommands() {
  const C = (name, run, opts = {}) => Object.assign({ cat: "Función", icon: "⚡", name, run }, opts);
  const S = (name, id, opts = {}) => C(name, () => cmdUse(id, false), Object.assign({ cat: "Ajuste", icon: "⚙" }, opts));
  const T = (name, tab, opts = {}) => C(name, () => { closeModals(); switchTab(tab); if (opts.sub) switchSub(opts.sub); if (opts.train) openTrainSection(opts.train); }, Object.assign({ cat: "Ir a", icon: "➜" }, opts));
  return [
    C("Nueva partida", () => cmdUse("newGame"), { kw: "empezar borrar limpiar tablero" }),
    C("Jugar contra la CPU", () => cmdUse("playCpuToggle"), { kw: "ordenador maquina fritz stockfish rival partida dos jugadores reloj jugar la posicion" }),
    C("Jugar esta posición contra la CPU", () => { closeModals(); if (ui.cpu.on) { toast("Ya estás jugando una partida."); return; } openCpuDialog(); $("cpuFrom").value = "here"; }, { kw: "jugar la posicion desde aqui fritz motor practicar" }),
    C("Analizar y comentar la partida", () => cmdUse("autoAnnotateBtn"), { kw: "analisis errores precision grafico informe" }),
    C("Piensa conmigo", thinkWithMe, { key: "T", kw: "mejor jugada explicar razonamiento por que" }),
    C("Habla con tus piezas", talkToPieces, { key: "H", kw: "pieza infeliz casilla sonada plan profilaxis" }),
    C("Ver amenaza del rival", showThreat, { key: "X", kw: "amenaza que quiere el rival" }),
    C("Lee el tablero", readBoard, { key: "L", kw: "metodo calculo material reyes jugadas forzadas" }),
    C("Radar de piezas en peligro", () => setRadar(!settings.radar), { key: "R", kw: "colgadas atacadas indefensas" }),
    C("Colores en las jugadas", () => setMoveColors(!settings.moveColors), { key: "C", kw: "colorear jugadas buenas malas" }),
    C("Análisis continuo (activar / pausar)", cmdToggle("liveToggle"), { key: "E", kw: "motor stockfish evaluacion" }),
    C("Girar el tablero", () => $("flipBtn").click(), { key: "F", kw: "dar la vuelta orientacion negras" }),
    C("Piezas ocultas (a ciegas)", () => setBlind(!ui.blind), { key: "B", kw: "ciegas blind visualizacion" }),
    C("Pantalla completa", () => fullBoard(!ui.full), { key: "P", kw: "grande maximizar" }),
    C("Marcar esta jugada", openMarkDialog, { key: "M", kw: "marcador favorita idea tarjeta nota" }),
    C("Preguntar al profesor IA", () => { if (!aiProvider()) { openModal("settingsModal"); setTimeout(() => cmdUse("setAiProvider", false), 80); toast("Primero elige un proveedor de IA."); return; } closeModals(); revealEl($("aiQuestion")); $("aiQuestion").focus(); flashEl($("aiBox")); }, { kw: "ia ollama claude gemini pregunta chatgpt inteligencia artificial ask" }),
    C("Guardar en la biblioteca", () => cmdUse("saveGame"), { kw: "guardar salvar" }),
    C("Copiar el PGN", () => cmdUse("copyPgnBtn"), { kw: "exportar portapapeles" }),
    C("Descargar la partida en .pgn", () => cmdUse("downloadPgnBtn"), { kw: "exportar archivo" }),
    C("Copiar la FEN", () => cmdUse("copyFenBtn"), { kw: "posicion portapapeles" }),
    C("Imagen de la posición (PNG)", () => cmdUse("pngBtn"), { kw: "captura diagrama compartir" }),
    C("Imprimir o PDF de la partida", () => cmdUse("printBtn"), { kw: "pdf papel diagramas" }),
    C("Enlace a esta jugada", () => cmdUse("linkBtn"), { kw: "compartir url link" }),
    C("Colocar piezas (editor de posición)", () => cmdUse("editPosBtn"), { kw: "editor montar posicion fen" }),
    C("Dibujar flechas", () => cmdUse("drawToggle"), { kw: "flechas circulos marcar casillas" }),
    C("Importar PGN o jugadas", () => { switchTab("study"); cmdUse("moveInput", false); }, { kw: "pegar partida texto" }),
    C("Abrir un fichero .pgn", () => cmdUse("openPgnFileBtn"), { kw: "base de datos archivo cargar" }),
    C("Descargar mis partidas de Lichess", () => cmdUse("liUser", false), { kw: "lichess importar usuario" }),
    C("Descargar mis partidas de Chess.com", () => cmdUse("ccUser", false), { kw: "chesscom chess.com importar usuario" }),
    C("Copia de seguridad", () => cmdUse("libBackup"), { kw: "backup exportar todo" }),
    C("Restaurar una copia", () => cmdUse("libRestore"), { kw: "backup importar recuperar" }),
    C("Buscar esta posición en mis partidas", () => { closeModals(); switchTab("library"); switchSub("position"); }, { kw: "posicion estructura de peones material partidas modelo" }),
    C("Sorpresas y trampas de esta posición", () => cmdUse("surpriseBtn"), { kw: "trampa sorpresa apertura" }),
    C("Preparar un rival", () => cmdUse("rivalUser", false), { kw: "rival oponente preparacion lichess" }),
    C("Problemas de táctica", () => cmdUse("puzzleStartBtn", false), { kw: "puzzles ejercicios tactica" }),
    C("Contrarreloj de problemas", () => cmdUse("rushBtn3", false), { kw: "rush tiempo problemas rapidos" }),
    C("Examen de nivel", () => cmdUse("examStartBtn", false), { kw: "elo nivel examen medir" }),
    C("Mis repertorios", () => cmdUse("myRepSection", false), { kw: "repertorio aperturas entrenar crear" }),
    C("Adivina la jugada", () => cmdUse("guessStartBtn", false), { kw: "adivinar maestro" }),
    C("Ayuda completa", () => openHelp(), { key: "?", kw: "guia manual" }),
    T("Pestaña Estudio", "study", { kw: "partida comentarios variantes" }),
    T("Pestaña Cursos", "courses", { kw: "lecciones aprender" }),
    T("Pestaña Aperturas (explorador)", "explorer", { kw: "explorador eco lichess maestros" }),
    T("Pestaña Biblioteca", "library", { kw: "mis partidas" }),
    T("Pestaña Finales (tablas Syzygy)", "endgames", { kw: "finales syzygy lucena philidor tablebase" }),
    T("Pestaña Entrenar", "tools", { kw: "entrenamiento repaso" }),
    T("Marcadores", "library", { sub: "marks", kw: "marcadores notas" }),
    T("Buscar en los comentarios", "library", { sub: "search", kw: "notas comentarios texto" }),
    T("Estadísticas de mis partidas", "library", { sub: "stats", kw: "estadisticas errores precision aperturas" }),
    T("Tarjetas de repaso", "tools", { train: "cards", kw: "tarjetas repeticion espaciada" }),
    T("Errores de mis partidas", "tools", { train: "drill", kw: "ejercicios errores practicar" }),
    T("A ciegas y visualización (entrenar)", "tools", { train: "blind", kw: "ruta del caballo memoria casillas" }),
    S("Tablero en 3D", "setBoard3d", { kw: "3d staunton tridimensional" }),
    S("Aspecto claro, oscuro o automático", "setUiTheme", { kw: "tema modo oscuro claro noche" }),
    S("Diseño de las piezas", "pieceStyleSelect", { kw: "piezas estilo" }),
    S("Colores del tablero", "themeSelect", { kw: "tablero madera verde azul" }),
    S("Notación (española, inglesa, figurines)", "displayLang", { kw: "idioma notacion figurines" }),
    S("Motor de análisis", "setEngine", { kw: "stockfish motor" }),
    S("Token de Lichess", "setToken", { kw: "lichess token explorador" }),
    S("Profesor IA: proveedor y modelo", "setAiProvider", { kw: "ia ollama claude gemini clave" }),
    S("Nivel de las explicaciones", "setExplainLevel", { kw: "iniciacion club avanzado" }),
    S("Leer en voz alta automáticamente", "setVoiceAuto", { kw: "voz audio hablar" }),
    S("Sincronizar entre dispositivos", "syncLabel", { kw: "drive onedrive dropbox movil ordenador sincronizacion" })
  ];
}
/* Botones y ajustes de la página que no están en la lista anterior: aparecen solos, con el título de su sección */
function cmdScraped(known) {
  const out = [], skip = new Set(["cancelPromo", "welcomeClose", "welcomeHelp", "tabBoardBtn", "moreBtn", "startBtn", "backBtn", "forwardBtn", "endBtn", "aiAskBtn", "cmdBtn", "storageRefreshBtn", "engineHelpBtn", "drawClear",
    "thinkBtn", "talkBtn", "threatBtn", "scanBtn", "markBtn", "markBtn2", "flipBtn", "helpBtn", "toggleEditorModeBtn", "settingsBtn", "boardSizeReset"]);
  // Contexto: el último título (h2) anterior al botón dentro de su pestaña o modal, y la subpestaña de la biblioteca
  const ctxOf = el => {
    const box = el.closest(".tab-pane, .modal, .panel");
    let t = "";
    if (box) for (const h of box.querySelectorAll("h2")) if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !h.closest("[hidden]:not(.subpane):not([data-train])")) t = (h.querySelector("span") || h).textContent;
    const sub = el.closest(".subpane");
    if (sub) { const sb = document.querySelector(`.sub-btn[data-sub="${sub.id.replace(/^sub-/, "")}"]`); if (sb) t = sb.textContent.replace(/\d+\s*$/, ""); }
    return t.replace(/\s+/g, " ").trim();
  };
  document.querySelectorAll("button[id]").forEach(b => {
    if (known.has(b.id) || skip.has(b.id) || b.hidden || b.closest("#editorPanel, #helpModal, #cmdModal, #promoModal, #welcomeBox")) return;
    const modal = b.closest(".modal-back");
    if (modal && modal.id !== "settingsModal") return;
    const name = (b.textContent || "").replace(/\s+/g, " ").trim();
    if (name.replace(/[^\p{L}]/gu, "").length < 3) return;
    const ctx = ctxOf(b);
    if (!ctx && name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).length < 2) return;   // «Guardar» o «Buscar» sueltos no dicen nada
    out.push({ cat: "Función", icon: "•", name, ctx, kw: (b.title || "") + " " + ctx, run: () => cmdUse(b.id) });
  });
  document.querySelectorAll("#settingsModal label, .engine-switches label.switch, label.switch").forEach(l => {
    const ctl = l.htmlFor ? $(l.htmlFor) : l.querySelector("input, select");
    if (!ctl || !ctl.id || known.has(ctl.id)) return;
    known.add(ctl.id);
    const name = l.textContent.replace(/\s+/g, " ").trim();
    if (name.length < 3) return;
    out.push({ cat: "Ajuste", icon: "⚙", name, kw: l.title || "", run: () => cmdUse(ctl.id, false) });
  });
  return out;
}
function cmdHelpItems() {
  return [...document.querySelectorAll("#helpBody > details")].map(d => {
    const s = d.querySelector("summary");
    return { cat: "Ayuda", icon: "❓", name: s ? s.textContent.replace(/\s+/g, " ").trim() : d.id, run: () => { closeModals(); openHelp(d.id); } };
  });
}
function cmdCourseItems() {
  const out = [];
  for (const c of COURSES.concat(typeof userCourses === "function" ? userCourses().map(u => ({ id: u.id, icon: "📥", name: u.name })) : [])) {
    out.push({ cat: "Curso", icon: c.icon || "📘", name: c.name, ctx: "curso completo", kw: c.desc || "", run: () => { closeModals(); switchTab("courses"); renderCourses(); } });
    let lessons = [];
    try { lessons = courseLessons(c.id); } catch {}
    lessons.forEach((l, i) => out.push({ cat: "Lección", icon: c.icon || "📘", name: l.title, ctx: c.name, run: () => { closeModals(); switchTab("courses"); openLesson(c.id, i); } }));
  }
  return out;
}
function cmdOpeningItems() {
  const arts = OPENING_ARTICLES.map(a => ({ cat: "Apertura explicada", icon: "📖", name: `Leer: ${a.name}`, ctx: a.eco, kw: `${a.name} articulo explicada historia como se juega ${a.eco}`, run: () => openOpeningArticle(a.id) }));
  return arts.concat(ECO_BOOK.filter(x => x.ucis).map(x => ({ cat: "Apertura", icon: "📖", name: x.name, ctx: x.eco, kw: x.eco, run: () => {
    const r = Pgn.parseGame(x.moves, { lang: "en" });
    r.game.headers.Event = x.name; r.game.headers.ECO = x.eco;
    closeModals();
    setGame(r.game, { name: x.name, current: Pgn.mainlineFrom(r.game.root).pop() });
  } })));
}
function cmdGameItems() {
  const out = [];
  if (Lib.ready) for (const r of Lib.games.values()) {
    const h = r.headers || {};
    const rep = isRepRec(r);
    out.push({ cat: rep ? "Repertorio" : "Partida", icon: rep ? "🗂" : "📚", name: r.title || defaultTitle(h), ctx: [r.white || h.White, r.black || h.Black, r.event || h.Event, (r.date || h.Date || "").slice(0, 4)].filter(x => x && x !== "?").join(" · "),
      kw: [(r.tags || []).join(" "), r.opening || "", r.eco || ""].join(" "), game: true, run: () => { closeModals(); if (openLibGame(r.id, [])) switchTab("study"); } });
  }
  const tag = (t, k) => { const m = t.match(new RegExp(`\\[${k} "([^"]*)"`)); return m ? m[1] : ""; };
  Coll.games.slice(0, 20000).forEach((t, i) => {
    const w = tag(t, "White"), b = tag(t, "Black");
    out.push({ cat: "Partida (.pgn)", icon: "🗂", name: `${w || "?"} – ${b || "?"}`, ctx: [tag(t, "Result"), tag(t, "Event"), tag(t, "Date").slice(0, 4)].filter(x => x && x !== "?").join(" · "), kw: tag(t, "ECO") + " " + tag(t, "Opening"), game: true, run: () => { closeModals(); loadCollGame(i); switchTab("study"); } });
  });
  return out;
}
function cmdBuild() {
  const cmds = cmdCommands();
  const known = new Set();
  // Los botones que ya tienen nombre propio no se repiten con el texto del botón
  cmds.forEach(c => { const m = String(c.run).match(/cmdUse\("([^"]+)"/); if (m) known.add(m[1]); });
  ["setBoard3d", "setUiTheme", "pieceStyleSelect", "themeSelect", "displayLang", "setEngine", "setToken", "setAiProvider", "setExplainLevel", "setVoiceAuto", "liveToggle", "radarToggle", "setRadar", "moveColorsToggle", "setMoveColors"].forEach(id => known.add(id));
  Cmd.items = cmds.concat(cmdScraped(known), cmdHelpItems(), cmdCourseItems(), cmdOpeningItems(), cmdGameItems())
    .map(it => Object.assign(it, { hay: cmdNorm(`${it.name} ${it.ctx || ""} ${it.kw || ""} ${it.cat}`), nm: cmdNorm(it.name) }));
}

/* Lo escrito puede ser también una jugada legal en el tablero o una FEN */
function cmdSpecial(q) {
  const out = [];
  const txt = q.trim();
  if (/^([rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+(\s|$)/.test(txt)) out.push({ cat: "Posición", icon: "♟", name: "Cargar esta posición (FEN)", ctx: txt.slice(0, 40), run: () => { closeModals(); loadFen(txt); } });
  if (txt.length >= 2 && txt.length <= 8 && !/\s/.test(txt)) {
    try {
      const lang = settings.notation === "en" ? "en" : settings.notation === "es" ? "es" : "auto";
      const { move } = Chess.parseMove(cur().state, txt, lang);
      if (move) {
        const L = Chess.legal(cur().state);
        const san = formatSan(Chess.san(cur().state, move, L), settings.lang, cur().state.t);
        out.push({ cat: "Jugada", icon: "♞", name: `Jugar ${san}`, ctx: "en el tablero", run: () => { closeModals(); if (!canUserMove()) { toast("Ahora no se puede mover."); return; } playMove(move, "user"); } });
      }
    } catch {}
  }
  return out;
}
/* Todas las palabras tienen que aparecer; puntúa más lo que empieza por ellas y lo que está en el nombre */
function cmdSearch(q) {
  const words = cmdNorm(q).split(" ").filter(Boolean);
  if (!words.length) return Cmd.items.filter(it => it.cat === "Función" && it.icon === "⚡").slice(0, 14);
  const scored = [];
  for (const it of Cmd.items) {
    let score = 0, ok = true;
    for (const w of words) {
      const i = it.hay.indexOf(w);
      if (i < 0) { ok = false; break; }
      const inName = it.nm.indexOf(w);
      score += inName === 0 ? 6 : inName > 0 && it.nm[inName - 1] === " " ? 4 : inName > 0 ? 2 : it.hay[i - 1] === " " || i === 0 ? 1 : 0.5;
    }
    if (!ok) continue;
    if (it.icon === "⚡") score += 1.5;
    if (it.game) score -= 0.5;
    scored.push([score, it]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, 40).map(x => x[1]);
}
function cmdRender() {
  const q = $("cmdInput").value;
  Cmd.shown = cmdSpecial(q).concat(cmdSearch(q));
  Cmd.sel = Math.min(Cmd.sel, Math.max(0, Cmd.shown.length - 1));
  const list = $("cmdList");
  list.innerHTML = Cmd.shown.length ? Cmd.shown.map((it, i) => `<li role="option" id="cmdOpt${i}" data-i="${i}" class="cmd-item${i === Cmd.sel ? " sel" : ""}" aria-selected="${i === Cmd.sel}">
      <span class="cmd-ico" aria-hidden="true">${esc(it.icon)}</span><span class="cmd-name">${esc(it.name)}${it.ctx ? ` <span class="small">· ${esc(it.ctx)}</span>` : ""}</span>
      ${it.key ? `<kbd>${esc(it.key)}</kbd>` : ""}<span class="cmd-cat small">${esc(it.cat)}</span></li>`).join("")
    : `<li class="small cmd-empty">Nada con «${esc(q)}». Prueba con otras palabras (por ejemplo «radar», «siciliana», «Carlsen» o una jugada como «Cf3»).</li>`;
  $("cmdInput").setAttribute("aria-activedescendant", Cmd.shown.length ? "cmdOpt" + Cmd.sel : "");
  const sel = list.querySelector(".sel");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}
function cmdRun(i) {
  const it = Cmd.shown[i];
  if (!it) return;
  try { LS.set("ajedrezCmdUltimo", it.name); } catch {}
  closeModals();
  setTimeout(() => it.run(), 0);
}
function openCommands() {
  cmdBuild();
  Cmd.sel = 0;
  $("cmdInput").value = "";
  openModal("cmdModal");
  cmdRender();
  $("cmdInput").focus();
}
$("cmdInput").addEventListener("input", () => { Cmd.sel = 0; cmdRender(); });
$("cmdInput").addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); Cmd.sel = Math.min(Cmd.shown.length - 1, Cmd.sel + 1); cmdRender(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); Cmd.sel = Math.max(0, Cmd.sel - 1); cmdRender(); }
  else if (e.key === "Enter") { e.preventDefault(); cmdRun(Cmd.sel); }
});
$("cmdList").addEventListener("click", e => { const li = e.target.closest("[data-i]"); if (li) cmdRun(+li.dataset.i); });
$("cmdBtn").onclick = openCommands;
/* Ctrl + K (⌘ + K en Mac) desde cualquier sitio; «/» cuando no se está escribiendo */
document.addEventListener("keydown", e => {
  const a = document.activeElement;
  const typing = !!a && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName) && a.offsetParent !== null && !["checkbox", "radio", "range"].includes(a.type);
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); if ($("cmdModal").classList.contains("open")) closeModals(); else openCommands(); return; }
  if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector(".modal-back.open") && !editor.active) { e.preventDefault(); openCommands(); }
});
