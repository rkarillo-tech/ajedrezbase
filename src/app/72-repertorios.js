/* ---------- 25c. Mis repertorios: crearlos, entrenarlos con repaso espaciado y revisarlos ---------- */
function repLeaves(root) { const out = []; const walk = n => { if (!n.children.length) { if (n !== root) out.push(n); return; } n.children.forEach(walk); }; walk(root); return out; }
function repSrsLabel(rec) {
  if (!rec.srs) return `<span class="srs-pill">sin entrenar</span>`;
  const days = Math.ceil((rec.srs.due - Date.now()) / 864e5);
  return days <= 0 ? `<span class="srs-pill due">📅 toca repasar</span>` : `<span class="srs-pill ok">próximo repaso: ${days === 1 ? "mañana" : "en " + days + " días"}</span>`;
}
function renderMyReps() {
  const box = $("myRepList");
  if (!box) return;
  if ($("repFromCourse").options.length < 2) courseLessons("repertorios").forEach((l, i) => {
    $("repFromCourse").insertAdjacentHTML("beforeend", `<option value="${i}">${esc(l.title)}</option>`);
    $("repReviewCourse").insertAdjacentHTML("beforeend", `<option value="${i}">${esc(l.title)}</option>`);
  });
  if (!Lib.ready) { box.innerHTML = `<span class="small">Cargando la biblioteca…</span>`; return; }
  const recs = myRepRecs(), now = Date.now();
  const due = recs.filter(r => r.srs && r.srs.due <= now).length;
  $("myRepBadge").textContent = recs.length ? (due ? `${due} pendiente${due === 1 ? "" : "s"}` : `${recs.length} repertorio${recs.length === 1 ? "" : "s"}`) : "";
  $("myRepBadge").className = "srs-pill" + (due ? " due" : "");
  if (!recs.length) { box.innerHTML = `<div class="note-box small">Aún no tienes repertorios propios. Crea uno vacío y juega tus líneas en el tablero, o copia uno de los del curso y adáptalo a tu gusto. También vale cualquier partida de tu biblioteca con la etiqueta <b>repertorio</b>.</div>`; return; }
  box.innerHTML = recs.map(rec => {
    let lines = 0, pos = 0, first = "";
    try {
      const g = Pgn.parseGame(rec.pgn, { lang: "en" }).game;
      lines = repLeaves(g.root).length;
      const walk = n => { pos++; n.children.forEach(walk); }; walk(g.root); pos--;
      first = g.root.children.map(c => numPrefix(g.root.state) + formatSan(c.san, settings.lang, g.root.state.t)).join(", ");
    } catch {}
    const side = repSideOf(rec);
    return `<div class="mark-card" style="grid-template-columns:1fr"><div><b>${side === 1 ? "⚪" : "⚫"} ${esc(rec.title)}</b> ${repSrsLabel(rec)}<br>
      <span class="small">Con ${side === 1 ? "blancas" : "negras"} · ${lines} línea${lines === 1 ? "" : "s"} · ${pos} jugada${pos === 1 ? "" : "s"}${first ? ` · empieza por ${esc(first)}` : " · vacío"}</span></div>
      <div class="controls" style="margin-top:4px">
        <button class="sm-btn" data-rep-edit="${rec.id}" title="Ábrelo en el tablero: juega jugadas para añadir líneas y variantes; se guarda solo">✏ Editar</button>
        <button class="sm-btn primary" data-rep-train="${rec.id}" ${pos ? "" : "disabled"}>▶ Entrenar</button>
        <button class="sm-btn info-btn" data-rep-review="${rec.id}" ${pos ? "" : "disabled"} title="Busca huecos, jugadas dudosas y cómo te va en tus partidas">🩺 Revisar</button>
        <button class="sm-btn" data-rep-side="${rec.id}" title="Cambia el bando con el que juegas este repertorio">${side === 1 ? "⚪→⚫" : "⚫→⚪"}</button>
      </div></div>`;
  }).join("");
  box.querySelectorAll("[data-rep-edit]").forEach(b => b.onclick = () => editMyRep(+b.dataset.repEdit || b.dataset.repEdit));
  box.querySelectorAll("[data-rep-train]").forEach(b => b.onclick = () => trainMyRep(+b.dataset.repTrain || b.dataset.repTrain));
  box.querySelectorAll("[data-rep-review]").forEach(b => b.onclick = () => { const rec = Lib.games.get(+b.dataset.repReview || b.dataset.repReview); if (rec) reviewRepertoire({ lib: rec.id, title: rec.title, g: Pgn.parseGame(rec.pgn, { lang: "en" }).game, side: repSideOf(rec) }); });
  box.querySelectorAll("[data-rep-side]").forEach(b => b.onclick = () => toggleRepSide(+b.dataset.repSide || b.dataset.repSide));
}
function editMyRep(id) {
  const rec = Lib.games.get(id);
  if (!rec || !openLibGame(id, [])) return;
  ui.flipped = repSideOf(rec) === -1;
  switchTab("study");
  render();
  toast("✏ Juega las jugadas de tu repertorio. Para preparar otra respuesta del rival, vuelve atrás y juega otra jugada: se añade como variante. Se guarda solo.", 6000);
}
function trainMyRep(id) {
  const rec = Lib.games.get(id);
  if (!rec) return;
  if (openLibGame(id, [])) startTraining({ side: repSideOf(rec) });
}
async function toggleRepSide(id) {
  const rec = Lib.games.get(id);
  if (!rec) return;
  const black = repSideOf(rec) === 1;
  if (ui.libId === id) {
    if (black) game.headers.Orientation = "black"; else delete game.headers.Orientation;
    ui.flipped = black;
    markDirty();
    await saveToLibrary({ silent: true });
    render();
  } else {
    const upd = Object.assign({}, rec, { pgn: black ? `[Orientation "black"]\n` + rec.pgn : rec.pgn.replace(/\[Orientation "black"\]\s*\n?/i, ""), updated: Date.now() });
    upd.size = upd.pgn.length;
    try { await DB.put("games", upd); Lib.games.set(id, upd); } catch (e) { toast("❌ No se pudo cambiar: " + (e.message || e)); return; }
  }
  toast(`Ahora «${rec.title}» es un repertorio con ${black ? "negras" : "blancas"}.`);
  refreshLibraryViews();
}
/* Crea un repertorio vacío, o una copia de uno del curso, en tu biblioteca y lo abre para editarlo */
async function createMyRep(fromCourse) {
  if (!Lib.ready) { toast("La biblioteca aún se está cargando…"); return; }
  let g, side, title;
  if (fromCourse != null && fromCourse !== "") {
    const l = courseLessons("repertorios")[+fromCourse];
    if (!l) return;
    g = Pgn.parseGame(collRaw(l.g), { lang: "en" }).game;
    side = l.black ? -1 : 1;
    title = "Mi " + l.title.charAt(0).toLowerCase() + l.title.slice(1);
  } else {
    side = +$("repNewSide").value || 1;
    title = $("repNewName").value.trim() || `Mi repertorio con ${side === 1 ? "blancas" : "negras"}`;
    g = Pgn.newGame();
    g.headers.Event = "Repertorio";
  }
  if (side === -1) g.headers.Orientation = "black"; else delete g.headers.Orientation;
  if (!setGame(g, { name: title, tags: ["repertorio"] })) return;
  ui.flipped = side === -1;
  const rec = await saveToLibrary({ silent: true, force: true });
  if (!rec) return;
  $("repNewName").value = "";
  switchTab("study");
  render();
  toast(fromCourse != null && fromCourse !== "" ? `🗂 «${title}» copiado a tus repertorios: cámbialo como quieras (añade o borra variantes); se guarda solo.` : `🗂 «${title}» creado. Juega en el tablero las jugadas de tu repertorio; para añadir otra respuesta del rival, vuelve atrás y juega otra jugada. Se guarda solo.`, 6500);
}

