/* ---------- 26b. Plan de hoy: objetivos diarios, racha y calendario de actividad ---------- */
const ACT_KEY = "ajedrezActividad";
const ACT_LABEL = { puzzle: "problemas", lesson: "lecciones", rep: "líneas de repertorio", card: "tarjetas", drill: "ejercicios", cpu: "partidas contra la CPU", exam: "exámenes", guess: "partidas adivinadas", vis: "ejercicios de visualización" };
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const actDays = () => LS.get(ACT_KEY, {});
const dayTotal = d => (d ? Object.entries(d).filter(([k]) => ACT_LABEL[k]).reduce((s, [, v]) => s + v, 0) : 0);
function logActivity(kind, n = 1) {
  const a = actDays(), k = dayKey();
  a[k] = a[k] || {};
  a[k][kind] = (a[k][kind] || 0) + n;
  LS.set(ACT_KEY, a);
  renderToday();
}
function streakInfo() {
  const a = actDays();
  let cur = 0, best = 0, run = 0;
  const d = new Date();
  if (!dayTotal(a[dayKey(d)])) d.setDate(d.getDate() - 1);   // hoy aún no cuenta: la racha sigue viva si ayer entrenaste
  for (;;) { if (dayTotal(a[dayKey(d)])) { cur++; d.setDate(d.getDate() - 1); } else break; }
  const keys = Object.keys(a).filter(k => dayTotal(a[k])).sort();
  let prev = null;
  for (const k of keys) {
    const t = new Date(k + "T12:00:00");
    run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { cur, best, days: keys.length };
}
/* Lo que queda pendiente de repasar (repertorios, problemas, tarjetas y ejercicios de tus partidas) */
function dueCounts() {
  const now = Date.now(), srs = repSrs(), ps = puzSrs();
  const reps = COURSES.flatMap(c => courseLessons(c.id).filter(l => l.repertoire).map(l => ({ c: c.id, l, s: srs[c.id + ":" + l.round] }))).filter(x => x.s && x.s.due <= now);
  const puzzles = PUZZLES.filter(p => ps[p.id] && ps[p.id].due <= now).length;
  const cards = Lib.ready ? trainableMarks(false).length : 0;
  const drills = Lib.ready ? drillPool().filter(x => x.srs && x.srs.due <= now).length : 0;
  const mine = myRepRecs().filter(r => r.srs && r.srs.due <= now).sort((a, b) => a.srs.due - b.srs.due);
  return { reps, mine, puzzles, cards, drills, total: reps.length + mine.length + puzzles + cards + drills };
}
const goalPuzzles = () => Math.max(1, +settings.goalPuzzles || 5);
function nextLesson() {
  const done = courseDone();
  for (const c of COURSES) {
    const L = courseLessons(c.id), ok = new Set(done[c.id] || []);
    const i = L.findIndex(l => !l.repertoire && !ok.has(l.round));
    if (i >= 0) return { course: c, i, l: L[i] };
  }
  return null;
}
function renderToday() {
  const box = $("todayBox");
  if (!box) return;
  const a = actDays(), today = a[dayKey()] || {}, st = streakInfo(), due = dueCounts();
  const pz = today.puzzle || 0, ls = today.lesson || 0, gP = goalPuzzles();
  const goals = [
    { ok: pz >= gP, txt: `🧩 Problemas: ${Math.min(pz, gP)} de ${gP}`, frac: Math.min(1, pz / gP) },
    { ok: ls >= 1, txt: `📘 Una lección: ${ls ? "hecha" : "pendiente"}`, frac: Math.min(1, ls) },
    { ok: !due.total, txt: `📅 Repasos: ${due.total ? `quedan ${due.total}` : "al día"}`, frac: due.total ? 0 : 1 }
  ];
  const all = goals.every(g => g.ok);
  // Calendario de las últimas 16 semanas (de lunes a domingo)
  const cells = [], end = new Date(), start = new Date(end);
  start.setDate(start.getDate() - 7 * 15 - ((end.getDay() + 6) % 7));
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d), n = dayTotal(a[k]);
    const lvl = !n ? 0 : n < 3 ? 1 : n < 8 ? 2 : n < 15 ? 3 : 4;
    const det = a[k] ? Object.entries(a[k]).filter(([x]) => ACT_LABEL[x]).map(([x, v]) => `${v} ${ACT_LABEL[x]}`).join(", ") : "sin actividad";
    cells.push(`<i class="cal-d l${lvl}" title="${esc(d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }))}: ${esc(det)}"></i>`);
  }
  box.innerHTML = `<div class="today-head"><span class="streak" title="Días seguidos entrenando">🔥 <b>${st.cur}</b> día${st.cur === 1 ? "" : "s"} seguido${st.cur === 1 ? "" : "s"}</span><span class="small">Mejor racha: ${st.best} · ${st.days} día${st.days === 1 ? "" : "s"} entrenando</span></div>
    <div class="goals">${goals.map(g => `<div class="goal${g.ok ? " ok" : ""}"><span>${g.ok ? "✔ " : ""}${esc(g.txt)}</span><div class="meter"><div style="width:${Math.round(g.frac * 100)}%"></div></div></div>`).join("")}</div>
    <div class="controls"><button id="todayNextBtn" class="primary">${all ? "🏆 Objetivo cumplido · seguir entrenando ▶" : "▶ Siguiente tarea de hoy"}</button>
      <label class="small">Problemas al día: <select id="goalPuzzlesSel" style="width:auto">${[3, 5, 10, 15, 20].map(n => `<option${n === gP ? " selected" : ""}>${n}</option>`).join("")}</select></label></div>
    <div class="cal" aria-label="Actividad de las últimas semanas">${cells.join("")}</div>
    <div class="small cal-legend">Últimas 16 semanas · <i class="cal-d l0"></i> nada <i class="cal-d l1"></i><i class="cal-d l2"></i><i class="cal-d l3"></i><i class="cal-d l4"></i> mucho</div>`;
  $("todayNextBtn").onclick = nextTask;
  $("goalPuzzlesSel").onchange = e => { settings.goalPuzzles = +e.target.value; saveSettings(); renderToday(); };
  const badge = $("streakBadge");
  if (badge) { badge.textContent = st.cur ? `🔥${st.cur}` : ""; badge.hidden = !st.cur; }
}
/* «Siguiente tarea»: primero los repasos que tocan, después el objetivo de problemas y la lección del día */
function nextTask() {
  const due = dueCounts(), today = actDays()[dayKey()] || {};
  if (due.reps.length) {
    const r = due.reps[0], i = courseLessons(r.c).indexOf(r.l);
    if (openLesson(r.c, i)) { toast("📅 Toca repasar este repertorio."); lessonAction("practice"); }
    return;
  }
  if (due.mine.length) { toast(`📅 Toca repasar tu repertorio «${due.mine[0].title}».`); trainMyRep(due.mine[0].id); return; }
  if (due.puzzles || (today.puzzle || 0) < goalPuzzles()) {
    $("puzzleTheme").value = ""; $("puzzleLevel").value = "";
    $("puzzleCount").value = String(due.puzzles ? Math.min(20, Math.max(5, due.puzzles)) : Math.max(5, goalPuzzles() - (today.puzzle || 0)) > 10 ? "20" : Math.max(5, goalPuzzles() - (today.puzzle || 0)) > 5 ? "10" : "5");
    startPuzzles();
    return;
  }
  if (due.cards) { startCards(false); return; }
  if (due.drills) { startDrills("due"); return; }
  const nl = nextLesson();
  if (nl && !(today.lesson >= 1)) { switchTab("courses"); openLesson(nl.course.id, nl.i); toast(`📘 Lección del día: ${nl.l.title}`); return; }
  $("puzzleCount").value = "10";
  startPuzzles();
}

