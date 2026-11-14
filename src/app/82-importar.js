/* ---------- 27c. Más formas de traer partidas: soltar ficheros, pegar, abrir .pgn con la aplicación instalada y Chess.com ---------- */

/* Ficheros que llegan de fuera (arrastrados a la página o abiertos con la aplicación instalada):
   un .json es una copia de seguridad; un .pgn con una sola partida se abre en el tablero y, con varias, en «🗂 Abrir .pgn» */
async function handleDroppedFiles(files) {
  files = [...files];
  if (!files.length) return;
  if (editor.active || quiz()) { toast(editor.active ? "Cierra antes el editor de posición." : "Termina antes el ejercicio o la partida."); return; }
  closeModals();
  const json = files.find(f => /\.json$/i.test(f.name) || f.type === "application/json");
  if (json) {
    if (confirm(`¿Restaurar la copia de seguridad «${json.name}»?\n\nSe combina con lo que ya tienes: no se borra nada.`)) await restoreBackupFile(json);
    return;
  }
  const pgns = files.filter(f => /\.(pgn|txt)$/i.test(f.name) || /chess-pgn|^text\//.test(f.type));
  if (!pgns.length) { toast("Suelta un fichero .pgn (partidas) o .json (copia de seguridad de AjedrezBase).", 4500); return; }
  if (pgns.length === 1 && pgns[0].size < 200000) {
    const text = await pgns[0].text();
    const n = Pgn.splitGames(text).filter(g => g.movetext.trim()).length;
    if (n === 1) {
      const res = loadPgnText(text);
      if (res) { switchTab("study"); importResultMsg(res.r, " Si te interesa, pulsa «💾 Guardar en biblioteca»."); toast(`📄 «${pgns[0].name}» abierto en el tablero.`); }
      return;
    }
    if (!n) { toast(`«${pgns[0].name}» no contiene partidas en formato PGN.`, 4500); return; }
  }
  await openPgnFiles(pgns);
  switchTab("library"); switchSub("collection");
}
(function dropFiles() {
  let depth = 0;
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  const veil = on => document.body.classList.toggle("dropping", on);
  window.addEventListener("dragenter", e => { if (!hasFiles(e)) return; depth++; veil(true); e.preventDefault(); });
  window.addEventListener("dragover", e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  window.addEventListener("dragleave", e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) veil(false); });
  window.addEventListener("drop", e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0; veil(false);
    handleDroppedFiles(e.dataTransfer.files).catch(err => { console.warn(err); toast("No se pudo leer el fichero."); });
  });
})();
/* Aplicación instalada (Chrome y Edge en el ordenador): «Abrir con AjedrezBase» sobre un .pgn */
if ("launchQueue" in window && window.launchQueue && typeof window.launchQueue.setConsumer === "function") {
  window.launchQueue.setConsumer(async params => {
    if (!params || !params.files || !params.files.length) return;
    try {
      const files = await Promise.all(params.files.map(h => h.getFile()));
      if (!Lib.ready) await new Promise(res => { const t = setInterval(() => { if (Lib.ready) { clearInterval(t); res(); } }, 50); });
      await handleDroppedFiles(files);
    } catch (e) { console.warn("No se pudo abrir el fichero:", e); }
  });
}

/* Pegar (Ctrl + V) fuera de un recuadro de texto: si lo pegado es una partida o una FEN, se abre directamente */
document.addEventListener("paste", e => {
  const el = document.activeElement, tag = el && el.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || (el && el.isContentEditable)) return;
  if (document.querySelector(".modal-back.open")) return;
  const text = ((e.clipboardData && e.clipboardData.getData("text")) || "").trim();
  if (!text || text.length > 2000000) return;
  const fen = looksLikeFen(text);
  if (!fen) {
    // Sólo si de verdad parece una partida: con cabeceras PGN o con al menos dos jugadas legibles
    if (!/^\s*\[\w+\s+"/.test(text)) {
      let r = null;
      try { r = Pgn.parseGame(text.slice(0, 20000), { lang: "auto" }); } catch {}
      if (!r || r.count < 2) return;
    }
  }
  e.preventDefault();
  if (editor.active || quiz()) { toast(editor.active ? "Cierra antes el editor de posición para pegar una partida." : "Termina antes el ejercicio o la partida para pegar otra."); return; }
  if (fen) { loadFen(text); return; }
  $("moveInput").value = text;
  if (ui.activeTab !== "study") switchTab("study");
  $("importBtn").click();
  toast("📋 Partida pegada.");
});

