/* ---------- 14. Lista de jugadas con variantes ---------- */
const NAG_CLASS = { "!!": "nag-brilliant", "!": "nag-good", "!?": "nag-good", "?!": "nag-inacc", "?": "nag-mistake", "??": "nag-blunder" };
/* Huella del contenido de la lista de jugadas: si no cambia, basta con mover el resaltado */
function movesSignature(marked) {
  let s = `${settings.lang}|${settings.moveView}|${quiz() ? "q" + cur().id : ""}|${game.root.comment || ""}|${[...marked].map(([k, m]) => k + m.cat + (m.note || "")).join()}|`;
  const st = [game.root];
  while (st.length) {
    const n = st.pop();
    s += n.id + (n.nag || "") + (n.posNag || "") + "{" + (n.comment || "") + "}";
    for (let i = n.children.length - 1; i >= 0; i--) st.push(n.children[i]);
  }
  return s;
}
function scrollActiveMove() {
  const box = $("moves"), a = box.querySelector(".mv.active");
  if (a) {
    const top = a.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 30) box.scrollTop = Math.max(0, top - box.clientHeight / 2);
  } else if (!cur().parent) box.scrollTop = 0;
}
function renderMoves() {
  const box = $("moves");
  if (typeof hoverTip !== "undefined") hoverTip.hidden = true;
  const marked = Lib.ready ? markedNodesOfCurrent() : new Map();
  const sig = movesSignature(marked);
  if (sig === ui.movesSig && box.children.length) {
    const prev = box.querySelector(".mv.active");
    if (prev) prev.classList.remove("active");
    const now = box.querySelector(`.mv[data-id="${cur().id}"]`);
    if (now) now.classList.add("active");
    scrollActiveMove();
    return;
  }
  ui.movesSig = sig;
  ui.nodeMap = new Map();
  const frag = document.createDocumentFragment();
  const emit = (parentEl, node, forceNum) => {
    const ps = node.parent.state;
    if (ps.t === 1 || forceNum) {
      const n = document.createElement("span");
      n.className = "mvnum";
      n.textContent = ps.full + (ps.t === 1 ? "." : "…");
      parentEl.append(n);
    }
    const b = document.createElement("span");
    b.className = "mv" + (node === cur() ? " active" : "");
    if (node.clk != null) { const sp = spentOn(node); b.title = `⏱ ${sp != null ? "tardó " + fmtSecs(sp) + " · " : ""}le quedaban ${fmtClock(node.clk * 1000)}`; }
    b.dataset.id = node.id;
    const mk = marked.get(node.id);
    b.innerHTML = esc(dispSan(node)) + (node.nag ? `<span class="nag ${NAG_CLASS[node.nag] || ""}">${esc(node.nag)}</span>` : "") + (node.posNag ? `<span class="nag-pos">${esc(node.posNag)}</span>` : "") + (mk ? `<span class="mv-mark" title="${esc(CATS[mk.cat].name + (mk.note ? ": " + mk.note : ""))}">${CATS[mk.cat].icon}</span>` : "");
    ui.nodeMap.set(node.id, node);
    parentEl.append(b, " ");
  };
  const comment = (parentEl, node) => {
    if (!node.comment) return false;
    const c = document.createElement("span");
    c.className = "mvcomment";
    c.textContent = node.comment.length > 220 ? node.comment.slice(0, 217) + "…" : node.comment;
    c.title = node.comment;
    parentEl.append(c, " ");
    return true;
  };
  if (quiz()) {
    const path = Pgn.pathTo(cur()).slice(1);
    path.forEach((n, i) => emit(frag, n, i === 0));
    if (!path.length) frag.append(Object.assign(document.createElement("span"), { className: "empty-moves", textContent: "Entrenamiento en curso: las jugadas aparecen a medida que las haces." }));
  } else {
    if (game.root.comment) comment(frag, game.root);
    if (!game.root.children.length) frag.append(Object.assign(document.createElement("span"), { className: "empty-moves", textContent: "Sin jugadas. Mueve una pieza o importa una partida." }));
    const line = (parentEl, node, forceNum) => {
      let c = node;
      while (c.children.length) {
        const main = c.children[0];
        emit(parentEl, main, forceNum);
        forceNum = comment(parentEl, main);
        for (const alt of c.children.slice(1)) {
          const v = document.createElement("div");
          v.className = "var";
          emit(v, alt, true);
          const hc = comment(v, alt);
          line(v, alt, hc);
          parentEl.append(v);
          forceNum = true;
        }
        c = main;
      }
    };
    if (settings.moveView === "sheet" && game.root.children.length) {
      // Planilla: dos columnas (Nº · blancas · negras); comentarios y variantes cortan la tabla
      const emitMove = (cell, node) => { const tmp = document.createElement("span"); emit(tmp, node, false); tmp.querySelectorAll(".mvnum").forEach(x => x.remove()); cell.append(...tmp.childNodes); };
      let cells = null;
      const startRow = (num, blackFirst) => {
        const row = document.createElement("div");
        row.className = "sheet-row";
        row.innerHTML = `<span class="sheet-num">${num}.</span><span class="sheet-cell"></span><span class="sheet-cell"></span>`;
        cells = row.querySelectorAll(".sheet-cell");
        if (blackFirst) cells[0].textContent = "…";
        frag.append(row);
      };
      for (const node of Pgn.mainlineFrom(game.root)) {
        const ps = node.parent.state;
        if (ps.t === 1 || !cells) startRow(ps.full, ps.t === -1);
        emitMove(cells[ps.t === 1 ? 0 : 1], node);
        const alts = node.parent.children.slice(1);
        if (node.comment || alts.length) {
          const blk = document.createElement("div");
          blk.className = "sheet-extra";
          comment(blk, node);
          for (const alt of alts) { const v = document.createElement("div"); v.className = "var"; emit(v, alt, true); const hc = comment(v, alt); line(v, alt, hc); blk.append(v); }
          frag.append(blk);
          cells = null;
        }
        if (ps.t === -1) cells = null;
      }
    } else line(frag, game.root, true);
  }
  box.replaceChildren(frag);
  scrollActiveMove();
}
$("moves").addEventListener("click", e => {
  const el = e.target.closest(".mv");
  if (!el) return;
  const n = ui.nodeMap.get(+el.dataset.id);
  if (n && !quiz()) { stopAutoplay(); goTo(n); }
});

