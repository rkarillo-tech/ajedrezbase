/* ---------- 21a. Consultas a Lichess: de una en una y respetando sus pausas ----------
   Lichess pide hacer una sola petición a la vez y esperar un minuto entero tras una respuesta 429. */
const Lichess = {
  chain: Promise.resolve(), blockedUntil: 0,
  waitSeconds() { return Math.max(0, Math.ceil((this.blockedUntil - Date.now()) / 1000)); },
  fetch(url, opts = {}) {
    const run = async () => {
      if (opts.signal && opts.signal.aborted) throw new DOMException("Consulta cancelada", "AbortError");
      const wait = this.waitSeconds();
      if (wait > 0) { const e = Error(`Lichess pide esperar: inténtalo de nuevo en ${wait} s.`); e.status = 429; throw e; }
      const res = await fetch(url, opts);
      if (res.status === 429) this.blockedUntil = Date.now() + 61000;
      return res;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
};

/* ---------- 21. Explorador de aperturas ---------- */
const explorerCache = new Map();
const refreshExplorer = debounce(() => fetchExplorer(), 260);
const authHeaders = () => (settings.token ? { Authorization: "Bearer " + settings.token } : {});
function wdlBar(w, d, b) {
  const total = w + d + b || 1;
  const wp = Math.round(w / total * 100), dp = Math.round(d / total * 100), bp = 100 - wp - dp;
  return `<div class="wdl-bar" title="Blancas ${wp}% · Tablas ${dp}% · Negras ${bp}%"><div class="wdl-w" style="width:${wp}%">${wp > 14 ? wp + "%" : ""}</div><div class="wdl-d" style="width:${dp}%">${dp > 14 ? dp + "%" : ""}</div><div class="wdl-b" style="width:${bp}%">${bp > 14 ? bp + "%" : ""}</div></div>`;
}
/* 📊 Valoración de cada jugada del explorador: primero la nube de Lichess (una consulta con las 5 mejores) y,
   para las demás, una evaluación rápida con el motor de la aplicación */
const ExpEval = { cache: new Map(), token: 0, busy: false };
async function fillExplorerEvals(node, rows) {
  const my = ++ExpEval.token, s = node.state, fen = Chess.toFen(s);
  const cells = () => [...$("explorerMovesBody").querySelectorAll(".exp-eval")];
  const still = () => my === ExpEval.token && cur() === node && ui.activeTab === "explorer";
  const keyOf = u => fen + "|" + u;
  const uciOf = san => { try { return Chess.uci(Chess.parseMove(s, san, "en").move); } catch { return null; } };
  const show = () => {
    const vals = rows.map(r => ExpEval.cache.get(keyOf(uciOf(r.san)))).filter(Boolean);
    const best = vals.length ? Math.max(...vals.map(v => winPct(v) * s.t + (s.t === -1 ? 100 : 0))) : null;
    for (const td of cells()) {
      const v = ExpEval.cache.get(keyOf(uciOf(td.dataset.san)));
      if (!v) continue;
      const w = winPct(v) * s.t + (s.t === -1 ? 100 : 0), loss = best == null ? 0 : best - w;
      td.className = "num exp-eval" + (loss <= 2 ? " good" : loss >= 10 ? " bad" : "");
      td.innerHTML = `${esc(fmtEval(v))}<span class="src">${v.src === "nube" ? "☁" : "⚙"}</span>`;
      td.title = `${evalVerdict(v)} · ${v.src === "nube" ? "nube de Lichess, profundidad " + v.depth : "motor de la aplicación (evaluación rápida)"}`;
    }
  };
  if (!rows.length) return;
  show();
  // 1) Nube de Lichess: las 5 mejores jugadas de la posición
  if (!rows.every(r => ExpEval.cache.has(keyOf(uciOf(r.san))))) {
    try {
      const res = await Lichess.fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=5`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        for (const pv of data.pvs || []) { const u = pv.moves.split(" ")[0]; const k = keyOf(u); if (!ExpEval.cache.has(k) || ExpEval.cache.get(k).src !== "nube") ExpEval.cache.set(k, { cp: pv.cp, mate: pv.mate, depth: data.depth, src: "nube" }); }
      }
    } catch {}
    if (!still()) return;
    show();
  }
  // 2) Las que faltan: evaluación rápida con el motor de la aplicación (sin molestar a otras tareas del motor)
  for (const r of rows.slice(0, 10)) {
    const u = uciOf(r.san);
    if (!u || ExpEval.cache.has(keyOf(u))) continue;
    if (!still() || !Engine.ready || ui.analysing || ui.cpu.on || Batch.running || Think.busy || RepReview.busy || Surprise.busy) break;
    const after = Chess.apply(s, Chess.moveFromUci(s, u));
    ExpEval.busy = true;
    Engine.cancel("live");
    let j = null;
    try { j = await evalState(after, Engine.kind === "stockfish" ? 350 : 500, 1); } finally { ExpEval.busy = false; }
    const l = j && j.lines && j.lines[0];
    if (l) ExpEval.cache.set(keyOf(u), { cp: l.cp, mate: l.mate, winner: l.winner, depth: l.depth, src: "motor" });
    if (!still()) break;
    show();
  }
  if (cells().some(td => td.textContent === "…")) cells().filter(td => td.textContent === "…").forEach(td => { td.textContent = "—"; td.title = "Sin valoración (la nube no tiene esta jugada y el motor estaba ocupado)"; });
  if (my === ExpEval.token) requestLive();
}
function explorerMoveRows(node, rows) {
  const tbody = $("explorerMovesBody");
  tbody.innerHTML = "";
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="small">No hay partidas registradas en esta posición.</td></tr>`; return; }
  for (const m of rows) {
    const tr = document.createElement("tr");
    const total = m.white + m.draws + m.black;
    tr.innerHTML = `<td><b>${esc(formatSan(m.san, settings.lang, node.state.t))}</b></td><td class="num">${total.toLocaleString("es-ES")}</td><td>${wdlBar(m.white, m.draws, m.black)}</td><td class="num exp-eval" data-san="${esc(m.san)}">…</td><td class="num hide-sm">${m.averageRating || "—"}</td>`;
    tr.onclick = () => {
      if (cur() !== node || !canUserMove()) return;
      try { playMove(Chess.parseMove(node.state, m.san, "en").move, "user"); } catch {}
    };
    tbody.append(tr);
  }
  fillExplorerEvals(node, rows);
}
const explorerUrl = (db, fen) => db === "masters"
  ? `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&moves=12&topGames=8`
  : `https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1800,2000,2200,2500&fen=${encodeURIComponent(fen)}&moves=12&topGames=8&recentGames=0`;
async function fetchExplorer() {
  if (ui.activeTab !== "explorer") return;
  const node = cur();
  const db = $("explorerDbSelect").value;
  if (db === "local") { renderLocalExplorer(node); return; }
  const url = explorerUrl(db, Chess.toFen(node.state));
  const tbody = $("explorerMovesBody"), gbody = $("explorerGamesBody");
  if (!settings.token) {
    $("explorerHint").textContent = "Lichess pide ahora un token personal gratuito para consultar su explorador.";
    $("explorerOpening").textContent = "";
    tbody.innerHTML = `<tr><td colspan="5"><div class="token-help"><b>🔑 Falta tu token de Lichess</b> (gratis, se hace una sola vez):
      <ol>
        <li>Entra en lichess.org con tu cuenta y abre <a href="https://lichess.org/account/oauth/token/create?description=AjedrezBase" target="_blank" rel="noopener">la página para crear tokens</a>.</li>
        <li><b>No marques ningún permiso</b> y pulsa el botón de crear del final.</li>
        <li>Copia el código que empieza por <code>lip_</code> (sólo se muestra una vez).</li>
        <li>Pégalo en <a href="#" data-open-settings>⚙ Ajustes</a> y pulsa «🔌 Probar token».</li>
      </ol>
      Mientras tanto: <a href="#" data-use-local>usar «Mi biblioteca + .pgn abierto»</a> (sin conexión) o la enciclopedia ECO de abajo.</div></td></tr>`;
    gbody.innerHTML = `<tr><td colspan="5" class="small">—</td></tr>`;
    tbody.querySelector("[data-open-settings]").onclick = e => { e.preventDefault(); openModal("settingsModal"); };
    tbody.querySelector("[data-use-local]").onclick = e => { e.preventDefault(); $("explorerDbSelect").value = "local"; $("explorerDbSelect").dispatchEvent(new Event("change")); };
    return;
  }
  $("explorerHint").textContent = "Estadísticas reales de Lichess para la posición del tablero. Pulsa una jugada para hacerla.";
  let data = explorerCache.get(url);
  if (!data) {
    tbody.innerHTML = `<tr><td colspan="5" class="small">Consultando Lichess…</td></tr>`;
    if (ui.explorerAbort) ui.explorerAbort.abort();
    const ctrl = ui.explorerAbort = new AbortController();
    try {
      const res = await Lichess.fetch(url, { headers: authHeaders(), signal: ctrl.signal });
      if (res.status === 401 || res.status === 403) {
        tbody.innerHTML = `<tr><td colspan="5" class="small msg-err">Lichess ha rechazado el token: no es válido, se ha borrado o está mal copiado. Crea otro y pégalo en ⚙ Ajustes (pulsa «🔌 Probar token»).</td></tr>`;
        gbody.innerHTML = `<tr><td colspan="5" class="small">—</td></tr>`;
        return;
      }
      if (res.status === 429) { tbody.innerHTML = `<tr><td colspan="5" class="small msg-err">Lichess pide una pausa por demasiadas consultas: se reanudará en ${Lichess.waitSeconds()} s (vuelve a mover o cambia de pestaña).</td></tr>`; return; }
      if (!res.ok) throw Error(res.status);
      data = await res.json();
      explorerCache.set(url, data);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (e && e.status === 429) { if (cur() === node) tbody.innerHTML = `<tr><td colspan="5" class="small msg-err">${esc(e.message)}</td></tr>`; return; }
      if (cur() === node) {
        tbody.innerHTML = `<tr><td colspan="5" class="small">No se pudo conectar con Lichess (¿sin conexión?). Puedes usar «Mi biblioteca + .pgn abierto» o la enciclopedia ECO de abajo. En ⚙ Ajustes, «🔌 Probar token» ayuda a ver qué falla.</td></tr>`;
        gbody.innerHTML = `<tr><td colspan="5" class="small">—</td></tr>`;
      }
      return;
    }
  }
  if (cur() !== node || ui.activeTab !== "explorer") return;
  $("explorerOpening").textContent = data.opening ? `Lichess: ${data.opening.eco} · ${data.opening.name}` : "";
  explorerMoveRows(node, data.moves || []);
  const games = (data.topGames || []).concat(data.recentGames || []);
  gbody.innerHTML = games.length ? "" : `<tr><td colspan="5" class="small">Sin partidas destacadas.</td></tr>`;
  for (const g of games) {
    const tr = document.createElement("tr");
    const res = g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "½-½";
    tr.innerHTML = `<td>${esc(g.white && g.white.name || "?")} <span class="small">${esc(g.white && g.white.rating || "")}</span></td><td>${esc(g.black && g.black.name || "?")} <span class="small">${esc(g.black && g.black.rating || "")}</span></td><td><b>${res}</b></td><td>${esc(g.year || g.month || "")}</td><td><button class="sm-btn primary">Cargar</button></td>`;
    tr.querySelector("button").onclick = ev => { ev.stopPropagation(); loadRemoteGame(g.id, db); };
    tr.onclick = () => loadRemoteGame(g.id, db);
    gbody.append(tr);
  }
}
async function loadRemoteGame(id, db) {
  const url = db === "masters" ? `https://explorer.lichess.ovh/masters/pgn/${encodeURIComponent(id)}` : `https://lichess.org/game/export/${encodeURIComponent(id)}?clocks=false&evals=false`;
  try {
    toast("Descargando partida…");
    const res = await Lichess.fetch(url, { headers: Object.assign({ Accept: "application/x-chess-pgn" }, authHeaders()) });
    if (!res.ok) throw Error(res.status);
    const text = await res.text();
    const out = loadPgnText(text, { endAtEnd: false });
    if (out) { switchTab("study"); toast("Partida cargada."); }
  } catch (e) {
    if (e && e.status === 429) { toast(e.message, 4000); return; }
    window.open(`https://lichess.org/${encodeURIComponent(id)}`, "_blank", "noopener");
  }
}