/* Estadísticas de una posición en la base elegida: Lichess (maestros o partidas online, con token) o tus partidas.
   Devuelve { total, moves: [{ san, n, white, draws, black }] } o { error } */
let LocalMoves = null, LocalMovesSig = "";
function localMoveIndex() {
  const sig = Lib.games.size + ":" + Coll.games.length + ":" + Math.max(0, ...[...Lib.games.values()].map(r => r.updated || 0));
  if (LocalMoves && LocalMovesSig === sig) return LocalMoves;
  const idx = new Map();
  const add = (g, res) => { let n = g.root; while (n.children.length) { const c = n.children[0]; const e = idx.get(n.key) || new Map(); const m = e.get(c.san) || { san: c.san, n: 0, white: 0, draws: 0, black: 0 }; m.n++; if (res === "1-0") m.white++; else if (res === "0-1") m.black++; else m.draws++; e.set(c.san, m); idx.set(n.key, e); n = c; } };
  for (const rec of Lib.games.values()) if (!isRepRec(rec)) { try { add(Pgn.parseGame(rec.pgn, { lang: "en" }).game, rec.result); } catch {} }
  Coll.games.forEach(t => { try { const g = Pgn.parseGame(t, { lang: "auto" }).game; add(g, (g.headers.Result || "").trim()); } catch {} });
  LocalMoves = idx; LocalMovesSig = sig;
  return idx;
}
async function explorerData(db, state) {
  if (db === "local") {
    const e = localMoveIndex().get(Chess.posKey(state));
    const moves = e ? [...e.values()].sort((a, b) => b.n - a.n) : [];
    return { total: moves.reduce((a, m) => a + m.n, 0), moves };
  }
  if (!settings.token) return { error: "token" };
  const url = explorerUrl(db, Chess.toFen(state));
  let data = explorerCache.get(url);
  if (!data) {
    try {
      const res = await Lichess.fetch(url, { headers: authHeaders() });
      if (res.status === 429) return { error: "pausa" };
      if (res.status === 401 || res.status === 403) return { error: "token-malo" };
      if (!res.ok) return { error: "red" };
      data = await res.json();
      explorerCache.set(url, data);
    } catch { return { error: "red" }; }
  }
  return { total: data.white + data.draws + data.black, moves: (data.moves || []).map(m => ({ san: m.san, n: m.white + m.draws + m.black, white: m.white, draws: m.draws, black: m.black })) };
}
const EXPLORER_ERR = { token: "Falta tu token de Lichess (⚙ Ajustes); mientras tanto, elige «Mi biblioteca».", pausa: "Lichess ha pedido una pausa: vuelve a intentarlo en un minuto.", "token-malo": "Lichess ha rechazado tu token: revísalo en ⚙ Ajustes.", red: "No se ha podido consultar Lichess (¿sin conexión?)." };
/* Evalúa una posición suelta con el motor; devuelve las líneas con la puntuación desde las blancas */
function evalState(state, ms, multipv = 1) {
  if (!Chess.legal(state).length) return Promise.resolve({ lines: [{ cp: Chess.inCheck(state) ? -3000 * state.t : 0, pv: [] }] });
  return new Promise(resolve => Engine.start({ purpose: "batch", fen: Chess.toFen(state), moves: [], stm: state.t, movetime: ms, multipv, resolve }));
}

