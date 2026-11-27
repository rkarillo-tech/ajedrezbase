/* ---------- 19b. Recorrido guiado: importar → analizar → revisar → practicar ----------
   Las funciones ya existen; lo difícil era saber en qué orden usarlas. Encima de la lista de jugadas aparece una
   sugerencia del siguiente paso, que se puede ignorar o cerrar (✖) y que no interrumpe nada:
     1. tras importar: «✔ Partida cargada · 32 jugadas» y «🤖 Analizar y comentar»;
     2. al terminar el análisis: cuántos errores hay, «📍 Revisar el primer momento crítico» y «🎯 Practicar»;
     3. mientras revisas: «Momento 1 de 3» con «▶ Siguiente momento» y «🎯 Practicar».
   Se quita al cambiar de partida, al empezar a practicar o en un ejercicio, contra la CPU o en una lección, y se
   puede desactivar en ⚙ Ajustes › 🎨 Apariencia. */
const Flow = { step: "", game: null, count: 0, moments: [], i: -1, closed: false };

function flowReset() { Object.assign(Flow, { step: "", game: null, count: 0, moments: [], i: -1, closed: false }); renderFlow(); }
/* Lo llama importResultMsg con el resultado de leer la partida */
function flowImported(r) {
  if (!r || !r.count || r.game !== game) return;
  Object.assign(Flow, { step: "imported", game, count: Pgn.mainlineFrom(game.root).length, moments: [], i: -1, closed: false, error: r.error ? r.error.label : "" });
  renderFlow();
}
/* Al abrir una partida de la biblioteca: si no está analizada, analizarla; si lo está, ver su informe (se rehace al
   momento con las evaluaciones guardadas) y practicar sus errores; y si le toca repaso, entrenarla */
function flowLibrary(rec) {
  if (!rec || ui.libId !== rec.id) return;
  const line = Pgn.mainlineFrom(game.root);
  const evals = line.filter(n => n.eval).length;   // las guardadas vuelven del PGN como [%eval]
  const A = rec.analysis, errs = A && A.err ? A.err.length : 0;
  Object.assign(Flow, { step: "library", game, count: line.length, moments: [], i: -1, closed: false, error: "",
    lib: { title: rec.title, analysed: line.length > 0 && (!!analysisOf(game) || evals >= line.length * 0.9), errs, due: !!(rec.srs && rec.srs.due <= Date.now()), rep: (rec.tags || []).includes("repertorio") } });
  renderFlow();
}
function flowAnalysing() { if (Flow.game === game) { Flow.step = "analysing"; renderFlow(); } }
function flowAnalysisCancelled() { if (Flow.game === game && Flow.step === "analysing") { Flow.step = "imported"; renderFlow(); } }
/* Al terminar «🤖 Analizar y comentar» (también si la partida no venía de importar: el análisis es el paso 2) */
function flowAnalysed() {
  const R = ui.report;
  if (!R) return;
  const depth = n => Pgn.pathTo(n).length;
  const moments = R.key.map(x => x.n).filter(n => n.parent).sort((a, b) => depth(a) - depth(b));
  Object.assign(Flow, { step: "analysed", game, moments, i: -1, closed: Flow.game === game ? Flow.closed : false });
  renderFlow();
}
/* El bando del usuario, si su nombre está en «Mis nombres» (⚙ Ajustes o 📊 Estadísticas); si no, 0 = los dos */
function flowMySide() {
  try { return colorOfMe({ white: game.headers.White || "", black: game.headers.Black || "" }, myNameList()); } catch { return 0; }
}
/* Tras «🔬 Más a fondo» el informe se rehace y los momentos críticos pueden cambiar: se recuentan y, si la jugada
   que estabas revisando ya no lo es, se dice y «Siguiente momento» lleva al siguiente que sí lo sea */
