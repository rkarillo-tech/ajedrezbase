/* ---------- 19c. 🧭 Rutas: «¿Qué quieres hacer?» y la aplicación te guía paso a paso ----------
   Hay muchas herramientas y no siempre es fácil saber cuál usar ni en qué orden. Cada ruta es un objetivo
   (revisar una partida, estudiar una apertura, la táctica, los finales, una partida de un libro) dividido en pasos.
   Una tarjeta flotante dice qué hacer y por qué; «Llévame» abre la pestaña y resalta el botón, pero la acción la haces
   tú. El paso avanza solo cuando se cumple (se ha analizado, se ha guardado, terminó la sesión de problemas…), y si no
   se puede saber, con «Hecho». Se puede minimizar, saltar pasos o salir; si recargas la página, sigue donde ibas. */
const Route = { id: "", i: 0, min: false, events: new Map(), stepAt: 0, game0: null, timer: 0 };

/* Lo llaman las herramientas cuando pasa algo que puede completar un paso */
function routeEvent(name, detail) {
  if (!Route.id) return;
  Route.events.set(name, { t: Date.now(), detail });
  routeCheck();
}
const routeHad = (name, test) => { const e = Route.events.get(name); return !!e && e.t >= Route.stepAt && (!test || test(e.detail)); };
const routeGameLoaded = () => game !== Route.game0 && Pgn.mainlineFrom(game.root).length > 0;
const routeAnalysed = () => !!(ui.report && ui.analysedLine && ui.analysedLine[0] === game.root);
function routeTrain(view) { switchTab("tools"); openTrainSection(view); }

