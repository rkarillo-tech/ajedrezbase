/* ---------- 27b. Primeros pasos: accesos directos para quien abre la aplicación por primera vez ---------- */
const firstVisit = !settings.welcomed && !LS.get("ajedrezStudioCurrent", null) && !location.hash;
function showWelcome(on) {
  $("welcomeBox").hidden = !on;
  if (!on && !settings.welcomed) { settings.welcomed = true; saveSettings(); }
}
const WELCOME = {
  analyse() { switchTab("study"); $("moveInput").focus(); $("moveInput").select(); toast("Pega aquí tu partida (PGN o jugadas sueltas) y pulsa «Importar». Después, «🤖 Analizar y comentar».", 7000); },
  lichess() { switchTab("library"); switchSub("collection"); $("lichessImport").open = true; $("liUser").focus(); },
  puzzles() { switchTab("tools"); openTrainSection("puzzles"); },
  courses() { switchTab("courses"); },
  cpu() { $("playCpuToggle").click(); }
};
document.querySelectorAll("[data-welcome]").forEach(b => b.addEventListener("click", () => {
  showWelcome(false);
  WELCOME[b.dataset.welcome]();
  if (b.dataset.welcome !== "cpu" && !wideLayout.matches) $("tab-" + ui.activeTab).scrollIntoView({ block: "start" });
}));
$("welcomeClose").onclick = () => showWelcome(false);
$("welcomeHelp").onclick = () => openHelp();
$("welcomeBtn").onclick = () => { showWelcome(true); scrollTo({ top: 0 }); };
/* Sólo va encima del tablero en vertical (móvil y tableta); en el resto, arriba de la columna de herramientas, para no empujar el tablero fuera de la pantalla */
const welcomeOnTop = matchMedia("(orientation: portrait) and (max-width: 980px)");
function placeWelcome() {
  const box = $("welcomeBox"), main = document.querySelector("main");
  if (welcomeOnTop.matches) { if (box.parentElement !== main) main.prepend(box); }
  else if (box.parentElement !== $("toolsPanel")) $("toolsPanel").prepend(box);
}
welcomeOnTop.addEventListener("change", placeWelcome);
placeWelcome();
if (firstVisit) showWelcome(true);

/* ---------- 28. Arranque ---------- */
(function boot() {
  document.body.dataset.theme = settings.theme;
  $("pieceStyleSelect").value = settings.pieceStyle;
  $("displayLang").value = settings.lang;
  $("themeSelect").value = settings.theme;
  $("soundToggle").textContent = settings.sound ? "🔊" : "🔇";
  $("notation").value = settings.notation;
  $("branchMode").value = settings.branchMode;
  $("explorerDbSelect").value = settings.explorerDb;
  buildEditorPalettes();
  initPuzzleFilters();
  initPacks();
  renderToday();
  renderLocalEcoList();
  initEndgamePresets();
  renderCollection();

  let restored = false;
  const saved = settings.autosave ? LS.get("ajedrezStudioCurrent", null) : null;
  if (saved && saved.pgn) {
    try {
      const r = Pgn.parseGame(saved.pgn, { lang: "en" });
      let node = r.game.root;
      for (const u of saved.path || []) { const c = node.children.find(x => x.uci === u); if (!c) break; node = c; }
      ui.flipped = !!saved.flipped;
      setGame(r.game, { noConfirm: true, current: node, libId: saved.libId || null, fav: saved.fav, tags: saved.tags || [], name: saved.name || saved.study || "" });
      if (saved.dirty) ui.dirty = true;
      if (!saved.libId && saved.study) ui.legacyStudy = saved.study;
      restored = true;
    } catch (e) { console.warn("No se pudo restaurar la sesión anterior:", e); }
  }
  if (!restored) {
    const r = Pgn.parseGame($("moveInput").value, { lang: "auto" });
    setGame(r.game, { name: "", noConfirm: true });
  }
  $("moveViewBtn").textContent = settings.moveView === "sheet" ? "📜 Ver como lista" : "📋 Ver como planilla";
  $("liUser").value = settings.lichessUser || "";
  Engine.init();
  initLibrary().then(() => openSharedLink());
})();