function flowRefreshMoments() {
  if (Flow.game !== game || !ui.report || !["analysed", "reviewing"].includes(Flow.step)) return;
  const depth = n => Pgn.pathTo(n).length, was = Flow.off || Flow.moments[Flow.i];
  Flow.moments = ui.report.key.map(x => x.n).filter(n => n.parent).sort((a, b) => depth(a) - depth(b));
  Flow.off = null;
  if (Flow.step === "reviewing" && was) {
    const j = Flow.moments.indexOf(was);
    if (j >= 0) Flow.i = j;
    else { Flow.off = was; Flow.i = Flow.moments.filter(n => depth(n) < depth(was)).length - 1; }
  }
  renderFlow();
}
function flowGo(i) {
  const n = Flow.moments[i];
  if (!n) return;
  Flow.off = null;
  Flow.i = i;
  Flow.step = "reviewing";
  goTo(n);
  renderFlow();
}
function flowPractice() {
  const side = flowMySide();
  const q = mistakesOf(side);
  Flow.step = "";
  renderFlow();
  startRetry(q.length ? side : 0);
}
function renderFlow() {
  const box = $("flowGuide");
  if (!box) return;
  const hide = settings.flowGuide === false || !Flow.step || Flow.closed || Flow.game !== game || quiz() || editor.active || ui.cpu.on || ui.lesson || Retry.active || (typeof Coach !== "undefined" && Coach.active);
  if (hide) { box.hidden = true; box.innerHTML = ""; return; }
  const side = flowMySide(), mine = mistakesOf(side).length, all = mistakesOf(0).length;
  const practice = (all ? `<button type="button" class="sm-btn${Flow.step === "reviewing" ? " primary" : ""}" data-flow="practice" title="Repasa como ejercicio los errores (? y ??): buscas tú la jugada buena">🎯 Practicar ${side && mine ? `mis errores (${mine})` : `los errores (${all})`}</button>` : "");
  const close = `<button type="button" class="flow-close" data-flow="close" title="Ocultar esta sugerencia (se desactiva del todo en ⚙ Ajustes › 🎨 Apariencia)" aria-label="Ocultar la sugerencia">✖</button>`;
  let html = "";
  if (Flow.step === "library") {
    const L = Flow.lib || {};
    if (L.rep) { box.hidden = true; box.innerHTML = ""; return; }   // los repertorios tienen su propio entrenamiento
    html = `<span class="flow-msg">📚 <b>${esc(L.title || "Partida de tu biblioteca")}</b> · ${Flow.count} jugada${Flow.count === 1 ? "" : "s"} · ${L.analysed ? `analizada${L.errs ? ` · ${L.errs} error${L.errs === 1 ? "" : "es"}` : ""}` : "sin analizar"}${L.due ? " · 📅 le toca repaso" : ""}</span>
      <span class="flow-next">Siguiente paso: ${L.analysed
        ? `<button type="button" class="sm-btn primary" data-flow="report" title="El informe se rehace al momento con las evaluaciones guardadas, sin volver a calcular">📋 Ver el informe y sus momentos críticos</button>`
        : `<button type="button" class="sm-btn primary" data-flow="analyse" title="El motor evalúa cada jugada, marca los errores y escribe comentarios">🤖 Analizar y comentar</button>`}${L.due ? ` <button type="button" class="sm-btn" data-flow="train" title="Repasa la partida jugando tú sus jugadas (repetición espaciada)">🎯 Repasarla</button>` : ""}</span>`;
  } else if (Flow.step === "imported") {
    const n = Flow.count;
    html = `<span class="flow-msg">✔ <b>Partida cargada</b> · ${n} jugada${n === 1 ? "" : "s"}${Flow.error ? ` · ⚠ se detuvo en «${esc(Flow.error)}»` : ""}</span>
      <span class="flow-next">Siguiente paso: <button type="button" class="sm-btn primary" data-flow="analyse" title="El motor evalúa cada jugada, marca los errores y escribe comentarios">🤖 Analizar y comentar</button></span>`;
  } else if (Flow.step === "analysing") {
    html = `<span class="flow-msg">⏳ <b>Analizando la partida…</b> Cuando termine, podrás revisar los momentos críticos y practicar los errores.</span>`;
  } else if (Flow.step === "analysed") {
    const k = Flow.moments.length;
    html = `<span class="flow-msg">✔ <b>Análisis terminado</b> · ${k ? `${k} momento${k === 1 ? "" : "s"} crítico${k === 1 ? "" : "s"}` : "ningún momento crítico: ninguna jugada cambió el rumbo de la partida"}${all ? ` · ${all} error${all === 1 ? "" : "es"} para practicar` : ""}</span>
      <span class="flow-next">${k ? `Siguiente paso: <button type="button" class="sm-btn primary" data-flow="first" title="Lleva el tablero a la primera jugada que cambió el rumbo de la partida">📍 Revisar el primer momento crítico</button>` : ""}${practice}</span>`;
  } else if (Flow.step === "reviewing") {
    const k = Flow.moments.length, n = Flow.off || Flow.moments[Flow.i];
    const lbl = n && n.parent ? numPrefix(n.parent.state) + dispSan(n) + (n.nag || "") : "";
    html = Flow.off
      ? `<span class="flow-msg">📍 Tras recalcularla, <b>${esc(lbl)}</b> ya no es un momento crítico. ${k ? `Quedan ${k} momento${k === 1 ? "" : "s"} crítico${k === 1 ? "" : "s"}.` : "No queda ningún momento crítico."}</span>`
      : `<span class="flow-msg">📍 <b>Momento crítico ${Flow.i + 1} de ${k}</b>${lbl ? `: <button type="button" class="link-btn" data-flow="here" title="Volver a esta jugada">${esc(lbl)}</button>` : ""}. Lee el comentario y prueba la buena en el tablero.</span>`;
    html += `
      <span class="flow-next">${Flow.i + 1 < k ? `<button type="button" class="sm-btn" data-flow="next">▶ Siguiente momento</button>` : `<span class="small">Era el último.</span>`}${practice ? ` ${Flow.i + 1 < k ? "" : "Siguiente paso: "}${practice}` : ""}</span>`;
  }
  box.innerHTML = html + close;
  box.hidden = false;
}
$("flowGuide").addEventListener("click", e => {
  const b = e.target.closest("[data-flow]");
  if (!b) return;
  const a = b.dataset.flow;
  if (a === "close") { Flow.closed = true; renderFlow(); }
  else if (a === "analyse") analyseGame();
  else if (a === "report") { if (!showStoredReport()) analyseGame(); }
  else if (a === "train") { Flow.step = ""; renderFlow(); startTraining({}); }
  else if (a === "first") flowGo(0);
  else if (a === "next") flowGo(Flow.i + 1);
  else if (a === "here") flowGo(Flow.i);
  else if (a === "practice") flowPractice();
});
$("setFlowGuide").checked = settings.flowGuide !== false;
$("setFlowGuide").onchange = e => { settings.flowGuide = e.target.checked; saveSettings(); renderFlow(); };