const ROUTES = [
  { id: "revisar", icon: "🔍", name: "Revisar una partida mía", desc: "Encontrar tus errores, entenderlos y practicarlos", steps: [
    { t: "Trae la partida", why: "Pégala en «Importar» (PGN o jugadas sueltas) o, si juegas en Lichess, tráela con tu usuario desde «📚 Biblioteca › 🗂 Abrir .pgn».",
      go: () => { switchTab("study"); $("importDetails").open = true; }, target: "#moveInput", done: routeGameLoaded },
    { t: "Analízala con el motor", why: "«🤖 Analizar y comentar» evalúa cada jugada, marca los errores (?! ? ??) y escribe comentarios. Arriba del informe verás con qué motor y cuánto tiempo se ha calculado.",
      go: () => switchTab("study"), target: "#autoAnnotateBtn", done: routeAnalysed },
    { t: "Revisa los momentos críticos", why: "Pulsa «📍 Revisar el primer momento crítico», encima de las jugadas. En cada uno, lee el comentario y prueba la buena en el tablero. Si dudas de un juicio, «🔬 Más a fondo» lo recalcula; «🧠 Piensa conmigo» explica la posición.",
      go: () => switchTab("study"), target: ["#flowGuide", "#reportExtra .rep-key", "#autoAnnotateBtn"], done: () => Flow.step === "reviewing" },
    { t: "Practica tus errores", why: "Repasa cada error como un ejercicio: desde la posición anterior, buscas tú la jugada buena. Es lo que más se fija en la memoria.",
      go: () => { switchTab("study"); $("reportBox").scrollIntoView({ block: "center" }); }, target: ["#retryStart", "#autoAnnotateBtn"], done: () => Retry.active || routeHad("practice-start") },
    { t: "Guárdala en tu biblioteca", why: "Ponle etiquetas (por ejemplo, «siciliana, torneo») y guárdala: tus errores pasarán a «🎯 Errores de tus partidas» y a tus estadísticas.",
      go: () => switchTab("study"), target: "#saveGame", done: () => !!ui.libId && !ui.dirty }
  ], next: "Cuando tengas varias partidas guardadas, «📚 Biblioteca › 📊 Estadísticas» te dirá en qué fallas más." },

  { id: "apertura", icon: "🌍", name: "Estudiar una apertura", desc: "Entender sus ideas, ver qué juegan los maestros y hacer tu repertorio", steps: [
    { t: "Elige la apertura", why: "Juega sus primeras jugadas en el tablero o búscala por nombre en la «Enciclopedia ECO», al final de la pestaña 🌍 Aperturas. Su nombre aparecerá arriba, junto al título.",
      go: () => switchTab("explorer"), target: "#ecoSearchInput", done: () => { const d = ECO.detect(cur()); return !!d; } },
    { t: "Lee la apertura explicada", why: "Pulsa el nombre de la apertura (arriba, junto al título) o el resumen de esta pestaña: verás sus ideas, los planes de cada bando y las trampas típicas.",
      go: () => switchTab("explorer"), target: "#ecoBanner", done: () => routeHad("opening-article") },
    { t: "Mira qué juegan los maestros", why: "La tabla del explorador dice qué jugadas se han jugado aquí, con qué resultados y qué opina el motor. Cambia entre Maestros, Lichess o tus partidas con el selector.",
      go: () => switchTab("explorer"), target: "#explorerMovesBody", done: null },
    { t: "Conoce las trampas y sorpresas", why: "«🔎 Buscar en esta posición» encuentra jugadas que el rival suele fallar y trampas habituales. También hay un curso de 🪤 Trampas en la pestaña Cursos.",
      go: () => switchTab("explorer"), target: "#surpriseBtn", done: () => routeHad("surprises") },
    { t: "Crea tu repertorio", why: "Ponle nombre y bando y pulsa «➕ Crear». Se guarda en tu biblioteca con lo que tengas en el tablero; añade las variantes que quieras recordar.",
      go: () => routeTrain("rep"), target: "#repNewBtn", done: () => routeHad("rep-created") },
    { t: "Entrénalo con repaso espaciado", why: "Elige tu repertorio en la lista y pulsa 🎯: te pedirá tus jugadas y te las volverá a preguntar más espaciadas cuanto mejor las sepas.",
      go: () => routeTrain("rep"), target: "#myRepSection", done: () => routeHad("rep-train") }
  ], next: "Para preparar una partida, «🌍 Aperturas › Preparar un rival» analiza las aperturas de su cuenta de Lichess." },

  { id: "tactica", icon: "🧩", name: "Mejorar la táctica", desc: "Problemas a tu nivel, tus temas flojos y tus propios errores", steps: [
    { t: "Mide tu nivel", why: "El examen son 15 problemas, con 90 segundos cada uno y sin pistas; al terminar estima tu nivel y los problemas se adaptan a él. Si ya lo hiciste, pulsa «Saltar».",
      go: () => routeTrain("puzzles"), target: "#examStartBtn", done: () => routeHad("exam-done") },
    { t: "Resuelve problemas a tu nivel", why: "Elige «Todos los temas» y pulsa «▶ Empezar». La dificultad sube o baja según aciertes.",
      go: () => routeTrain("puzzles"), target: "#puzzleStartBtn", done: () => routeHad("puzzles-done") },
    { t: "Trabaja tus temas flojos", why: "Debajo verás tus resultados por tema. Elige en «Tema» el que peor llevas y haz otra sesión solo de ese.",
      go: () => routeTrain("puzzles"), target: "#puzzleTheme", done: () => routeHad("puzzles-done", d => d && d.theme) },
    { t: "Practica los errores de tus partidas", why: "Si tienes partidas analizadas en la biblioteca, aquí repasas tus propios errores tácticos: son los que más te van a volver a salir.",
      go: () => routeTrain("drill"), target: "#drillDueBtn", done: () => routeHad("drill-start") },
    { t: "Haz de ello un hábito", why: "«📅 Hoy», al principio de la pestaña Entrenar, propone cada día una sesión corta con lo que te toca repasar. La contrarreloj sirve para ganar velocidad.",
      go: () => routeTrain("menu"), target: "#todayBox", done: null }
  ], next: "El «🧑‍🏫 Entrenador» prepara clases a tu medida con lo que más te cuesta." },

  { id: "finales", icon: "👑", name: "Estudiar finales", desc: "Los finales básicos, explicados y practicados contra la defensa perfecta", steps: [
    { t: "Aprende los finales básicos", why: "Abre el curso «👑 Finales» y sigue sus lecciones: cada una explica la idea y luego te deja practicarla.",
      go: () => { switchTab("courses"); const d = document.querySelector('#courseList details[data-course="finales"]'); if (d) d.open = true; }, target: '#courseList details[data-course="finales"]', done: () => routeHad("lesson", id => id === "finales") },
    { t: "Prueba un final fundamental", why: "En «👑 Finales», elige uno de los «Finales fundamentales (1 clic)»: se pone en el tablero con una nota sobre cómo se gana o se defiende.",
      go: () => switchTab("endgames"), target: "#endgamePresets", done: () => routeHad("endgame-preset") },
    { t: "Juégalo contra la defensa perfecta", why: "Activa «practicar contra la tabla» y haz tus jugadas: la tabla de Syzygy responde con la mejor defensa posible. Si no logras ganar, la tabla te dice qué jugada lo conseguía.",
      go: () => switchTab("endgames"), target: "#tbPractice", done: () => $("tbPractice").checked && cur() !== game.root },
    { t: "Consulta la tabla cuando dudes", why: "«🔍 Consultar posición» dice, para cada jugada, si gana, empata o pierde, y en cuántas jugadas. Funciona con 7 piezas o menos.",
      go: () => switchTab("endgames"), target: "#querySyzygyBtn", done: null }
  ], next: "En «📘 Cursos» también hay lecciones de mates y de geometría del tablero, que ayudan mucho en los finales." },

  { id: "libro", icon: "📖", name: "Estudiar una partida de un libro o de un maestro", desc: "Adivinar sus jugadas, compararlas con el motor y anotar lo aprendido", steps: [
    { t: "Carga la partida", why: "Pégala en «Importar»; puedes copiarla tal como viene en el libro, también en notación descriptiva (P4R, C3AR). En «📘 Cursos › Partidas comentadas» tienes clásicos ya anotados.",
      go: () => { switchTab("study"); $("importDetails").open = true; }, target: "#moveInput", done: routeGameLoaded },
    { t: "Adivina la jugada", why: "En «🔮 Adivina la jugada», elige el bando del ganador y pulsa «▶ Empezar»: piensas cada jugada antes de verla y comparas la tuya con la del maestro. Es la mejor forma de entrar en sus ideas.",
      go: () => routeTrain("guess"), target: "#guessStartBtn", done: () => routeHad("guess-done") },
    { t: "Compárala con el motor", why: "«🤖 Analizar y comentar» marca dónde el motor no está de acuerdo. No todo lo que el motor critica es un error en la práctica: lee el comentario del libro y el del motor.",
      go: () => switchTab("study"), target: "#autoAnnotateBtn", done: routeAnalysed },
    { t: "Anota lo que aprendas", why: "Escribe tus ideas en «Comentario de la posición» y marca con «📌 Marcar jugada» las posiciones que quieras repasar: después saldrán en «🧠 Tarjetas de tus marcadores».",
      go: () => switchTab("study"), target: "#annotation", done: () => routeHad("mark") || ui.dirty },
    { t: "Guárdala", why: "Guárdala en tu biblioteca con una etiqueta (por ejemplo, el nombre del libro). Si otro libro comenta la misma partida, se guardará como otra versión.",
      go: () => switchTab("study"), target: "#saveGame", done: () => !!ui.libId && !ui.dirty }
  ], next: "En «🎯 Entrenar › 🧠 Tarjetas de tus marcadores» repasarás las posiciones que has marcado." },

  { id: "rival", icon: "🎯", name: "Preparar una partida contra un rival", desc: "Ver qué aperturas juega, buscar sorpresas y ensayar la línea", steps: [
    { t: "Mira qué juega", why: "En «Preparar un rival», escribe su usuario de Lichess y pulsa «🔎 Preparar». Se descargan sus últimas partidas públicas (no hace falta contraseña).",
      go: () => switchTab("explorer"), target: "#rivalUser", done: () => routeHad("rival") },
    { t: "Elige la línea que vas a preparar", why: "El informe enseña sus aperturas con cada color, cómo le van, cómo suelen acabar sus partidas y qué líneas suyas no tienes en tu repertorio. Pulsa la que quieras preparar para ponerla en el tablero.",
      go: () => switchTab("explorer"), target: ["#rivalOut", "#rivalUser"], done: null },
    { t: "Busca sorpresas en esa línea", why: "«🔎 Buscar en esta posición» encuentra jugadas buenas que casi nadie juega y las respuestas en las que se suele fallar: justo lo que conviene llevar preparado.",
      go: () => switchTab("explorer"), target: "#surpriseBtn", done: () => routeHad("surprises") },
    { t: "Llévala a tu repertorio", why: "Crea un repertorio con esa línea (o añádela al que ya tengas) y entrénala: así la recordarás en la partida.",
      go: () => routeTrain("rep"), target: "#repNewBtn", done: () => routeHad("rep-created") || routeHad("rep-train") },
    { t: "Ensáyala contra la CPU", why: "Pon la línea en el tablero y abre «🤖 Jugar vs CPU» eligiendo «desde esta posición»: practicarás los planes que vienen después.",
      go: () => switchTab("study"), target: "#playCpuToggle", done: () => routeHad("cpu-start") }
  ], next: "Después de la partida, la ruta «🔍 Revisar una partida mía» te ayuda a sacarle partido." },

  { id: "diario", icon: "📅", name: "Mi entrenamiento diario", desc: "Una sesión corta cada día con lo que te toca repasar", steps: [
    { t: "Mira tu plan de hoy", why: "«📅 Hoy», arriba en la pestaña Entrenar, resume lo que te toca: problemas, una lección y los repasos pendientes, con tu racha de días.",
      go: () => routeTrain("menu"), target: "#todayBox", done: null },
    { t: "Haz la siguiente tarea", why: "«▶ Siguiente tarea» te lleva directamente a lo que toca ahora. Al terminar, vuelve a «Hoy» y pulsa otra vez hasta completarlo.",
      go: () => routeTrain("menu"), target: ["#todayNextBtn", "#todayBox"], done: () => routeHad("today-next") },
    { t: "Una clase con el entrenador", why: "El «🧑‍🏫 Entrenador» mira tus errores, elige qué trabajar y te prepara una clase corta con problemas y posiciones de tus partidas.",
      go: () => routeTrain("coach"), target: "#coachStartBtn", done: () => routeHad("coach-start") },
    { t: "Repasa tus errores", why: "«🎯 Errores de tus partidas» te pone las posiciones donde fallaste; las que aciertes volverán cada vez más espaciadas.",
      go: () => routeTrain("drill"), target: "#drillDueBtn", done: () => routeHad("drill-start") }
  ], next: "Vuelve mañana: la racha y los repasos espaciados hacen el resto." },

  { id: "calculo", icon: "🧠", name: "Mejorar el cálculo", desc: "Leer la posición con orden, visualizar sin mover y calcular antes de ver", steps: [
    { t: "Lee el tablero antes de calcular", why: "En cualquier posición (por ejemplo, la de un problema), «🔎 Lee el tablero» te guía por orden: material, reyes, amenazas del rival, tus oportunidades y jugadas forzadas.",
      go: () => { switchTab("study"); if ($("engineTools").hidden) setEngineTools(true); }, target: "#scanBtn", done: () => routeHad("scan") },
    { t: "Visualiza sin mover las piezas", why: "En «🙈 A ciegas y visualización», el ejercicio «Sigue la línea de memoria» te deja ver la posición, oculta las piezas y te pide seguir las jugadas de cabeza.",
      go: () => routeTrain("blind"), target: "#visStartBtn", done: () => routeHad("vis-done") },
    { t: "Juega con las piezas ocultas", why: "«🙈 Ocultar piezas» o una partida contra la CPU a ciegas: obliga a llevar la posición en la cabeza. Con «👁 Ojear» las ves un par de segundos.",
      go: () => routeTrain("blind"), target: "#blindBtn", done: () => routeHad("blind") || routeHad("cpu-start") },
    { t: "Calcula antes de ver la jugada", why: "«🔮 Adivina la jugada» con una partida de un maestro: calculas cada jugada antes de verla y comparas con la suya.",
      go: () => routeTrain("guess"), target: "#guessStartBtn", done: () => routeHad("guess-done") }
  ], next: "Los problemas sin pistas (el examen o la contrarreloj) también entrenan el cálculo." }
];
const routeDef = () => ROUTES.find(r => r.id === Route.id);

