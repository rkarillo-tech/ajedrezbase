/* ---------- Ayuda ---------- */
function openHelp(sectionId) {
  openModal("helpModal");
  if (sectionId) {
    const el = $(sectionId);
    const det = el && (el.tagName === "DETAILS" ? el : el.closest("details"));
    if (det) { det.open = true; setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 40); }
  }
}
$("helpSearch").oninput = debounce(() => {
  const q = norm($("helpSearch").value.trim());
  let any = false;
  document.querySelectorAll("#helpBody > details").forEach(d => {
    const hit = !q || norm(d.textContent).includes(q);
    d.hidden = !hit;
    if (q && hit) d.open = true;
    any = any || hit;
  });
  $("helpNoResults").hidden = any;
}, 150);
$("helpExpand").onclick = () => document.querySelectorAll("#helpBody > details").forEach(d => { d.open = true; });
$("helpCollapse").onclick = () => document.querySelectorAll("#helpBody > details").forEach(d => { d.open = false; });
document.addEventListener("click", e => {
  const a = e.target.closest(".help-link");
  if (!a) return;
  e.preventDefault();
  closeModals();
  openHelp(a.dataset.help);
});
$("testTokenBtn").onclick = async () => {
  const out = $("tokenResult");
  const tok = $("setToken").value.trim();
  if (!tok) { out.className = "small msg-err"; out.textContent = "Pega primero el token."; return; }
  if (!/^lip_/.test(tok)) { out.className = "small msg-err"; out.textContent = "Los tokens de Lichess empiezan por «lip_». Revisa que lo hayas copiado entero."; return; }
  settings.token = tok; saveSettings(); explorerCache.clear();
  out.className = "small"; out.textContent = "Probando…";
  try {
    const res = await Lichess.fetch(`https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(Chess.START_FEN)}&moves=1&topGames=0`, { headers: authHeaders() });
    if (res.ok) { out.className = "small msg-ok"; out.textContent = "✔ Funciona: el explorador de Lichess ya está disponible."; refreshExplorer(); }
    else if (res.status === 401 || res.status === 403) { out.className = "small msg-err"; out.textContent = "❌ Lichess rechaza este token (no válido o borrado). Crea uno nuevo."; }
    else if (res.status === 429) { out.className = "small msg-err"; out.textContent = "Lichess pide esperar un minuto (demasiadas consultas)."; }
    else { out.className = "small msg-err"; out.textContent = "Lichess respondió con un error " + res.status + ". Prueba más tarde."; }
  } catch (e) {
    out.className = "small msg-err";
    if (e && e.status === 429) { out.textContent = e.message; return; }
    out.textContent = "No se pudo conectar con Lichess: comprueba la conexión. Si tienes internet y aun así falla, puede que el navegador bloquee la consulta desde un archivo local; prueba con la versión web: https://rkarillo-tech.github.io/ajedrezbase/";
  }
};

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    const busy = !!document.querySelector(".modal-back.open") || $("promoModal").classList.contains("open");
    closeModals();
    if ($("promoModal").classList.contains("open")) $("cancelPromo").click();
    if (!busy && ui.full) fullBoard(false);
    return;
  }
  const tag = document.activeElement && document.activeElement.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector(".modal-back.open")) return;
  const k = e.key;
  if (editor.active && !["f", "F", "?"].includes(k)) return;
  if (e.repeat && "pPbBeEfF".includes(k)) return;
  if (quiz() && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", " ", "x", "X", "t", "T", "h", "H"].includes(k)) return;
  if (k === "ArrowLeft") { stopAutoplay(); goBack(); }
  else if (k === "ArrowRight") { stopAutoplay(); goForward(); }
  else if (k === "ArrowUp") goSibling(-1);
  else if (k === "ArrowDown") goSibling(1);
  else if (k === "Home") goStart();
  else if (k === "End") goEnd();
  else if (k === " ") toggleAutoplay();
  else if (k === "f" || k === "F") $("flipBtn").click();
  else if (k === "e" || k === "E") { $("liveToggle").checked = !$("liveToggle").checked; $("liveToggle").dispatchEvent(new Event("change")); }
  else if (k === "?") openHelp();
  else if (k === "m" || k === "M") openMarkDialog();
  else if (k === "x" || k === "X") showThreat();
  else if (k === "t" || k === "T") thinkWithMe();
  else if (k === "h" || k === "H") talkToPieces();
  else if (k === "l" || k === "L") readBoard();
  else if (k === "b" || k === "B") setBlind(!ui.blind);
  else if (k === "p" || k === "P") fullBoard(!ui.full);
  else return;
  e.preventDefault();
});

/* ---------- Aplicación instalable (sólo cuando se sirve por http/https) ---------- */
(function pwa() {
  if (!/^https?:$/.test(location.protocol)) return;
  const link = (rel, href) => { const l = document.createElement("link"); l.rel = rel; l.href = href; document.head.append(l); };
  link("manifest", "manifest.webmanifest");
  link("apple-touch-icon", "assets/icon-180.png");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("installBtn").hidden = false; });
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; toast("✔ AjedrezBase instalada: ya puedes abrirla como una aplicación, también sin conexión.", 5000); });
  $("installBtn").onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    deferred = null;
    $("installBtn").hidden = true;
  };
})();

