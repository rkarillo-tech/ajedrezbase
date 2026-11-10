/* ---------- 23. Finales: Syzygy ---------- */
const TB_SIDE = { win: "🏆 Ganan las {s}", "maybe-win": "Ganan las {s} (dudoso por la regla de 50)", "cursed-win": "Ganan las {s}, pero la regla de 50 jugadas lo deja en tablas", draw: "🟰 Tablas teóricas", "blessed-loss": "Pierden las {s}, pero se salvan por la regla de 50 jugadas", "maybe-loss": "Pierden las {s} (dudoso por la regla de 50)", loss: "❌ Pierden las {s}", unknown: "Desconocido" };
const TB_MOVE = { loss: "🏆 Gana", "maybe-loss": "Gana (dudoso)", "blessed-loss": "Gana, pero tablas por la regla de 50", draw: "🟰 Tablas", "cursed-win": "Pierde, pero tablas por la regla de 50", "maybe-win": "Pierde (dudoso)", win: "❌ Pierde", unknown: "?" };
function pieceCount(s) { let n = 0; for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (s.b[i] !== ".") n++; } return n; }
async function fetchTablebase(s) {
  const res = await Lichess.fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(Chess.toFen(s).replace(/ /g, "_"))}`);
  if (res.status === 429) throw Error("Demasiadas consultas; espera un minuto.");
  if (!res.ok) throw Error("Error " + res.status);
  return res.json();
}
async function querySyzygy() {
  const node = cur(), s = node.state;
  const tbody = $("syzygyTableBody"), status = $("syzygyStatusText");
  const n = pieceCount(s);
  if (n > 7) {
    status.textContent = `Hay ${n} piezas en el tablero; Syzygy cubre como máximo 7.`;
    tbody.innerHTML = `<tr><td colspan="4" class="small">Carga un final de abajo o simplifica la posición.</td></tr>`;
    return;
  }
  status.textContent = "Consultando la base Syzygy…";
  try {
    const data = await fetchTablebase(s);
    if (cur() !== node) return;
    const side = s.t === 1 ? "blancas" : "negras";
    let v = (TB_SIDE[data.category] || data.category).replace("{s}", side);
    if (data.checkmate) v = "Jaque mate";
    else if (data.stalemate) v = "Rey ahogado";
    if (data.dtm != null) v += ` · mate en ${Math.ceil(Math.abs(data.dtm) / 2)}`;
    status.textContent = v;
    tbody.innerHTML = "";
    for (const m of data.moves || []) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><b>${esc(formatSan(m.san, settings.lang, s.t))}</b></td><td>${TB_MOVE[m.category] || esc(m.category)}</td><td class="num">${m.dtz != null ? Math.abs(m.dtz) : "—"}</td><td class="num">${m.dtm != null ? Math.abs(m.dtm) : "—"}</td>`;
      tr.onclick = () => {
        if (cur() !== node || !canUserMove()) return;
        const mv = Chess.moveFromUci(s, m.uci);
        if (mv) playMove(mv, "user");
      };
      tbody.append(tr);
    }
    if (!(data.moves || []).length) tbody.innerHTML = `<tr><td colspan="4" class="small">No hay jugadas legales.</td></tr>`;
  } catch (e) {
    status.textContent = "No se pudo consultar Syzygy (" + (e.message || "sin conexión") + ").";
  }
}
const debouncedSyzygy = debounce(querySyzygy, 300);
async function tbReply() {
  const node = cur();
  if (gameStatus(node).over || pieceCount(node.state) > 7) { debouncedSyzygy(); return; }
  ui.cpu.thinking = true;
  renderStatus();
  try {
    const data = await fetchTablebase(node.state);
    ui.cpu.thinking = false;
    if (cur() !== node || !data.moves || !data.moves.length) { render(); return; }
    const mv = Chess.moveFromUci(node.state, data.moves[0].uci);
    if (mv) playMove(mv, "cpu");
  } catch (e) { ui.cpu.thinking = false; toast("Syzygy no responde: " + e.message); render(); }
}
function initEndgamePresets() {
  const box = $("endgamePresets");
  for (const eg of CLASSIC_ENDGAMES) {
    const b = document.createElement("button");
    b.className = "sm-btn";
    b.textContent = eg.name;
    b.onclick = () => {
      const g = Pgn.newGame(eg.fen);
      g.headers.Event = eg.name;
      g.root.comment = eg.note;
      setGame(g, { name: eg.name });
      $("endgameNote").hidden = false;
      $("endgameNote").textContent = eg.note;
      querySyzygy();
    };
    box.append(b);
  }
}