/* Sorpresas y trampas de la posición del tablero */
const Surprise = { busy: false };
async function findSurprises() {
  ExpEval.token++;
  const out = $("surpriseOut"), node = cur(), st = node.state, me = st.t;
  if (Surprise.busy) return;
  if (!Engine.ready) { out.innerHTML = `<div class="note-box small">El motor aún no está listo.</div>`; return; }
  if (!Chess.legal(st).length) { out.innerHTML = `<div class="note-box small">La partida ha terminado en esta posición.</div>`; return; }
  const db = $("explorerDbSelect").value;
  Surprise.busy = true;
  $("surpriseBtn").disabled = true;
  const say = t => { out.innerHTML = `<div class="note-box small">⏳ ${esc(t)}</div>`; };
  ui.analysing = true;
  Engine.cancel("live");
  const fast = Engine.kind === "stockfish";
  const ms = fast ? 900 : 1500;
  const clean = x => String(x || "").replace(/[+#!?]/g, "");
  const sanTxt = (s, san) => numPrefix(s) + formatSan(san, settings.lang, s.t);
  const mv = (s, san) => { try { return Chess.parseMove(s, san, "en").move; } catch { return null; } };
  const sanOfUci = (s, u) => { const m = u && Chess.moveFromUci(s, u); return m ? Chess.san(s, m) : u; };
  try {
    say("Consultando las partidas…");
    const data = await explorerData(db, st);
    if (data.error) { out.innerHTML = `<div class="note-box small">${esc(EXPLORER_ERR[data.error])}</div>`; return; }
    if (!data.total) { out.innerHTML = `<div class="note-box small">No hay partidas en esta posición en la base elegida.</div>`; return; }
    say("Stockfish analiza la posición…");
    const top = await evalState(st, fast ? 2500 : 3000, fast ? 5 : 1);
    if (!top || !top.lines[0]) { out.innerHTML = `<div class="note-box small">El motor no ha podido analizar la posición.</div>`; return; }
    const evals = new Map();   // san -> cp desde el bando que mueve
    top.lines.filter(Boolean).forEach(l => { const san = sanOfUci(st, l.pv[0]); if (san && !evals.has(clean(san))) evals.set(clean(san), winnerCp(l) * me); });
    const best = Math.max(...evals.values());
    const bestSan = sanOfUci(st, top.lines[0].pv[0]);
    const popular = data.moves.filter(m => m.n / data.total >= 0.05).slice(0, 6);
    for (let i = 0; i < popular.length; i++) {
      const m = popular[i];
      if (evals.has(clean(m.san))) continue;
      const x = mv(st, m.san);
      if (!x) continue;
      say(`Stockfish revisa las jugadas más jugadas (${i + 1} de ${popular.length})…`);
      const j = await evalState(Chess.apply(st, x), ms);
      if (j && j.lines[0]) evals.set(clean(m.san), winnerCp(j.lines[0]) * me);
    }
    const shareOf = san => { const m = data.moves.find(x => clean(x.san) === clean(san)); return m ? m.n / data.total : 0; };
    // Sorpresas: casi tan buenas como la mejor, pero poco jugadas
    const surprises = [...evals].filter(([san, v]) => best - v <= 20 && shareOf(san) < 0.05 && data.total >= (db === "local" ? 5 : 50)).map(([san, v]) => ({ san, v, share: shareOf(san) }));
    // Errores frecuentes: muy jugadas y claramente peores que la mejor
    const errors = popular.filter(m => evals.has(clean(m.san)) && best - evals.get(clean(m.san)) >= 100 && m.n / data.total >= 0.08).map(m => ({ san: m.san, share: m.n / data.total, loss: best - evals.get(clean(m.san)) }));
    // Trampas: tras una jugada buena, la respuesta más habitual del rival es un error
    const traps = [];
    const cands = popular.filter(m => evals.has(clean(m.san)) && best - evals.get(clean(m.san)) <= 60).slice(0, 4);
    for (let i = 0; i < cands.length; i++) {
      const x = mv(st, cands[i].san);
      if (!x) continue;
      const s2 = Chess.apply(st, x);
      say(`Buscando trampas tras ${sanTxt(st, cands[i].san)} (${i + 1} de ${cands.length})…`);
      const d2 = await explorerData(db, s2);
      if (d2.error || !d2.total || d2.total < (db === "local" ? 3 : 30)) continue;
      const replies = d2.moves.filter(r => r.n / d2.total >= 0.12).slice(0, 3);
      if (!replies.length) continue;
      const b2 = await evalState(s2, ms, 1);
      if (!b2 || !b2.lines[0]) continue;
      const bestReply = winnerCp(b2.lines[0]) * -me, bestReplySan = sanOfUci(s2, b2.lines[0].pv[0]);
      for (const r of replies) {
        if (clean(r.san) === clean(bestReplySan)) continue;
        const y = mv(s2, r.san);
        if (!y) continue;
        const j = await evalState(Chess.apply(s2, y), ms);
        if (!j || !j.lines[0]) continue;
        const loss = bestReply - winnerCp(j.lines[0]) * -me;
        if (loss >= 150) traps.push({ first: cands[i].san, reply: r.san, share: r.n / d2.total, loss, bestReply: bestReplySan, s2, after: winnerCp(j.lines[0]) * me });
      }
    }
    const pct = x => Math.round(x * 100) + " %";
    const turnTxt = me === 1 ? "las blancas" : "las negras";
    const src = db === "masters" ? "las partidas de maestros" : db === "lichess" ? "las partidas de Lichess" : "tus partidas";
    out.innerHTML = `<div class="small">Según Stockfish y ${src} (${data.total.toLocaleString("es-ES")} partida${data.total === 1 ? "" : "s"} en esta posición). Juegan ${turnTxt}; lo mejor según el motor: <b>${esc(sanTxt(st, bestSan))}</b>.</div>
      <h3>💡 Sorpresas: buenas y poco jugadas</h3>
      ${surprises.length ? surprises.map(x => `<div class="version-row"><span class="version-what"><b>${esc(sanTxt(st, x.san))}</b> <span class="small">(${x.share ? "sólo el " + pct(x.share) + " de las partidas" : "casi nadie la juega"}; ${best - x.v > 5 ? `según el motor, casi tan buena como la mejor: a ${(Math.max(0, best - x.v) / 100).toFixed(2).replace(".", ",")} peones` : "según el motor, tan buena como la mejor"})</span></span><button class="sm-btn" data-sp="${esc(x.san)}">▶ Jugarla</button></div>`).join("") : `<div class="small">No hay jugadas poco conocidas que sean tan buenas como las habituales.</div>`}
      <h3>⚠ Errores frecuentes en esta posición</h3>
      ${errors.length ? errors.map(x => `<div class="version-row"><span class="version-what"><b>${esc(sanTxt(st, x.san))}</b> se juega en el ${pct(x.share)} de las partidas, pero pierde ${(x.loss / 100).toFixed(2).replace(".", ",")} peones respecto a ${esc(sanTxt(st, bestSan))}.</span></div>`).join("") : `<div class="small">Ninguna de las jugadas habituales es un error claro.</div>`}
      <h3>🪤 Trampas: la respuesta habitual es un error</h3>
      ${traps.length ? traps.sort((a, b) => b.share * b.loss - a.share * a.loss).map(x => `<div class="version-row"><span class="version-what">Tras <b>${esc(sanTxt(st, x.first))}</b>, el ${pct(x.share)} responde <b>${esc(sanTxt(x.s2, x.reply))}</b>, que pierde ${(x.loss / 100).toFixed(2).replace(".", ",")} peones (lo correcto es ${esc(sanTxt(x.s2, x.bestReply))}).</span><button class="sm-btn" data-sp="${esc(x.first)}" data-sp2="${esc(x.reply)}">▶ Verla</button></div>`).join("") : `<div class="small">No se han encontrado trampas claras a partir de esta posición.</div>`}
      <p class="small">Prepara las sorpresas y las trampas en <b>🗂 Mis repertorios</b>. Es una revisión rápida: compruébalo con el análisis antes de jugarlo en una partida.</p>`;
    out.querySelectorAll("[data-sp]").forEach(b => b.onclick = () => {
      if (cur() !== node) { toast("La posición del tablero ha cambiado: vuelve a buscar."); return; }
      if (!canUserMove()) return;
      const a = mv(node.state, b.dataset.sp);
      if (!a) return;
      playMove(a, "user");
      if (b.dataset.sp2) { const c = mv(cur().state, b.dataset.sp2); if (c) setTimeout(() => playMove(c, "user"), 350); }
    });
  } finally {
    ui.analysing = false;
    Surprise.busy = false;
    $("surpriseBtn").disabled = false;
    requestLive();
  }
}

/* 🎯 Preparar un rival: sus partidas públicas de Lichess → aperturas, resultados, finales de partida, errores
   y las líneas suyas que se salen de tu repertorio */
const Rival = { busy: false };
async function prepareRival() {
  const user = $("rivalUser").value.trim(), out = $("rivalOut");
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(user)) { toast("Escribe un nombre de usuario de Lichess válido."); $("rivalUser").focus(); return; }
  if (Rival.busy) return;
  Rival.busy = true;
  $("rivalBtn").disabled = true;
  out.innerHTML = `<div class="note-box small">⏳ Descargando las partidas de ${esc(user)} de Lichess…</div>`;
  try {
    const q = new URLSearchParams({ max: $("rivalMax").value, perfType: $("rivalPerf").value, opening: "true", clocks: "false", evals: "true", sort: "dateDesc" });
    let text;
    try {
      const res = await Lichess.fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${q}`, { headers: Object.assign({ Accept: "application/x-chess-pgn" }, authHeaders()) });
      if (res.status === 404) throw Error(`no existe el usuario «${user}» en Lichess`);
      if (res.status === 429) throw Error(`Lichess pide una pausa: inténtalo en ${Lichess.waitSeconds()} s`);
      if (!res.ok) throw Error("Lichess respondió con un error " + res.status);
      text = await res.text();
    } catch (e) { out.innerHTML = `<div class="note-box small msg-err">No se pudieron descargar: ${esc(e.message && !/fetch/i.test(e.message) ? e.message : "sin conexión con Lichess")}.</div>`; return; }
    out.innerHTML = `<div class="note-box small">⏳ Estudiando sus partidas…</div>`;
    await new Promise(r => setTimeout(r, 0));
    const me = norm(user), games = [];
    for (const part of Pgn.splitGames(text)) {
      if (!part.movetext.trim()) continue;
      let r;
      try { r = Pgn.parseGame(part, { lang: "en" }); } catch { continue; }
      if (r.error) continue;
      const h = r.game.headers, c = norm(h.White) === me ? 1 : norm(h.Black) === me ? -1 : 0;
      if (!c || h.SetUp === "1") continue;
      const line = Pgn.mainlineFrom(r.game.root);
      if (line.length < 2) continue;
      const res = (h.Result || "*").trim(), sc = scoreOf(res, c);
      const eco = ECO.detect(line[Math.min(line.length, 24) - 1]);
      games.push({ g: r.game, h, c, line, sc, res, opening: eco ? eco.entry.name.split(" · ")[0] : (h.Opening || "Otras").split(":")[0] });
    }
    if (!games.length) { out.innerHTML = `<div class="note-box small">${esc(user)} no tiene partidas que coincidan con esos filtros.</div>`; return; }
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + " %";
    const scoreTxt = list => { const v = list.filter(x => x.sc != null); return v.length ? pct(v.reduce((a, x) => a + x.sc, 0), v.length) : "—"; };
    const byColor = c => games.filter(x => x.c === c);
    const W = byColor(1), B = byColor(-1);
    // Aperturas por color
    const openingRows = list => {
      const m = new Map();
      list.forEach(x => { const e = m.get(x.opening) || { name: x.opening, n: 0, pts: 0, k: 0 }; e.n++; if (x.sc != null) { e.pts += x.sc; e.k++; } m.set(x.opening, e); });
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 7).map(e => {
        const s = e.k ? e.pts / e.k : null, tag = e.n >= 3 && s != null ? (s <= 0.4 ? ` <span class="srs-pill due">floja para él</span>` : s >= 0.65 ? ` <span class="srs-pill ok">su fuerte</span>` : "") : "";
        return `<div class="version-row"><span class="version-what">${esc(e.name)}${tag}</span><span class="small">${e.n} partida${e.n === 1 ? "" : "s"} · ${s == null ? "—" : Math.round(s * 100) + " %"}</span></div>`;
      }).join("") || `<div class="small">Sin partidas.</div>`;
    };
    // Primeras jugadas
    const firstMoves = (list, ply, filter) => {
      const m = new Map();
      list.filter(filter || (() => true)).forEach(x => { const n = x.line[ply]; if (!n) return; const k = n.san; const e = m.get(k) || { san: k, st: n.parent.state, n: 0 }; e.n++; m.set(k, e); });
      const tot = [...m.values()].reduce((a, e) => a + e.n, 0);
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 4).map(e => `${numPrefix(e.st)}${formatSan(e.san, settings.lang, e.st.t)} (${pct(e.n, tot)})`).join(", ");
    };
    // Cómo acaban sus partidas
    const lost = games.filter(x => x.sc === 0), timeLoss = lost.filter(x => /time/i.test(x.h.Termination || "")).length;
    const avgLen = Math.round(games.reduce((a, x) => a + x.line.length, 0) / games.length / 2);
    // Errores por fase (sólo partidas analizadas en Lichess, con [%eval])
    const phase = { apertura: 0, "medio juego": 0, final: 0 }, analysed = [];
    for (const x of games) {
      if (x.line.filter(n => n.eval).length < x.line.length * 0.7) continue;
      analysed.push(x);
      if (!x.g.root.eval) x.g.root.eval = { cp: 20, depth: 0, source: "pgn" };
      for (const n of x.line) {
        if (n.parent.state.t !== x.c) continue;
        const info = classifyMove(n);
        if (!info || (info.cls !== "??" && info.cls !== "?")) continue;
        const ply = Pgn.pathTo(n).length - 1;
        phase[ply <= 24 ? "apertura" : Chess.nonPawnCount(n.parent.state) <= 6 ? "final" : "medio juego"]++;
      }
    }
    const errTot = Object.values(phase).reduce((a, b) => a + b, 0);
    const worst = Object.entries(phase).sort((a, b) => b[1] - a[1])[0];
    // Sus líneas frente a tu repertorio
    const trees = repertoireTrees(), devs = new Map(), followed = [];
    for (const x of games) {
      const mySide = -x.c;
      const fits = trees.filter(t => t.side === mySide && t.g.root.children.some(ch => ch.uci === x.line[0].uci));
      const pool = fits.some(t => t.lib) ? fits.filter(t => t.lib) : fits;
      let best = null;
      for (const t of pool) { const m = matchGameToTree(x.line, t, mySide); if (!best || m.depth > best.depth) best = Object.assign({ tree: t }, m); }
      if (!best) continue;
      if (!best.dev) { followed.push(best); continue; }
      if (best.dev.mine) continue;   // se salió su rival, no él: no dice nada de lo que juega
      const k = (best.tree.lib || "c" + best.tree.i) + "|" + best.path.join(" ");
      const e = devs.get(k) || { n: 0, tree: best.tree, path: best.path, node: best.dev.n };
      e.n++; devs.set(k, e);
    }
    const topDevs = [...devs.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    Rival.devs = topDevs;
    Rival.text = text; Rival.user = user;
    const lineOfPath = (tree, path) => lineText(tree.g.root.state, path, 40);
    out.innerHTML = `<div class="note-box"><b>🎯 ${esc(user)}</b>: ${games.length} partida${games.length === 1 ? "" : "s"} (${W.length} con blancas, ${B.length} con negras) · puntuación ${scoreTxt(games)} · con blancas ${scoreTxt(W)} · con negras ${scoreTxt(B)}.</div>
      <div class="rival-grid">
        <div><h3>⚪ Con blancas</h3><div class="small">Empieza con: ${esc(firstMoves(W, 0) || "—")}</div>${openingRows(W)}</div>
        <div><h3>⚫ Con negras</h3><div class="small">Contra 1.e4: ${esc(firstMoves(B, 1, x => x.line[0].san === "e4") || "—")}<br>Contra 1.d4: ${esc(firstMoves(B, 1, x => x.line[0].san === "d4") || "—")}</div>${openingRows(B)}</div>
      </div>
      <h3>⏱ Cómo acaban sus partidas</h3>
      <div class="small">Duran unas ${avgLen} jugadas de media. ${lost.length ? `De sus ${lost.length} derrotas, ${timeLoss} fueron por tiempo${timeLoss / lost.length >= 0.3 ? ": <b>se apura con el reloj</b>, así que conviene llevarle a posiciones complicadas y no tener prisa" : ""}.` : "No tiene derrotas en estas partidas."}</div>
      <h3>⚠ Dónde falla</h3>
      <div class="small">${analysed.length ? `En ${analysed.length === 1 ? "su única partida analizada" : `sus ${analysed.length} partidas analizadas`} en Lichess cometió ${errTot} error${errTot === 1 ? "" : "es"} (? y ??), ${String(Math.round(errTot / analysed.length * 10) / 10).replace(".", ",")} por partida${errTot ? `; la mayoría en <b>${{ apertura: "la apertura", "medio juego": "el medio juego", final: "el final" }[worst[0]]}</b> (${pct(worst[1], errTot)})` : ""}.` : "Ninguna de estas partidas está analizada en Lichess, así que no se pueden contar sus errores."}</div>
      <h3>🗂 Sus líneas frente a tu repertorio</h3>
      ${topDevs.length ? `<p class="small">Líneas suyas que se salen de tu repertorio (para prepararlas):</p>` + topDevs.map((d, i) => `<div class="version-row"><span class="version-what">${d.tree.lib ? "🗂" : "📘"} ${esc(d.tree.title)}: <b>${esc(lineOfPath(d.tree, d.path))}</b> <span class="small">(${d.n} partida${d.n === 1 ? "" : "s"})</span></span>${d.tree.lib ? `<button class="sm-btn primary" data-rv="${i}">➕ Prepararla</button>` : `<button class="sm-btn" data-rvc="${i}" title="Es un repertorio del curso: cópialo a «Mis repertorios» para poder añadirla">📖 Ver</button>`}</div>`).join("") : `<div class="small">${followed.length ? "" : "Sus partidas no se cruzan con tus repertorios."}</div>`}
      ${followed.length ? `<div class="small">✔ En ${followed.length} partida${followed.length === 1 ? "" : "s"} jugó dentro de tu repertorio hasta el final de tu preparación.</div>` : ""}
      <div class="controls"><button class="sm-btn" id="rivalOpenBtn" title="Abre sus partidas como .pgn: podrás recorrerlas y, en el explorador «Mi biblioteca + .pgn», ver su árbol de aperturas">🗂 Abrir sus partidas</button></div>`;
    out.querySelectorAll("[data-rv]").forEach(b => b.onclick = () => { const d = Rival.devs[+b.dataset.rv]; prepareRivalMove(d.tree, d.path.slice(0, -1), d.path[d.path.length - 1]); });
    out.querySelectorAll("[data-rvc]").forEach(b => b.onclick = () => { const d = Rival.devs[+b.dataset.rvc]; openRepertoireAt(d.tree, d.path.slice(0, -1)); });
    $("rivalOpenBtn").onclick = () => { const n = setCollection(Rival.text, false, `Lichess: ${Rival.user}`); switchTab("library"); switchSub("collection"); toast(`🗂 ${n} partidas de ${Rival.user} abiertas (sin guardar).`); };
  } finally {
    Rival.busy = false;
    $("rivalBtn").disabled = false;
  }
}

/* Revisión de un repertorio: líneas sin terminar, huecos (respuestas frecuentes del rival que no tienes),
   jugadas dudosas según el motor y cómo te va con él en tus partidas */
const RepReview = { busy: false, cancel: false };
const winnerCp = l => (!l ? null : l.mate != null ? (l.mate > 0 || (l.mate === 0 && l.winner === 1) ? 3000 : -3000) : l.cp);
const fmtPawns = v => (Math.abs(v) >= 2000 ? (v > 0 ? "mate" : "mate en contra") : (v > 0 ? "+" : "") + (v / 100).toFixed(2).replace(".", ","));
async function reviewRepertoire(tree) {
  ExpEval.token++;
  const out = $("repReviewOut");
  if (RepReview.busy) { toast("Ya hay una revisión en marcha."); return; }
  RepReview.busy = true; RepReview.cancel = false;
  const side = tree.side, root = tree.g.root, MAXPLY = 20;
  const pathOf = n => Pgn.pathTo(n).slice(1).map(x => x.uci);
  const lineOf = n => lineText(root.state, pathOf(n), 40);
  const nodes = [];
  (function walk(n, d) { nodes.push(n); if (d < MAXPLY) n.children.forEach(c => walk(c, d + 1)); })(root, 0);
  const depthOf = n => Pgn.pathTo(n).length - 1;
  const status = txt => { out.innerHTML = `<div class="note-box">🩺 Revisando «${esc(tree.title)}»… ${txt} <button class="sm-btn danger" id="repReviewStop">⏹ Parar</button></div>`; $("repReviewStop").onclick = () => { RepReview.cancel = true; }; };
  out.scrollIntoView({ block: "nearest" });
  // 1) Estructura: líneas que acaban con una jugada del rival (te falta tu respuesta)
  const leaves = repLeaves(root);
  const open = leaves.filter(n => n.state.t === side && Chess.legal(n.state).length);
  // 2) Huecos: respuestas del rival frecuentes que tu repertorio no tiene
  const gaps = [];
  let source = "", gapNote = "";
  const rivalNodes = nodes.filter(n => n.state.t === -side && n.children.length && depthOf(n) <= 14 && Chess.legal(n.state).length);
  const db = settings.explorerDb === "local" ? "local" : settings.token ? (settings.explorerDb === "masters" ? "masters" : "lichess") : "local";
  const stats = new Map();   // node -> { total, moves: [{san, n}] }
  if (db === "local") {
    source = "tus partidas de la biblioteca y el .pgn abierto";
    const idx = new Map();
    const add = g => { let n = g.root; while (n.children.length) { const c = n.children[0]; const e = idx.get(n.key) || new Map(); e.set(c.san, (e.get(c.san) || 0) + 1); idx.set(n.key, e); n = c; } };
    for (const rec of Lib.games.values()) if (!isRepRec(rec)) { try { add(Pgn.parseGame(rec.pgn, { lang: "en" }).game); } catch {} }
    Coll.games.forEach(t => { try { add(Pgn.parseGame(t, { lang: "auto" }).game); } catch {} });
    for (const n of rivalNodes) { const e = idx.get(n.key); if (e) { const moves = [...e].map(([san, k]) => ({ san, n: k })); stats.set(n, { total: moves.reduce((a, m) => a + m.n, 0), moves }); } }
    if (!settings.token) gapNote = "Con tu token de Lichess (⚙ Ajustes) los huecos se buscan en millones de partidas, no sólo en las tuyas.";
  } else {
    source = db === "masters" ? "las partidas de maestros de Lichess" : "las partidas de Lichess (1800-2500)";
    const todo = rivalNodes.slice().sort((a, b) => depthOf(a) - depthOf(b)).slice(0, 30);
    for (let i = 0; i < todo.length && !RepReview.cancel; i++) {
      status(`Consultando a Lichess las respuestas del rival (${i + 1} de ${todo.length})…`);
      const url = explorerUrl(db, Chess.toFen(todo[i].state));
      let data = explorerCache.get(url);
      if (!data) {
        try {
          const res = await Lichess.fetch(url, { headers: authHeaders() });
          if (res.status === 429) { gapNote = `Lichess ha pedido una pausa: se han revisado ${i} posiciones. Vuelve a pulsar «Revisar» en un minuto para completar.`; break; }
          if (res.status === 401 || res.status === 403) { gapNote = "Lichess ha rechazado tu token: revísalo en ⚙ Ajustes."; break; }
          if (!res.ok) throw Error(res.status);
          data = await res.json();
          explorerCache.set(url, data);
        } catch (e) { gapNote = "No se ha podido consultar Lichess (¿sin conexión?): los huecos están incompletos."; break; }
      }
      const moves = (data.moves || []).map(m => ({ san: m.san, n: m.white + m.draws + m.black }));
      stats.set(todo[i], { total: data.white + data.draws + data.black, moves });
    }
  }
  const clean = x => String(x || "").replace(/[+#!?]/g, "");
  // Probabilidad de llegar a cada posición: el producto de lo que se juega cada jugada del rival en el camino
  const reach = n => { let p = 1; for (let x = n; x.parent; x = x.parent) { const st = stats.get(x.parent); if (x.parent.state.t === -side && st && st.total) { const m = st.moves.find(mm => clean(mm.san) === clean(x.san)); p *= m ? m.n / st.total : 0.05; } } return p; };
  for (const [n, st] of stats) {
    if (!st.total || st.total < (db === "local" ? 2 : 10)) continue;
    for (const m of st.moves) {
      const share = m.n / st.total;
      if (share < (db === "local" ? 0.2 : 0.08) || n.children.some(c => clean(c.san) === clean(m.san))) continue;
      const mv = (() => { try { return Chess.parseMove(n.state, m.san, "en").move; } catch { return null; } })();
      if (!mv) continue;
      gaps.push({ n, san: m.san, uci: Chess.uci(mv), share, games: m.n, weight: reach(n) * share });
    }
  }
  gaps.sort((a, b) => b.weight - a.weight);
  // 3) Motor: tus jugadas que pierden mucho y líneas que terminan peor para ti
  const dubious = [], badEnds = [];
  let engineNote = "";
  if (!Engine.ready) engineNote = "El motor no está listo: no se han revisado las jugadas.";
  else {
    ui.analysing = true;
    Engine.cancel("live");
    const ms = Engine.kind === "stockfish" ? 350 : 600;
    const mineNodes = nodes.filter(n => n.state.t === side && n.children.length && Chess.legal(n.state).length).slice(0, 50);
    const ends = leaves.filter(n => Chess.legal(n.state).length).slice(0, 30);
    const total = mineNodes.length + ends.length;
    const evalOf = async n => { let j = await Engine.analyse(n, { purpose: "batch", movetime: ms, multipv: 1 }); if (!j && !RepReview.cancel) j = await Engine.analyse(n, { purpose: "batch", movetime: ms, multipv: 1 }); return j && j.lines[0] ? j : null; };
    const cache = new Map();
    const ev = async n => { if (cache.has(n)) return cache.get(n); const t = terminalEval(n); const v = t ? { cp: winnerCp(t), best: null } : await (async () => { const j = await evalOf(n); return j ? { cp: winnerCp(j.lines[0]), best: j.lines[0].pv[0] || j.best } : null; })(); cache.set(n, v); return v; };
    let k = 0;
    try {
      for (const n of mineNodes) {
        if (RepReview.cancel) break;
        status(`Stockfish revisa tus jugadas (${++k} de ${total})…`);
        const before = await ev(n);
        if (!before) continue;
        for (const c of n.children) {
          if (RepReview.cancel || c.uci === before.best) continue;
          const after = await ev(c);
          if (!after) continue;
          const drop = (before.cp - after.cp) * side, mineAfter = after.cp * side;
          if (drop >= 80 && !(mineAfter > 400)) dubious.push({ n: c, drop, best: before.best, after: mineAfter });
        }
      }
      for (const n of ends) {
        if (RepReview.cancel) break;
        status(`Stockfish revisa cómo acaban tus líneas (${++k} de ${total})…`);
        const v = await ev(n);
        if (v && v.cp * side <= -70) badEnds.push({ n, v: v.cp * side });
      }
    } finally { ui.analysing = false; }
    if (RepReview.cancel) engineNote = "Revisión con el motor interrumpida: los resultados están incompletos.";
  }
  // 4) Tus partidas con este repertorio
  const names = myNameList();
  let gamesHtml = "";
  if (!names.length) gamesHtml = `<span class="small">Pon tu nombre en «📚 Biblioteca › 📊 Estadísticas» para ver cómo te va con este repertorio en tus partidas.</span>`;
  else {
    const rows = myGameLines(names).filter(x => x.c === side && root.children.some(ch => ch.uci === x.line[0].uci)).map(x => Object.assign(x, matchGameToTree(x.line, tree, side)));
    if (!rows.length) gamesHtml = `<span class="small">Ninguna partida tuya de la biblioteca empieza como este repertorio.</span>`;
    else {
      const mine = rows.filter(r => r.dev && r.dev.mine), rival = rows.filter(r => r.dev && !r.dev.mine);
      const pts = rows.map(r => scoreOf(r.rec.result, side)).filter(x => x != null);
      const avg = Math.round(rows.reduce((a, r) => a + r.depth, 0) / rows.length / 2 * 10) / 10;
      const newLines = {};
      rival.forEach(r => { const k = r.path.join(" "); newLines[k] = newLines[k] || { n: 0, r }; newLines[k].n++; });
      const topNew = Object.values(newLines).sort((a, b) => b.n - a.n).slice(0, 5);
      gamesHtml = `<div class="small">${rows.length} partida${rows.length === 1 ? "" : "s"} · sigues el repertorio ${String(avg).replace(".", ",")} jugadas de media · ❌ te saliste tú en ${mine.length} · 🆕 se salió el rival en ${rival.length}${pts.length ? ` · puntuación: ${Math.round(pts.reduce((a, b) => a + b, 0) / pts.length * 100)} %` : ""}</div>`
        + topNew.map((x, i) => `<div class="version-row"><span class="version-what">🆕 ${esc(lineText(root.state, x.r.path, 40))} <span class="small">(${x.n} partida${x.n === 1 ? "" : "s"})</span></span>${tree.lib ? `<button class="sm-btn primary" data-new="${i}">➕ Prepararla</button>` : ""}</div>`).join("");
      RepReview.newLines = topNew;
    }
  }
  RepReview.busy = false;
  const btnGo = (kind, i, label = "📖 Ver") => `<button class="sm-btn" data-go="${kind}:${i}">${label}</button>`;
  const shownGaps = gaps.slice(0, 12);
  const sanTxt = (st, san) => numPrefix(st) + formatSan(san, settings.lang, st.t);
  out.innerHTML = `<div class="note-box"><b>🩺 Revisión de «${esc(tree.title)}»</b> (con ${side === 1 ? "blancas" : "negras"}): ${leaves.length} línea${leaves.length === 1 ? "" : "s"}.
      ${!tree.lib ? `<br><span class="small">Es un repertorio del curso: para cambiarlo, cópialo a «Mis repertorios».</span>` : ""}</div>
    <h3>🕳 Huecos: respuestas del rival que no tienes preparadas</h3>
    <p class="small">Según ${esc(source)}, ordenadas por lo probable que es encontrártelas.${gapNote ? " " + esc(gapNote) : ""}</p>
    ${shownGaps.length ? shownGaps.map((x, i) => `<div class="version-row"><span class="version-what">Tras <b>${esc(lineOf(x.n) || "la posición inicial")}</b>: falta <b>${esc(sanTxt(x.n.state, x.san))}</b> <span class="small">(${Math.round(x.share * 100)} % · ${x.games.toLocaleString("es-ES")} partida${x.games === 1 ? "" : "s"})</span></span>${tree.lib ? `<button class="sm-btn primary" data-gap="${i}">➕ Prepararla</button>` : btnGo("gap", i)}</div>`).join("") : `<div class="small">✔ No se han encontrado huecos importantes${stats.size ? "" : " (no hay datos de partidas para estas posiciones)"}.</div>`}
    <h3>✂ Líneas sin tu respuesta</h3>
    ${open.length ? `<p class="small">Acaban con una jugada del rival: falta decidir qué juegas tú.</p>` + open.slice(0, 10).map((n, i) => `<div class="version-row"><span class="version-what">${esc(lineOf(n))}</span>${btnGo("open", i, tree.lib ? "✏ Completar" : "📖 Ver")}</div>`).join("") : `<div class="small">✔ Todas tus líneas terminan con una jugada tuya.</div>`}
    <h3>⚠ Jugadas dudosas según Stockfish</h3>
    ${engineNote ? `<p class="small">${esc(engineNote)}</p>` : ""}
    ${dubious.length ? dubious.sort((a, b) => b.drop - a.drop).slice(0, 10).map((x, i) => { const p = x.n.parent, bm = x.best && Chess.moveFromUci(p.state, x.best); return `<div class="version-row"><span class="version-what"><b>${esc(lineOf(x.n))}</b>: pierde ${fmtPawns(x.drop).replace("+", "")} peones${bm ? `; el motor prefiere <b>${esc(sanTxt(p.state, Chess.san(p.state, bm)))}</b>` : ""}</span>${btnGo("dub", i)}</div>`; }).join("") : Engine.ready && !RepReview.cancel ? `<div class="small">✔ Ninguna de tus jugadas pierde claramente según el motor (revisión rápida).</div>` : ""}
    ${badEnds.length ? `<p class="small">Líneas que terminan en una posición peor para ti:</p>` + badEnds.sort((a, b) => a.v - b.v).slice(0, 8).map((x, i) => `<div class="version-row"><span class="version-what">${esc(lineOf(x.n))} <span class="small">(${fmtPawns(x.v)} para ti)</span></span>${btnGo("end", i)}</div>`).join("") : ""}
    <h3>📚 En tus partidas</h3>
    ${gamesHtml}`;
  const lists = { gap: shownGaps.map(x => x.n), open, dub: dubious.map(x => x.n), end: badEnds.map(x => x.n) };
  out.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { const [kind, i] = b.dataset.go.split(":"); const n = lists[kind][+i]; if (n) openRepertoireAt(tree, pathOf(n)); });
  out.querySelectorAll("[data-gap]").forEach(b => b.onclick = () => { const x = shownGaps[+b.dataset.gap]; prepareRivalMove(tree, pathOf(x.n), x.uci); });
  out.querySelectorAll("[data-new]").forEach(b => b.onclick = () => { const x = RepReview.newLines[+b.dataset.new]; prepareRivalMove(tree, x.r.path.slice(0, -1), x.r.path[x.r.path.length - 1]); });
}