/* ---------- 15. Comentario, apertura, gráfico y barra de evaluación ---------- */
function renderComment() {
  const n = cur();
  const ta = $("annotation");
  if (document.activeElement !== ta) ta.value = n.comment || "";
  $("currentMoveBadge").textContent = n.parent ? `Tras ${numPrefix(n.parent.state)}${dispSan(n)}` : "Posición inicial";
}
function renderEco() {
  const d = ECO.detect(cur());
  const banner = $("ecoBanner");
  if (d) banner.textContent = `${d.entry.eco} · ${d.entry.name}`;
  else if (game.root.state && Chess.toFen(game.root.state) !== Chess.START_FEN) banner.textContent = "Posición personalizada";
  else banner.textContent = cur().parent ? "Apertura sin catalogar" : "Posición inicial";
}
function updateEvalBar(ev) {
  const outer = $("evalBarOuter");
  outer.classList.toggle("flipped", ui.flipped);
  outer.classList.toggle("hidden-eval", !ev || quiz());
  const top = $("evalTopText"), bot = $("evalBotText");
  top.textContent = bot.textContent = "";
  if (!ev || quiz()) return;
  const w = winPct(ev);
  $("evalBarWhite").style.height = Math.max(2, Math.min(98, w)) + "%";
  const txt = ev.mate != null ? (ev.mate === 0 ? "#" : "#" + Math.abs(ev.mate)) : (Math.abs(ev.cp) >= 1000 ? Math.round(Math.abs(ev.cp) / 100) : (Math.abs(ev.cp) / 100).toFixed(1));
  const whiteBetter = w >= 50;
  // El texto aparece en el extremo del bando que lleva ventaja
  ((whiteBetter !== ui.flipped) ? bot : top).textContent = txt;
}
function renderEvalChart() {
  const svg = $("evalChartSvg");
  const line = [game.root, ...Pgn.mainlineFrom(game.root)];
  const W = 600, H = 64;
  const msg = $("chartMsg"), legend = $("chartLegend");
  const empty = html => {
    svg.innerHTML = `<line x1="0" y1="32" x2="600" y2="32" stroke="#2c384e" stroke-dasharray="4,4"/>`;
    msg.innerHTML = html; msg.hidden = false; legend.hidden = true;
    const btn = msg.querySelector("button");
    if (btn) btn.onclick = ev => { ev.stopPropagation(); analyseGame({ quick: true }); };
  };
  if (quiz()) { empty(`Gráfico oculto durante ${ui.cpu.on ? "la partida" : "el ejercicio"}`); return; }
  if (line.length < 2) { empty("El gráfico de evaluación aparecerá cuando haya jugadas"); return; }
  const pts = line.map((n, i) => (n.eval ? { i, w: winPct(n.eval), n } : null)).filter(Boolean);
  // Sólo se dibuja la curva si cubre casi toda la partida (o mientras se está analizando)
  const enough = pts.length >= 2 && (pts.length >= line.length * 0.8 || line.length - pts.length <= 2);
  if (!enough && !(ui.analysing && pts.length >= 2)) {
    empty(`<span>Gráfico pendiente: ${pts.length} de ${line.length} posiciones evaluadas.</span><button class="sm-btn info-btn" ${ui.analysing ? "disabled" : ""}>📈 Completar gráfico</button>`);
    return;
  }
  msg.hidden = true;
  legend.hidden = false;
  const X = i => (i / (line.length - 1)) * W, Y = w => H - (w / 100) * H;
  const poly = pts.map(p => `${X(p.i).toFixed(1)},${Y(p.w).toFixed(1)}`).join(" ");
  let marks = "";
  for (const p of pts) {
    const c = { "??": "#ef5350", "?": "#ff7043", "?!": "#ffca28", "!": "#26c6da", "!!": "#26c6da" }[p.n.nag];
    if (c) marks += `<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.w).toFixed(1)}" r="3.4" fill="${c}" stroke="#111" stroke-width=".8"/>`;
  }
  let curNode = cur();
  while (curNode && !Pgn.isMainline(curNode)) curNode = curNode.parent;
  const ci = line.indexOf(curNode);
  svg.innerHTML = `
    <rect x="0" y="0" width="${W}" height="${H}" fill="#1a202b"/>
    <polygon points="${X(pts[0].i).toFixed(1)},${H} ${poly} ${X(pts[pts.length - 1].i).toFixed(1)},${H}" fill="#dfe5ee" opacity=".9"/>
    <polyline points="${poly}" fill="none" stroke="#94a3b8" stroke-width="1"/>
    <line x1="0" y1="32" x2="600" y2="32" stroke="#64748b" stroke-width="1" stroke-dasharray="3,3"/>
    ${marks}
    ${ci >= 0 ? `<line x1="${X(ci).toFixed(1)}" y1="0" x2="${X(ci).toFixed(1)}" y2="${H}" stroke="#ffa726" stroke-width="2"/>` : ""}`;
}
$("evalChartWrap").addEventListener("click", e => {
  if (!$("chartMsg").hidden) return;
  const line = [game.root, ...Pgn.mainlineFrom(game.root)];
  if (line.length < 2 || quiz()) return;
  const rect = $("evalChartWrap").getBoundingClientRect();
  const idx = Math.round(((e.clientX - rect.left) / rect.width) * (line.length - 1));
  goTo(line[Math.max(0, Math.min(line.length - 1, idx))]);
});

