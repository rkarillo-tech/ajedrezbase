/* ---------- B16. Cursos: lecciones en PGN comentadas paso a paso (cursos/*.pgn) ---------- */
const COURSE_PGN = /*__COURSES__*/{};
const COURSES = [
  { id: "aperturas", icon: "📖", name: "Aperturas", desc: "Los principios, los errores típicos y las aperturas principales con blancas y con negras, explicando el porqué de cada jugada." },
  { id: "planes", icon: "💡", name: "Planes de apertura", desc: "Posiciones típicas que salen de las aperturas: ¿cuál es el plan? Encuentra tú las jugadas clave (ataque de minorías, cadenas de peones, rupturas, casillas fuertes, enroques opuestos, peones doblados, la pareja de alfiles…) y entiende por qué se juegan." },
  { id: "repertorios", icon: "🗂", name: "Repertorios para entrenar", desc: "Repertorios completos con blancas (1.e4, el Londres o el Gambito de Dama) y con negras (Caro-Kann, Siciliana, Gambito de Dama Declinado o India de Rey), con el porqué de cada jugada. Entrénalos con 🎯: los repasos se espacian solos." },
  { id: "tactica", icon: "⚔", name: "Táctica", desc: "Horquillas, clavadas, enfiladas, descubiertas, sobrecarga y mates típicos, con ejercicios para resolver." },
  { id: "mates", icon: "🗡", name: "Patrones de mate y ataque al rey", desc: "Los mates con nombre propio (Anastasia, Boden, árabe, Damiano, Lolli, Greco, las hombreras, las torres en séptima) y los sacrificios clásicos contra el rey: el doble sacrificio de alfil de Lasker, el sacrificio en f7 y el ataque Fegatello." },
  { id: "estrategia", icon: "🧭", name: "Estrategia", desc: "Cómo hacer un plan: estructuras de peones, piezas buenas y malas, columnas, casillas fuertes y peones pasados." },
  { id: "finales", icon: "👑", name: "Finales", desc: "Los mates básicos, rey y peón, la oposición, Lucena, Philidor y los finales que hay que saber de memoria." },
  { id: "geometria", icon: "📐", name: "Geometría del tablero", desc: "Los trucos geométricos del tablero que deciden finales: el rey que va en diagonal hacia dos objetivos (el estudio de Réti), la geometría del caballo contra un peón y las casillas conjugadas de Lasker y Reichhelm." },
  { id: "partidas", icon: "🏆", name: "Partidas magistrales", desc: "Partidas célebres de Morphy, Anderssen, Fischer, Karpov y Kaspárov, comentadas jugada a jugada: qué ideas las decidieron y dónde se equivocaron." },
  { id: "trampas", icon: "🪤", name: "Trampas y miniaturas", desc: "Partidas célebres de menos de 20 jugadas y trampas de apertura que conviene conocer con los dos colores: Teed–Delmar, Réti–Tartakower, la caza del rey de Lasker, la trampa de Blackburne, la del Englund y la siberiana." }
];
const courseCache = {};
/* 📥 Cursos añadidos por el usuario desde un .pgn: se guardan en este navegador y funcionan como los de la aplicación */
const USER_COURSES_KEY = "ajedrezCursosPropios";
const userCourses = () => LS.get(USER_COURSES_KEY, []);
function registerUserCourse(uc) {
  const i = COURSES.findIndex(c => c.id === uc.id);
  const entry = { id: uc.id, icon: "📂", name: uc.name, desc: uc.desc, user: true };
  if (i >= 0) COURSES[i] = entry; else COURSES.push(entry);
  COURSE_PGN[uc.id] = uc.pgn;
  delete courseCache[uc.id];
}
userCourses().forEach(registerUserCourse);
/* Lee un .pgn y lo prepara como curso: cada partida es una lección (con título y número aunque no los traiga) */
function courseFromPgn(text, fileName) {
  const parts = Pgn.splitGames(text).filter(g => g.movetext.trim() || g.headers.FEN);
  const lessons = [], bad = [];
  parts.forEach((g, k) => {
    const r = Pgn.parseGame(g, { lang: "auto" });
    if (r.error && !r.count) { bad.push(k + 1); return; }
    // Posición imposible (el bando que no mueve está en jaque): se descarta, el motor no podría analizarla
    const s0 = r.game.root.state;
    if (Chess.inCheck(Object.assign({}, s0, { t: -s0.t }))) { bad.push(k + 1); return; }
    lessons.push(g);
  });
  if (!lessons.length) return { error: "El fichero no tiene ninguna partida o lección que se pueda leer." };
  const rounds = lessons.map(g => +g.headers.Round);
  const renumber = rounds.some(x => !(x > 0)) || new Set(rounds).size !== rounds.length;
  const isDefault = v => !v || v === "?" || /^(blancas|negras|white|black)$/i.test(v);
  lessons.forEach((g, i) => {
    const h = g.headers;
    if (renumber) h.Round = String(i + 1);
    if (!h.Title) h.Title = !isDefault(h.White) && !isDefault(h.Black) ? `${h.White} – ${h.Black}${h.Date && /^\d{4}/.test(h.Date) ? ` (${h.Date.slice(0, 4)})` : ""}` : h.Event && h.Event !== "?" && lessons.length > 1 ? `${h.Event} ${i + 1}` : `Lección ${i + 1}`;
  });
  const h0 = lessons[0].headers;
  const name = (h0.Course || (h0.Event && h0.Event !== "?" && !/^(estudio|casual|rated|\?)/i.test(h0.Event) ? h0.Event.replace(/^curso\s+(de|del)\s+/i, "") : "") || String(fileName || "Mi curso").replace(/\.pgn$/i, "").replace(/[_-]+/g, " ")).trim();
  return { name: name.charAt(0).toUpperCase() + name.slice(1), desc: h0.CourseDesc || "", pgn: lessons.map(collRaw).join("\n\n") + "\n", n: lessons.length, bad };
}
async function importCourseFile(file) {
  let text;
  try { text = await file.text(); } catch { toast("No se pudo leer el fichero."); return; }
  if (text.length > 3e6) { toast("El fichero es demasiado grande para un curso (más de 3 MB)."); return; }
  const c = courseFromPgn(text, file.name);
  if (c.error) { toast(c.error, 5000); return; }
  const name = (prompt(`Curso con ${c.n} lección${c.n === 1 ? "" : "es"}${c.bad.length ? ` (${c.bad.length} no se pudieron leer y se omiten)` : ""}.\n\nNombre del curso:`, c.name) || "").trim();
  if (!name) return;
  const list = userCourses();
  const same = list.find(x => norm(x.name) === norm(name));
  if (same && !confirm(`Ya tienes un curso llamado «${same.name}». ¿Sustituirlo por este?`)) return;
  const uc = { id: same ? same.id : "u" + Date.now().toString(36), name, desc: c.desc || `Curso añadido desde «${file.name}» · ${c.n} lección${c.n === 1 ? "" : "es"}`, pgn: c.pgn, added: Date.now() };
  const next = list.filter(x => x.id !== uc.id).concat(uc);
  if (!LS.set(USER_COURSES_KEY, next)) { toast("❌ No hay espacio en el navegador para guardar este curso.", 5000); return; }
  registerUserCourse(uc);
  renderCourses();
  const box = document.querySelector(`#courseList details[data-course="${uc.id}"]`);
  if (box) { box.open = true; box.scrollIntoView({ block: "nearest" }); }
  toast(`📥 Curso «${name}» añadido con ${c.n} lección${c.n === 1 ? "" : "es"}. Ábrelo como cualquier otro.`, 4500);
}
function removeUserCourse(id) {
  const c = COURSES.find(x => x.id === id);
  if (!c || !c.user || !confirm(`¿Quitar el curso «${c.name}»? Se borra de este navegador (tu fichero .pgn no se toca).`)) return;
  syncTomb(["curso:" + id]);
  LS.set(USER_COURSES_KEY, userCourses().filter(x => x.id !== id));
  COURSES.splice(COURSES.indexOf(c), 1);
  delete COURSE_PGN[id]; delete courseCache[id];
  const done = courseDone(); if (done[id]) { delete done[id]; LS.set("ajedrezCursos", done); }
  if (ui.lesson && ui.lesson.course === id) { ui.lesson = null; renderLesson(); }
  renderCourses();
  toast(`Curso «${c.name}» quitado.`);
}
function courseLessons(id) {
  if (!courseCache[id]) {
    courseCache[id] = Pgn.splitGames(COURSE_PGN[id] || "").map(g => {
      const h = g.headers;
      return { g, round: +h.Round || 0, title: h.Title || "Lección", level: h.Level || "", exercise: h.Type === "ejercicio", repertoire: h.Type === "repertorio", black: h.Orientation === "black" };
    });
  }
  return courseCache[id];
}
const courseDone = () => LS.get("ajedrezCursos", {});
/* Repasos espaciados de los repertorios: { "repertorios:1": { box, due, reps } } */
const repSrs = () => LS.get("ajedrezRepasos", {});
function repSrsText(s) {
  if (!s) return "sin empezar";
  const d = Math.ceil((s.due - Date.now()) / 864e5);
  return d <= 0 ? "📅 toca hoy" : d === 1 ? "mañana" : `en ${d} días`;
}
function markLessonDone(id, round) {
  const d = courseDone();
  d[id] = [...new Set([...(d[id] || []), round])].sort((a, b) => a - b);
  LS.set("ajedrezCursos", d);
  renderCourses();
}
function renderCourses() {
  const box = $("courseList");
  if (!box) return;
  const done = courseDone();
  const open = new Set([...box.querySelectorAll("details[open]")].map(d => d.dataset.course));
  if (!box.children.length && ui.lesson) open.add(ui.lesson.course);
  let total = 0, finished = 0, dueReps = 0;
  const srs = repSrs();
  box.innerHTML = COURSES.map(c => {
    const L = courseLessons(c.id), ok = new Set(done[c.id] || []);
    L.forEach(l => { const s = srs[c.id + ":" + l.round]; if (l.repertoire && s && s.due <= Date.now()) dueReps++; });
    total += L.length;
    finished += L.filter(l => ok.has(l.round)).length;
    const rows = L.map((l, i) => `<button class="lesson-row${ui.lesson && ui.lesson.course === c.id && ui.lesson.i === i ? " current" : ""}" data-c="${c.id}" data-i="${i}">
        <span class="lesson-num">${ok.has(l.round) ? "✔" : l.round}</span><span class="lesson-title">${l.exercise ? "🧩 " : l.repertoire ? "🗂 " : ""}${esc(l.title)}</span>${l.repertoire ? (s => `<span class="srs-pill${s && s.due <= Date.now() ? " due" : ""}" title="Próximo repaso">${esc(repSrsText(s))}</span>`)(srs[c.id + ":" + l.round]) : ""}<span class="srs-pill">${esc(l.level)}</span></button>`).join("");
    return `<details class="course" data-course="${c.id}"${open.has(c.id) ? " open" : ""}>
      <summary><span class="course-icon">${c.icon}</span><span><b>${esc(c.name)}</b> <span class="small">${L.filter(l => ok.has(l.round)).length} de ${L.length} lecciones</span><br><span class="small">${esc(c.desc)}</span></span></summary>
      <div class="lesson-list">${rows}</div>
      <div class="controls"><button class="sm-btn" data-dl="${c.id}" title="Descargar el curso como fichero .pgn">⬇ Descargar .pgn</button><button class="sm-btn" data-coll="${c.id}" title="Abrirlo en «Biblioteca › Abrir .pgn» para guardar las lecciones que quieras">🗂 Abrir como .pgn</button>${c.user ? `<button class="sm-btn danger" data-rmc="${c.id}" title="Quitar este curso de la aplicación">🗑 Quitar curso</button>` : ""}</div>
    </details>`;
  }).join("");
  $("courseProgress").textContent = `${finished} de ${total} lecciones${dueReps ? ` · 📅 ${dueReps} repertorio${dueReps === 1 ? "" : "s"} para repasar` : ""}`;
  $("courseProgress").className = "srs-pill" + (finished ? " ok" : "");
  box.querySelectorAll("[data-i]").forEach(b => b.onclick = () => openLesson(b.dataset.c, +b.dataset.i));
  box.querySelectorAll("[data-dl]").forEach(b => b.onclick = () => { const c = COURSES.find(x => x.id === b.dataset.dl); download(`ajedrezbase_curso_${c && c.user ? safeName(c.name) : b.dataset.dl}.pgn`, COURSE_PGN[b.dataset.dl], "application/x-chess-pgn"); });
  box.querySelectorAll("[data-rmc]").forEach(b => b.onclick = () => removeUserCourse(b.dataset.rmc));
  box.querySelectorAll("[data-coll]").forEach(b => b.onclick = () => {
    const c = COURSES.find(x => x.id === b.dataset.coll);
    const n = setCollection(COURSE_PGN[c.id], false, "Curso de " + c.name.toLowerCase());
    switchTab("library"); switchSub("collection");
    toast(`🗂 ${n} lecciones abiertas (sin guardar). Guarda las que quieras con 💾.`);
  });
}
function openLesson(id, i) {
  const l = courseLessons(id)[i], c = COURSES.find(x => x.id === id);
  if (!l) return false;
  if (!confirmLeave()) return false;
  leaveModes();
  const r = Pgn.parseGame(l.g, { lang: "en" });
  const mark = n => { n.__lesson = true; n.children.forEach(mark); };
  mark(r.game.root);
  ui.flipped = l.black;
  if (setGame(r.game, { noConfirm: true, name: `📘 ${c.name} ${l.round}: ${l.title}` }) === false) return false;
  ui.lesson = { course: id, i, game: r.game, done: false };
  renderCourses();
  renderLesson();
  setTimeout(() => {
    const b = $("lessonBox").getBoundingClientRect(), tb = $("topBar").getBoundingClientRect();
    if (wideLayout.matches) { if (tb.top < 0 || $("bottomBar").getBoundingClientRect().bottom > innerHeight) scrollTo({ top: 0, behavior: "smooth" }); }
    else if (tb.top < 0 || b.bottom > innerHeight) $("topBar").scrollIntoView({ block: "start", behavior: "smooth" });
  }, 40);
  return true;
}
/* En el ordenador el panel de la lección va en la columna derecha, junto al tablero; en el móvil, debajo del tablero */
/* (en horizontal con poca altura se usa la disposición de móvil aunque haya ancho: ver el CSS) */
const wideLayout = matchMedia("(min-width: 981px) and (min-height: 541px), (min-width: 981px) and (orientation: portrait)");
function placeLessonBox() {
  const box = $("lessonBox"), side = wideLayout.matches;
  if (side && box.parentElement !== $("toolsPanel")) $("toolsPanel").prepend(box);
  if (!side && box.parentElement === $("toolsPanel")) $("visBox").after(box);
  box.classList.toggle("side", side);
}
/* En el móvil, los mensajes del entrenador (repertorio, problemas, tarjetas) van debajo del tablero */
const trainFeedbackHome = { parent: $("trainFeedback").parentElement, next: $("trainFeedback").nextElementSibling };
function placeTrainFeedback() {
  const el = $("trainFeedback");
  if (!wideLayout.matches) { if (el.parentElement === trainFeedbackHome.parent) $("lessonBox").after(el); }
  else if (el.parentElement !== trainFeedbackHome.parent) trainFeedbackHome.parent.insertBefore(el, trainFeedbackHome.next);
  el.classList.toggle("under-board", !wideLayout.matches);
}
const onLayout = () => { placeLessonBox(); placeTrainFeedback(); };
wideLayout.addEventListener ? wideLayout.addEventListener("change", onLayout) : wideLayout.addListener(onLayout);
onLayout();
/* La línea principal de la lección tal como viene en el curso (sin las jugadas que pruebe el usuario) */
function lessonLine() {
  const out = [];
  for (let n = game.root; ;) { n = n.children.find(c => c.__lesson); if (!n) break; out.push(n); }
  return out;
}
/* Panel de la lección: la explicación completa de la posición y los botones para seguir */
function renderLesson() {
  const box = $("lessonBox");
  const L = ui.lesson;
  if (!L || L.game !== game || quiz() || editor.active) { box.hidden = true; return; }
  const c = COURSES.find(x => x.id === L.course), lessons = courseLessons(L.course), l = lessons[L.i];
  const line = lessonLine(), n = cur();
  const onMain = n === game.root || line.includes(n), step = onMain ? line.indexOf(n) + 1 : -1;
  const atEnd = n === (line.length ? line[line.length - 1] : game.root) && line.length > 0;
  if (atEnd && !L.done) { L.done = true; markLessonDone(L.course, l.round); if (!l.repertoire) logActivity("lesson"); }
  const mine = !n.__lesson;
  const text = n === game.root ? game.root.comment : n.comment;
  const where = n === game.root ? "Posición inicial" : `${numPrefix(n.parent.state)}${dispSan(n)}${n.nag || ""}`;
  const next = lessons[L.i + 1];
  box.hidden = false;
  box.innerHTML = `<div class="retry-head">${c.icon} ${esc(c.name)} · ${l.round} de ${lessons.length}: ${esc(l.title)}</div>
    <div class="lesson-step small">${esc(where)}${mine ? " · 🧪 tu prueba" : step >= 0 ? ` · paso ${step} de ${line.length}` : " · variante de la lección"}</div>
    <div class="lesson-text">${mine
      ? `🧪 <b>Jugada tuya</b>, fuera de la lección.${n.eval ? ` Valoración del motor: <b>${esc(fmtEval(n.eval))}</b>.` : settings.live ? " El motor la está analizando: mira su valoración en el panel del motor." : " Activa «Analizar» (tecla E) para que el motor la valore."} Sigue probando o vuelve con <b>↩ Línea principal</b>; <b>↺ Reiniciar</b> borra todas tus pruebas.${text ? `<br>📝 ${esc(text)}` : ""}`
      : text ? esc(text) : `<span class="small">${n === game.root ? "Pulsa ▶ para empezar." : "Sin comentario en esta jugada: sigue con ▶ o mira las flechas del tablero."}</span>`}</div>
    ${atEnd ? `<div class="retry-msg">✔ <b>Lección terminada.</b>${next ? "" : " ¡Has llegado al final del curso!"}</div>` : ""}
    <div class="controls">
      <button class="sm-btn" data-l="back" ${n.parent ? "" : "disabled"}>◀</button>
      <button class="sm-btn${atEnd ? "" : " primary"}" data-l="fwd" ${n.children.length ? "" : "disabled"}>${n === game.root ? "▶ Empezar" : "▶ Siguiente"}</button>
      ${!onMain ? `<button class="sm-btn" data-l="main" title="Volver a la línea principal">↩ Línea principal</button>` : ""}
      <button class="sm-btn" data-l="reset" title="Vuelve a abrir la lección desde el principio y borra tus pruebas">↺ Reiniciar</button>
      <button class="sm-btn info-btn" data-l="practice" title="${l.exercise ? "Resuelve el ejercicio tú mismo" : l.repertoire ? "Juega tus jugadas del repertorio; el rival elige al azar entre sus respuestas" : "Juega tú las jugadas de la lección desde el principio"}">🎯 ${l.exercise ? "Resolver" : l.repertoire ? "Entrenar repertorio" : "Practicar"}</button>
      ${next ? `<button class="sm-btn${atEnd ? " primary" : ""}" data-l="next">Lección siguiente ▶</button>` : ""}
      <button class="sm-btn" data-l="close" title="Cerrar el panel de la lección">✖</button>
    </div>`;
  box.querySelectorAll("[data-l]").forEach(b => b.onclick = () => lessonAction(b.dataset.l));
}
function lessonAction(a) {
  const L = ui.lesson;
  if (!L) return;
  if (a === "back") goBack();
  else if (a === "fwd") { goForward(); soundFor(cur()); }
  else if (a === "main") { const line = lessonLine(); let n = cur(); while (n.parent && !line.includes(n)) n = n.parent; goTo(n); }
  else if (a === "next") openLesson(L.course, L.i + 1);
  else if (a === "reset") { if (openLesson(L.course, L.i)) toast("↺ Lección reiniciada."); }
  else if (a === "close") { ui.lesson = null; renderLesson(); renderCourses(); }
  else if (a === "practice") {
    const l = courseLessons(L.course)[L.i];
    // Se practica la lección tal como viene, sin las jugadas que hayas probado
    if (game.root.children.some(function own(c) { return !c.__lesson || c.children.some(own); }) && !openLesson(L.course, L.i)) return;
    startTraining({ side: l.exercise ? game.root.state.t : l.black ? -1 : 1 });
  }
}

