/* ---------- 9d. 🛡 Radar de piezas en peligro (ayuda opcional) ----------
   Marca con un anillo rojo las piezas del bando que mueve que están en peligro (atacadas y sin defensa, atacadas por una
   pieza de menos valor, o con más atacantes que defensores) y con un anillo azul las del rival que se pueden ganar con el
   mismo criterio. Es un cálculo rápido, sin motor: no ve clavadas ni combinaciones, pero sí lo que más se escapa en las
   partidas («piezas sueltas, piezas que se pierden»). Se activa con «🛡 Radar», en ⚙ Ajustes o con la tecla R. */
const RADAR_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
function radarAllowed() {
  if (!settings.radar || editor.active || ui.visBoard || (ui.blind && !ui.peek)) return false;
  return !quiz() || cpuHelpMode();
}
/* Piezas del color c en peligro: { sq, why } */
function piecesInDanger(s, c) {
  const out = [];
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = s.b[i];
    if (p === "." || Chess.color(p) !== c || p.toLowerCase() === "k") continue;
    const att = Chess.attackers(s.b, i, -c);
    if (!att.length) continue;
    const def = Chess.attackers(s.b, i, c), v = RADAR_VAL[p.toLowerCase()];
    const minAtt = Math.min(...att.map(x => RADAR_VAL[s.b[x].toLowerCase()]));
    let why = "";
    if (!def.length) why = "atacada y sin defensa";
    else if (minAtt < v) why = "atacada por una pieza de menos valor";
    else if (att.length > def.length) why = "con más atacantes que defensores";
    if (why) out.push({ sq: i, why });
  }
  return out;
}
/* Lo que hay que marcar ahora: { mine: [...], theirs: [...] } o null */
function radarMarks() {
  if (!radarAllowed()) return null;
  const s = viewState();
  if (gameStatus(cur()).over && !editor.active) return null;
  ui.cpu.helpKeys = ui.cpu.helpKeys || new Set();
  if (cpuHelpMode() && !ui.cpu.helpKeys.has("radar")) { ui.cpu.helpKeys.add("radar"); noteCpuHelp(); }
  return { mine: piecesInDanger(s, s.t), theirs: piecesInDanger(s, -s.t) };
}
function renderRadar() {
  boardEl.querySelectorAll(".radar-ring").forEach(x => x.remove());
  const R = radarMarks();
  const box = $("radarLegend");
  if (box) box.hidden = !R;
  if (!R) return;
  const put = (sq, cls, title) => {
    const el = boardEl.querySelector(`.square[data-sq="${sq}"]`);
    if (el) el.insertAdjacentHTML("beforeend", `<span class="radar-ring ${cls}" title="${esc(title)}"></span>`);
  };
  const side = cur().state.t === 1 ? "blanca" : "negra", other = cur().state.t === 1 ? "negra" : "blanca";
  R.mine.forEach(x => put(x.sq, "danger", `En peligro: pieza ${side} ${x.why}`));
  R.theirs.forEach(x => put(x.sq, "chance", `Se puede ganar: pieza ${other} ${x.why}`));
  box.querySelector(".rd-count").textContent = R.mine.length || R.theirs.length ? ` · ${R.mine.length} tuya${R.mine.length === 1 ? "" : "s"} en peligro, ${R.theirs.length} del rival` : " · ninguna pieza en peligro";
}
function setRadar(on) {
  settings.radar = !!on;
  saveSettings();
  $("setRadar").checked = $("radarToggle").checked = settings.radar;
  renderBoard();
  if (ui.cpu.on) cpuPanel();
  toast(on ? "🛡 Radar activado: rojo, tus piezas en peligro; azul, las del rival que se pueden ganar." : "🛡 Radar desactivado.");
}