/* ---------- 16. Panel del motor ---------- */
function renderEngineLines(lines, stateNode, meta) {
  const box = $("engineLines");
  if (quiz()) { box.innerHTML = `<div class="pv-empty">Motor oculto durante ${ui.cpu.on ? "la partida" : "el ejercicio"}.</div>`; $("engineMeta").textContent = ""; return; }
  if (!lines || !lines.length) { box.innerHTML = `<div class="pv-empty">${esc(meta || "Sin análisis para esta posición.")}</div>`; return; }
  box.innerHTML = "";
  lines.forEach(l => {
    if (!l) return;
    const ev = { cp: l.cp, mate: l.mate, winner: l.winner };
    const row = document.createElement("div");
    row.className = "pv-line";
    const sc = winPct(ev) >= 50 ? "pos" : "neg";
    row.innerHTML = `<span class="pv-score ${sc}">${esc(fmtEval(ev))}</span><span class="pv-moves">${lineSpans(stateNode.state, l.pv, 12)}</span>`;
    row.title = "Pulsa para jugar la primera jugada de esta línea";
    row.onclick = () => {
      const m = Chess.moveFromUci(stateNode.state, l.pv[0]);
      if (m && cur() === stateNode && canUserMove()) playMove(m, "user");
    };
    box.append(row);
  });
}
/* La valoración en palabras: «ligera ventaja de las blancas», «las negras dan mate en 3»… */
function evalVerdict(ev) {
  if (!ev) return "";
  if (ev.mate != null) {
    if (ev.mate === 0) return `Mate: ganan las ${ev.winner === 1 ? "blancas" : "negras"}`;
    return `Las ${ev.mate > 0 ? "blancas" : "negras"} dan mate en ${Math.abs(ev.mate)}`;
  }
  const a = Math.abs(ev.cp), side = ev.cp > 0 ? "las blancas" : "las negras";
  if (a < 30) return "Igualdad";
  const how = a < 70 ? "Ligera ventaja" : a < 150 ? "Ventaja clara" : a < 400 ? "Ventaja decisiva" : "Ventaja aplastante";
  const pawns = a < 70 ? "menos de un peón" : a < 150 ? "alrededor de un peón" : a < 400 ? `unos ${Math.round(a / 100)} peones` : "más de una pieza";
  return `${how} de ${side} (${pawns})`;
}
function renderVerdict(ev) {
  const el = $("engineVerdict");
  el.hidden = !ev || quiz();
  if (!el.hidden) el.innerHTML = `<b>${esc(fmtEval(ev))}</b> · ${esc(evalVerdict(ev))}`;
}
/* ⚖ La jugada que lleva a la posición actual frente a la que proponía el motor */
const Compare = { busy: false };
const COMPARE_LABEL = { "??": "?? Error grave", "?": "? Error", "?!": "?! Imprecisión" };
function renderCompare(job) {
  const el = $("moveCompare"), n = cur(), p = n.parent;
  if (!p || quiz() || editor.active) { el.hidden = true; return; }
  el.hidden = false;
  const san = numPrefix(p.state) + dispSan(n);
  const live = job && job.lines && job.lines[0] ? { cp: job.lines[0].cp, mate: job.lines[0].mate, winner: job.lines[0].winner } : null;
  const after = terminalEval(n) || n.eval || live;
  if (Compare.busy) { el.innerHTML = `⚖ ⏳ Comparando <b>${esc(san)}</b> con la jugada del motor…`; return; }
  if (p.eval && p.eval.best === n.uci) { el.innerHTML = `⚖ ★ <b>${esc(san)}</b> es la jugada que propone el motor (${esc(fmtEval(p.eval))}).`; return; }
  if (!p.eval || !p.eval.best || !after) {
    el.innerHTML = `⚖ ¿Qué tal <b>${esc(san)}</b>? <button class="sm-btn" data-cmp="run" ${Engine.ready ? "" : "disabled"}>Compararla con la del motor</button>`;
    el.querySelector("[data-cmp]").onclick = compareWithEngine;
    return;
  }
  const c = classifyMove(Object.assign({}, n, { eval: after }));
  const bm = Chess.moveFromUci(p.state, p.eval.best);
  const bestSan = bm ? numPrefix(p.state) + formatSan(Chess.san(p.state, bm), settings.lang, p.state.t) : p.eval.best;
  const label = c.book ? "📖 Jugada de teoría: no se compara" : COMPARE_LABEL[c.cls] || (c.loss < 2 ? "✔ Excelente: casi como la del motor" : "✔ Buena jugada");
  const lost = c.book ? "" : after.mate == null && p.eval.mate == null ? ` · pierdes ${(c.cpl / 100).toFixed(2).replace(".", ",")} peones` : "";
  el.innerHTML = `⚖ <b>${esc(san)}</b> → ${esc(fmtEval(after))} · la del motor, <b>${esc(bestSan)}</b> → ${esc(fmtEval(p.eval))}${lost}<br><b>${esc(label)}</b>${live && !n.eval ? ` <span class="small">(provisional, el motor sigue calculando)</span>` : ""}
    <div class="controls"><button class="sm-btn" data-cmp="best" title="Vuelve a la posición anterior y juega la del motor, como variante">↪ Probar la del motor</button></div>`;
  el.querySelector("[data-cmp=best]").onclick = () => {
    if (!bm || cur() !== n) return;
    goTo(p);
    if (canUserMove()) playMove(bm, "user");
  };
}
async function compareWithEngine() {
  const n = cur(), p = n.parent;
  if (!p || Compare.busy || !Engine.ready) return;
  Compare.busy = true;
  Engine.cancel("live");
  renderCompare();
  const ms = Math.max(800, Math.min(3000, +settings.analysisMs));
  try {
    if (!p.eval || !p.eval.best) { const j = await Engine.analyse(p, { purpose: "compare", movetime: ms, multipv: Engine.kind === "stockfish" ? 2 : 1 }); if (j) storeEval(p, j, true); }
    if (!n.eval && !terminalEval(n)) { const j = await Engine.analyse(n, { purpose: "compare", movetime: ms, multipv: 1 }); if (j) storeEval(n, j, true); }
  } finally { Compare.busy = false; }
  if (cur() === n) render();
}
function showEngineFor(node, job) {
  renderCompare(job);
  if (job && job.lines && job.lines.length) {
    const l0 = job.lines[0];
    renderVerdict({ cp: l0.cp, mate: l0.mate, winner: l0.winner });
    updateEvalBar({ cp: l0.cp, mate: l0.mate, winner: l0.winner });
    renderEngineLines(job.lines, node);
    $("engineMeta").textContent = `prof. ${job.depth || 0}` + (job.nps ? ` · ${Math.round(job.nps / 1000)} kN/s` : "");
    if (l0.pv[0]) { ui.engineArrow = { node, from: Chess.sqIdx(l0.pv[0].slice(0, 2)), to: Chess.sqIdx(l0.pv[0].slice(2, 4)) }; renderShapes(); }
    return;
  }
  const ev = node.eval || terminalEval(node);
  ui.engineArrow = null;
  renderVerdict(ev);
  if (ev) {
    updateEvalBar(ev);
    const pseudoLines = ev.lines && ev.lines.length ? ev.lines : [{ cp: ev.cp, mate: ev.mate, winner: ev.winner, pv: ev.pv || (ev.best ? [ev.best] : []) }];
    if (pseudoLines[0].pv.length) renderEngineLines(pseudoLines, node);
    else renderEngineLines(null, node, `Evaluación ${fmtEval(ev)}`);
    $("engineMeta").textContent = ev.depth && ev.depth < 99 ? `prof. ${ev.depth} (guardada)` : "";
    if (ev.best && /^[a-h][1-8][a-h][1-8]/.test(ev.best)) ui.engineArrow = { node, from: Chess.sqIdx(ev.best.slice(0, 2)), to: Chess.sqIdx(ev.best.slice(2, 4)) };
  } else {
    updateEvalBar(null);
    const st = gameStatus(node);
    renderEngineLines(null, node, st.over ? st.text : settings.live ? "Analizando…" : "Análisis en pausa. Activa «Analizar» o pulsa E.");
    $("engineMeta").textContent = "";
  }
  renderShapes();
}
const requestLive = debounce(() => {
  const node = cur();
  if (!settings.live || editor.active || quiz() || Threat.busy || ui.analysing || ExpEval.busy || ui.cpu.thinking || Compare.busy || !Engine.ready) {
    Engine.cancel("live");
    return;
  }
  if (gameStatus(node).over) { Engine.cancel("live"); return; }
  if (ui.liveNode === node && Engine.running && Engine.running.purpose === "live" && !Engine.running.cancelled) return;
  const want = Engine.kind === "stockfish" ? +settings.multipv : 1;
  const ev = node.eval;
  if (ev && ev.done && ev.source === Engine.kind && (ev.lines || []).length >= want) return;
  ui.liveNode = node;
  resetEngineBadge();
  const onInfo = throttle(j => { if (cur() === node && !j.cancelled) showEngineFor(node, j); }, 150);
  Engine.analyse(node, {
    purpose: "live", movetime: settings.liveMs, multipv: Engine.kind === "stockfish" ? +settings.multipv : 1, onInfo,
    onDone: j => { storeEval(node, j); if (ui.liveNode === node) ui.liveNode = null; if (cur() === node) { showEngineFor(node, j); renderEvalChart(); } }
  });
}, 140);

