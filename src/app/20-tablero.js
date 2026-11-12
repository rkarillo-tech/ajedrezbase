/* ---------- 9. Renderizado del tablero ---------- */
const boardEl = $("board");
const boardCache = { key: "", els: [], pieces: [] };
function renderBoard() {
  const s = viewState(), node = cur();
  const last = !editor.active && !ui.visBoard && node.move ? node.move : null;
  const checkSq = !editor.active && Chess.inCheck(s) ? Chess.kingSq(s.b, s.t) : -1;
  const targets = new Map();
  if (!editor.active && ui.selected != null && settings.showLegal) for (const m of Chess.legal(s)) if (m.from === ui.selected) targets.set(m.to, m.captured !== ".");
  const locked = !editor.active && !canUserMove();
  // Las 64 casillas se crean una vez (o al girar el tablero, cambiar las piezas o las coordenadas);
  // después sólo se actualizan las clases y las piezas que cambian
  const key = `${ui.flipped}|${settings.pieceStyle}|${settings.coords}`;
  if (boardCache.key !== key || boardEl.children.length !== 64) {
    const frag = document.createDocumentFragment();
    boardCache.els = []; boardCache.pieces = [];
    for (let d = 0; d < 64; d++) {
      const r = d >> 3, c = d & 7, rr = ui.flipped ? 7 - r : r, cc = ui.flipped ? 7 - c : c;
      const el = document.createElement("div");
      el.dataset.sq = rr * 16 + cc;
      el.setAttribute("role", "gridcell");
      el.innerHTML = `<div class="piece-holder"></div>`;
      if (settings.coords) {
        if (c === 0) el.insertAdjacentHTML("beforeend", `<span class="coord">${8 - rr}</span>`);
        if (r === 7) el.insertAdjacentHTML("beforeend", `<span class="coord file">${"abcdefgh"[cc]}</span>`);
      }
      boardCache.els.push(el);
      frag.append(el);
    }
    boardEl.replaceChildren(frag);
    boardCache.key = key;
  }
  boardEl.querySelectorAll(".sq-badge").forEach(x => x.remove());
  for (let d = 0; d < 64; d++) {
    const r = d >> 3, c = d & 7;
    const rr = ui.flipped ? 7 - r : r, cc = ui.flipped ? 7 - c : c;
    const i = rr * 16 + cc, p = s.b[i], el = boardCache.els[d];
    let cls = "square " + ((rr + cc) % 2 === 0 ? "light" : "dark");
    if (ui.selected === i) cls += " selected";
    if (last && (last.from === i || last.to === i)) cls += " last";
    if (checkSq === i) cls += " in-check";
    if ((trainer.active && trainer.hintSq === i) || (Retry.active && Retry.hintSq === i) || (Guess.active && Guess.hintSq === i)) cls += " hint-sq";
    if (Vis.marks.ok === i) cls += " vis-ok";
    if (Vis.marks.bad === i) cls += " vis-bad";
    if (targets.has(i)) cls += targets.get(i) ? " target occupied" : " target";
    if (!locked && !editor.active && p !== "." && Chess.color(p) === s.t) cls += " has-own";
    if (el.className !== cls) el.className = cls;   // también limpia marcas temporales (arrastre, destello de error)
    if (boardCache.pieces[d] !== p) {
      el.firstChild.innerHTML = getPieceHTML(p, settings.pieceStyle);
      el.setAttribute("aria-label", Chess.sqName(i) + (p !== "." ? ", " + PIECE_LABEL[p] : ""));
      boardCache.pieces[d] = p;
    }
  }
  boardEl.classList.toggle("editor-cursor", editor.active);
  boardEl.classList.toggle("locked", locked && !Vis.active);
  boardEl.classList.toggle("blind", !!ui.blind && !ui.peek && !editor.active);
  boardEl.classList.toggle("no-coords", Vis.active && Vis.mode === "coords");
  boardEl.classList.toggle("vis-hide", Vis.active && Vis.mode === "color");
  // Símbolo de calidad (?? ? ?! ! !!) sobre la casilla de destino de la última jugada
  if (last && node.nag && !quiz()) {
    const sq = boardEl.querySelector(`.square[data-sq="${last.to}"]`);
    if (sq) sq.insertAdjacentHTML("beforeend", `<span class="sq-badge ${NAG_CLASS[node.nag] || ""}-bg" title="${esc(NAG_TITLE[node.nag] || "")}">${esc(node.nag)}</span>`);
  }
  board3dSync();
  const prev = ui.prevRenderNode;
  ui.prevRenderNode = editor.active ? null : node;
  if (prev && prev !== node && !editor.active && settings.animate && !ui.noAnimOnce && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    if (node.parent === prev && node.move) animateMove(node.move, 1);
    else if (prev.parent === node && prev.move) animateMove(prev.move, -1);
  }
  ui.noAnimOnce = false;
  renderShapes();
}
const NAG_TITLE = { "!!": "Jugada brillante", "!": "Buena jugada", "!?": "Interesante", "?!": "Imprecisión", "?": "Error", "??": "Error grave" };
/* Desliza la pieza desde su casilla de origen (o de vuelta, al retroceder) */
function animateMove(mv, dir) {
  const slide = (from, to) => {
    const el = boardEl.querySelector(`.square[data-sq="${to}"] .piece-holder`);
    const sqEl = boardEl.querySelector(`.square[data-sq="${to}"]`);
    if (!el || !sqEl || !el.animate) return;
    const size = sqEl.getBoundingClientRect().width;
    const col = i => (ui.flipped ? 7 - (i & 7) : i & 7), row = i => (ui.flipped ? 7 - (i >> 4) : i >> 4);
    const dx = (col(from) - col(to)) * size, dy = (row(from) - row(to)) * size;
    el.style.zIndex = 9;
    const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 160, easing: "ease-out" });
    a.onfinish = a.oncancel = () => { el.style.zIndex = ""; };
  };
  const f = dir > 0 ? mv.from : mv.to, t = dir > 0 ? mv.to : mv.from;
  slide(f, t);
  if (mv.flag === "castle") {
    const rf = mv.to > mv.from ? mv.from + 3 : mv.from - 4, rt = mv.to > mv.from ? mv.from + 1 : mv.from - 1;
    slide(dir > 0 ? rf : rt, dir > 0 ? rt : rf);
  }
  board3dAnimate(mv, dir);
}
function sqCenter(i) {
  const f = i & 7, r = i >> 4;
  return [(ui.flipped ? 7 - f : f) * 100 + 50, (ui.flipped ? 7 - r : r) * 100 + 50];
}
const SHAPE_COLORS = { green: "rgba(76,175,80,0.85)", red: "rgba(239,83,80,0.85)", blue: "rgba(41,182,246,0.85)", yellow: "rgba(255,202,40,0.9)", engine: "rgba(186,104,200,0.72)", threat: "rgba(239,83,80,0.8)" };
/* Flechas y círculos que hay que dibujar ahora (en el tablero plano y en el 3D) */
function shapeList() {
  const list = [];
  if (ui.visBoard) for (const sh of ui.visShapes || []) list.push(sh);
  else if (!editor.active) {
    for (const sh of cur().shapes || []) list.push({ color: sh.color, from: Chess.sqIdx(sh.from), to: Chess.sqIdx(sh.to) });
    if (ui.engineArrow && settings.arrow && !quiz() && ui.engineArrow.node === cur() && !(ui.lesson && ui.lesson.game === game)) list.push({ color: "engine", from: ui.engineArrow.from, to: ui.engineArrow.to });
    if (Threat.node === cur() && !quiz()) list.push({ color: "threat", from: Threat.from, to: Threat.to });
    if (Scan.node === cur() && Scan.data) for (const sh of Scan.shapes) list.push({ color: sh.color, from: Chess.sqIdx(sh.from), to: Chess.sqIdx(sh.to) });
    if (Talk.node === cur() && (!quiz() || cpuHelpMode())) for (const sh of Talk.shapes) list.push({ color: sh.color, from: Chess.sqIdx(sh.from), to: Chess.sqIdx(sh.to) });
    if (trainer.active && trainer.hintArrow) list.push({ color: "blue", from: trainer.hintArrow.from, to: trainer.hintArrow.to });
    if (Retry.active) {
      // La jugada que se hizo en la partida (el error), como referencia mientras se busca la buena
      if (Retry.played && ["ask", "wrong", "checking", "preparing"].includes(Retry.state)) list.push(Retry.played);
      for (const a of Retry.arrows) list.push(a);
    }
    // Mientras se dibuja: la flecha (o el círculo) que va a quedar, para ver dónde se suelta
    if (ui.drawStart && ui.drawStart.over != null) list.push({ color: ui.drawStart.color, from: ui.drawStart.sq, to: ui.drawStart.over, preview: true });
  }
  return list;
}
function renderShapes() {
  let html = "";
  for (const sh of shapeList()) {
    const col = SHAPE_COLORS[sh.color] || SHAPE_COLORS.green;
    const [x1, y1] = sqCenter(sh.from), [x2, y2] = sqCenter(sh.to);
    const op = sh.preview ? ` opacity=".55"` : "";
    if (sh.from === sh.to) { html += `<circle cx="${x1}" cy="${y1}" r="44" fill="none" stroke="${col}" stroke-width="7"${op}/>`; continue; }
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const sw = sh.color === "engine" ? 13 : 15;
    const ex = x2 - ux * 22, ey = y2 - uy * 22;
    const marker = sh.color === "threat" ? "red" : sh.color;
    const dash = sh.color === "threat" ? ` stroke-dasharray="18 14"` : "";
    html += `<line x1="${x1}" y1="${y1}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="${dash ? "butt" : "round"}"${dash}${op} marker-end="url(#ah-${marker})"/>`;
  }
  $("arrowsGroup").innerHTML = html;
  if (B3.active) board3dDraw();
}
function toggleShape(from, to, color) {
  const node = cur();
  const f = Chess.sqName(from), t = Chess.sqName(to);
  const i = node.shapes.findIndex(s => s.from === f && s.to === t);
  if (i >= 0) { const same = node.shapes[i].color === color; node.shapes.splice(i, 1); if (!same) node.shapes.push({ color, from: f, to: t }); }
  else node.shapes.push({ color, from: f, to: t });
  renderShapes();
  markDirty();
}
const shapeColor = e => (e.shiftKey && e.altKey ? "yellow" : e.shiftKey ? "red" : e.altKey ? "blue" : "green");

