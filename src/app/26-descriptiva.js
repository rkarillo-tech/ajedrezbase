/* ---------- Notación descriptiva española (libros antiguos) ----------
   La lectura y la escritura están en src/pgn.js (Pgn.descMoves, Pgn.descFor). Aquí, la parte de la pantalla:
   - 📜 Descriptiva: la jugada en descriptiva junto a la estándar (P4R junto a e4), en la lista y en la planilla;
   - escribir una jugada como en el libro (P4R, C3AR, PxP) en «⌨ Escribe una jugada»;
   - elegir cuando una jugada admite varias (PxP con dos capturas posibles): flechas en el tablero y un botón por
     cada una. Al importar una partida, la lectura se para ahí y sigue después de elegir. */
const DescPick = { node: null, ucis: [], kind: "", r: null, key: "", label: "" };

/* La jugada de un nodo en descriptiva (se calcula una vez) */
function nodeDesc(n) {
  if (!n || !n.parent || !n.move) return "";
  if (n._desc == null) { try { n._desc = Pgn.descFor(n.parent.state, n.move); } catch { n._desc = ""; } }
  return n._desc;
}
function descPickStart(node, ucis, opts = {}) {
  Object.assign(DescPick, { node, ucis: ucis.slice(), kind: opts.kind || "typed", r: opts.r || null, key: opts.key || "", label: opts.label || "" });
  if (cur() !== node) goTo(node); else render();
}
function descPickClear() { Object.assign(DescPick, { node: null, ucis: [], kind: "", r: null, key: "", label: "" }); renderDescPick(); }
function descPickChoose(uci) {
  const P = Object.assign({}, DescPick);
  if (!P.node || !P.ucis.includes(uci)) return;
  descPickClear();
  if (P.kind === "import" && P.r) {
    // Se vuelve a leer la partida con la elección; si más adelante hay otra jugada ambigua, se vuelve a preguntar
    const r2 = P.r.reparse({ [P.key]: uci });
    if (setGame(r2.game, { noConfirm: true, name: $("gameName").value }) === false) return;
    const last = Pgn.mainlineFrom(game.root).pop();
    if (last) goTo(last);
    importResultMsg(r2);
    return;
  }
  const m = Chess.moveFromUci(P.node.state, uci);
  if (m && cur() === P.node) playMove(m, "user");
}
function renderDescPick() {
  const box = $("descPick");
  if (!box) return;
  if (!DescPick.node || DescPick.node !== cur() || quiz()) { box.hidden = true; box.innerHTML = ""; return; }
  const s = DescPick.node.state;
  const opts = DescPick.ucis.map(u => {
    const m = Chess.moveFromUci(s, u);
    return m ? `<button type="button" class="sm-btn primary" data-dp="${esc(u)}">${esc(numPrefix(s) + formatSan(Chess.san(s, m), settings.lang, s.t))} <span class="small">(${esc(Pgn.descFor(s, m))})</span></button>` : "";
  }).join(" ");
  box.innerHTML = `<b>📜 «${esc(DescPick.label)}» admite ${DescPick.ucis.length} jugadas.</b> ${DescPick.kind === "import" ? "La partida se ha leído hasta aquí: elige cuál es (en el tablero, con las flechas, o aquí) y seguirá leyéndose." : "Elige cuál es, en el tablero (flechas) o aquí:"}
    <div class="controls">${opts} <button type="button" class="sm-btn" data-dp="">✖ Cancelar</button></div>`;
  box.hidden = false;
}
$("descPick").addEventListener("click", e => {
  const b = e.target.closest("[data-dp]");
  if (!b) return;
  if (b.dataset.dp) descPickChoose(b.dataset.dp); else descPickClear();
});
/* Lo llama importResultMsg: si la lectura se paró en una jugada ambigua de la línea principal, se pregunta */
function descImportAmbiguity(r) {
  if (!r || !r.error || !r.error.choices || r.error.inVariation || r.game !== game || !r.reparse) return;
  const last = Pgn.mainlineFrom(game.root).pop() || game.root;
  descPickStart(last, r.error.choices, { kind: "import", r, key: r.error.key, label: r.error.token });
}
/* «⌨ Escribe una jugada»: devuelve la jugada, o null si se ha abierto la elección (o no es descriptiva) */
function descTyped(txt) {
  const f = Pgn.descMoves(cur().state, txt);
  if (f.length === 1) return f[0];
  if (f.length > 1) { descPickStart(cur(), f.map(m => Chess.uci(m)), { kind: "typed", label: txt }); return null; }
  return undefined;
}
function setShowDesc(on) {
  settings.showDesc = !!on;
  saveSettings();
  $("descViewBtn").setAttribute("aria-pressed", String(settings.showDesc));
  $("descViewBtn").classList.toggle("on", settings.showDesc);
  renderMoves();
}
$("descViewBtn").onclick = () => setShowDesc(!settings.showDesc);
$("descViewBtn").setAttribute("aria-pressed", String(!!settings.showDesc));
$("descViewBtn").classList.toggle("on", !!settings.showDesc);