/* ---------- 17. Render general ---------- */
function saveSessionNow() {
  if (!settings.autosave || trainer.active || (typeof Cards !== "undefined" && Cards.stash)) return;
  LS.set("ajedrezStudioCurrent", {
    pgn: Pgn.exportPgn(game, { evals: true }), path: Pgn.pathTo(cur()).slice(1).map(n => n.uci), libId: ui.libId, dirty: ui.dirty, fav: ui.fav, tags: ui.tags, flipped: ui.flipped, name: $("gameName").value
  });
}
const scheduleAutosave = debounce(saveSessionNow, 600);
window.addEventListener("pagehide", saveSessionNow);
function updateButtons() {
  const n = cur();
  const q = quiz();
  $("backBtn").disabled = $("startBtn").disabled = !n.parent || q;
  $("forwardBtn").disabled = $("endBtn").disabled = !n.children.length || q;
  $("playBtn").disabled = q || !game.root.children.length;
  $("undoBtn").disabled = !n.parent || q;
  $("promoteVarBtn").disabled = !n.parent || n.parent.children[0] === n || q;
  $("mainVarBtn").disabled = Pgn.isMainline(n) || q;
  $("analyseVarBtn").hidden = Pgn.isMainline(n) || q;
  $("threatBtn").disabled = q || editor.active;
  $("playBestMoveBtn").disabled = q;
  $("threatBtn").classList.toggle("on", Threat.node === n);
  $("threatInfo").hidden = Threat.node !== n || q;
  $("clearShapesBtn").disabled = !n.shapes.length;
  $("liveToggle").checked = settings.live;
  $("arrowToggle").checked = settings.arrow;
  $("playCpuToggle").textContent = ui.cpu.on ? "⏹ Terminar vs CPU" : "🤖 Jugar vs CPU";
  $("playCpuToggle").className = ui.cpu.on ? "on" : "info-btn";
}
/* 📌 Marcadores de la partida abierta: debajo de la lista de jugadas, para volver a ellos con un clic */
function renderGameMarks() {
  const box = $("gameMarksBox");
  if (!box) return;
  const list = ui.libId && typeof Lib !== "undefined" && Lib.ready ? marksOfGame(ui.libId) : [];
  box.hidden = !list.length || quiz();
  if (box.hidden) { box.innerHTML = ""; return; }
  const items = list.map(m => ({ m, n: resolvePath(game.root, m.path, true) })).filter(x => x.n)
    .sort((a, b) => Pgn.pathTo(a.n).length - Pgn.pathTo(b.n).length);
  if (!items.length) { box.hidden = true; return; }
  box.innerHTML = `<div class="gm-head">📌 Marcadores de esta partida (${items.length})<a href="#" data-allmarks class="small">Ver todos</a></div>`
    + items.map((x, i) => `<button class="gm-row${x.n === cur() ? " current" : ""}" data-gm="${i}" title="${esc(x.m.note || "")}"><span>${CATS[x.m.cat] ? CATS[x.m.cat].icon : "📌"}</span><span class="gm-move">${x.n.parent ? esc(numPrefix(x.n.parent.state) + dispSan(x.n)) : "Inicio"}</span><span class="gm-note">${esc(x.m.note || (CATS[x.m.cat] ? CATS[x.m.cat].name : ""))}</span></button>`).join("");
  box.querySelectorAll("[data-gm]").forEach(b => b.onclick = () => { const x = items[+b.dataset.gm]; if (x && !quiz()) goTo(x.n); });
  box.querySelector("[data-allmarks]").onclick = e => { e.preventDefault(); switchTab("library"); switchSub("marks"); };
}
function render() {
  if (Think.node && Think.node !== cur() && !Think.busy) { $("thinkBox").hidden = true; Think.node = null; }
  if (Scan.node && Scan.node !== cur()) { $("scanBox").hidden = true; Scan.node = null; Scan.data = null; Scan.shapes = []; }
  if (Talk.node && Talk.node !== cur() && !Talk.busy) { $("talkBox").hidden = true; Talk.node = null; Talk.shapes = []; }
  renderGameMarks();
  renderBoard();
  renderBars();
  renderClocks();
  renderStatus();
  renderMoves();
  renderComment();
  renderEco();
  renderEvalChart();
  if (!editor.active) {
    const running = Engine.running && Engine.running.purpose === "live" && !Engine.running.cancelled && ui.liveNode === cur() ? Engine.running : null;
    showEngineFor(cur(), running);
  }
  updateButtons();
  updateSaveState();
  renderLesson();
  requestLive();
  if (ui.activeTab === "explorer") refreshExplorer();
  if (ui.activeTab === "library" && ui.librarySub === "position") renderPosTarget();
  scheduleAutosave();
}
function syncHeaderForm() {
  document.querySelectorAll("[data-h]").forEach(el => { el.value = game.headers[el.dataset.h] || (el.tagName === "SELECT" ? "*" : ""); });
}
document.querySelectorAll("[data-h]").forEach(el => el.addEventListener("input", () => {
  game.headers[el.dataset.h] = el.value.trim();
  renderBars();
  markDirty();
}));

