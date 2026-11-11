/* ---------- 26b. Plan de hoy: objetivos diarios, racha y calendario de actividad ---------- */
const ACT_KEY = "ajedrezActividad";
const ACT_LABEL = { puzzle: "problemas", lesson: "lecciones", rep: "líneas de repertorio", card: "tarjetas", drill: "ejercicios", cpu: "partidas contra la CPU", exam: "exámenes", guess: "partidas adivinadas", vis: "ejercicios de visualización" };
const ACT_ONE = { puzzle: "problema", lesson: "lección", rep: "línea de repertorio", card: "tarjeta", drill: "ejercicio", cpu: "partida contra la CPU", exam: "examen", guess: "partida adivinada", vis: "ejercicio de visualización" };
const actText = (k, v) => `${v} ${v === 1 ? ACT_ONE[k] : ACT_LABEL[k]}`;
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
    const det = a[k] ? Object.entries(a[k]).filter(([x]) => ACT_LABEL[x]).map(([x, v]) => actText(x, v)).join(", ") : "sin actividad";
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
  renderWeek();
}

/* ---------- 26w. Tu semana: resumen de los últimos 7 días y qué practicar ----------
   Sale del registro de actividad. Cada día guarda además (en claves que no cuentan como actividad) cuántos
   problemas salieron a la primera, el acierto por tema y el nivel al acabar el día. */