/* ---------- 10. Interacción con el tablero (clic, arrastre, flechas) ---------- */
function canUserMove() {
  if (ui.cpu.thinking || trainer.busy || Vis.active) return false;
  if (Guess.active) return Guess.state === "ask" && !Guess.busy && cur().state.t === Guess.side;
  if (Retry.active) return !Retry.busy && Retry.state !== "solved" && Retry.state !== "shown";
  if (trainer.active) return trainerUserTurn();
  if (ui.cpu.on && !ui.cpu.two && cur().state.t === ui.cpu.side) return false;
  return true;
}
function sqFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const sqEl = el && el.closest ? el.closest(".square") : null;
  return sqEl && boardEl.contains(sqEl) ? +sqEl.dataset.sq : null;
}
boardEl.addEventListener("contextmenu", e => e.preventDefault());
$("drawingLayer").addEventListener("contextmenu", e => e.preventDefault());
boardEl.addEventListener("pointerdown", e => {
  const sqEl = e.target.closest(".square");
  if (!sqEl) return;
  const i = +sqEl.dataset.sq;
  if (e.button === 2) {
    if (editor.active) { editor.state.b[i] = "."; editor.sel = null; editorChanged(); return; }
    ui.drawStart = { sq: i, color: shapeColor(e), over: i };
    ui.drawAt = Date.now();
    renderShapes();
    return;
  }
  if (e.button !== 0) return;
  // Modo dibujo (botón ✏) o Ctrl + arrastrar: arrastrar dibuja una flecha y pulsar una casilla la rodea
  if ((ui.drawMode || e.ctrlKey) && !editor.active) {
    ui.drawStart = { sq: i, color: ui.drawMode ? ui.drawColor || "green" : shapeColor(e), touch: true, over: i };
    ui.drawAt = Date.now();
    sqEl.classList.add("hint-sq");
    renderShapes();
    e.preventDefault();
    return;
  }
  if (editor.active) {
    const p = editor.state.b[i];
    ui.drag = { editor: true, from: i, piece: p !== "." ? p : null, x0: e.clientX, y0: e.clientY, ghost: null, moved: false };
    e.preventDefault();
    return;
  }
  const wasSelected = ui.selected === i;
  if (pressSquare(i)) {
    ui.drag = { from: i, x0: e.clientX, y0: e.clientY, ghost: null, moved: false, wasSelected };
    e.preventDefault();
  }
});
/* Pulsar una casilla (en el tablero plano o en el 3D): mover la pieza elegida o elegir otra. Devuelve true si queda una pieza elegida */
function pressSquare(i) {
  if (Vis.active) { visAnswer(i); return false; }
  const s = cur().state;
  if (!canUserMove()) {
    if (ui.cpu.thinking) toast("La CPU está pensando…");
    else if (trainer.active && !trainer.busy) toast("Espera la respuesta del rival.");
    return false;
  }
  if (ui.selected != null && ui.selected !== i && tryMove(ui.selected, i)) return false;
  if (Chess.color(s.b[i]) === s.t) { ui.selected = i; renderBoard(); return true; }
  if (ui.selected != null) { ui.selected = null; renderBoard(); }
  return false;
}
window.addEventListener("pointermove", e => {
  if (ui.drawStart) {
    const over = sqFromPoint(e.clientX, e.clientY);
    if (over != null && over !== ui.drawStart.over) { ui.drawStart.over = over; renderShapes(); }
    return;
  }
  const d = ui.drag;
  if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
  if (d.editor && !d.piece) return;
  if (!d.ghost) {
    const sqEl = d.from != null ? boardEl.querySelector(`.square[data-sq="${d.from}"]`) : null;
    if (d.from != null && !sqEl) return;
    const size = (sqEl || boardEl.querySelector(".square")).getBoundingClientRect().width;
    const pc = d.piece || cur().state.b[d.from];
    d.ghost = document.createElement("div");
    d.ghost.className = "drag-ghost";
    d.ghost.style.width = d.ghost.style.height = size + "px";
    d.ghost.innerHTML = `<div class="piece-holder" style="width:100%;height:100%">${getPieceHTML(pc, settings.pieceStyle)}</div>`;
    document.body.append(d.ghost);
    if (sqEl) sqEl.classList.add("drag-origin");
  }
  d.moved = true;
  d.ghost.style.left = e.clientX + "px";
  d.ghost.style.top = e.clientY + "px";
  const over = sqFromPoint(e.clientX, e.clientY);
  if (over !== d.over) {
    boardEl.querySelectorAll(".hover-target").forEach(x => x.classList.remove("hover-target"));
    if (over != null) { const t = boardEl.querySelector(`.square[data-sq="${over}"]`); if (t && (editor.active || t.classList.contains("target"))) t.classList.add("hover-target"); }
    d.over = over;
  }
});
window.addEventListener("pointerup", e => {
  if (ui.drawStart && ui.drawStart.touch) {
    const to = sqFromPoint(e.clientX, e.clientY), d = ui.drawStart;
    ui.drawStart = null;
    ui.drawAt = Date.now();
    boardEl.querySelectorAll(".hint-sq").forEach(x => x.classList.remove("hint-sq"));
    if (to != null) toggleShape(d.sq, to, d.color);
    return;
  }
  if (ui.drawStart) {
    const to = sqFromPoint(e.clientX, e.clientY), d = ui.drawStart;
    ui.drawStart = null;
    ui.drawAt = Date.now();
    const target = to != null ? to : d.over;
    if (target != null) toggleShape(d.sq, target, d.color); else renderShapes();
    return;
  }
  const d = ui.drag;
  if (!d) return;
  ui.drag = null;
  if (d.ghost) d.ghost.remove();
  if (d.palette) {
    if (d.moved && editor.active) { const to = sqFromPoint(e.clientX, e.clientY); if (to != null) editorPlace(to, d.piece); }
    return;
  }
  if (d.editor) {
    if (!editor.active) return;
    if (d.moved && d.piece) { editor.sel = null; editorMovePiece(d.from, sqFromPoint(e.clientX, e.clientY)); }
    else editorClick(d.from);
    return;
  }
  if (d.moved) {
    const to = sqFromPoint(e.clientX, e.clientY);
    ui.noAnimOnce = true;
    if (to != null && to !== d.from && tryMove(d.from, to)) return;
    renderBoard();
  } else if (d.wasSelected) { ui.selected = null; renderBoard(); }
});
window.addEventListener("pointercancel", () => { if (ui.drag && ui.drag.ghost) ui.drag.ghost.remove(); ui.drag = null; if (ui.drawStart && ui.drawStart.touch) ui.drawStart = null; renderBoard(); });