/* ---------- 24. Editor de posición ---------- */
function buildEditorPalettes() {
  const mk = (row, codes) => {
    row.innerHTML = "";
    for (const code of codes) {
      const b = document.createElement("button");
      b.className = "palette-btn" + (editor.tool === code ? " active" : "");
      b.title = code === "ERASE" ? "Goma: pulsa casillas para vaciarlas" : code === "MOVE" ? "Mano: mover piezas (arrastrando o con dos clics)" : cap(PIECE_LABEL[code]) + " (arrástrala al tablero o elígela y pulsa casillas)";
      b.innerHTML = code === "ERASE" ? "🗑" : code === "MOVE" ? "✋" : `<div class="pal-piece">${getPieceHTML(code, settings.pieceStyle)}</div>`;
      b.onclick = () => { editor.tool = code; editor.sel = null; ui.selected = null; buildEditorPalettes(); renderBoard(); };
      if (code !== "ERASE" && code !== "MOVE") {
        b.addEventListener("pointerdown", e => {
          if (e.button !== 0) return;
          e.preventDefault();
          ui.drag = { palette: true, from: null, piece: code, x0: e.clientX, y0: e.clientY, ghost: null, moved: false };
        });
      }
      row.append(b);
    }
  };
  mk($("paletteWhite"), ["MOVE", "K", "Q", "R", "B", "N", "P"]);
  mk($("paletteBlack"), ["ERASE", "k", "q", "r", "b", "n", "p"]);
}
function editorMsg(text, bad) { const m = $("edMsg"); m.textContent = text; m.className = "small" + (bad ? " msg-err" : ""); }
function editorChanged() {
  ui.selected = editor.sel;
  syncEditorForm();
  renderBoard();
  renderBars();
}
const backRank = i => i >> 4 === 0 || i >> 4 === 7;
function editorPlace(i, code) {
  const b = editor.state.b;
  if ((code === "P" || code === "p") && backRank(i)) { editorChanged(); editorMsg("⚠ Los peones no pueden estar en la 1ª u 8ª fila.", true); return; }
  if (code === "K" || code === "k") for (let x = 0; x < 128; x++) if (b[x] === code) b[x] = ".";
  b[i] = code;
  editorChanged();
}
function editorMovePiece(from, to) {
  const b = editor.state.b, p = b[from];
  if (p === ".") return;
  if (to == null) { b[from] = "."; editorChanged(); editorMsg(`${cap(PIECE_LABEL[p])} retirado del tablero.`); return; }
  if (to === from) { editorChanged(); return; }
  if ((p === "P" || p === "p") && backRank(to)) { editorChanged(); editorMsg("⚠ Los peones no pueden estar en la 1ª u 8ª fila.", true); return; }
  b[to] = p;
  b[from] = ".";
  editorChanged();
}
function editorClick(i) {
  const b = editor.state.b, t = editor.tool;
  if (t === "MOVE") {
    if (editor.sel == null) { if (b[i] !== ".") editor.sel = i; editorChanged(); return; }
    const from = editor.sel;
    editor.sel = null;
    if (from === i) { editorChanged(); return; }
    editorMovePiece(from, i);
    return;
  }
  if (t === "ERASE") { b[i] = "."; editorChanged(); return; }
  if (b[i] === t) { b[i] = "."; editorChanged(); return; }
  editorPlace(i, t);
}
function editorFenFromForm() {
  const s = editor.state;
  s.t = $("edTurn").value === "w" ? 1 : -1;
  s.c = ($("edCK").checked ? 1 : 0) | ($("edCQ").checked ? 2 : 0) | ($("edCk").checked ? 4 : 0) | ($("edCq").checked ? 8 : 0);
  s.ep = -1;
  try { editor.state = Chess.parseFen(Chess.toFen(s)); } catch {}
  syncEditorForm();
  renderBoard();
}
function syncEditorForm() {
  const s = editor.state;
  try { const sane = Chess.parseFen(Chess.toFen(s)); s.c = sane.c; } catch {}
  $("edTurn").value = s.t === 1 ? "w" : "b";
  $("edCK").checked = !!(s.c & 1); $("edCQ").checked = !!(s.c & 2); $("edCk").checked = !!(s.c & 4); $("edCq").checked = !!(s.c & 8);
  if (document.activeElement !== $("edFen")) $("edFen").value = Chess.toFen(s);
  $("edMsg").textContent = "";
}
function validatePosition(s) {
  const cnt = Chess.material(s);
  if ((cnt.K || 0) !== 1 || (cnt.k || 0) !== 1) return "Debe haber exactamente un rey de cada color.";
  if ((cnt.P || 0) > 8 || (cnt.p || 0) > 8) return "No puede haber más de 8 peones por bando.";
  for (let c = 0; c < 8; c++) if ("Pp".includes(s.b[c]) || "Pp".includes(s.b[112 + c])) return "Los peones no pueden estar en la 1ª u 8ª fila.";
  if (Chess.inCheck(s, -s.t)) return `El rey de las ${s.t === 1 ? "negras" : "blancas"} está en jaque pero no les toca mover: posición imposible.`;
  return null;
}
function openEditor() {
  if (trainer.active) stopTraining(true);
  if (ui.cpu.on) stopCpu(true);
  if (Guess.active) guessStop();
  if (Vis.active) visStop(true);
  stopAutoplay();
  Engine.cancel("live");
  editor.active = true;
  editor.state = Chess.clone(cur().state);
  editor.state.ep = -1;
  editor.state.half = 0;
  editor.origin = Chess.clone(editor.state);
  editor.sel = null;
  editor.tool = "MOVE";
  ui.selected = null;
  setEditorUi(true);
  buildEditorPalettes();
  syncEditorForm();
  render();
  editorMsg("");
  setTimeout(() => { const r = $("topBar").getBoundingClientRect(); if (r.top < 60 || r.top > innerHeight * 0.6) $("topBar").scrollIntoView({ block: "start", behavior: "smooth" }); }, 50);
}
function setEditorUi(on) {
  document.body.classList.toggle("editing", on);
  $("editorPanel").hidden = !on;
  $("toggleEditorModeBtn").textContent = on ? "✖ Cerrar editor" : "✏ Colocar piezas";
  $("editPosBtn").textContent = on ? "✖ Cerrar editor" : "✏ Colocar piezas";
}
function closeEditor() {
  editor.active = false;
  editor.sel = null;
  ui.selected = null;
  setEditorUi(false);
  render();
}
function applyEditor() {
  const err = validatePosition(editor.state);
  if (err) { editorMsg("⚠ " + err, true); return false; }
  if (!confirmLeave()) return false;
  const fen = Chess.toFen(editor.state);
  editor.active = false;
  editor.sel = null;
  setEditorUi(false);
  ui.dirty = false;
  loadFen(fen);
  return true;
}

