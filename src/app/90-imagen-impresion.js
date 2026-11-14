/* ---------- Tablero en SVG: imagen PNG, impresión y minitablero ---------- */
function boardSvg(state, opts = {}) {
  const cs = getComputedStyle(document.body);
  const light = cs.getPropertyValue("--light").trim() || "#f0d9b5", dark = cs.getPropertyValue("--dark").trim() || "#b58863";
  const flip = !!opts.flipped, S = 100;
  const X = i => (flip ? 7 - (i & 7) : i & 7) * S, Y = i => (flip ? 7 - (i >> 4) : i >> 4) * S;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="${opts.size || 800}" height="${opts.size || 800}">`;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const i = r * 16 + c;
    out += `<rect x="${X(i)}" y="${Y(i)}" width="${S}" height="${S}" fill="${(r + c) % 2 ? dark : light}"/>`;
    if (opts.last && (opts.last.from === i || opts.last.to === i)) out += `<rect x="${X(i)}" y="${Y(i)}" width="${S}" height="${S}" fill="rgba(255,235,59,0.42)"/>`;
  }
  if (opts.coords !== false) for (let k = 0; k < 8; k++) {
    const file = "abcdefgh"[flip ? 7 - k : k], rank = flip ? k + 1 : 8 - k;
    out += `<text x="${k * S + 92}" y="794" font-size="15" font-weight="700" text-anchor="end" font-family="sans-serif" fill="${k % 2 ? light : dark}">${file}</text>`;
    out += `<text x="4" y="${k * S + 17}" font-size="15" font-weight="700" font-family="sans-serif" fill="${k % 2 ? light : dark}">${rank}</text>`;
  }
  const style = settings.pieceStyle === "unicode" ? "staunton" : settings.pieceStyle;
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = state.b[i];
    if (p === ".") continue;
    const svg = getPieceHTML(p, style).replace(/<svg class="piece-svg" viewBox="0 0 45 45">/, `<svg x="${X(i) + 6}" y="${Y(i) + 6}" width="88" height="88" viewBox="0 0 45 45">`);
    out += svg;
  }
  for (const sh of opts.shapes || []) {
    const col = SHAPE_COLORS[sh.color] || SHAPE_COLORS.green;
    const x1 = X(sh.from) + 50, y1 = Y(sh.from) + 50, x2 = X(sh.to) + 50, y2 = Y(sh.to) + 50;
    if (sh.from === sh.to) { out += `<circle cx="${x1}" cy="${y1}" r="44" fill="none" stroke="${col}" stroke-width="7"/>`; continue; }
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const ex = x2 - ux * 30, ey = y2 - uy * 30, px = -uy, py = ux;
    out += `<line x1="${x1}" y1="${y1}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${col}" stroke-width="15" stroke-linecap="round"/>`;
    out += `<polygon points="${(x2 - ux * 6).toFixed(1)},${(y2 - uy * 6).toFixed(1)} ${(ex + px * 22).toFixed(1)},${(ey + py * 22).toFixed(1)} ${(ex - px * 22).toFixed(1)},${(ey - py * 22).toFixed(1)}" fill="${col}"/>`;
  }
  return out + "</svg>";
}
function nodeShapes(node) { return (node.shapes || []).map(sh => ({ color: sh.color, from: Chess.sqIdx(sh.from), to: Chess.sqIdx(sh.to) })); }
function positionLabel(node) { return node.parent ? `Tras ${numPrefix(node.parent.state)}${dispSan(node)}${node.nag || ""}` : "Posición inicial"; }

/* Minitablero al pasar el ratón por una jugada (lista de jugadas y líneas del motor) */
const hoverTip = document.createElement("div");
hoverTip.className = "hover-board";
hoverTip.hidden = true;
document.body.append(hoverTip);
function showHoverBoard(e, state, last) {
  hoverTip.innerHTML = boardSvg(state, { size: 184, coords: false, last, flipped: ui.flipped });
  hoverTip.hidden = false;
  const x = Math.min(innerWidth - 196, e.clientX + 14), y = e.clientY + 200 > innerHeight ? e.clientY - 196 : e.clientY + 14;
  hoverTip.style.left = x + "px";
  hoverTip.style.top = y + "px";
}
if (window.matchMedia && matchMedia("(hover: hover)").matches) {
  document.addEventListener("mouseover", e => {
    const pv = e.target.closest && e.target.closest(".pv-mv");
    if (pv) { try { showHoverBoard(e, Chess.parseFen(pv.dataset.fen), { from: +pv.dataset.from, to: +pv.dataset.to }); } catch {} return; }
    const mv = e.target.closest && e.target.closest("#moves .mv");
    if (mv && !quiz()) { const n = ui.nodeMap.get(+mv.dataset.id); if (n && n !== cur()) { showHoverBoard(e, n.state, n.move); return; } }
    hoverTip.hidden = true;
  });
  document.addEventListener("scroll", () => { hoverTip.hidden = true; }, true);
  document.addEventListener("mouseout", e => { if (e.target.closest && e.target.closest(".pv-mv, #moves .mv")) hoverTip.hidden = true; });
}

/* Rueda del ratón sobre el tablero: avanzar y retroceder */
/* Con un panel táctil (touchpad), el gesto de dos dedos produce muchos desplazamientos pequeños seguidos:
   se acumulan y sólo se avanza una jugada por cada «golpe» claro. Mientras se dibuja con el botón derecho
   (o justo después) la rueda no hace nada, para que el gesto de dibujar no mueva las jugadas. */
let wheelLast = 0, wheelAcc = 0, wheelAccAt = 0;
$("boardWrap").addEventListener("wheel", e => {
  if (!settings.wheel || editor.active || quiz() || document.querySelector(".modal-back.open")) return;
  e.preventDefault();
  const now = Date.now();
  if (ui.drawStart || (e.buttons & 2) || ui.drawMode || now - (ui.drawAt || 0) < 600) { wheelAcc = 0; return; }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  if (now - wheelAccAt > 250 || Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0;
  wheelAcc += dy;
  wheelAccAt = now;
  if (Math.abs(wheelAcc) < 50 || now - wheelLast < 120) return;
  wheelLast = now;
  const fwd = wheelAcc > 0;
  wheelAcc = 0;
  stopAutoplay();
  if (fwd) goForward(); else goBack();
}, { passive: false });

/* Exportar la posición como imagen PNG (descarga y, si se puede, copia al portapapeles) */
function positionPng() {
  const node = cur(), W = 800, H = 860;
  const svg = boardSvg(viewState(), { last: editor.active ? null : node.move, shapes: editor.active ? [] : nodeShapes(node), flipped: ui.flipped });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#0b0e14"; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, W);
      ctx.fillStyle = "#eef2f8"; ctx.font = "600 22px system-ui, sans-serif"; ctx.textBaseline = "middle";
      const h = game.headers;
      const title = h.White && h.White !== "Blancas" ? `${h.White} – ${h.Black}` : ($("gameName").value || "AjedrezBase");
      ctx.fillText(`${title} · ${positionLabel(node)}`.slice(0, 70), 14, W + 30);
      ctx.fillStyle = "#94a3b8"; ctx.font = "16px system-ui, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(viewState().t === 1 ? "Juegan blancas" : "Juegan negras", W - 14, W + 30);
      c.toBlob(b => (b ? resolve(b) : reject(Error("sin imagen"))), "image/png");
    };
    img.onerror = () => reject(Error("No se pudo dibujar el tablero"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
$("pngBtn").onclick = async () => {
  const pngP = positionPng();
  let copied = false;
  try { if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ "image/png": pngP })]); copied = true; } } catch {}
  try {
    const blob = await pngP;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safeName($("gameName").value || "posicion") + ".png";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(copied ? "🖼 Imagen descargada y copiada al portapapeles." : "🖼 Imagen descargada.");
  } catch (e) { toast("No se pudo crear la imagen: " + e.message); }
};

/* Imprimir (o guardar como PDF) la partida comentada con diagramas */
function buildPrintView() {
  const v = $("printView"), h = game.headers;
  const marked = Lib.ready ? markedNodesOfCurrent() : new Map();
  const diag = new Set();
  for (const n of Pgn.mainlineFrom(game.root)) if (marked.has(n.id) || ["??", "?", "!!"].includes(n.nag)) diag.add(n.id);
  const ml = Pgn.mainlineFrom(game.root);
  if (ml.length) diag.add(ml[ml.length - 1].id);
  let count = 0;
  const diagram = n => {
    if (count >= 16) return "";
    count++;
    const mk = marked.get(n.id);
    return `<figure class="pv-diagram">${boardSvg(n.state, { size: 260, last: n.move, shapes: nodeShapes(n) })}<figcaption>${esc(positionLabel(n))}${mk ? ` · ${CATS[mk.cat].icon} ${esc(mk.note || CATS[mk.cat].name)}` : ""}</figcaption></figure>`;
  };
  const moveTxt = (n, force) => `${n.parent.state.t === 1 || force ? `<span class="pnum">${n.parent.state.full}${n.parent.state.t === 1 ? "." : "…"}</span>` : ""}<b>${esc(dispSan(n))}${esc(n.nag || "")}</b>${n.posNag ? " " + esc(n.posNag) : ""}`;
  const varText = (node, force) => {
    let out = "", c = node, f = force;
    out += moveTxt(c, f) + " ";
    if (c.comment) { out += `<i>${esc(c.comment)}</i> `; f = true; } else f = false;
    while (c.children.length) {
      const m = c.children[0];
      out += moveTxt(m, f) + " ";
      f = false;
      if (m.comment) { out += `<i>${esc(m.comment)}</i> `; f = true; }
      for (const alt of c.children.slice(1)) { out += "(" + varText(alt, true).trim() + ") "; f = true; }
      c = m;
    }
    return out;
  };
  let body = "", para = "", f = true;
  let c = game.root;
  if (c.comment) body += `<p><i>${esc(c.comment)}</i></p>`;
  while (c.children.length) {
    const m = c.children[0];
    para += moveTxt(m, f) + " ";
    f = false;
    if (m.comment) { para += `<i>${esc(m.comment)}</i> `; f = true; }
    for (const alt of c.children.slice(1)) { para += "(" + varText(alt, true).trim() + ") "; f = true; }
    if (diag.has(m.id)) { body += `<p>${para}</p>${diagram(m)}`; para = ""; f = true; }
    c = m;
  }
  if (para) body += `<p>${para}</p>`;
  const meta = [h.Event, h.Site, (h.Date || "").replace(/\.\?\?/g, ""), h.Round && h.Round !== "-" ? "Ronda " + h.Round : "", h.ECO].filter(x => x && x !== "?").join(" · ");
  v.innerHTML = `<h1>${esc(h.White || "Blancas")}${h.WhiteElo ? ` (${esc(h.WhiteElo)})` : ""} – ${esc(h.Black || "Negras")}${h.BlackElo ? ` (${esc(h.BlackElo)})` : ""} <span class="pres">${esc(h.Result || "*")}</span></h1>
    <div class="pmeta">${esc(meta)}</div>${game.root.state && Chess.toFen(game.root.state) !== Chess.START_FEN ? `<figure class="pv-diagram">${boardSvg(game.root.state, { size: 260 })}<figcaption>Posición inicial</figcaption></figure>` : ""}
    <div class="pmoves">${body}</div>${ui.report ? printReportHtml() : ""}<div class="pfoot">AjedrezBase · rkarillo-tech.github.io/ajedrezbase</div>`;
}
function printReportHtml() {
  const R = ui.report, h = game.headers;
  const nm = c => esc(c === 1 ? h.White || "Blancas" : h.Black || "Negras");
  return `<div class="preport"><h2>Informe de la partida</h2><p>${esc(R.summary)}</p>` +
    (R.key.length ? `<p><b>Momentos clave:</b></p><ol>${R.key.map(x => `<li><b>${esc(numPrefix(x.n.parent.state) + dispSan(x.n) + (x.n.nag || ""))}</b>: ${esc(x.theme.txt)} (${esc(fmtEval(x.n.parent.eval))} → ${esc(fmtEval(x.info.after || x.n.eval))}).</li>`).join("")}</ol>` : "") +
    `<table><tr><th></th><th>${nm(1)}</th><th>${nm(-1)}</th></tr>${PHASES.map(([k, l]) => `<tr><td>${l}</td><td>${R.phases[k + 1] == null ? "–" : R.phases[k + 1] + "%"}</td><td>${R.phases[k + -1] == null ? "–" : R.phases[k + -1] + "%"}</td></tr>`).join("")}</table>` +
    R.players.map(pl => `<p><b>${esc(pl.verdict)}</b>${pl.practice.length ? "<br>Practicar: " + pl.practice.map(esc).join(" · ") : ""}</p>`).join("") + `</div>`;
}
$("printBtn").onclick = () => { buildPrintView(); setTimeout(() => window.print(), 60); };

/* Enlace para compartir la partida (hasta donde estás) */
const WEB_URL = "https://rkarillo-tech.github.io/ajedrezbase/";
function shareLink() {
  const base = /^https?:$/.test(location.protocol) ? location.href.split("#")[0] : WEB_URL;
  const line = [...Pgn.pathTo(cur()).slice(1), ...Pgn.mainlineFrom(cur())];
  const ply = Pgn.pathTo(cur()).length - 1;
  const q = new URLSearchParams();
  const fen = Chess.toFen(game.root.state);
  if (fen !== Chess.START_FEN) q.set("fen", fen);
  if (line.length) q.set("m", line.map(n => n.uci).join(" "));
  if (ply) q.set("n", ply);
  const h = game.headers;
  if (h.White && h.White !== "Blancas") q.set("w", h.White);
  if (h.Black && h.Black !== "Negras") q.set("b", h.Black);
  return base + "#" + q.toString();
}
$("linkBtn").onclick = async () => {
  const url = shareLink();
  // En el móvil y la tableta, el menú de compartir del sistema (WhatsApp, correo…); si no lo hay o se cancela con error, se copia
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    const h = game.headers, named = h.White && h.White !== "Blancas";
    try { await navigator.share({ title: named ? `${h.White} – ${h.Black || "?"}` : "Partida de ajedrez", url }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  toast((await copyText(url)) ? `🔗 Enlace copiado (${url.length > 1800 ? "largo: " : ""}${Pgn.pathTo(cur()).length - 1 ? "abre la partida en esta jugada" : "abre la partida"}). Pégalo donde quieras.` : "No se pudo copiar el enlace.", 4500);
};
function openSharedLink() {
  const h = location.hash.slice(1);
  if (!/(^|&)(m|fen)=/.test(h)) return false;
  const q = new URLSearchParams(h);
  let g;
  try { g = Pgn.newGame(q.get("fen") || undefined); } catch { toast("El enlace tiene una posición no válida."); return false; }
  let node = g.root, target = null;
  const n = +(q.get("n") || 0);
  (q.get("m") || "").split(/[\s,]+/).filter(Boolean).forEach((u, i) => {
    const mv = Chess.moveFromUci(node.state, u);
    if (!mv) return;
    node = Pgn.addMove(node, mv);
    if (i + 1 === n) target = node;
  });
  if (q.get("w")) g.headers.White = q.get("w");
  if (q.get("b")) g.headers.Black = q.get("b");
  const ok = setGame(g, { name: q.get("w") ? `${q.get("w")} – ${q.get("b") || "?"}` : "Partida compartida", current: target || (n ? node : g.root) });
  try { history.replaceState(null, "", location.href.split("#")[0]); } catch {}
  if (ok !== false) toast("🔗 Partida abierta desde un enlace. Si te interesa, pulsa «💾 Guardar en biblioteca».", 5000);
  return ok !== false;
}
window.addEventListener("hashchange", () => openSharedLink());

$("moveViewBtn").onclick = () => { settings.moveView = settings.moveView === "sheet" ? "list" : "sheet"; saveSettings(); $("moveViewBtn").textContent = settings.moveView === "sheet" ? "📜 Ver como lista" : "📋 Ver como planilla"; renderMoves(); };