function logPuzzleResult(p, perfect) {
  const a = actDays(), k = dayKey(), d = a[k] = a[k] || {};
  d.pzOk = (d.pzOk || 0) + (perfect ? 1 : 0);
  d.pzFail = (d.pzFail || 0) + (perfect ? 0 : 1);
  d.pzTh = d.pzTh || {};
  for (const t of puzzleThemeKeys(p)) { const x = d.pzTh[t] = d.pzTh[t] || [0, 0]; x[0]++; if (!perfect) x[1]++; }
  d.nivel = Math.round(puzRating().r);
  // El detalle por temas sólo hace falta para las últimas semanas
  const old = new Date(); old.setDate(old.getDate() - 60);
  const limit = dayKey(old);
  for (const key of Object.keys(a)) if (key < limit && a[key].pzTh) delete a[key].pzTh;
  LS.set(ACT_KEY, a);
}
/* back = 0: los últimos 7 días (hoy incluido); back = 1: los 7 anteriores */
function weekStats(back) {
  const a = actDays(), W = { days: 0, total: 0, kinds: {}, ok: 0, fail: 0, th: {} };
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i - 7 * back);
    const r = a[dayKey(d)];
    if (!r) continue;
    const n = dayTotal(r);
    if (n) W.days++;
    W.total += n;
    for (const [k, v] of Object.entries(r)) if (ACT_LABEL[k]) W.kinds[k] = (W.kinds[k] || 0) + v;
    W.ok += r.pzOk || 0; W.fail += r.pzFail || 0;
    for (const [k, v] of Object.entries(r.pzTh || {})) { const x = W.th[k] = W.th[k] || { k, tries: 0, fails: 0 }; x.tries += v[0] || 0; x.fails += v[1] || 0; }
  }
  return W;
}
/* Nivel de problemas con el que se llegó a esta semana (el último anotado antes de los 7 días) */
function levelBeforeWeek() {
  const a = actDays();
  for (let i = 7; i < 120; i++) { const d = new Date(); d.setDate(d.getDate() - i); const r = a[dayKey(d)]; if (r && r.nivel) return r.nivel; }
  return null;
}
function renderWeek() {
  const body = $("weekBody");
  if (!body) return;
  const W = weekStats(0), P = weekStats(1), due = dueCounts(), R = puzRating();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const trend = W.total > P.total ? " ↗" : W.total < P.total && P.total ? " ↘" : "";
  $("weekSummary").textContent = W.total ? `📈 Tu semana: ${W.days} de 7 días · ${plural(W.total, "actividad", "actividades")}${trend}` : "📈 Tu semana: aún sin actividad";
  const rows = [];
  if (W.total) {
    const kinds = Object.entries(W.kinds).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<b>${v}</b> ${esc(v === 1 ? ACT_ONE[k] : ACT_LABEL[k])}`).join(" · ");
    rows.push(`<div class="week-row"><span class="week-k">Has hecho</span><span>${kinds}<br><span class="small">${P.total ? `Los 7 días anteriores: ${P.days} ${P.days === 1 ? "día" : "días"} y ${plural(P.total, "actividad", "actividades")}.` : "Los 7 días anteriores no entrenaste."}</span></span></div>`);
  }
  const tried = W.ok + W.fail;
  if (tried || R.n) {
    const before = levelBeforeWeek(), delta = before != null && R.n ? Math.round(R.r) - before : null;
    rows.push(`<div class="week-row"><span class="week-k">Problemas</span><span>${tried ? `<b>${W.ok}</b> de ${tried} a la primera (${Math.round(100 * W.ok / tried)} %)` : "ninguno esta semana"}${R.n ? ` · nivel <b>${Math.round(R.r)}</b>${delta != null && tried ? ` (${delta >= 0 ? "+" : "−"}${Math.abs(delta)} en la semana)` : ""}` : ""}</span></div>`);
  }
  // Partidas propias de los últimos 7 días (hace falta tu nombre en Estadísticas)
  let S = null;
  if (Lib.ready && myNameList().length) { S = computeStats({ period: 7 }); if (!S.games) S = null; }
  if (S) {
    const acc = avg(S.accs);
    rows.push(`<div class="week-row"><span class="week-k">Partidas</span><span><b>${S.games}</b> jugada${S.games === 1 ? "" : "s"}: +${S.w} =${S.d} −${S.l}${acc != null ? ` · precisión media <b>${Math.round(acc)} %</b>` : ""}${S.pending.length ? ` <span class="small">(${S.pending.length} sin analizar)</span>` : ""}</span></div>`);
  }
  // Qué practicar: como mucho tres propuestas, de la más urgente a la menos
  const tips = [];
  if (due.total) tips.push({ txt: `Tienes <b>${plural(due.total, "repaso pendiente", "repasos pendientes")}</b>: lo que no se repasa a tiempo se olvida.`, btn: "▶ Repasar", act: "due" });
  const weakWeek = Object.values(W.th).filter(x => x.k !== "other" && x.tries >= 3 && (x.tries - x.fails) / x.tries < 0.8).sort((x, y) => (x.tries - x.fails) / x.tries - (y.tries - y.fails) / y.tries)[0];
  const weakAll = weakWeek ? null : weakThemes()[0];
  const hasTheme = k => [...$("puzzleTheme").options].some(o => o.value === k);
  if (weakWeek && hasTheme(weakWeek.k)) tips.push({ txt: `Esta semana lo que más se te ha resistido en los problemas es <b>${esc(puzzleThemeName(weakWeek.k))}</b> (${weakWeek.tries - weakWeek.fails} de ${weakWeek.tries} a la primera).`, btn: "🧩 Practicarlo", act: "theme:" + weakWeek.k });
  else if (weakAll && hasTheme(weakAll.k)) tips.push({ txt: `Tu tema más flojo en los problemas es <b>${esc(weakAll.name)}</b> (${weakAll.pct} % de acierto).`, btn: "🧩 Practicarlo", act: "theme:" + weakAll.k });
  const topErr = S ? Object.entries(S.th).filter(([k]) => THEMES[k]).sort((x, y) => y[1] - x[1])[0] : null;
  if (topErr) tips.push({ txt: `En tus partidas de la semana, el error más repetido: <b>${esc(THEMES[topErr[0]].name.toLowerCase())}</b> (${plural(topErr[1], "vez", "veces")}).`, btn: "🎯 Entrenarlo", act: "drill:" + THEMES[topErr[0]].drill });
  if (S && S.pending.length && tips.length < 3) tips.push({ txt: `Hay <b>${plural(S.pending.length, "partida", "partidas")}</b> de esta semana sin analizar: analízalas para ver en qué fallaste.`, btn: "📊 Ir a Estadísticas", act: "stats" });
  if (!tips.length) tips.push(W.days >= 4 ? { txt: "Buena semana: vas al día y sin un punto flojo claro. Sigue con el plan de hoy.", btn: "▶ Siguiente tarea", act: "due" }
    : { txt: W.total ? `Has entrenado ${plural(W.days, "día", "días")} de 7. Mejor poco cada día que mucho de golpe: prueba con el plan de hoy.` : "Empieza por el plan de hoy: unos problemas y una lección.", btn: "▶ Siguiente tarea", act: "due" });
  body.innerHTML = rows.join("") + `<div class="week-tips"><b>Qué practicar</b>${tips.slice(0, 3).map(t => `<div class="week-tip"><span>${t.txt}</span><button class="sm-btn primary" data-week="${esc(t.act)}">${t.btn}</button></div>`).join("")}</div>`;
  body.querySelectorAll("[data-week]").forEach(b => b.onclick = () => {
    const [act, arg] = b.dataset.week.split(":");
    if (act === "due") nextTask();
    else if (act === "theme") { $("puzzleTheme").value = arg; $("puzzleLevel").value = ""; $("puzzleCount").value = "10"; startPuzzles(); }
    else if (act === "drill") { $("drillType").value = arg; startDrills("due"); }
    else if (act === "stats") { switchTab("library"); switchSub("stats"); }
  });
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