function routeSave() { LS.set("ajedrezRuta", Route.id ? { id: Route.id, i: Route.i, min: Route.min } : null); }
function routeStart(id) {
  const r = ROUTES.find(x => x.id === id);
  if (!r) return;
  Object.assign(Route, { id, i: 0, min: false, events: new Map(), stepAt: Date.now(), game0: game });
  routeSave();
  routeRender();
  routeGo();
}
function routeExit() {
  routeHighlight(null);
  Object.assign(Route, { id: "", i: 0, min: false, events: new Map() });
  routeSave();
  routeRender();
}
function routeStep(i) {
  const r = routeDef();
  if (!r) return;
  Route.i = Math.max(0, Math.min(i, r.steps.length));
  Route.min = false;   // el paso nuevo se ve entero
  Route.stepAt = Date.now();
  Route.game0 = game;
  routeSave();
  routeHighlight(null);
  routeRender();
}
/* «Llévame»: abre la pestaña y resalta el botón (no lo pulsa) */
function routeGo() {
  const r = routeDef(), s = r && r.steps[Route.i];
  if (!s) return;
  try { s.go && s.go(); } catch {}
  // En el móvil la tarjeta tapa media pantalla: se queda en la pastilla para que se vea lo resaltado
  if (matchMedia("(max-width: 640px)").matches) { Route.min = true; routeSave(); routeRender(); }
  routeHighlight(s.target);
}
/* sel: un selector o una lista; se resalta el primero que se vea (si no es el primero, es que falta un paso anterior) */
const routeVisible = sel => [].concat(sel || []).map(x => document.querySelector(x)).find(el => el && el.getClientRects().length) || null;
function routeDodge() {
  const box = $("routeCard"), el = document.querySelector(".route-target");
  box.classList.remove("route-left");
  if (!el || box.hidden || Route.min) return;
  const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  if (a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) box.classList.add("route-left");
}
function routeHighlight(sel) {
  document.querySelectorAll(".route-target").forEach(el => el.classList.remove("route-target"));
  if (!sel) return;
  const el = routeVisible(sel);
  if (!el) return;
  if (Array.isArray(sel) && el !== document.querySelector(sel[0]) && el.id === "autoAnnotateBtn") toast("🧭 Antes hace falta analizar la partida: pulsa «🤖 Analizar y comentar».", 4000);
  el.classList.add("route-target");
  // En el tercio de arriba de la pantalla, para que la tarjeta (abajo) no lo tape
  el.scrollIntoView({ block: "nearest" });
  const top = el.getBoundingClientRect().top + scrollY - innerHeight * 0.22;
  scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  // Si aun así la tarjeta lo tapa (está al final de la página), la tarjeta se pasa al otro lado
  setTimeout(routeDodge, 650);
}
/* Se mira cada poco (y cuando una herramienta avisa) si el paso actual ya se ha cumplido */
function routeCheck() {
  const r = routeDef(), s = r && r.steps[Route.i];
  if (!s || !s.done) return;
  let ok = false;
  try { ok = s.done(); } catch {}
  if (ok) { routeStep(Route.i + 1); if (Route.i < r.steps.length) toast(`🧭 ¡Hecho! Paso ${Route.i + 1}: ${r.steps[Route.i].t}`, 3500); }
}
function routeRender() {
  const box = $("routeCard");
  clearInterval(Route.timer);
  if (!Route.id && !box.dataset.menu) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  if (!Route.id) {   // el menú: «¿Qué quieres hacer?»
    box.className = "route-card";
    box.innerHTML = `<div class="route-head"><b>🧭 ¿Qué quieres hacer?</b><button type="button" class="route-x" data-route="close" aria-label="Cerrar">✖</button></div>
      <div class="small">Elige un objetivo y te guío paso a paso por las herramientas que sirven para eso.</div>
      <div class="route-list">${ROUTES.map(x => `<button type="button" class="train-card" data-route-start="${x.id}"><span class="tc-ico" aria-hidden="true">${x.icon}</span><span class="tc-body"><b>${esc(x.name)}</b><span class="small">${esc(x.desc)} · ${x.steps.length} pasos</span></span></button>`).join("")}</div>`;
    return;
  }
  const r = routeDef(), n = r.steps.length;
  Route.timer = setInterval(routeCheck, 800);
  if (Route.min) {
    box.className = "route-card route-min";
    box.innerHTML = `<button type="button" class="route-pill" data-route="max" title="Ver el paso">🧭 ${esc(r.name)} · ${Route.i < n ? `paso ${Route.i + 1} de ${n}` : "terminada"}</button>`;
    return;
  }
  box.className = "route-card";
  const head = `<div class="route-head"><b>${r.icon} ${esc(r.name)}</b><span><button type="button" class="route-x" data-route="min" title="Minimizar" aria-label="Minimizar">—</button><button type="button" class="route-x" data-route="exit" title="Salir de la ruta" aria-label="Salir de la ruta">✖</button></span></div>`;
  if (Route.i >= n) {
    box.innerHTML = head + `<div class="route-step"><b>🎉 Ruta terminada.</b> ${esc(r.next || "")}</div>
      <div class="controls"><button type="button" class="sm-btn primary" data-route="menu">🧭 Otra ruta</button><button type="button" class="sm-btn" data-route="exit">Cerrar</button></div>`;
    return;
  }
  const s = r.steps[Route.i];
  const dots = r.steps.map((x, k) => `<span class="route-dot${k < Route.i ? " done" : k === Route.i ? " cur" : ""}" title="${esc(x.t)}"></span>`).join("");
  box.innerHTML = head + `<div class="route-dots" aria-label="Paso ${Route.i + 1} de ${n}">${dots}<span class="small">Paso ${Route.i + 1} de ${n}</span></div>
    <div class="route-step"><b>${esc(s.t)}</b><div class="small">${esc(s.why)}</div></div>
    <div class="controls"><button type="button" class="sm-btn primary" data-route="go" title="Abre la pestaña y resalta lo que hay que pulsar">👉 Llévame</button>${s.done ? `<button type="button" class="sm-btn" data-route="skip" title="Pasar al siguiente sin hacer este">Saltar</button>` : `<button type="button" class="sm-btn primary" data-route="next">✔ Hecho</button>`}${Route.i ? `<button type="button" class="sm-btn" data-route="back">◀ Anterior</button>` : ""}</div>
    ${s.done ? `<div class="small route-auto">Cuando lo hagas, pasará solo al siguiente paso.</div>` : ""}`;
}
function routeMenu() { const box = $("routeCard"); box.dataset.menu = "1"; if (Route.id) routeExit(); routeRender(); }
$("routeCard").addEventListener("click", e => {
  const st = e.target.closest("[data-route-start]");
  if (st) { delete $("routeCard").dataset.menu; routeStart(st.dataset.routeStart); return; }
  const b = e.target.closest("[data-route]");
  if (!b) return;
  const a = b.dataset.route;
  if (a === "close") { delete $("routeCard").dataset.menu; routeRender(); }
  else if (a === "exit") { delete $("routeCard").dataset.menu; routeExit(); }
  else if (a === "menu") routeMenu();
  else if (a === "min" || a === "max") { Route.min = a === "min"; routeSave(); routeRender(); if (a === "min") routeHighlight(null); }
  else if (a === "go") routeGo();
  else if (a === "next" || a === "skip") { routeStep(Route.i + 1); if (routeDef() && Route.i < routeDef().steps.length) routeGo(); }
  else if (a === "back") { routeStep(Route.i - 1); routeGo(); }
});
$("routesBtn").onclick = () => { if (Route.id) { Route.min = false; routeRender(); } else routeMenu(); };
/* Si se recarga la página en mitad de una ruta, se sigue en el mismo paso */
{ const saved = LS.get("ajedrezRuta", null); if (saved && ROUTES.some(r => r.id === saved.id)) { Object.assign(Route, { id: saved.id, i: saved.i || 0, min: !!saved.min, stepAt: Date.now() }); setTimeout(() => { Route.game0 = game; routeRender(); }, 0); } }