/* Chess.com: partidas públicas de un usuario, por meses, con su API pública (sin cuenta ni token) */
const Chesscom = {
  base: "https://api.chess.com/pub/player/",
  async json(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) { const e = Error("no existe"); e.status = 404; throw e; }
    if (res.status === 429) { const e = Error("Chess.com pide una pausa: inténtalo dentro de un minuto"); e.status = 429; throw e; }
    if (!res.ok) throw Error("Chess.com respondió con un error " + res.status);
    return res.json();
  },
  /* Las últimas «max» partidas de ajedrez normal, de la más reciente a la más antigua. perf: "" | bullet | blitz | rapid | daily */
  async games(user, { max = 50, perf = "", rated = false, onProgress } = {}) {
    const u = encodeURIComponent(user.toLowerCase());
    const { archives = [] } = await this.json(`${this.base}${u}/games/archives`);
    const out = [];
    for (let i = archives.length - 1, months = 0; i >= 0 && out.length < max && months < 36; i--, months++) {
      // Sólo se siguen direcciones del propio Chess.com con la forma esperada (…/games/AAAA/MM)
      const m = /\/games\/(\d{4})\/(\d{2})$/.exec(String(archives[i]));
      if (!m) continue;
      if (onProgress) onProgress(out.length, `${m[2]}/${m[1]}`);
      const data = await this.json(`${this.base}${u}/games/${m[1]}/${m[2]}`);
      const list = (data.games || []).filter(g => g && typeof g.pgn === "string" && g.pgn.trim() && (g.rules || "chess") === "chess"
        && (!perf || g.time_class === perf) && (!rated || g.rated));
      list.sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
      for (const g of list) { if (out.length >= max) break; out.push(g.pgn.trim()); }
    }
    return out;
  }
};
async function downloadChesscomGames() {
  const user = $("ccUser").value.trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(user)) { toast("Escribe un nombre de usuario de Chess.com válido."); $("ccUser").focus(); return; }
  const btn = $("ccBtn"), max = +$("ccMax").value || 50;
  btn.disabled = true;
  btn.textContent = "⏳ Descargando…";
  $("dbStatus").textContent = `Pidiendo a Chess.com las partidas de ${user}…`;
  try {
    const pgns = await Chesscom.games(user, { max, perf: $("ccPerf").value, rated: $("ccRated").checked,
      onProgress: (n, month) => { $("dbStatus").textContent = `Chess.com: leyendo ${month}… (${n} de ${max} partidas)`; } });
    if (!pgns.length) { $("dbStatus").textContent = ""; toast(`${user} no tiene partidas en Chess.com que coincidan con esos filtros.`, 4500); return; }
    const append = Coll.games.length > 0 && confirm(`¿Añadir las ${pgns.length} partidas de ${user} a la lista que ya tienes abierta?\n\nAceptar = añadir · Cancelar = sustituirla`);
    settings.chesscomUser = user;
    saveSettings();
    setCollection(pgns.join("\n\n") + "\n", append, `Chess.com: ${user}`);
    $("dbFilterInput").value = "";
    renderCollection();
    toast(`♟ ${pgns.length} partidas de ${user} descargadas de Chess.com (sólo en memoria). Guarda las que quieras con 💾.`, 4500);
  } catch (e) {
    $("dbStatus").textContent = "";
    toast("No se pudieron descargar: " + (e.status === 404 ? `no existe el usuario «${user}» en Chess.com` : e.message && !/fetch|network|load/i.test(e.message) ? e.message : "sin conexión con Chess.com"), 5000);
  } finally {
    btn.disabled = false;
    btn.textContent = "♟ Descargar";
  }
}
$("ccBtn").onclick = downloadChesscomGames;
$("ccUser").addEventListener("keydown", e => { if (e.key === "Enter") downloadChesscomGames(); });
$("ccUser").value = settings.chesscomUser || "";
