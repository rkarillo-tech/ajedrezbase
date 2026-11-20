/* ---------- 27c. Modo básico, estado de los servicios, comparar dos posiciones y espacios de trabajo (1.59) ---------- */

/* 🌱 Modo básico: menos botones a la vista (dibujar flechas, variantes, exportar, herramientas del motor, cabeceras PGN,
   escribir la jugada, comparar posiciones, la planilla y las líneas del motor salvo la mejor). Nada desaparece de la
   aplicación: todo sigue en el buscador (Ctrl+K) y en ⚙ Ajustes. */
function setUiMode(mode, save = true) {
  settings.uiMode = mode === "basic" ? "basic" : "full";
  document.body.classList.toggle("ui-basic", settings.uiMode === "basic");
  if ($("setUiMode")) $("setUiMode").value = settings.uiMode;
  if (save) saveSettings();
}
$("setUiMode").onchange = e => { setUiMode(e.target.value); toast(settings.uiMode === "basic" ? "🌱 Modo básico: menos botones. Lo demás sigue en 🔎 Buscar y en ⚙ Ajustes." : "🧰 Modo completo: todas las herramientas a la vista.", 4000); };
setUiMode(settings.uiMode, false);

/* ---------- 🔌 Estado de los servicios ---------- */
function servicesState() {
  const rows = [], ok = (icon, title, text, act) => rows.push({ lvl: "ok", icon, title, text, act }), warn = (icon, title, text, act) => rows.push({ lvl: "warn", icon, title, text, act }), off = (icon, title, text, act) => rows.push({ lvl: "off", icon, title, text, act });
  const online = navigator.onLine !== false;
  // Motor
  if (!Engine.ready) warn("⚙", "Motor", "Cargando…", null);
  else if (Engine.kind === "stockfish") ok("⚙", "Motor", `${Engine.name}${Engine.fromCache ? " (copia guardada en este navegador: funciona sin conexión)" : ""}${Engine.note ? ` · ⚠ ${Engine.note}` : ""}`, ["motor", "Ver el estado"]);
  else warn("⚙", "Motor", `${Engine.name || "Motor interno"}: funciona sin conexión, pero es más débil que Stockfish.${(Engine.fails || []).length ? " Stockfish no se ha podido cargar." : ""}`, ["motor", "Ver por qué"]);
  // Conexión
  if (online) ok("🌐", "Conexión", "Hay conexión a internet.", null);
  else warn("🌐", "Conexión", "Sin conexión: funcionan el tablero, el motor, la biblioteca, los cursos y los problemas; no el explorador de Lichess, la nube ni la IA de Claude o Gemini.", null);
  // Profesor IA
  const p = aiProvider();
  if (!p) off("🤖", "Profesor IA", "Desactivado. Es opcional: elige un proveedor para preguntarle sobre las posiciones.", ["ia", "Configurar"]);
  else if (p === "ollama") ok("🤖", "Profesor IA", `Ollama en tu ordenador (${aiModel() || "sin modelo elegido"})${aiWatchOn() ? " · ⚡ vigilancia en una sola consulta" : ""}. Pulsa «Probar» en Ajustes para comprobar que responde.`, ["ia", "Probar"]);
  else if (!settings.aiKey) warn("🤖", "Profesor IA", `${AI_PROVIDERS[p].name.split(" (")[0]}: falta la clave.`, ["ia", "Poner la clave"]);
  else (online ? ok : warn)("🤖", "Profesor IA", `${AI_PROVIDERS[p].name.split(" (")[0]} (${aiModel()})${online ? "" : ": sin conexión no responderá"}.`, ["ia", "Probar"]);
  // Lichess
  const wait = typeof Lichess !== "undefined" && Lichess.waitSeconds ? Lichess.waitSeconds() : 0;
  if (wait) warn("♞", "Lichess", `Ha pedido una pausa: se podrá volver a consultar en ${wait} s.`, null);
  else if (settings.token) (online ? ok : warn)("♞", "Lichess", `Con tu token: explorador de maestros y de partidas online${online ? "" : " (sin conexión, no disponible)"}.`, ["datos", "Ver"]);
  else off("♞", "Lichess", "Sin token: el explorador usa sólo tus partidas. Con un token gratuito tendrás las partidas de maestros y de Lichess.", ["datos", "Poner el token"]);
  // Sincronización
  const sync = typeof syncState !== "undefined" ? syncState : "none";
  if (sync === "ok") ok("🔄", "Sincronización", "Vinculada a un archivo: tus partidas y tu progreso viajan entre dispositivos.", ["datos", "Ver"]);
  else if (sync === "perm") warn("🔄", "Sincronización", "Hace falta volver a dar permiso al archivo vinculado.", ["datos", "Dar permiso"]);
  else if (sync === "unsupported") off("🔄", "Sincronización", "Este navegador no permite vincular un archivo (usa Chrome o Edge en el ordenador).", null);
  else off("🔄", "Sincronización", "No vinculada (opcional).", ["datos", "Vincular"]);
  // Tablero 3D y sin conexión
  if (settings.board3d) (B3.ready ? ok : warn)("🧊", "Tablero 3D", B3.ready ? "Cargado." : online ? "Cargando…" : "Sin conexión no se puede descargar la primera vez.", null);
  if (servedOverHttp()) (navigator.serviceWorker && navigator.serviceWorker.controller ? ok : warn)("💾", "Uso sin conexión", navigator.serviceWorker && navigator.serviceWorker.controller ? "La aplicación está guardada para abrirse sin conexión." : "Todavía no está guardada para usarse sin conexión (lo estará tras recargar con conexión).", null);
  else ok("💾", "Uso sin conexión", "Es el archivo de la aplicación: se abre sin conexión.", null);
  return rows;
}
function renderServicesDot() {
  const dot = $("servicesDot");
  if (!dot) return;
  let rows;
  try { rows = servicesState(); } catch { return; }
  const bad = !Engine.ready && Date.now() - (window.__t0 || 0) > 30000;
  const warnN = rows.filter(r => r.lvl === "warn").length;
  dot.className = "svc-dot " + (bad ? "bad" : warnN ? "warn" : "ok");
  $("servicesBtn").title = `Estado de los servicios: ${warnN ? `${warnN} aviso${warnN === 1 ? "" : "s"}` : "todo bien"} (motor, profesor IA, conexión, Lichess, sincronización…)`;
}
function renderServices() {
  const rows = servicesState();
  $("servicesList").innerHTML = rows.map((r, i) => `<div class="svc-row"><span>${r.lvl === "ok" ? "🟢" : r.lvl === "warn" ? "🟠" : "⚪"}</span><div><b>${r.icon} ${esc(r.title)}</b>${esc(r.text)}</div>${r.act ? `<button class="sm-btn" data-svc="${i}" type="button">${esc(r.act[1])}</button>` : "<span></span>"}</div>`).join("");
  $("servicesList").querySelectorAll("[data-svc]").forEach(b => b.onclick = () => { const r = rows[+b.dataset.svc]; closeModals(); openSettings(r.act[0]); });
}
window.__t0 = Date.now();
$("servicesBtn").onclick = () => { renderServices(); openModal("servicesModal"); };
window.addEventListener("online", renderServicesDot);
window.addEventListener("offline", renderServicesDot);
setInterval(renderServicesDot, 4000);
setTimeout(renderServicesDot, 500);