function askPromotion(color) {
  return new Promise(resolve => {
    const box = $("promoChoices");
    box.innerHTML = "";
    for (const p of ["q", "r", "b", "n"]) {
      const b = document.createElement("button");
      b.className = "promo-btn";
      b.title = cap(PIECE_ES[p]);
      b.innerHTML = getPieceHTML(color === 1 ? p.toUpperCase() : p, settings.pieceStyle);
      b.onclick = () => { $("promoModal").classList.remove("open"); resolve(p); };
      box.append(b);
    }
    $("cancelPromo").onclick = () => { $("promoModal").classList.remove("open"); resolve(null); };
    $("promoModal").classList.add("open");
  });
}
function tryMove(from, to) {
  const s = cur().state;
  const cands = Chess.legal(s).filter(m => m.from === from && m.to === to);
  if (!cands.length) return false;
  ui.selected = null;
  if (cands.length > 1) {
    askPromotion(s.t).then(p => {
      if (!p) { renderBoard(); return; }
      playMove(cands.find(m => m.promotion === p), "user");
    });
    return true;
  }
  playMove(cands[0], "user");
  return true;
}
function soundFor(node) {
  const st = gameStatus(node);
  if (st.over) Sound.play("end");
  else if (Chess.inCheck(node.state)) Sound.play("check");
  else if (node.move && node.move.captured !== ".") Sound.play("capture");
  else Sound.play("move");
}
function playMove(move, who = "user") {
  if (Retry.active && who === "user") { retryMove(move); return; }
  if (trainer.active && who === "user") { trainerUserMove(move); return; }
  if (Guess.active && who === "user") { guessResolve(move); return; }
  if (who === "user") stopAutoplay();
  const existed = cur().children.some(c => Pgn.sameMove(c.move, move));
  const child = Pgn.addMove(cur(), move, settings.branchMode);
  game.current = child;
  if (!existed) markDirty();
  ui.selected = null;
  soundFor(child);
  render();
  if (ui.cpu.on) cpuAfterMove(child, who);
  else if (who === "user") {
    if ($("tbPractice").checked && ui.activeTab === "endgames") setTimeout(tbReply, 60);
  }
  if (ui.activeTab === "endgames" && who !== "user") debouncedSyzygy();
}

