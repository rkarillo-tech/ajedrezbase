/* ---------- 27a. Qué estás haciendo (1.57) ----------
   Una etiqueta en la cabecera dice siempre la actividad del tablero: analizar una partida, un problema (y cuál de
   cuántos), la partida contra la CPU, la clase del entrenador, una lección… Al pulsarla te lleva al recuadro de esa
   actividad (o al tablero). También cambia el título de la pestaña del navegador. Se actualiza en cada render(). */
function activityNow() {
  const name = () => ($("gameName").value || "").trim();
  if (editor.active) return { kind: "edit", icon: "✏", text: "Colocando piezas en el editor", box: "editorPanel" };
  if (Coach.active) return { kind: "coach", icon: "🧑‍🏫", text: Coach.state === "summary" ? "Clase con el entrenador: resumen" : `Clase con el entrenador · ${Math.min(Coach.i + 1, Coach.queue.length || 1)} de ${Coach.queue.length || "…"}`, box: "coachBox" };
  if (ui.cpu.on) return { kind: "cpu", icon: ui.cpu.two ? "👥" : "🤖", text: ui.cpu.two ? "Partida entre dos personas" : `Jugando contra ${ui.cpu.human ? `un rival humano (~${ui.cpu.human})` : "la CPU"}${ui.cpu.over ? " · terminada" : ""}`, box: "cpuBox" };
  if (Guess.active) return { kind: "guess", icon: "🔮", text: `Adivina la jugada · ${Math.min(Guess.n + 1, Guess.total || 1)} de ${Guess.total || "…"}`, box: "guessBox" };
  if (Vis.active) return { kind: "vis", icon: "👁", text: `Visualización${Vis.total ? ` · ${Math.min(Vis.n + 1, Vis.total)} de ${Vis.total}` : ""}`, box: "visBox" };
  if (Retry.active) return { kind: "retry", icon: "🔁", text: `Repitiendo tus errores · ${Math.min(Retry.i + 1, Retry.queue.length)} de ${Retry.queue.length}`, box: "retryBox" };
  if (trainer.active) {
    if (trainer.puzzle) {
      if (Puz.rush) return { kind: "puzzle", icon: "⚡", text: `Contrarreloj · problema ${Puz.done + 1}`, box: "trainFeedback" };
      if (Puz.exam) return { kind: "puzzle", icon: "📏", text: `Examen de nivel · problema ${Puz.done + 1} de ${Puz.total}`, box: "trainFeedback" };
      return { kind: "puzzle", icon: "🧩", text: `Problema ${Puz.done + 1} de ${Puz.total}`, box: "trainFeedback" };
    }
    if (trainer.card) {
      const drill = cur().__drill || (game.root && game.root.__drill), left = Cards.queue.length;
      return { kind: "card", icon: drill ? "🎯" : "🧠", text: `${drill ? "Ejercicio de tus partidas" : "Tarjeta de repaso"} · ${Cards.done + 1} de ${Cards.done + 1 + left}`, box: "trainFeedback" };
    }
    const rec = trainer.libId != null && Lib.games.get(trainer.libId);
    return { kind: "rep", icon: "🗂", text: `Entrenando el repertorio${rec ? ` «${rec.title}»` : ui.lesson ? " del curso" : ""}`, box: "trainFeedback" };
  }
  if (ui.lesson && ui.lesson.game === game) {
    const c = COURSES.find(x => x.id === ui.lesson.course), l = c && courseLessons(c.id)[ui.lesson.i];
    return { kind: "lesson", icon: "📘", text: `Lección${l ? `: ${l.title}` : ""}`, box: "lessonBox" };
  }
  if (ui.full) return { kind: "study", icon: "📖", text: "Analizando a pantalla completa", box: null };
  const moves = game.root.children.length > 0;
  if (ui.libId != null && Lib.games.has(ui.libId)) return { kind: "study", icon: "📖", text: `Analizando «${name() || Lib.games.get(ui.libId).title}»`, box: null };
  return { kind: "study", icon: "📖", text: moves ? `Analizando una partida${name() ? ` «${name()}»` : ""} (sin guardar)` : "Tablero libre: juega o pega una partida", box: null };
}
const Activity = { key: "" };
function renderActivity() {
  const chip = $("modeChip");
  if (!chip) return;
  let a;
  try { a = activityNow(); } catch { return; }
  const key = a.kind + "|" + a.text;
  if (key === Activity.key) return;
  Activity.key = key;
  Activity.box = a.box;
  chip.textContent = `${a.icon} ${a.text}`;
  chip.title = (a.kind === "study" ? "Lo que estás haciendo" : "Lo que estás haciendo: pulsa para ir a su recuadro") + ` — ${a.text}`;
  chip.dataset.kind = a.kind;
  document.body.classList.toggle("in-activity", a.kind !== "study");
  document.title = a.kind === "study" ? "AjedrezBase" : `${a.text} · AjedrezBase`;
}
$("modeChip").onclick = () => {
  const box = Activity.box && $(Activity.box);
  if (box && box.offsetParent) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  else $("topBar").scrollIntoView({ block: "start", behavior: "smooth" });
};
$("modeChip").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("modeChip").click(); } };
// Red de seguridad para las transiciones que no pasan por render() (resúmenes, finales de sesión): comprobar es barato
setInterval(renderActivity, 1000);