/* ---------- ⚖ Comparar dos posiciones ----------
   Fijas una posición (A) y comparas con la del tablero (B): material, estructura de peones, qué piezas han cambiado de
   sitio, enroques, valoración y, si una sale de la otra, las jugadas entre ambas. Sirve para estudiar un plan: cómo
   queda la posición después de una secuencia. */
const Cmp = { a: null, ev: new Map() };
const CMP_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function cmpMaterial(s) {
  let w = 0, b = 0;
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (p === "." || p.toLowerCase() === "k") continue; if (p === p.toUpperCase()) w += CMP_VAL[p.toLowerCase()]; else b += CMP_VAL[p]; }
  return w - b;
}
const cmpMatText = d => (d === 0 ? "igualdad" : `${d > 0 ? "+" : "−"}${Math.abs(d)} para las ${d > 0 ? "blancas" : "negras"}`);
/* Qué piezas han cambiado de casilla, por tipo y color (con su nombre en notación española) */
function cmpPieces(sa, sb) {
  const out = [], LET = { k: "R", q: "D", r: "T", b: "A", n: "C", p: "" };
  for (const p of "KQRBNPkqrbnp") {
    const A = [], B = [];
    for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (sa.b[i] === p && sb.b[i] !== p) A.push(Chess.sqName(i)); if (sb.b[i] === p && sa.b[i] !== p) B.push(Chess.sqName(i)); }
    if (!A.length && !B.length) continue;
    const name = (p === p.toUpperCase() ? "⚪" : "⚫") + (LET[p.toLowerCase()] || "peón ");
    // Se empareja cada casilla de A con la más cercana de B; un peón sólo puede seguir en su columna o pasar a la de al lado
    const pawn = p.toLowerCase() === "p", fx = q => q.charCodeAt(0), ry = q => +q[1];
    const pairs = [], usedB = new Set();
    const cand = [];
    A.forEach((qa, i) => B.forEach((qb, j) => { const df = Math.abs(fx(qa) - fx(qb)), dr = Math.abs(ry(qa) - ry(qb)); if (!pawn || df <= 1) cand.push({ i, j, d: Math.max(df, dr) }); }));
    cand.sort((x, y) => x.d - y.d);
    const usedA = new Set();
    for (const c of cand) if (!usedA.has(c.i) && !usedB.has(c.j)) { usedA.add(c.i); usedB.add(c.j); pairs.push([A[c.i], B[c.j]]); }
    for (const [qa, qb] of pairs) out.push(`${name}${qa} → ${qb}`);
    A.forEach((q, i) => { if (!usedA.has(i)) out.push(`${name}${q} ✗ (ya no está)`); });
    B.forEach((q, j) => { if (!usedB.has(j)) out.push(`${name}${q} (nueva)`); });
  }
  return out;
}
function cmpLabel(n) { return n.parent ? `tras ${numPrefix(n.parent.state)}${dispSan(n)}` : "posición inicial"; }
function renderCmp() {
  const box = $("cmpBody");
  if (!box || !$("cmpBox").open) return;
  const a = Cmp.a && Cmp.a.g === game ? Cmp.a.node : null, b = cur();
  if (!a) {
    box.innerHTML = `<p class="small">Fija la posición del tablero como <b>A</b>; después ve a otra (más adelante en la partida, en una variante o probando jugadas) y verás aquí qué ha cambiado: material, estructura de peones, piezas, enroques y valoración.</p>
      <div class="controls"><button class="sm-btn primary" id="cmpSetA" type="button">📍 Fijar esta posición como A</button></div>`;
    $("cmpSetA").onclick = () => { Cmp.a = { g: game, node: cur() }; renderCmp(); };
    return;
  }
  const sa = a.state, sb = b.state, same = a === b;
  const path = (() => { const p = Pgn.pathTo(b); const i = p.indexOf(a); return i >= 0 ? p.slice(i + 1).map(n => n.uci) : null; })();
  const stA = structInfo(pawnStruct(sa.b)), stB = structInfo(pawnStruct(sb.b));
  const ev = n => { const e = n.eval || Cmp.ev.get(n); return e ? fmtEval(e) : "—"; };
  const castle = s => [s.c & 3 ? "⚪ puede enrocar" : "⚪ sin enroque", s.c & 12 ? "⚫ puede enrocar" : "⚫ sin enroque"].join(" · ");
  const pieces = same ? [] : cmpPieces(sa, sb);
  box.innerHTML = `<div class="cmp-grid">
      <div>${miniBoard(Chess.toFen(sa))}<div class="cmp-cap"><b>A</b>: ${esc(cmpLabel(a))}</div></div>
      <div>${miniBoard(Chess.toFen(sb))}<div class="cmp-cap"><b>B</b> (tablero): ${esc(cmpLabel(b))}</div></div>
      <div class="cmp-info">${same ? `<p class="small">Ahora mismo A y B son la misma posición: ve a otra jugada (o prueba jugadas) para compararlas.</p>` : path ? `<p class="small">De A a B: <b>${esc(lineText(sa, path, 30))}</b> (${path.length} media${path.length === 1 ? "" : "s"} jugada${path.length === 1 ? "" : "s"}).</p>` : `<p class="small">B no sale de A en esta partida (otra variante o una posición anterior).</p>`}
        <table class="cmp-table"><tr><th></th><th>A</th><th>B</th></tr>
          <tr><td>Material</td><td>${esc(cmpMatText(cmpMaterial(sa)))}</td><td>${esc(cmpMatText(cmpMaterial(sb)))}</td></tr>
          <tr><td>Estructura</td><td>${esc(stA ? stA.name : "sin estructura típica")}</td><td>${esc(stB ? stB.name : "sin estructura típica")}</td></tr>
          <tr><td>Valoración</td><td>${esc(ev(a))}</td><td>${esc(ev(b))}</td></tr>
          <tr><td>Enroque</td><td class="small">${esc(castle(sa))}</td><td class="small">${esc(castle(sb))}</td></tr>
          <tr><td>Turno</td><td>${sa.t === 1 ? "blancas" : "negras"}</td><td>${sb.t === 1 ? "blancas" : "negras"}</td></tr>
        </table>
        ${pieces.length ? `<p class="small"><b>Qué ha cambiado:</b> ${pieces.slice(0, 16).map(esc).join(" · ")}${pieces.length > 16 ? " …" : ""}</p>` : ""}
      </div></div>
    <div class="controls">
      <button class="sm-btn" id="cmpGoA" type="button">↩ Ir a A</button>
      <button class="sm-btn" id="cmpSetA2" type="button" title="La posición del tablero pasa a ser A">📍 Fijar el tablero como A</button>
      ${ev(a) === "—" || ev(b) === "—" ? `<button class="sm-btn info-btn" id="cmpEval" type="button">⚙ Valorar con el motor</button>` : ""}
      <button class="sm-btn" id="cmpClear" type="button">✖ Quitar A</button>
    </div>`;
  $("cmpGoA").onclick = () => goTo(a);
  $("cmpSetA2").onclick = () => { Cmp.a = { g: game, node: cur() }; renderCmp(); };
  $("cmpClear").onclick = () => { Cmp.a = null; renderCmp(); };
  if ($("cmpEval")) $("cmpEval").onclick = async () => {
    $("cmpEval").disabled = true; $("cmpEval").textContent = "⏳ Valorando…";
    for (const n of [a, b]) if (!n.eval && !Cmp.ev.has(n)) { const r = await evalState(n.state, Engine.kind === "stockfish" ? 800 : 1200, 1); const l = r && r.lines && r.lines[0]; if (l) Cmp.ev.set(n, { cp: l.cp, mate: l.mate, winner: l.winner }); }
    renderCmp();
  };
}
$("cmpBox").addEventListener("toggle", renderCmp);