/* ---------- 11. Navegación ---------- */
function goTo(node) { if (!node) return; game.current = node; ui.selected = null; render(); }
const goBack = () => cur().parent && goTo(cur().parent);
const goForward = () => cur().children.length && goTo(cur().children[0]);
const goStart = () => goTo(game.root);
const goEnd = () => { const l = Pgn.mainlineFrom(cur()); if (l.length) goTo(l[l.length - 1]); };
function goSibling(dir) {
  const n = cur(), p = n.parent;
  if (!p || p.children.length < 2) return;
  const i = p.children.indexOf(n);
  goTo(p.children[(i + dir + p.children.length) % p.children.length]);
}
function stopAutoplay() {
  if (ui.autoplay) { clearInterval(ui.autoplay); ui.autoplay = null; $("playBtn").textContent = "▶ Auto"; }
  if ($("autoSpeedRow")) $("autoSpeedRow").hidden = true;
}
function toggleAutoplay() {
  if (ui.autoplay) { stopAutoplay(); return; }
  if (!cur().children.length) goStart();
  $("playBtn").textContent = "⏸ Pausa";
  $("autoSpeed").value = String(autoplayMs());
  $("autoSpeedRow").hidden = false;
  startAutoplayTimer();
}
/* Velocidad del modo Auto: milisegundos entre jugadas (⚙ Ajustes o el selector que aparece mientras reproduce) */
const AUTO_SPEEDS = [500, 1000, 2000, 3500, 6000];
const autoplayMs = () => (AUTO_SPEEDS.includes(+settings.autoplayMs) ? +settings.autoplayMs : 2000);
function startAutoplayTimer() {
  clearInterval(ui.autoplay);
  ui.autoplay = setInterval(() => {
    if (!cur().children.length) { stopAutoplay(); return; }
    goForward();
    soundFor(cur());
  }, autoplayMs());
}
function setAutoplaySpeed(ms) {
  settings.autoplayMs = ms;
  saveSettings();
  $("autoSpeed").value = String(ms);
  $("setAutoSpeed").value = String(ms);
  if (ui.autoplay) startAutoplayTimer();
}