/* ---------- 18. Carga de partidas ---------- */
function setGame(g, opts = {}) {
  if (!opts.noConfirm && !confirmLeave()) return false;
  stopAutoplay();
  if (trainer.active && !opts.keepTrainer) stopTraining(true);
  if (ui.cpu.on) stopCpu(true);
  if (Guess.active) guessStop();
  if (Vis.active && !opts.keepVis) visStop(true);
  $("cpuBox").hidden = $("guessBox").hidden = true;
  if (!opts.keepVis) $("visBox").hidden = true;
  clockStop();
  Clock.shown = false;
  ui.lesson = null;
  ui.snapFor = null;
  game = g;
  game.current = opts.current || g.root;
  ui.selected = null;
  ui.liveNode = null;
  ui.engineArrow = null;
  if (Retry.active) retryEnd(true);
  Threat.node = null;
  ui.analysedLine = null;
  ui.report = null;
  $("reportExtra").innerHTML = "";
  $("retryStart").hidden = true;
  ui.libId = opts.libId || null;
  ui.recUpdated = ui.libId && typeof Lib !== "undefined" && Lib.games.get(ui.libId) ? Lib.games.get(ui.libId).updated : 0;
  ui.saveError = "";
  ui.dirty = false;
  ui.rev++;
  ui.fav = !!opts.fav;
  ui.tags = (opts.tags || []).slice();
  $("gameTags").value = ui.tags.join(", ");
  $("gameName").value = opts.name !== undefined ? opts.name : "";
  $("reportBox").classList.remove("show");
  $("analysisStatus").textContent = "";
  syncHeaderForm();
  render();
  if (Lib.ready && ui.activeTab === "library") renderLibrary();
  return true;
}
function importResultMsg(r, extra = "") {
  const el = $("importResult");
  if (r.error) {
    el.className = "small msg-err";
    el.textContent = `⚠ Se importaron ${r.count} jugadas. ${r.error.inVariation ? "Variante descartada" : "Detenido"} en «${r.error.label}»: ${r.error.message}${extra}`;
  } else {
    el.className = "small msg-ok";
    el.textContent = `✔ ${r.count} jugadas importadas.${extra}`;
  }
}
function looksLikeFen(t) { return /^\s*[prnbqkPRNBQK1-8]+(\/[prnbqkPRNBQK1-8]+){7}\s+[wb]\b/.test(t); }
function loadPgnText(text, opts = {}) {
  const parts = Pgn.splitGames(text);
  if (!parts.length) { toast("No se encontraron jugadas en el texto."); return null; }
  const r = Pgn.parseGame(parts[0], { lang: opts.lang || "auto" });
  const name = opts.name !== undefined ? opts.name : (r.game.headers.White && r.game.headers.White !== "Blancas" ? `${r.game.headers.White} – ${r.game.headers.Black}` : "");
  const target = opts.endAtEnd ? Pgn.mainlineFrom(r.game.root).pop() : null;
  if (setGame(r.game, { name, current: target || r.game.root }) === false) return null;
  return { r, parts };
}
function loadFen(fen) {
  try {
    const g = Pgn.newGame(fen.trim());
    if (setGame(g, { name: "" }) === false) return false;
    toast("Posición FEN cargada.");
    return true;
  } catch (e) { toast("FEN no válida: " + e.message, 4000); return false; }
}