/* ---------- 🗂 Espacios de trabajo ----------
   Un espacio de trabajo guarda cómo tienes las herramientas para una actividad: análisis en vivo, flecha, líneas del
   motor, herramientas del motor, importar/exportar, colores, radar, coordenadas, modo de la interfaz y la pestaña.
   Hay tres de serie (Analizar, Jugar y Entrenar) y puedes guardar los tuyos (viajan con la sincronización). */
const WS_BUILTIN = [
  { id: "analizar", name: "📖 Analizar", cfg: { live: true, arrow: true, multipv: 3, engineTools: true, importOpen: false, moveColors: false, radar: false, coords: true, uiMode: "full", tab: "study" } },
  { id: "jugar", name: "🤖 Jugar", cfg: { live: false, arrow: false, multipv: 1, engineTools: false, importOpen: false, moveColors: false, radar: false, coords: true, uiMode: "basic", tab: "study" } },
  { id: "entrenar", name: "🎯 Entrenar", cfg: { live: false, arrow: false, multipv: 1, engineTools: false, importOpen: false, moveColors: false, radar: false, coords: true, uiMode: "basic", tab: "tools" } }
];
const wsList = () => WS_BUILTIN.concat((settings.workspaces || []).filter(w => w && w.id && w.cfg));
function wsCurrent() {
  return { live: !!settings.live, arrow: !!settings.arrow, multipv: +settings.multipv || 1, engineTools: !!settings.engineTools, importOpen: !!settings.importOpen,
    moveColors: !!settings.moveColors, radar: !!settings.radar, coords: !!settings.coords, uiMode: settings.uiMode || "full", tab: ui.activeTab || "study" };
}
/* Aplica un espacio de trabajo usando los mismos controles de la aplicación (así cada cambio tiene sus efectos) */
function wsApply(id) {
  const w = wsList().find(x => x.id === id);
  if (!w) return;
  const c = w.cfg, set = (elId, v) => { const el = $(elId); if (el && el.checked !== v) { el.checked = v; el.dispatchEvent(new Event("change")); } };
  set("liveToggle", !!c.live);
  set("arrowToggle", !!c.arrow);
  set("moveColorsToggle", !!c.moveColors);
  set("radarToggle", !!c.radar);
  set("setCoords", !!c.coords);
  if (c.multipv && $("setMultipv").value !== String(c.multipv)) { $("setMultipv").value = String(c.multipv); $("setMultipv").dispatchEvent(new Event("change")); }
  settings.engineTools = !!c.engineTools; setEngineTools(settings.engineTools);
  settings.importOpen = !!c.importOpen; $("importDetails").open = settings.importOpen;
  setUiMode(c.uiMode, false);
  settings.workspace = w.id;
  saveSettings();
  if (c.tab && c.tab !== ui.activeTab) switchTab(c.tab);
  renderWorkspaces();
  toast(`🗂 Espacio de trabajo «${w.name.replace(/^\S+\s/, "")}»`);
}
function renderWorkspaces(pick) {
  const sel = $("wsSelect");
  if (!sel) return;
  const list = wsList(), has = id => id && list.some(w => w.id === id);
  const cur = has(pick) ? pick : has(settings.workspace) ? settings.workspace : has(sel.value) ? sel.value : "analizar";
  sel.innerHTML = list.map(w => `<option value="${esc(w.id)}">${esc(w.name)}${w.builtin === false || !WS_BUILTIN.includes(w) ? "" : " (de serie)"}</option>`).join("");
  sel.value = cur;
  const builtin = WS_BUILTIN.some(w => w.id === sel.value);
  $("wsDelete").disabled = builtin;
  const w = list.find(x => x.id === sel.value), c = w && w.cfg;
  $("wsNote").textContent = c ? `${c.live ? "Análisis en vivo" : "Sin análisis en vivo"} · ${c.arrow ? "con flecha" : "sin flecha"} · ${c.multipv} línea${c.multipv === 1 ? "" : "s"} del motor · ${c.engineTools ? "herramientas desplegadas" : "herramientas plegadas"} · modo ${c.uiMode === "basic" ? "básico" : "completo"} · pestaña ${({ study: "Estudio", courses: "Cursos", explorer: "Aperturas", library: "Biblioteca", endgames: "Finales", tools: "Entrenar" })[c.tab] || c.tab}.` : "";
}
$("wsSelect").onchange = () => renderWorkspaces($("wsSelect").value);
$("wsApply").onclick = () => wsApply($("wsSelect").value);
$("wsSave").onclick = () => {
  const name = (prompt("Nombre del espacio de trabajo (por ejemplo «Preparar aperturas»):", "") || "").trim().slice(0, 40);
  if (!name) return;
  const list = (settings.workspaces || []).filter(w => w.name !== "🗂 " + name);
  const w = { id: "ws" + Date.now().toString(36), name: "🗂 " + name, cfg: wsCurrent() };
  settings.workspaces = list.concat(w).slice(-12);
  settings.workspace = w.id;
  saveSettings();
  renderWorkspaces();
  toast(`💾 Guardado el espacio de trabajo «${name}».`);
};
$("wsDelete").onclick = () => {
  const id = $("wsSelect").value, w = (settings.workspaces || []).find(x => x.id === id);
  if (!w || !confirm(`¿Borrar el espacio de trabajo «${w.name.replace(/^\S+\s/, "")}»?`)) return;
  settings.workspaces = settings.workspaces.filter(x => x.id !== id);
  if (settings.workspace === id) settings.workspace = "";
  saveSettings();
  renderWorkspaces();
};
renderWorkspaces();