/* ---------- 12. Estado de la partida ---------- */
function gameStatus(node) {
  const s = node.state, L = Chess.legal(s), chk = Chess.inCheck(s);
  const side = s.t === 1 ? "blancas" : "negras", other = s.t === 1 ? "negras" : "blancas";
  if (!L.length) return chk ? { over: true, text: `Jaque mate · ganan las ${other}`, result: s.t === 1 ? "0-1" : "1-0" } : { over: true, text: "Rey ahogado · tablas", result: "1/2-1/2" };
  if (Chess.insufficient(s)) return { over: true, text: "Tablas por material insuficiente", result: "1/2-1/2" };
  if (s.half >= 100) return { over: true, text: "Tablas por la regla de las 50 jugadas", result: "1/2-1/2" };
  let reps = 0;
  for (let n = node; n; n = n.parent) if (n.key === node.key) reps++;
  if (reps >= 3) return { over: true, text: "Tablas por triple repetición", result: "1/2-1/2" };
  return { over: false, check: chk, text: chk ? `¡Jaque! Juegan las ${side}` : `Juegan las ${side}` };
}
function renderStatus() {
  const el = $("statusText");
  if (editor.active) { el.textContent = "✏ Editor: mueve las piezas libremente y pulsa «Empezar desde esta posición»."; el.className = "status-line"; return; }
  const st = gameStatus(cur());
  let txt = st.text;
  if (ui.cpu.thinking) txt += " · 🤖 la CPU está pensando…";
  else if (ui.cpu.on && !st.over) txt += cur().state.t === ui.cpu.side ? " · turno de la CPU" : " · tu turno";
  if (trainer.active) txt = (trainer.puzzle ? "🧩 Problema · " : "🎯 Entrenamiento · ") + txt;
  if (Retry.active) txt = "🎯 Aprende de tus errores · " + txt;
  if (Guess.active) txt = "🔮 Adivina la jugada · " + txt;
  if (Vis.active) txt = "🙈 Visualización: responde en el panel de abajo";
  if (ui.blind && !Vis.active) txt += " · 🙈 piezas ocultas";
  el.textContent = txt;
  el.className = "status-line" + (st.over ? " over" : st.check ? " check" : "");
}

