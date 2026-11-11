/* ---------- B12. Resúmenes de análisis guardados y análisis por lotes ---------- */
const hasPgnEvals = rec => /\[%eval /.test(rec.pgn || "");
const triedSummary = new Set();
function summaryFromPgn(rec) {
  const r = Pgn.parseGame(rec.pgn, { lang: "en" });
  const nodes = [r.game.root, ...Pgn.mainlineFrom(r.game.root)];
  for (const n of nodes) if (!n.eval) { const t = terminalEval(n); if (t) n.eval = t; }
  if (!nodes[0].eval && Chess.toFen(nodes[0].state) === Chess.START_FEN) nodes[0].eval = { cp: 20, depth: 0, source: "pgn" };
  if (nodes.length < 3 || nodes.filter(n => n.eval).length < nodes.length * 0.7) return null;
  return analysisSummary(buildGameReport(nodes, r.game.headers), r.game.root, "pgn");
}
/* Las partidas con evaluaciones en el PGN (analizadas en versiones anteriores o por Lichess) se resumen una vez */
async function ensureSummaries(recs) {
  const changed = [];
  let k = 0;
  for (const rec of recs) {
    if (rec.analysis || !hasPgnEvals(rec)) continue;
    const tag = rec.id + ":" + rec.updated;
    if (triedSummary.has(tag)) continue;
    triedSummary.add(tag);
    let a = null;
    try { a = summaryFromPgn(rec); } catch (e) { console.warn("Resumen del análisis:", e); }
    if (a) { rec.analysis = a; changed.push(rec); }
    if (++k % 15 === 0) await new Promise(r => setTimeout(r, 0));
  }
  if (changed.length) { try { await DB.putMany("games", changed, { raw: true }); } catch (e) { console.warn("No se pudieron guardar los resúmenes:", e); } }
  return changed.length;
}
const Batch = { running: false, cancel: false, done: 0, total: 0, status: "" };
async function analyseRecordHeadless(rec, ms, onPos) {
  const r = Pgn.parseGame(rec.pgn, { lang: "en" });
  const g = r.game, nodes = [g.root, ...Pgn.mainlineFrom(g.root)];
  for (let i = 0; i < nodes.length; i++) {
    if (Batch.cancel) return false;
    const n = nodes[i], term = terminalEval(n);
    if (term) n.eval = term;
    else if (!(n.eval && n.eval.source !== "pgn" && (n.eval.depth || 0) >= 10)) {
      let job = await Engine.analyse(n, { purpose: "batch", movetime: ms, multipv: Engine.kind === "stockfish" ? 2 : 1 });
      if (!job && !Batch.cancel) job = await Engine.analyse(n, { purpose: "batch", movetime: ms, multipv: Engine.kind === "stockfish" ? 2 : 1 });
      if (job) storeEval(n, job, true);
    }
    onPos && onPos(i + 1, nodes.length);
  }
  annotateNodes(nodes);
  g.analysis = analysisSummary(buildGameReport(nodes, g.headers), g.root, "motor");
  const fresh = Lib.games.get(rec.id);
  if (!fresh || fresh.updated !== rec.updated || fresh.id === ui.libId) return false;   // cambió mientras tanto
  const upd = Object.assign({}, fresh, recordFromGame(g, { title: fresh.title, fav: fresh.fav, tags: fresh.tags || [], created: fresh.created, srs: fresh.srs || null }));
  upd.id = fresh.id;
  upd.drills = fresh.drills;
  await DB.put("games", upd);
  Lib.games.set(upd.id, upd);
  return true;
}
async function analysePending(recs) {
  if (ui.analysing || Batch.running) { toast("Ya hay un análisis en marcha."); return; }
  if (quiz()) { toast("Termina antes el ejercicio."); return; }
  const list = recs.filter(r => r.id !== ui.libId);
  if (!list.length) { toast("La partida que tienes abierta se analiza con «🤖 Analizar y comentar»."); return; }
  const ms = +$("stBatchMs").value;
  Object.assign(Batch, { running: true, cancel: false, done: 0, total: list.length });
  ui.analysing = true;
  Engine.cancel("live");
  renderStatsBatch();
  let ok = 0;
  for (const rec of list) {
    if (Batch.cancel) break;
    try {
      const res = await analyseRecordHeadless(rec, ms, (i, n) => { Batch.status = `«${rec.title}»: posición ${i} de ${n}`; renderStatsBatch(); });
      if (res) ok++;
    } catch (e) { console.warn("Análisis por lotes:", e); }
    Batch.done++;
    renderStatsBatch();
  }
  const cancelled = Batch.cancel;
  Object.assign(Batch, { running: false, cancel: false, status: "" });
  ui.analysing = false;
  LocalIdx = null;
  toast(`${cancelled ? "⏹ Análisis detenido" : "✔ Análisis terminado"}: ${ok} partida${ok === 1 ? "" : "s"} analizada${ok === 1 ? "" : "s"} con ${Engine.name}.`, 5000);
  refreshLibraryViews();
  requestLive();
}

/* ---------- B13. Estadísticas personales ---------- */
const TC_CATS = { bullet: "Bala", blitz: "Blitz", rapid: "Rápidas", classical: "Clásicas", corr: "Correspondencia" };
const THEMES = {
  material: { name: "Perder material (táctica)", icon: "♟", drill: "material" },
  mateMissed: { name: "Mates que se te escaparon", icon: "🎯", drill: "mateMissed" },
  mateAllowed: { name: "Mates que permitiste", icon: "🛡", drill: "mateAllowed" },
  wasted: { name: "Ventajas ganadoras desperdiciadas", icon: "🏁", drill: "wasted" },
  positional: { name: "Errores de planteamiento", icon: "🧭", drill: "positional" }
};
function myNameList() {
  // Separados por «;»: los nombres de los PGN suelen llevar coma («Kasparov, Garry»)
  return String(settings.myNames || settings.lichessUser || "").split(";").map(x => norm(x).trim()).filter(Boolean);
}
function colorOfMe(rec, names) {
  if (!names.length) return 0;
  const w = norm(rec.white).trim(), b = norm(rec.black).trim();
  return names.includes(w) ? 1 : names.includes(b) ? -1 : 0;
}
function timeCat(rec) {
  let tc = rec.timeControl;
  if (!tc) { const m = /\[TimeControl "([^"]*)"\]/.exec(rec.pgn || ""); tc = m ? m[1] : ""; }
  if (tc === "-") return "corr";
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc);
  if (m) { const est = +m[1] + 40 * (+m[2] || 0); return est < 180 ? "bullet" : est < 480 ? "blitz" : est < 1500 ? "rapid" : "classical"; }
  const ev = norm(rec.event);
  if (/bullet|bala/.test(ev)) return "bullet";
  if (/blitz/.test(ev)) return "blitz";
  if (/rapid|rapida/.test(ev)) return "rapid";
  if (/classical|clasica/.test(ev)) return "classical";
  if (/correspondence|correspondencia/.test(ev)) return "corr";
  return "";
}
function gameTime(rec) {
  const m = /^(\d{4})\.(\d{2}|\?\?)?\.?(\d{2}|\?\?)?/.exec(rec.date || "");
  if (m && +m[1] > 1000) return new Date(+m[1], m[2] && m[2] !== "??" ? +m[2] - 1 : 0, m[3] && m[3] !== "??" ? +m[3] : 1).getTime();
  return rec.created || 0;
}
let ECO_NAMES = null;
function ecoName(code) {
  if (!ECO_NAMES) { ECO_NAMES = new Map(); for (const e of ECO_BOOK) if (!ECO_NAMES.has(e.eco)) ECO_NAMES.set(e.eco, e.name.split(" · ")[0]); }
  return ECO_NAMES.get(code) || "";
}
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (x, n) => (n ? Math.round((x / n) * 100) : null);
function scoreOf(res, c) { return res === "1-0" ? (c === 1 ? 1 : 0) : res === "0-1" ? (c === -1 ? 1 : 0) : res === "1/2-1/2" ? 0.5 : null; }
function computeStats(f) {
  const names = myNameList(), since = f.period ? Date.now() - f.period * 864e5 : 0;
  const blank = () => ({ games: 0, w: 0, d: 0, l: 0, pts: 0, fin: 0, accs: [] });
  const S = Object.assign(blank(), { analysed: 0, byColor: { 1: blank(), "-1": blank() }, ph: { apertura: [], medio: [], final: [] }, phErr: { apertura: 0, medio: 0, final: 0 },
    th: {}, counts: { "?!": 0, "?": 0, "??": 0 }, thGames: {}, openings: new Map(), months: new Map(), pending: [], names });
  const add = (o, sc, acc) => { o.games++; if (sc != null) { o.fin++; o.pts += sc; sc === 1 ? o.w++ : sc === 0 ? o.l++ : o.d++; } if (acc != null) o.accs.push(acc); };
  for (const rec of Lib.games.values()) {
    const c = colorOfMe(rec, names);
    if (!c || (f.color && c !== f.color)) continue;
    if (f.tc && timeCat(rec) !== f.tc) continue;
    const t = gameTime(rec);
    if (t < since) continue;
    const sc = scoreOf(rec.result, c), a = rec.analysis, my = a && a.p && a.p[c];
    const acc = my && my.acc != null ? my.acc : null;
    add(S, sc, acc);
    add(S.byColor[c], sc, acc);
    if (acc != null) {
      S.analysed++;
      for (const ph of ["apertura", "medio", "final"]) { if (my.ph && my.ph[ph] != null) S.ph[ph].push(my.ph[ph]); S.phErr[ph] += (my.phErr && my.phErr[ph]) || 0; }
      for (const k of ["?!", "?", "??"]) S.counts[k] += (my.c && my.c[k]) || 0;
      for (const [k, v] of Object.entries(my.th || {})) { S.th[k] = (S.th[k] || 0) + v; S.thGames[k] = (S.thGames[k] || 0) + 1; }
    } else S.pending.push(rec);
    const code = rec.eco || (a && a.eco) || "";
    const okey = (code || "—") + "|" + c;
    if (!S.openings.has(okey)) S.openings.set(okey, Object.assign(blank(), { code, c }));
    add(S.openings.get(okey), sc, acc);
    const d = new Date(t), mkey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (!S.months.has(mkey)) S.months.set(mkey, blank());
    add(S.months.get(mkey), sc, acc);
  }
  return S;
}
function statsConclusions(S) {
  const out = [], phAcc = {};
  for (const ph of ["apertura", "medio", "final"]) { const v = avg(S.ph[ph]); if (v != null && S.ph[ph].length >= 3) phAcc[ph] = Math.round(v); }
  const phs = Object.entries(phAcc).sort((a, b) => a[1] - b[1]);
  const phName = { apertura: "la apertura", medio: "el medio juego", final: "el final" };
  if (phs.length >= 2 && phs[phs.length - 1][1] - phs[0][1] >= 5) {
    const tip = { apertura: "repasa tus líneas con el explorador y el entrenador de repertorio", medio: "entrena táctica y planes con «🎯 Errores de tus partidas»", final: "practica en «👑 Finales» contra la tabla perfecta" }[phs[0][0]];
    out.push(`Tu fase más floja es ${phName[phs[0][0]]} (${phs[0][1]} % de precisión, frente a ${phs[phs.length - 1][1]} % en ${phName[phs[phs.length - 1][0]]}): ${tip}.`);
  }
  const th = Object.entries(S.thGames).sort((a, b) => b[1] - a[1])[0];
  if (th && S.analysed >= 3) {
    const every = S.analysed / th[1];
    out.push(`Tu error más habitual: ${THEMES[th[0]].name.toLowerCase()}, ${every <= 1.2 ? "en casi todas las partidas" : `en 1 de cada ${Math.round(every)} partidas`}. Entrénalo con el botón 🎯 de esa fila.`);
  }
  const W = S.byColor[1], B = S.byColor[-1];
  if (W.fin >= 3 && B.fin >= 3) {
    const sw = pct(W.pts, W.fin), sb = pct(B.pts, B.fin);
    if (Math.abs(sw - sb) >= 12) out.push(`Con ${sw < sb ? "blancas" : "negras"} puntúas bastante menos (${Math.min(sw, sb)} % frente a ${Math.max(sw, sb)} %).`);
  }
  const ops = [...S.openings.values()].filter(o => o.code && o.fin >= 3);
  if (ops.length >= 2) {
    ops.sort((a, b) => a.pts / a.fin - b.pts / b.fin);
    const worst = ops[0], best = ops[ops.length - 1];
    const lbl = o => `${o.code} ${ecoName(o.code)} con ${o.c === 1 ? "blancas" : "negras"}`.replace("  ", " ");
    if (worst.pts / worst.fin < 0.45) out.push(`La apertura que peor te va: ${lbl(worst)} (${String(worst.pts).replace(".", ",")} de ${worst.fin} puntos).`);
    if (best.pts / best.fin > 0.55 && best !== worst) out.push(`Tu mejor apertura: ${lbl(best)} (${String(best.pts).replace(".", ",")} de ${best.fin} puntos).`);
  }
  const months = [...S.months.entries()].sort((a, b) => a[0].localeCompare(b[0])).filter(([, m]) => m.accs.length);
  if (months.length >= 4) {
    const half = Math.floor(months.length / 2);
    const before = avg(months.slice(0, half).flatMap(([, m]) => m.accs)), after = avg(months.slice(half).flatMap(([, m]) => m.accs));
    if (Math.abs(after - before) >= 3) out.push(`Tu precisión ${after > before ? "sube" : "baja"}: de ${Math.round(before)} % a ${Math.round(after)} % en los meses más recientes.`);
  }
  if (!out.length && S.analysed) out.push("No se ve ningún punto débil claro: sigue analizando partidas para afinar las conclusiones.");
  return out;
}
function statsChart(S) {
  const months = [...S.months.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  if (months.length < 2) return "";
  const W = 560, H = 190, L = 34, R = 48, T = 12, Bm = 26, iw = W - L - R, ih = H - T - Bm;
  const x = i => L + (months.length === 1 ? iw / 2 : (i * iw) / (months.length - 1)), y = v => T + ih - (v / 100) * ih;
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const lab = k => MES[+k.slice(5) - 1] + " " + k.slice(2, 4);
  const series = [
    { name: "Precisión", color: "#1e88e5", val: m => (m.accs.length ? avg(m.accs) : null), dash: "" },
    { name: "Puntuación", color: "#d06c0a", val: m => (m.fin ? (m.pts / m.fin) * 100 : null), dash: "5 3" }
  ];
  let svg = `<svg class="st-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución mensual de la precisión y la puntuación">`;
  for (const v of [0, 25, 50, 75, 100]) svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="st-grid"/><text x="${L - 5}" y="${y(v) + 3.5}" class="st-ax" text-anchor="end">${v}</text>`;
  const step = Math.ceil(months.length / 7);
  months.forEach(([k], i) => { if (i % step === 0 || i === months.length - 1) svg += `<text x="${x(i)}" y="${H - 8}" class="st-ax" text-anchor="middle">${lab(k)}</text>`; });
  const ends = [];
  for (const s of series) {
    const pts = months.map(([k, m], i) => ({ i, k, m, v: s.val(m) })).filter(p => p.v != null);
    if (!pts.length) continue;
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash}" stroke-linejoin="round" points="${pts.map(p => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}"/>`;
    for (const p of pts) svg += `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--panel)" stroke-width="2"><title>${lab(p.k)} · ${s.name}: ${Math.round(p.v)} % (${p.m.games} partida${p.m.games === 1 ? "" : "s"})</title></circle>`;
    const last = pts[pts.length - 1];
    ends.push({ x: x(last.i) + 8, y: y(last.v) + 4, txt: `${Math.round(last.v)} %`, color: s.color });
  }
  // Valor final junto a cada línea; si los dos coinciden en altura, se separan
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 16) {
    const [hi, lo] = ends[0].y <= ends[1].y ? ends : [ends[1], ends[0]];
    const mid = (hi.y + lo.y) / 2;
    hi.y = mid - 8; lo.y = mid + 8;
    if (hi.y < 12) { hi.y = 12; lo.y = 28; }
  }
  for (const e of ends) svg += `<text x="${e.x}" y="${e.y}" class="st-lbl" fill="${e.color}" style="fill:${e.color}">${e.txt}</text>`;
  svg += `</svg>`;
  const legend = `<div class="st-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}${s.dash ? " (discontinua)" : ""}</span>`).join("")}</div>`;
  const table = `<details class="st-table"><summary>Ver los datos en una tabla</summary><table class="rep-phases"><thead><tr><th>Mes</th><th>Partidas</th><th>Puntuación</th><th>Precisión</th></tr></thead><tbody>${months.map(([k, m]) => `<tr><td>${lab(k)}</td><td>${m.games}</td><td>${m.fin ? pct(m.pts, m.fin) + "%" : "–"}</td><td>${m.accs.length ? Math.round(avg(m.accs)) + "%" : "–"}</td></tr>`).join("")}</tbody></table></details>`;
  return `<h3>📈 Evolución por meses</h3>${legend}${svg}${table}`;
}
function renderNameChips() {
  const freq = new Map();
  for (const r of Lib.games.values()) for (const n of [r.white, r.black]) { const k = String(n || "").trim(); if (k && k !== "?" && k !== "Blancas" && k !== "Negras") freq.set(k, (freq.get(k) || 0) + 1); }
  const mine = myNameList();
  const top = [...freq.entries()].filter(([k]) => !mine.includes(norm(k).trim())).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const box = $("nameChips");
  box.innerHTML = top.length ? `Los que más aparecen en tu biblioteca: ` + top.map(([k, n]) => `<button class="sm-btn" data-name="${esc(k)}">+ ${esc(k)} (${n})</button>`).join(" ") : "";
  box.querySelectorAll("[data-name]").forEach(b => b.onclick = () => {
    const cur0 = $("myNames").value.split(";").map(x => x.trim()).filter(Boolean);
    cur0.push(b.dataset.name);
    $("myNames").value = cur0.join("; ");
    saveMyNames();
  });
}
function saveMyNames() {
  settings.myNames = $("myNames").value.split(";").map(x => x.trim()).filter(Boolean).join("; ");
  saveSettings();
  renderStats();
  renderDrillInfo();
}
function renderStatsBatch() {
  const box = $("statsBatch");
  if (!Batch.running) return;
  box.hidden = false;
  box.innerHTML = `<b>🤖 Analizando tus partidas con ${esc(Engine.name)}…</b> ${Batch.done} de ${Batch.total} terminadas.<div class="small">${esc(Batch.status)}</div>
    <div class="progress show"><div style="width:${((Batch.done / Math.max(1, Batch.total)) * 100).toFixed(1)}%"></div></div>
    <div class="controls"><button class="sm-btn danger" id="stBatchStop">⏹ Detener</button><span class="small">Puedes seguir usando la aplicación; el motor queda ocupado hasta que termine.</span></div>`;
  $("stBatchStop").onclick = () => { Batch.cancel = true; Engine.cancel("batch"); };
}
let statsSeq = 0;
async function renderStats() {
  if (!Lib.ready) return;
  const seq = ++statsSeq, out = $("statsOut");
  if (document.activeElement !== $("myNames")) $("myNames").value = settings.myNames || settings.lichessUser || "";
  renderNameChips();
  const names = myNameList();
  if (!names.length) {
    out.innerHTML = `<div class="note-box">Escribe arriba tu nombre (o tus nombres) tal como aparece en tus partidas, por ejemplo tu usuario de Lichess, y pulsa «Guardar». Las estadísticas se calculan con las partidas de tu biblioteca en las que juegas tú.</div>`;
    return;
  }
  const mine = [...Lib.games.values()].filter(r => colorOfMe(r, names));
  if (mine.some(r => !r.analysis && hasPgnEvals(r))) {
    out.innerHTML = `<p class="small">⏳ Preparando los análisis guardados…</p>`;
    await ensureSummaries(mine);
    if (seq !== statsSeq) return;
  }
  const f = { period: +$("stPeriod").value, tc: $("stTc").value, color: +$("stColor").value };
  const S = computeStats(f);
  if (!S.games) {
    out.innerHTML = `<div class="note-box">No hay partidas tuyas ${mine.length ? "con estos filtros" : "en la biblioteca"}. ${mine.length ? "" : "Comprueba que el nombre coincide con el de las cabeceras (Blancas / Negras) y guarda tus partidas en la biblioteca, por ejemplo descargándolas de Lichess desde «🗂 Abrir .pgn»."}</div>`;
    return;
  }
  const fmtSc = o => (o.fin ? `${pct(o.pts, o.fin)} %` : "–");
  const fmtAcc = o => (o.accs.length ? Math.round(avg(o.accs)) + " %" : "–");
  const perGame = k => (S.analysed ? (S.counts[k] / S.analysed).toLocaleString("es-ES", { maximumFractionDigits: 1 }) : "–");
  let html = `<div class="st-tiles">
    <div class="st-tile"><span>Partidas</span><b>${S.games}</b><small>${S.analysed} analizada${S.analysed === 1 ? "" : "s"}</small></div>
    <div class="st-tile"><span>Resultados</span><b>+${S.w} =${S.d} −${S.l}</b><small>${S.games - S.fin ? `${S.games - S.fin} sin terminar` : "ganadas · tablas · perdidas"}</small></div>
    <div class="st-tile"><span>Puntuación</span><b>${fmtSc(S)}</b><small>de los puntos posibles</small></div>
    <div class="st-tile"><span>Precisión media</span><b>${fmtAcc(S)}</b><small>en las analizadas</small></div>
    <div class="st-tile"><span>Errores por partida</span><b>${perGame("??")} <small>??</small> · ${perGame("?")} <small>?</small></b><small>${perGame("?!")} imprecisiones</small></div>
  </div>`;
  const conc = statsConclusions(S);
  if (conc.length) html += `<h3>💡 Conclusiones</h3><ul class="st-conc">${conc.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`;
  html += `<h3>♔ Por color</h3><table class="rep-phases"><thead><tr><th></th><th>Partidas</th><th>+ = −</th><th>Puntuación</th><th>Precisión</th></tr></thead><tbody>` +
    [[1, "Con blancas"], [-1, "Con negras"]].map(([c, l]) => { const o = S.byColor[c]; return `<tr><td>${l}</td><td>${o.games}</td><td>+${o.w} =${o.d} −${o.l}</td><td>${fmtSc(o)}</td><td>${fmtAcc(o)}</td></tr>`; }).join("") + `</tbody></table>`;
  if (S.analysed) {
    html += `<h3>⏱ Por fases</h3><table class="rep-phases"><thead><tr><th></th><th>Precisión</th><th>Errores (? y ??) por partida</th></tr></thead><tbody>` +
      PHASES.map(([k, l]) => `<tr><td>${l}</td><td>${S.ph[k].length ? Math.round(avg(S.ph[k])) + " %" : "–"}</td><td>${(S.phErr[k] / S.analysed).toLocaleString("es-ES", { maximumFractionDigits: 2 })}</td></tr>`).join("") + `</tbody></table>`;
    const ths = Object.keys(THEMES).filter(k => S.thGames[k]).sort((a, b) => S.thGames[b] - S.thGames[a]);
    html += `<h3>🔍 Tus errores más frecuentes</h3>`;
    if (ths.length) {
      const maxG = Math.max(...ths.map(k => S.thGames[k]));
      html += `<div class="st-bars">` + ths.map(k => `<div class="st-bar-row"><span class="st-bar-lbl">${THEMES[k].icon} ${esc(THEMES[k].name)}</span>
        <span class="st-bar"><i style="width:${((S.thGames[k] / maxG) * 100).toFixed(0)}%"></i></span>
        <span class="st-bar-val">${S.thGames[k]} de ${S.analysed} partidas</span>
        <button class="sm-btn" data-drill="${THEMES[k].drill}" title="Entrenar estas posiciones">🎯 Entrenar</button></div>`).join("") + `</div>`;
    } else html += `<p class="small">Sin errores (? ni ??) en tus partidas analizadas. ¡Muy bien!</p>`;
  }
  const ops = [...S.openings.values()].sort((a, b) => b.games - a.games).slice(0, 12);
  html += `<h3>📖 Aperturas</h3><div class="cb-table-wrap" style="max-height:300px"><table class="cb-table"><thead><tr><th>Apertura</th><th>Color</th><th class="num">Partidas</th><th>+ = −</th><th class="num">Puntos</th><th class="num">Precisión</th></tr></thead><tbody>` +
    ops.map(o => `<tr ${o.code ? `data-eco="${esc(o.code)}" title="Ver estas partidas en «Mis partidas»"` : ""}><td>${o.code ? `<span class="srs-pill">${esc(o.code)}</span> ${esc(ecoName(o.code))}` : `<span class="small">sin código ECO</span>`}</td><td>${o.c === 1 ? "♔" : "♚"}</td><td class="num">${o.games}</td><td>+${o.w} =${o.d} −${o.l}</td><td class="num">${fmtSc(o)}</td><td class="num">${fmtAcc(o)}</td></tr>`).join("") + `</tbody></table></div>`;
  html += statsChart(S);
  const pend = S.pending.filter(r => r.plies > 4);
  if (pend.length && !Batch.running) {
    const ms = +$("stBatchMs").value || 300;
    const secs = pend.reduce((a, r) => a + (r.plies + 1) * (ms / 1000 + 0.05), 0);
    html += `<div class="note-box st-pending"><b>🤖 ${pend.length} partida${pend.length === 1 ? "" : "s"} tuya${pend.length === 1 ? "" : "s"} sin analizar.</b> Las estadísticas de precisión y errores sólo cuentan las analizadas.
      <div class="controls"><button class="sm-btn primary" id="stBatchBtn">🤖 Analizarlas ahora</button><span class="small">Tardará unos ${secs < 90 ? Math.max(1, Math.round(secs)) + " s" : Math.round(secs / 60) + " min"} con el ritmo elegido.</span></div></div>`;
  }
  out.innerHTML = html;
  out.querySelectorAll("[data-drill]").forEach(b => b.onclick = () => { $("drillType").value = b.dataset.drill; startDrills("due"); });
  out.querySelectorAll("[data-eco]").forEach(tr => tr.onclick = () => { $("libFilter").value = tr.dataset.eco; switchSub("games"); renderLibrary(); });
  const bb = $("stBatchBtn");
  if (bb) bb.onclick = () => analysePending(pend);
  if (!Batch.running) $("statsBatch").hidden = true;
}
const renderStatsSoon = debounce(() => { if (ui.activeTab === "library" && ui.librarySub === "stats" && !Batch.running) renderStats(); }, 400);

/* ---------- B14. Ejercicios con los errores de tus partidas ---------- */
const DRILL_TYPES = { "": "Todos los errores", material: "Táctica: pérdidas de material", mateMissed: "Encuentra el mate", mateAllowed: "Defensa: mates permitidos", wasted: "Convertir la ventaja", positional: "Errores de planteamiento", apertura: "Errores en la apertura", final: "Errores en el final" };
function drillPool() {
  const names = myNameList(), onlyMine = $("drillMine").checked && names.length, type = $("drillType").value, out = [];
  for (const rec of Lib.games.values()) {
    const a = rec.analysis;
    if (!a || !a.err || !a.err.length) continue;
    const c = colorOfMe(rec, names);
    for (const e of a.err) {
      if (onlyMine && e.mover !== c) continue;
      if (type === "apertura" || type === "final" ? e.ph !== type : type && e.th !== type) continue;
      const key = e.ply + e.uci;
      out.push({ rec, e, key, srs: rec.drills && rec.drills[key] });
    }
  }
  return out;
}
let drillInfoSeq = 0;
async function renderDrillInfo() {
  if (!Lib.ready) return;
  const seq = ++drillInfoSeq;
  await ensureSummaries([...Lib.games.values()]);
  if (seq !== drillInfoSeq) return;
  const names = myNameList();
  $("drillMine").disabled = !names.length;
  $("drillMineLbl").title = names.length ? "" : "Configura tus nombres en «📚 Biblioteca › 📊 Estadísticas»";
  const pool = drillPool(), now = Date.now();
  const due = pool.filter(x => !x.srs || x.srs.due <= now).length;
  $("drillBadge").textContent = `${due} pendiente${due === 1 ? "" : "s"}`;
  $("drillBadge").className = "srs-pill" + (due ? " due" : "");
  const games = new Set(pool.map(x => x.rec.id)).size;
  $("drillInfo").textContent = pool.length
    ? `${pool.length} ${pool.length === 1 ? "posición" : "posiciones"} de ${games} partida${games === 1 ? "" : "s"} analizada${games === 1 ? "" : "s"}${$("drillMine").checked && names.length ? " (sólo tus jugadas)" : ""}; ${due} pendiente${due === 1 ? "" : "s"} de repaso.`
    : `No hay ejercicios de este tipo. Salen de los ? y ?? de las partidas de tu biblioteca analizadas con «🤖 Analizar y comentar» (o desde «📊 Estadísticas › Analizarlas ahora»).`;
}
function drillNode(item) {
  const { rec, e } = item;
  let g;
  try { g = Pgn.newGame(e.fen); } catch { return null; }
  const mv = Chess.moveFromUci(g.root.state, e.uci);
  if (!mv) return null;
  g.headers.Event = "Ejercicio";
  g.headers.White = rec.white || "Blancas";
  g.headers.Black = rec.black || "Negras";
  g.root.eval = Object.assign({ depth: 0, source: "pgn" }, e.ev || { cp: 0 }, e.best ? { best: e.best, pv: e.pv || [e.best] } : {});
  const node = Pgn.addMove(g.root, mv);
  node.nag = e.cls;
  node.eval = Object.assign({ depth: 0, source: "pgn" }, e.evAfter || { cp: 0 });
  node.__game = g;
  node.__drill = { recId: rec.id, key: item.key, e, title: rec.title, date: rec.date };
  return node;
}
function startDrills(mode) {
  if (!Lib.ready) return;
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  const pool = drillPool(), now = Date.now();
  if (!pool.length) { toast("No hay ejercicios de ese tipo: analiza antes tus partidas guardadas.", 4000); switchTab("tools"); openTrainSection("drill"); return; }
  let list = mode === "due" ? pool.filter(x => !x.srs || x.srs.due <= now) : pool.slice();
  if (!list.length) { toast("¡No tienes ejercicios pendientes hoy! 🎉 Pulsa «Al azar» para repasar igualmente.", 4000); return; }
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  if (mode === "due") list.sort((a, b) => (a.srs ? a.srs.due : now) - (b.srs ? b.srs.due : now));
  const q = list.slice(0, +$("drillCount").value).map(drillNode).filter(Boolean);
  if (!q.length) return;
  if (!stashBoard()) return;
  $("cardsBackBtn").hidden = false;
  if (Retry.active) retryEnd(true);
  startRetry(0, q);
}
async function drillRecord(node, ok) {
  logActivity("drill");
  const d = node.__drill, rec = d && Lib.games.get(d.recId);
  if (!rec) return;
  rec.drills = rec.drills || {};
  const s = rec.drills[d.key] || { box: 0, reps: 0 };
  srsStep(s, ok);
  s.ok = ok;
  rec.drills[d.key] = s;
  try { await DB.put("games", rec); } catch (e) { console.warn("No se pudo guardar el repaso:", e); }
  renderDrillInfo();
}
async function prepareDrill(node) {
  // Partidas con evaluaciones de un PGN: no se sabe cuál era la buena; la calcula el motor
  const p = node.parent;
  Retry.state = "preparing";
  retryPanel();
  const job = await Engine.analyse(p, { purpose: "retry", movetime: Math.max(800, +settings.analysisMs), multipv: 1 });
  if (!Retry.active || retryNode() !== node) return false;
  if (job) storeEval(p, job, true);
  return !!(p.eval && p.eval.best);
}
function pathOfPly(rec, ply) {
  const r = Pgn.parseGame(rec.pgn, { lang: "en" });
  return Pgn.mainlineFrom(r.game.root).slice(0, ply).map(n => n.uci);
}

/* ---------- B15. Buscar la posición, la estructura de peones o el material ---------- */
function pawnKey(s) {
  const w = [], b = [];
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (s.b[i] === "P") w.push(i); else if (s.b[i] === "p") b.push(i); }
  return w.join(",") + "|" + b.join(",");
}
function materialKey(s) {
  const cnt = {};
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (p !== "." && p.toLowerCase() !== "k") cnt[p] = (cnt[p] || 0) + 1; }
  return "QRBNPqrbnp".split("").map(p => p + (cnt[p] || 0)).join("");
}
function materialText(s) {
  const cnt = {};
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (p !== ".") cnt[p] = (cnt[p] || 0) + 1; }
  const side = up => "KQRBNP".split("").map(p => glyphUnicode[p].repeat(cnt[up ? p : p.toLowerCase()] || 0)).join("");
  return side(true) + " contra " + side(false);
}
const PosSearch = { running: false, cancel: false };
async function searchPosition() {
  if (PosSearch.running) { PosSearch.cancel = true; return; }
  const mode = $("posMode").value, s = viewState(), node = cur();
  const target = mode === "exact" ? node.key : mode === "pawns" ? pawnKey(s) : materialKey(s);
  const keyOf = mode === "exact" ? n => n.key : mode === "pawns" ? n => pawnKey(n.state) : n => materialKey(n.state);
  if (mode === "pawns" && target === "|") { toast("En esta posición no quedan peones: busca por material."); return; }
  const sources = [...[...Lib.games.values()].filter(r => r.id !== ui.libId).map(r => ({ lib: r.id })), ...($("posColl").checked ? Coll.games.map((g, i) => ({ coll: i })) : [])];
  if (!sources.length) { toast("No hay partidas en las que buscar: tu biblioteca está vacía y no hay ningún .pgn abierto."); return; }
  Object.assign(PosSearch, { running: true, cancel: false });
  $("posBtn").textContent = "⏹ Detener";
  const list = $("posResults"), found = [];
  list.innerHTML = "";
  const tally = { w: 0, d: 0, b: 0 }, names = myNameList(), me = { games: 0, pts: 0, fin: 0 };
  for (let k = 0; k < sources.length && !PosSearch.cancel; k++) {
    const src = sources[k];
    let r;
    try { r = src.lib != null ? Pgn.parseGame(Lib.games.get(src.lib).pgn, { lang: "en" }) : Pgn.parseGame(Coll.games[src.coll], { lang: "auto" }); } catch { continue; }
    let n = r.game.root, ply = 0, hit = null;
    for (;;) {
      if (ply >= (mode === "exact" ? 0 : 2) && keyOf(n) === target) { hit = n; break; }
      if (!n.children.length) break;
      n = n.children[0]; ply++;
    }
    if (hit) {
      const h = r.game.headers, res = (h.Result || "*").trim();
      if (res === "1-0") tally.w++; else if (res === "0-1") tally.b++; else if (res === "1/2-1/2") tally.d++;
      if (src.lib != null) { const c = colorOfMe(Lib.games.get(src.lib), names); if (c) { me.games++; const sc = scoreOf(res, c); if (sc != null) { me.fin++; me.pts += sc; } } }
      found.push(Object.assign({ h, path: Pgn.pathTo(hit).slice(1).map(x => x.uci), label: hit.parent ? `${numPrefix(hit.parent.state)}${dispSan(hit)}` : "posición inicial", fen: Chess.toFen(hit.state) }, src));
    }
    if (k % 20 === 19) {
      $("posStatus").textContent = `Buscando: ${k + 1} de ${sources.length} partidas · ${found.length} encontradas…`;
      await new Promise(res => setTimeout(res, 0));
    }
  }
  const stopped = PosSearch.cancel;
  Object.assign(PosSearch, { running: false, cancel: false });
  $("posBtn").textContent = "🔍 Buscar";
  const what = { exact: "la misma posición", pawns: "la misma estructura de peones", material: "el mismo material" }[mode];
  const tot = tally.w + tally.d + tally.b;
  $("posStatus").innerHTML = `${stopped ? "⏹ Búsqueda detenida. " : ""}<b>${found.length}</b> partida${found.length === 1 ? "" : "s"} con ${what}` +
    (tot ? ` · resultados: blancas ${tally.w}, tablas ${tally.d}, negras ${tally.b} (las blancas puntúan ${pct(tally.w + tally.d / 2, tot)} %)` : "") +
    (me.fin ? ` · tú: ${String(me.pts).replace(".", ",")} de ${me.fin} puntos en ${me.games} partida${me.games === 1 ? "" : "s"}` : "") + ".";
  const frag = document.createDocumentFragment();
  for (const f of found.slice(0, 200)) {
    const div = document.createElement("div");
    div.className = "mark-card";
    div.tabIndex = 0;
    div.innerHTML = `${miniBoard(f.fen)}<div><div><b>${esc(f.h.White || "?")} – ${esc(f.h.Black || "?")}</b> <span class="small">${esc(f.h.Result || "*")} · ${esc((f.h.Date || "").slice(0, 4))}${f.h.Event && f.h.Event !== "?" ? " · " + esc(f.h.Event) : ""}</span></div>
      <div class="small">${f.lib != null ? "📚 Biblioteca" : "🗂 .pgn abierto"} · aparece tras <b>${esc(f.label)}</b></div></div>`;
    const open = () => {
      if (f.lib != null) { if (openLibGame(f.lib, f.path)) switchTab("study"); }
      else { loadCollGame(f.coll); if (Coll.games[f.coll]) goTo(resolvePath(game.root, f.path)); }
    };
    div.onclick = open;
    div.onkeydown = e => { if (e.key === "Enter") open(); };
    frag.append(div);
  }
  list.append(frag);
  if (found.length > 200) list.insertAdjacentHTML("beforeend", `<p class="small">Se muestran las 200 primeras.</p>`);
}
function renderPosTarget() {
  const s = viewState(), mode = $("posMode").value;
  $("posTarget").innerHTML = `${miniBoard(Chess.toFen(s))}<div class="small">${mode === "exact" ? "Busca partidas que pasen exactamente por la posición del tablero (mismas piezas en las mismas casillas y mismo turno)." :
    mode === "pawns" ? "Busca partidas con los mismos peones en las mismas casillas, aunque las piezas estén en otro sitio: ideal para estudiar planes típicos de una estructura." :
      `Busca partidas que lleguen al mismo material: ${esc(materialText(s))}. Muy útil para finales (por ejemplo, torre y peón contra torre).`}</div>`;
}