/* ---------- 13. Barras de jugadores (nombres, material) ---------- */
function renderBars() {
  const s = viewState(), cnt = Chess.material(s);
  const start = { Q: 1, R: 2, B: 2, N: 2, P: 8 }, vals = { Q: 9, R: 5, B: 3, N: 3, P: 1 };
  let capW = "", capB = "", matW = 0, matB = 0;
  for (const p of Object.keys(start)) {
    const w = cnt[p] || 0, b = cnt[p.toLowerCase()] || 0;
    matW += w * vals[p]; matB += b * vals[p];
    capB += glyphUnicode[p.toLowerCase()].repeat(Math.max(0, start[p] - b)); // negras capturadas por blancas
    capW += glyphUnicode[p].repeat(Math.max(0, start[p] - w));
  }
  const diff = matW - matB;
  const h = game.headers;
  const wName = `${esc(h.White || "Blancas")}${h.WhiteElo ? `<span class="player-elo">(${esc(h.WhiteElo)})</span>` : ""}`;
  const bName = `${esc(h.Black || "Negras")}${h.BlackElo ? `<span class="player-elo">(${esc(h.BlackElo)})</span>` : ""}`;
  const white = { name: "⬜ " + wName, cap: capB, adv: diff > 0 ? "+" + diff : "" };
  const black = { name: "⬛ " + bName, cap: capW, adv: diff < 0 ? "+" + -diff : "" };
  const top = ui.flipped ? white : black, bot = ui.flipped ? black : white;
  $("topName").innerHTML = top.name; $("topCaptured").textContent = top.cap;
  $("topAdv").textContent = top.adv; $("topAdv").hidden = !top.adv;
  $("bottomName").innerHTML = bot.name; $("bottomCaptured").textContent = bot.cap;
  $("bottomAdv").textContent = bot.adv; $("bottomAdv").hidden = !bot.adv;
  renderClocks();
  const whiteToMove = s.t === 1;
  $("topBar").classList.toggle("to-move", ui.flipped ? whiteToMove : !whiteToMove);
  $("bottomBar").classList.toggle("to-move", ui.flipped ? !whiteToMove : whiteToMove);
}

