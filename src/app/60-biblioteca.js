/* ---------- B1. Almacén permanente (IndexedDB, con respaldo pequeño en localStorage) ---------- */
const TAB_ID = Math.random().toString(36).slice(2);
let libChannel = null;
try { libChannel = new BroadcastChannel("ajedrezbase-biblioteca"); } catch {}
const announceLibChange = () => { try { libChannel && libChannel.postMessage({ tab: TAB_ID }); } catch {} };
const DB = {
  kind: "none", db: null, mem: null,
  async open() {
    if (window.indexedDB) {
      try {
        this.db = await new Promise((res, rej) => {
          let req;
          try { req = indexedDB.open("ajedrezbase", 1); } catch (e) { rej(e); return; }
          req.onupgradeneeded = () => {
            const d = req.result;
            if (!d.objectStoreNames.contains("games")) d.createObjectStore("games", { keyPath: "id", autoIncrement: true });
            if (!d.objectStoreNames.contains("marks")) d.createObjectStore("marks", { keyPath: "id", autoIncrement: true });
          };
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
          req.onblocked = () => rej(Error("base bloqueada por otra pestaña"));
          setTimeout(() => rej(Error("tiempo de espera agotado")), 8000);
        });
        this.kind = "idb";
        return true;
      } catch (e) { console.warn("IndexedDB no disponible:", e); }
    }
    this.kind = "ls";
    this.mem = LS.get("ajedrezLibFallback", null) || { games: [], marks: [], next: 1 };
    return false;
  },
  _tx(store, mode, fn) {
    return new Promise((res, rej) => {
      let t;
      try { t = this.db.transaction(store, mode); } catch (e) { rej(e); return; }
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res(Array.isArray(r) ? r.map(x => x.result) : r ? r.result : undefined);
      t.onerror = () => rej(t.error || Error("error de escritura"));
      t.onabort = () => rej(t.error || Error("operación cancelada (¿sin espacio?)"));
    });
  },
  async all(store) {
    if (this.kind === "idb") return this._tx(store, "readonly", s => s.getAll());
    return this.mem[store].map(x => Object.assign({}, x));
  },
  /* Cada cambio lleva su identificador estable y su fecha, para combinar dispositivos (opts.raw: se guarda tal cual) */
  async putMany(store, recs, opts = {}) {
    if (!recs.length) return [];
    if (!opts.raw) { const now = Date.now(); recs.forEach(r => { if (!r.uid) r.uid = newUid(); r._m = now; }); }
    if (this.kind === "idb") {
      const clean = recs.map(r => { const c = Object.assign({}, r); if (c.id == null) delete c.id; return c; });
      const ids = await this._tx(store, "readwrite", s => clean.map(r => s.put(r)));
      recs.forEach((r, i) => { r.id = ids[i]; });
      announceLibChange();
      if (!opts.raw) syncTouch();
      return ids;
    }
    const arr = this.mem[store];
    const ids = recs.map(r => {
      if (r.id == null) r.id = this.mem.next++;
      const i = arr.findIndex(x => x.id === r.id);
      if (i >= 0) arr[i] = Object.assign({}, r); else arr.push(Object.assign({}, r));
      return r.id;
    });
    if (!LS.set("ajedrezLibFallback", this.mem)) throw Error("no queda espacio en el almacén de este navegador");
    if (!opts.raw) syncTouch();
    return ids;
  },
  async put(store, rec, opts) { return (await this.putMany(store, [rec], opts))[0]; },
  async delMany(store, ids, opts = {}) {
    if (!ids.length) return;
    if (!opts.raw) { syncTomb(ids.map(id => (Lib[store].get(id) || {}).uid).filter(Boolean)); setTimeout(syncTouch, 0); }
    if (this.kind === "idb") { await this._tx(store, "readwrite", s => { ids.forEach(id => s.delete(id)); return null; }); announceLibChange(); return; }
    const set = new Set(ids);
    this.mem[store] = this.mem[store].filter(x => !set.has(x.id));
    LS.set("ajedrezLibFallback", this.mem);
  }
};

/* ---------- B2. Biblioteca en memoria ---------- */
const Lib = { games: new Map(), marks: new Map(), ready: false, sel: new Set() };
const Coll = { games: [], bytes: 0, names: [], saved: new Set() };
let LocalIdx = null, LocalIdxBuilding = false;
const LIB_SOFT = () => (DB.kind === "ls" ? 4 * 1048576 : 100 * 1048576);   // recomendado (la biblioteca se carga entera al abrir)
const COLL_SOFT = 200 * 1048576;                                      // recomendado para un .pgn abierto en memoria
const COLL_HARD = 400 * 1048576;
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function fmtBytes(n) {
  if (n == null || isNaN(n)) return "–";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " KB";
  if (n < 1073741824) return (n / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " MB";
  return (n / 1073741824).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " GB";
}
function parseTags(txt) { return [...new Set(String(txt || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12); }
function defaultTitle(h) {
  const named = h.White && h.White !== "Blancas" && h.White !== "?";
  if (named) return `${h.White} – ${h.Black || "?"}${h.Event && h.Event !== "?" && h.Event !== "Estudio" ? ` (${h.Event})` : ""}`;
  if (h.Event && h.Event !== "Estudio" && h.Event !== "?") return h.Event;
  return "Estudio " + new Date().toLocaleDateString("es-ES");
}
function gameSig(g) {
  const h = g.headers;
  const line = Pgn.mainlineFrom(g.root).slice(0, 60).map(n => n.uci).join("");
  const start = Chess.toFen(g.root.state) === Chess.START_FEN ? "" : Chess.posKey(g.root.state);
  return `${norm(h.White)}|${norm(h.Black)}|${h.Date || ""}|${start}|${line}`;
}
function recordFromGame(g, extra = {}) {
  const h = g.headers, pgn = Pgn.exportPgn(g, { evals: true }), now = Date.now();
  return Object.assign({
    title: extra.title || defaultTitle(h), white: h.White || "", black: h.Black || "", event: h.Event || "", site: h.Site || "",
    date: h.Date || "", result: h.Result || "*", eco: h.ECO || "", whiteElo: h.WhiteElo || "", blackElo: h.BlackElo || "",
    pgn, sig: gameSig(g), plies: Pgn.mainlineFrom(g.root).length, size: pgn.length, timeControl: h.TimeControl || "",
    analysis: analysisOf(g), created: now, updated: now, fav: false, tags: [], srs: null
  }, extra, { title: extra.title || defaultTitle(h) });
}
function resolvePath(root, path, exact) {
  let n = root;
  for (const u of path || []) { const c = n.children.find(x => x.uci === u); if (!c) return exact ? null : n; n = c; }
  return n;
}
const marksOfGame = id => [...Lib.marks.values()].filter(m => m.gameId === id);
function libBytes() {
  let b = 0;
  for (const r of Lib.games.values()) b += (r.pgn || "").length + 400 + (r.orig ? r.orig.pgn.length : 0) + (r.versions || []).reduce((s, v) => s + v.pgn.length, 0);
  for (const m of Lib.marks.values()) b += 300 + (m.note || "").length;
  return b;
}

/* ---------- B3. Guardar / abrir la partida actual ---------- */
let saving = null;
function updateSaveState() {
  const el = $("saveState"), btn = $("saveGame"), fav = $("favToggle");
  fav.textContent = ui.fav ? "★" : "☆";
  fav.classList.toggle("on", ui.fav);
  if (trainer.active && trainer.card) {
    el.className = "save-state"; el.textContent = "🧠 Tarjeta de entrenamiento (no se guarda)";
    btn.disabled = true; fav.disabled = true; return;
  }
  fav.disabled = false;
  const saved = ui.libId && Lib.games.has(ui.libId);
  if (ui.saveError) {
    el.className = "save-state dirty";
    el.textContent = "❌ No se ha podido guardar: " + ui.saveError + ". Pulsa 💾 para reintentarlo.";
    btn.textContent = "💾 Reintentar";
    btn.disabled = false;
    return;
  }
  const rec = saved && Lib.games.get(ui.libId), nVer = rec ? (rec.orig ? 1 : 0) + (rec.versions || []).length : 0;
  $("gcVersions").hidden = !saved;
  $("versionsBtn").disabled = !nVer;
  $("versionsBtn").textContent = nVer ? `🕘 Versiones (${nVer})` : "🕘 Sin versiones anteriores";
  if (saved) {
    el.className = "save-state saved" + (ui.dirty ? " dirty" : "");
    el.textContent = ui.dirty ? "⏳ Guardando los cambios…" : "✔ Está en tu biblioteca · los cambios se guardan solos";
    btn.textContent = ui.dirty ? "💾 Guardar ahora" : "✔ Guardada";
    btn.disabled = !ui.dirty;
  } else {
    el.className = "save-state" + (ui.dirty ? " dirty" : "");
    el.textContent = ui.dirty ? "● Tiene cambios y NO está guardada en la biblioteca" : "No está en la biblioteca (sólo se guarda si pulsas 💾)";
    btn.textContent = "💾 Guardar en biblioteca";
    btn.disabled = !Lib.ready;
  }
}
function markDirty() {
  if (trainer.active && trainer.card) return;
  ui.dirty = true;
  ui.rev++;
  updateSaveState();
  if (ui.libId && Lib.games.has(ui.libId)) scheduleLibSave();
  scheduleAutosave();
}
const scheduleLibSave = debounce(() => { if (ui.dirty && ui.libId && Lib.games.has(ui.libId)) saveToLibrary({ silent: true }); }, 1200);

/* Guarda la partida del tablero. La parte síncrona (exportar) ocurre antes de cualquier espera,
   así que es seguro llamarla justo antes de cambiar de partida. */
const MAX_VERSIONS = 5;
async function saveToLibrary(opts = {}) {
  if (!Lib.ready) { toast("La biblioteca aún se está cargando…"); return null; }
  if (trainer.active && trainer.card) return null;
  const g = game, rev = ui.rev;
  const title = $("gameName").value.trim() || defaultTitle(g.headers);
  const existing = ui.libId && Lib.games.get(ui.libId);
  if (existing && !opts.copy && ui.recUpdated && existing.updated > ui.recUpdated && !opts.force) {
    const msg = "esta partida se ha modificado en otra pestaña";
    if (opts.silent || !confirm(`«${existing.title}» se ha modificado en otra pestaña o ventana después de abrirla aquí.\n\n¿Sustituir esos cambios por los de esta pestaña?`)) {
      if (g === game) { ui.saveError = msg + " (pulsa 💾 para sustituirla con la versión de esta pestaña, o vuelve a abrirla desde la biblioteca)"; updateSaveState(); }
      return null;
    }
  }
  let base;
  if (existing && opts.copy) {
    base = { created: Date.now(), srs: null };
  } else if (existing) base = Object.assign({}, existing);
  else {
    const sig = gameSig(g);
    const dup = [...Lib.games.values()].find(r => r.sig === sig);
    if (dup && !opts.force && !confirm(`Ya tienes en la biblioteca una partida igual («${dup.title}»).\n\n¿Guardar otra copia de todos modos?`)) return null;
    base = { created: Date.now(), srs: null };
  }
  const copyTitle = opts.copy ? `${title} (copia)` : title;
  const rec = Object.assign(base, recordFromGame(g, { title: copyTitle, fav: opts.copy ? false : ui.fav, tags: ui.tags.slice(), created: base.created, srs: base.srs || null }));
  if (opts.copy) { delete rec.orig; delete rec.versions; delete rec.drills; }
  if (existing && !opts.copy) {
    rec.id = existing.id;
    // Antes del primer cambio de cada sesión se guarda una foto: el original siempre y las últimas versiones
    if (existing.pgn !== rec.pgn && ui.snapFor !== existing.id) {
      const snap = { t: existing.updated || existing.created || Date.now(), pgn: existing.pgn, title: existing.title, plies: existing.plies };
      if (!existing.orig) rec.orig = snap;
      else if (existing.pgn !== existing.orig.pgn) rec.versions = [snap, ...(existing.versions || [])].slice(0, MAX_VERSIONS);
      ui.snapFor = existing.id;
    }
  }
  const projected = libBytes() + rec.size - (existing ? existing.size || 0 : 0);
  if ((!existing || opts.copy) && projected > LIB_SOFT()) toast(`⚠ La biblioteca ocupa ${fmtBytes(projected)}: supera lo recomendado (${fmtBytes(LIB_SOFT())}). Considera exportar y borrar partidas antiguas.`, 6000);
  try { await DB.put("games", rec); }
  catch (e) {
    if (g === game) { ui.saveError = e.message || String(e); updateSaveState(); }
    toast("❌ No se pudo guardar: " + (e.message || e), 6000);
    return null;
  }
  Lib.games.set(rec.id, rec);
  LocalIdx = null;
  if (g === game) {
    ui.saveError = "";
    ui.recUpdated = rec.updated;
    ui.libId = rec.id;
    if (ui.rev === rev) ui.dirty = false;
    else scheduleLibSave();
    $("gameName").value = rec.title;
  }
  if (opts.copy) toast(`📑 Copia guardada como «${rec.title}». Ahora editas la copia; la original queda como estaba.`, 4500);
  else if (!opts.silent) toast(existing ? `💾 «${rec.title}» actualizada.` : `💾 «${rec.title}» guardada en tu biblioteca.`);
  refreshLibraryViews();
  scheduleAutosave();
  return rec;
}
function confirmLeave() {
  if (!ui.dirty || (trainer.active && trainer.card)) return true;
  if (ui.lesson && ui.lesson.game === game && !ui.libId) return true;   // las pruebas en una lección no se guardan: el curso sigue intacto
  if (ui.libId && Lib.games.has(ui.libId)) { saveToLibrary({ silent: true }); return true; }
  return confirm("La partida actual tiene cambios y no está guardada en la biblioteca.\n\nAceptar = descartarlos y continuar\nCancelar = volver para guardarla (💾)");
}
/* Versiones de una partida de la biblioteca: el original y las últimas fotos antes de cada sesión de cambios */
const fmtWhen = ts => new Date(ts).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function versionsOf(rec) {
  const list = [];
  if (rec.orig) list.push(Object.assign({ kind: "orig" }, rec.orig));
  (rec.versions || []).slice().sort((a, b) => a.t - b.t).forEach((v, i) => list.push(Object.assign({ kind: "ver", n: i + 1 }, v)));
  return list;
}
function openVersions() {
  const rec = ui.libId && Lib.games.get(ui.libId);
  if (!rec) return;
  if (ui.dirty) saveToLibrary({ silent: true });
  const list = versionsOf(rec);
  const box = $("versionsList");
  box.innerHTML = list.map((v, i) => `<div class="version-row"><span class="version-what">${v.kind === "orig" ? "📜 <b>Original</b>" : `🕘 Versión ${v.n}`} · ${esc(fmtWhen(v.t))}<br><span class="small">${esc(v.title || rec.title)}${v.plies != null ? ` · ${v.plies} medias jugadas` : ""}</span></span>
      <button class="sm-btn" data-open="${i}" title="Abre esta versión en el tablero como una partida nueva, sin guardar">👁 Abrir como copia</button>
      <button class="sm-btn warn-btn" data-restore="${i}" title="Vuelve a esta versión (la actual se guarda en el historial)">↺ Restaurar</button></div>`).join("")
    + `<div class="version-row"><span class="version-what">✏ <b>Actual</b> · ${esc(fmtWhen(rec.updated))}<br><span class="small">${esc(rec.title)} · ${rec.plies} medias jugadas</span></span></div>`;
  box.querySelectorAll("[data-open]").forEach(b => b.onclick = () => {
    const v = list[+b.dataset.open], r = Pgn.parseGame(v.pgn, { lang: "en" });
    closeModals();
    setGame(r.game, { name: `${v.title || rec.title} (${v.kind === "orig" ? "original" : "versión " + v.n})` });
    toast("👁 Versión abierta como copia: no está guardada. Si quieres conservarla aparte, pulsa 💾.", 4000);
  });
  box.querySelectorAll("[data-restore]").forEach(b => b.onclick = async () => {
    const v = list[+b.dataset.restore];
    if (!confirm(`¿Volver a ${v.kind === "orig" ? "la versión original" : "la versión " + v.n} de «${rec.title}»?\n\nLa versión actual se guardará en el historial.`)) return;
    const r = Pgn.parseGame(v.pgn, { lang: "en" });
    closeModals();
    setGame(r.game, { noConfirm: true, libId: rec.id, name: rec.title, fav: rec.fav, tags: rec.tags });
    ui.dirty = true;
    if (await saveToLibrary({ silent: true, force: true })) toast(`↺ Restaurada ${v.kind === "orig" ? "la versión original" : "la versión " + v.n}.`);
    render();
  });
  openModal("versionsModal");
}
function openLibGame(id, path) {
  const rec = Lib.games.get(id);
  if (!rec) { toast("Esa partida ya no está en la biblioteca."); return false; }
  if (ui.libId === id && !trainer.active) { goTo(resolvePath(game.root, path)); return true; }
  if (!confirmLeave()) return false;
  const r = Pgn.parseGame(rec.pgn, { lang: "en" });
  r.game.analysis = rec.analysis || null;
  setGame(r.game, { noConfirm: true, libId: id, name: rec.title, fav: rec.fav, tags: rec.tags, current: resolvePath(r.game.root, path) });
  if (r.error) toast("⚠ Esta partida tenía un error de lectura en " + r.error.label, 4000);
  return true;
}

/* ---------- B4a. Filtros avanzados (biblioteca y .pgn abierto): Elo, año, ritmo, resultado, color y apertura ---------- */
function advFilterHtml(px) {
  return `<details class="adv-filter" id="${px}Adv"><summary>⚙ Filtros avanzados <span class="srs-pill" id="${px}AdvCount" hidden></span></summary>
    <div class="filter-row">
      <input id="${px}EloMin" class="adv-num" type="number" min="0" max="3500" step="50" placeholder="Elo mín." aria-label="Elo medio mínimo">
      <input id="${px}EloMax" class="adv-num" type="number" min="0" max="3500" step="50" placeholder="Elo máx." aria-label="Elo medio máximo">
      <input id="${px}YearMin" class="adv-num" type="number" min="1400" max="2100" placeholder="Año desde" aria-label="Año desde">
      <input id="${px}YearMax" class="adv-num" type="number" min="1400" max="2100" placeholder="Año hasta" aria-label="Año hasta">
    </div>
    <div class="filter-row">
      <select id="${px}Speed" aria-label="Ritmo"><option value="">Cualquier ritmo</option><option value="bullet">Bala (menos de 3 min)</option><option value="blitz">Blitz (3 a 9 min)</option><option value="rapid">Rápidas (10 a 59 min)</option><option value="classical">Clásicas (1 h o más)</option><option value="corr">Por correspondencia</option></select>
      <select id="${px}Result" aria-label="Resultado"><option value="">Cualquier resultado</option><option value="1-0">Ganan las blancas</option><option value="1/2-1/2">Tablas</option><option value="0-1">Ganan las negras</option><option value="win">Gano yo</option><option value="loss">Pierdo yo</option><option value="draw">Hago tablas</option></select>
      <select id="${px}Color" aria-label="Con qué color juego"><option value="">Juegue con cualquier color</option><option value="1">Juego con blancas</option><option value="-1">Juego con negras</option></select>
      <input id="${px}Eco" class="adv-eco" placeholder="Apertura: B90, C60-C99 o nombre" aria-label="Apertura">
      <button id="${px}AdvClear" class="sm-btn">Quitar filtros</button>
    </div>
    <div class="small adv-stats" id="${px}AdvStats"></div>
  </details>`;
}
const ADV_IDS = ["EloMin", "EloMax", "YearMin", "YearMax", "Speed", "Result", "Color", "Eco"];
function advState(px) {
  const v = id => ($(px + id) ? $(px + id).value.trim() : "");
  const F = { eloMin: +v("EloMin") || 0, eloMax: +v("EloMax") || 0, yearMin: +v("YearMin") || 0, yearMax: +v("YearMax") || 0, speed: v("Speed"), result: v("Result"), color: v("Color"), eco: norm(v("Eco")) };
  F.count = ADV_IDS.filter(id => v(id)).length;
  return F;
}
/* Ritmo según el control de tiempo (como Lichess: tiempo base + 40 × incremento) o el nombre del evento */
function speedOf(tc, event) {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc || "");
  if (m) { const t = +m[1] + 40 * +(m[2] || 0); return t < 180 ? "bullet" : t < 600 ? "blitz" : t < 3600 ? "rapid" : "classical"; }
  if (/^-$/.test(tc || "") || /correspond/i.test(event || "")) return /correspond/i.test(event || "") ? "corr" : "";
  const e = norm(event);
  return /bullet|bala/.test(e) ? "bullet" : /blitz/.test(e) ? "blitz" : /rapid/.test(e) ? "rapid" : /classical|clasic/.test(e) ? "classical" : "";
}
/* Datos de una partida para filtrar: de un registro de la biblioteca o de las cabeceras de un .pgn */
function advMeta(x) {
  const h = x.headers || null;
  const g = k => (h ? h[k] : x[{ White: "white", Black: "black", WhiteElo: "whiteElo", BlackElo: "blackElo", Date: "date", Result: "result", ECO: "eco", TimeControl: "timeControl", Event: "event" }[k]]) || "";
  return { white: g("White"), black: g("Black"), we: +g("WhiteElo") || 0, be: +g("BlackElo") || 0, year: +(String(g("Date")).slice(0, 4)) || 0, result: String(g("Result")).trim(), eco: String(g("ECO")).toUpperCase(), tc: g("TimeControl"), event: g("Event"), opening: h ? h.Opening || "" : x.title || "" };
}
function advMatch(meta, F, names) {
  if (F.eloMin || F.eloMax) {
    const elos = [meta.we, meta.be].filter(Boolean);
    if (!elos.length) return false;
    const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
    if (F.eloMin && avg < F.eloMin) return false;
    if (F.eloMax && avg > F.eloMax) return false;
  }
  if (F.yearMin && (!meta.year || meta.year < F.yearMin)) return false;
  if (F.yearMax && (!meta.year || meta.year > F.yearMax)) return false;
  if (F.speed && speedOf(meta.tc, meta.event) !== F.speed) return false;
  const mine = names.length ? (names.some(n => norm(meta.white).includes(n)) ? 1 : names.some(n => norm(meta.black).includes(n)) ? -1 : 0) : 0;
  if (F.color && mine !== +F.color) return false;
  if (F.result) {
    if (["1-0", "0-1", "1/2-1/2"].includes(F.result)) { if (meta.result !== F.result) return false; }
    else {
      const sc = mine ? scoreOf(meta.result, mine) : null;
      if (sc == null || (F.result === "win" && sc !== 1) || (F.result === "loss" && sc !== 0) || (F.result === "draw" && sc !== 0.5)) return false;
    }
  }
  if (F.eco) {
    const range = /^([a-e])(\d{2})\s*-\s*([a-e])?(\d{2})$/.exec(F.eco);
    if (range) {
      const lo = range[1].toUpperCase() + range[2], hi = (range[3] || range[1]).toUpperCase() + range[4];
      if (!meta.eco || meta.eco < lo || meta.eco > hi) return false;
    } else if (/^[a-e]\d{0,2}$/.test(F.eco)) { if (!meta.eco.startsWith(F.eco.toUpperCase())) return false; }
    else if (!norm(ecoName(meta.eco) + " " + meta.opening).includes(F.eco)) return false;
  }
  return true;
}
/* Resumen del conjunto filtrado: resultados, Elo medio y, si sabemos tu nombre, tu puntuación */
function advStatsHtml(metas, names) {
  if (!metas.length) return "";
  const w = metas.filter(m => m.result === "1-0").length, d = metas.filter(m => m.result === "1/2-1/2").length, b = metas.filter(m => m.result === "0-1").length, fin = w + d + b;
  const elos = metas.flatMap(m => [m.we, m.be]).filter(Boolean);
  let mineTxt = "";
  if (names.length) {
    const sc = metas.map(m => { const c = names.some(n => norm(m.white).includes(n)) ? 1 : names.some(n => norm(m.black).includes(n)) ? -1 : 0; return c ? scoreOf(m.result, c) : null; }).filter(x => x != null);
    if (sc.length) mineTxt = ` · tu puntuación: <b>${Math.round(sc.reduce((a, x) => a + x, 0) / sc.length * 100)} %</b> en ${sc.length} partida${sc.length === 1 ? "" : "s"}`;
  }
  return `${metas.length} partida${metas.length === 1 ? "" : "s"}${fin ? ` · blancas ${Math.round(w / fin * 100)} % · tablas ${Math.round(d / fin * 100)} % · negras ${Math.round(b / fin * 100)} %` : ""}${elos.length ? ` · Elo medio ${Math.round(elos.reduce((a, x) => a + x, 0) / elos.length)}` : ""}${mineTxt}`;
}
function setupAdvFilter(px, rerender) {
  $(px + "AdvWrap").innerHTML = advFilterHtml(px);
  const re = debounce(rerender, 200);
  for (const id of ADV_IDS) { const el = $(px + id); el.addEventListener(el.tagName === "SELECT" ? "change" : "input", re); }
  $(px + "AdvClear").onclick = () => { for (const id of ADV_IDS) $(px + id).value = ""; rerender(); };
}
function showAdvSummary(px, F, metas) {
  const c = $(px + "AdvCount");
  if (!c) return;
  c.hidden = !F.count; c.textContent = F.count ? `${F.count} activo${F.count === 1 ? "" : "s"}` : "";
  $(px + "AdvStats").innerHTML = advStatsHtml(metas, myNameList()) + (F.result && ["win", "loss", "draw"].includes(F.result) || F.color ? (myNameList().length ? "" : ` · <span class="msg-err">para «yo» pon tu nombre en 📊 Estadísticas</span>`) : "");
}

/* ---------- B4. Vista «Mis partidas» ---------- */
function libFiltered() {
  const q = norm($("libFilter").value).split(/\s+/).filter(Boolean);
  const tag = $("libTagFilter").value, now = Date.now(), F = advState("lib"), names = myNameList();
  let arr = [...Lib.games.values()].filter(r => {
    if (tag === "*fav" && !r.fav) return false;
    if (tag === "*due" && !(r.srs && r.srs.due <= now)) return false;
    if (tag === "*marks" && !marksOfGame(r.id).length) return false;
    if (tag && !tag.startsWith("*") && !(r.tags || []).includes(tag)) return false;
    if (F.count && !advMatch(advMeta(r), F, names)) return false;
    if (!q.length) return true;
    const hay = norm([r.title, r.white, r.black, r.event, r.site, r.date, r.eco, r.result, (r.tags || []).join(" ")].join(" "));
    return q.every(w => hay.includes(w));
  });
  const sort = $("libSort").value;
  if (sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title, "es"));
  else if (sort === "date") arr.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  else arr.sort((a, b) => b.updated - a.updated);
  return arr;
}
function renderTagOptions() {
  const tags = new Map();
  for (const r of Lib.games.values()) for (const t of r.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
  const sel = $("libTagFilter"), cur0 = sel.value;
  const nFav = [...Lib.games.values()].filter(r => r.fav).length;
  const nDue = [...Lib.games.values()].filter(r => r.srs && r.srs.due <= Date.now()).length;
  sel.innerHTML = `<option value="">Todas</option><option value="*fav">⭐ Favoritas (${nFav})</option><option value="*marks">📌 Con marcadores</option><option value="*due">📅 Repaso pendiente (${nDue})</option>` +
    [...tags.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([t, n]) => `<option value="${esc(t)}">🏷 ${esc(t)} (${n})</option>`).join("");
  sel.value = [...sel.options].some(o => o.value === cur0) ? cur0 : "";
  $("tagList").innerHTML = [...tags.keys()].map(t => `<option value="${esc(t)}">`).join("");
}
function renderLibrary() {
  const tbody = $("libBody");
  const arr = libFiltered();
  $("libCount").textContent = Lib.games.size;
  tbody.innerHTML = "";
  if (!Lib.ready) { tbody.innerHTML = `<tr><td colspan="6" class="small">Cargando la biblioteca…</td></tr>`; return; }
  if (!arr.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="small">${Lib.games.size ? "Ninguna partida coincide con el filtro." : "Tu biblioteca está vacía. Abre o importa una partida y pulsa «💾 Guardar en biblioteca», o guarda las que te interesen desde «🗂 Abrir .pgn»."}</td></tr>`;
  }
  const frag = document.createDocumentFragment();
  for (const r of arr.slice(0, 500)) {
    const tr = document.createElement("tr");
    if (r.id === ui.libId) tr.className = "current";
    const nMarks = marksOfGame(r.id).length;
    const due = r.srs && r.srs.due <= Date.now();
    const sub = [r.white && r.black ? `${r.white} – ${r.black}` : "", r.event, (r.date || "").replace(/\.\?\?/g, ""), r.eco, r.plies ? Math.ceil(r.plies / 2) + " jug." : ""].filter(x => x && x !== "?").join(" · ");
    tr.innerHTML = `<td><input type="checkbox" data-sel ${Lib.sel.has(r.id) ? "checked" : ""} aria-label="Seleccionar"></td>
      <td class="star-cell" data-fav title="Favorita">${r.fav ? "★" : "☆"}</td>
      <td><div class="lib-title">${esc(r.title)}${nMarks ? ` <span class="small" title="${nMarks} marcadores">📌${nMarks}</span>` : ""}${due ? ` <span class="srs-pill due">repasar</span>` : ""}</div><div class="lib-sub">${esc(sub)}</div></td>
      <td>${esc(r.result || "*")}</td>
      <td class="hide-sm">${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</td>
      <td class="row-actions"><button class="sm-btn" data-train title="Entrenar esta partida">🎯</button> <button class="sm-btn danger" data-del title="Borrar de la biblioteca">🗑</button></td>`;
    tr.querySelector("[data-sel]").onclick = e => { e.stopPropagation(); e.target.checked ? Lib.sel.add(r.id) : Lib.sel.delete(r.id); updateSelButtons(); };
    tr.querySelector("[data-fav]").onclick = async e => {
      e.stopPropagation();
      r.fav = !r.fav;
      try { await DB.put("games", r); }
      catch (err) { r.fav = !r.fav; toast("❌ No se pudo guardar la favorita: " + err.message, 5000); return; }
      if (r.id === ui.libId) { ui.fav = r.fav; updateSaveState(); }
      refreshLibraryViews();
    };
    tr.querySelector("[data-train]").onclick = e => { e.stopPropagation(); if (openLibGame(r.id)) startTraining({}); };
    tr.querySelector("[data-del]").onclick = e => { e.stopPropagation(); deleteLibGames([r.id]); };
    tr.onclick = () => { if (openLibGame(r.id)) switchTab("study"); };
    frag.append(tr);
  }
  tbody.append(frag);
  $("libStatus").textContent = arr.length > 500 ? `Mostrando 500 de ${arr.length}. Usa el buscador para afinar.` : arr.length ? `${arr.length} partida${arr.length === 1 ? "" : "s"}` : "";
  showAdvSummary("lib", advState("lib"), arr.map(advMeta));
  updateSelButtons();
}
function updateSelButtons() {
  for (const id of [...Lib.sel]) if (!Lib.games.has(id)) Lib.sel.delete(id);
  $("libDeleteSel").disabled = !Lib.sel.size;
  $("libDeleteSel").textContent = Lib.sel.size ? `🗑 Borrar seleccionadas (${Lib.sel.size})` : "🗑 Borrar seleccionadas";
}
async function deleteLibGames(ids) {
  if (!ids.length) return;
  const marks = [...Lib.marks.values()].filter(m => ids.includes(m.gameId));
  const label = ids.length === 1 ? `«${Lib.games.get(ids[0]).title}»` : `${ids.length} partidas`;
  if (!confirm(`¿Borrar ${label} de la biblioteca${marks.length ? ` y sus ${marks.length} marcadores` : ""}?\n\nNo se puede deshacer (salvo que tengas una copia de seguridad).`)) return;
  try {
    await DB.delMany("games", ids);
    await DB.delMany("marks", marks.map(m => m.id));
  } catch (e) { toast("❌ No se pudo borrar: " + e.message); return; }
  ids.forEach(id => { Lib.games.delete(id); Lib.sel.delete(id); });
  marks.forEach(m => Lib.marks.delete(m.id));
  if (ids.includes(ui.libId)) { ui.libId = null; ui.dirty = false; }
  LocalIdx = null;
  toast(`🗑 ${label} borrada${ids.length === 1 ? "" : "s"}.`);
  refreshLibraryViews();
  renderMoves();
  scheduleAutosave();
}

/* ---------- B5. Fichero .pgn abierto (sólo en memoria) ---------- */
function collRaw(g) { return Object.entries(g.headers).map(([k, v]) => `[${k} "${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`).join("\n") + "\n\n" + g.movetext.trim(); }
function setCollection(text, append, name) {
  const parts = Pgn.splitGames(text).filter(g => g.movetext.trim());
  if (!append) { Coll.games = []; Coll.bytes = 0; Coll.names = []; Coll.saved = new Set(); }
  for (const p of parts) Coll.games.push(p);
  Coll.bytes += text.length;
  if (name) Coll.names.push(name);
  LocalIdx = null;
  renderCollection();
  updateStorage();
  return parts.length;
}
function collFiltered() {
  const q = norm($("dbFilterInput").value).split(/\s+/).filter(Boolean);
  const rows = [], F = advState("db"), names = myNameList();
  Coll.games.forEach((g, i) => {
    if (F.count && !advMatch(advMeta(g), F, names)) return;
    if (!q.length) { rows.push(i); return; }
    const h = g.headers;
    const hay = norm([h.White, h.Black, h.Event, h.Site, h.Date, h.ECO, h.Result, h.Opening].join(" "));
    if (q.every(w => hay.includes(w))) rows.push(i);
  });
  return rows;
}
function renderCollection() {
  const tbody = $("pgnDbBody");
  $("collCount").textContent = Coll.games.length;
  const rows = collFiltered();
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="small">${Coll.games.length ? "Ninguna partida coincide con el filtro." : "No hay ningún fichero abierto. Pulsa «📂 Abrir .pgn» o carga la antología de clásicos."}</td></tr>`;
  }
  const frag = document.createDocumentFragment();
  for (const i of rows.slice(0, 500)) {
    const h = Coll.games[i].headers;
    const tr = document.createElement("tr");
    const saved = Coll.saved.has(i);
    tr.innerHTML = `<td class="num">${i + 1}</td><td><b>${esc(h.White || "?")}</b>${h.WhiteElo ? ` <span class="small">${esc(h.WhiteElo)}</span>` : ""}</td><td><b>${esc(h.Black || "?")}</b>${h.BlackElo ? ` <span class="small">${esc(h.BlackElo)}</span>` : ""}</td><td>${esc(h.Result || "*")}</td><td class="hide-sm">${h.ECO ? `<span class="srs-pill">${esc(h.ECO)}</span> ` : ""}${esc(h.Event || "")}</td><td>${esc((h.Date || "").slice(0, 4))}</td>
      <td class="row-actions">${saved ? `<span class="small msg-ok" title="Ya está en tu biblioteca">✔</span>` : `<button class="sm-btn" data-save title="Guardar en la biblioteca">💾</button>`}</td>`;
    const sb = tr.querySelector("[data-save]");
    if (sb) sb.onclick = e => { e.stopPropagation(); saveCollGames([i]); };
    tr.onclick = () => loadCollGame(i);
    frag.append(tr);
  }
  tbody.append(frag);
  $("dbStatus").textContent = Coll.games.length
    ? `${Coll.names.length ? "«" + Coll.names.join("», «") + "» · " : ""}${Coll.games.length} partidas en memoria (${fmtBytes(Coll.bytes)})${rows.length > 500 ? ` · mostrando 500 de ${rows.length}` : ""}`
    : "";
  showAdvSummary("db", advState("db"), rows.map(i => advMeta(Coll.games[i])));
  $("saveCollFilteredBtn").disabled = !rows.length;
  $("saveCollFilteredBtn").textContent = rows.length ? `💾 Guardar en la biblioteca las ${rows.length} partidas filtradas` : "💾 Guardar en la biblioteca las partidas filtradas";
}
function loadCollGame(i) {
  const g = Coll.games[i];
  if (!g) return;
  const r = Pgn.parseGame(g, { lang: "auto" });
  const ok = setGame(r.game, { name: defaultTitle(r.game.headers) });
  if (ok === false) return;
  importResultMsg(r);
  switchTab("study");
}
async function saveCollGames(list) {
  if (!Lib.ready || !list.length) return;
  const estBytes = list.reduce((a, i) => a + Coll.games[i].movetext.length + 300, 0);
  if (list.length > 1) {
    const projected = libBytes() + estBytes;
    let msg = `¿Guardar ${list.length} partidas en tu biblioteca (≈${fmtBytes(estBytes)})?`;
    if (projected > LIB_SOFT()) msg += `\n\n⚠ La biblioteca pasaría a ocupar ≈${fmtBytes(projected)}, más de lo recomendado (${fmtBytes(LIB_SOFT())}). Puede ir más lenta al abrir la página.`;
    if (!confirm(msg)) return;
  }
  const sigs = new Map([...Lib.games.values()].map(r => [r.sig, r.id]));
  const recs = [];
  let dup = 0, dupFile = 0, bad = 0;
  const btn = $("saveCollFilteredBtn");
  btn.disabled = true;
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    const r = Pgn.parseGame(Coll.games[i], { lang: "auto" });
    if (!r.count && r.error) { bad++; continue; }
    const rec = recordFromGame(r.game);
    if (sigs.has(rec.sig)) { if (sigs.get(rec.sig) === -1) dupFile++; else dup++; Coll.saved.add(i); continue; }
    sigs.set(rec.sig, -1);
    recs.push(rec);
    Coll.saved.add(i);
    if (k % 40 === 39) { $("dbStatus").textContent = `Preparando… ${k + 1} / ${list.length}`; await new Promise(r2 => setTimeout(r2, 0)); }
  }
  try {
    for (let k = 0; k < recs.length; k += 250) {
      await DB.putMany("games", recs.slice(k, k + 250));
      $("dbStatus").textContent = `Guardando… ${Math.min(recs.length, k + 250)} / ${recs.length}`;
    }
  } catch (e) { toast("❌ Error al guardar: " + e.message, 6000); }
  for (const r of recs) if (r.id != null) Lib.games.set(r.id, r);
  LocalIdx = null;
  btn.disabled = false;
  toast(`💾 ${recs.length} guardada${recs.length === 1 ? "" : "s"}${dup ? ` · ${dup} ya estaba${dup === 1 ? "" : "n"} en tu biblioteca` : ""}${dupFile ? ` · ${dupFile} repetida${dupFile === 1 ? "" : "s"} dentro del fichero` : ""}${bad ? ` · ${bad} ilegibles` : ""}.`, 4500);
  renderCollection();
  refreshLibraryViews();
}
async function openPgnFiles(files) {
  let total = 0;
  for (const [k, f] of files.entries()) {
    if (f.size > COLL_HARD) { toast(`«${f.name}» ocupa ${fmtBytes(f.size)}: es demasiado grande para abrirlo en el navegador (máx. ${fmtBytes(COLL_HARD)}). Divide el fichero.`, 7000); continue; }
    const after = Coll.bytes + f.size;
    if (after > COLL_SOFT && !confirm(`Abrir «${f.name}» (${fmtBytes(f.size)}) dejará ${fmtBytes(after)} de partidas en memoria, más de lo recomendado (${fmtBytes(COLL_SOFT)}). El navegador puede ir lento. ¿Continuar?`)) continue;
    const append = k > 0 || (Coll.games.length > 0 && confirm(`¿Añadir «${f.name}» al fichero que ya tienes abierto?\n\nAceptar = añadir · Cancelar = sustituirlo`));
    $("dbStatus").textContent = `Leyendo «${f.name}»…`;
    total += setCollection(await f.text(), append, f.name);
  }
  toast(`🗂 ${total} partidas abiertas en memoria. Guarda en la biblioteca sólo las que te interesen.`, 4500);
}

/* ---------- B6. Marcadores ---------- */
const CATS = {
  idea: { icon: "💡", name: "Idea" }, tactica: { icon: "⚔", name: "Táctica" }, error: { icon: "⚠", name: "Error típico" },
  plan: { icon: "🧭", name: "Plan" }, final: { icon: "♟", name: "Final" }, apertura: { icon: "📖", name: "Apertura" }, fav: { icon: "⭐", name: "Favorita" }
};
const DEFAULT_TRAIN = { error: "best", fav: "none" };
const markLabel = m => (m.num ? m.num + formatSan(m.san, settings.lang, m.color) : "Posición inicial");
function markedNodesOfCurrent() {
  const out = new Map();
  if (!ui.libId || trainer.card) return out;
  for (const m of marksOfGame(ui.libId)) { const n = resolvePath(game.root, m.path, true); if (n) out.set(n.id, m); }
  return out;
}
async function openMarkDialog() {
  if (editor.active) { toast("Cierra antes el editor de posición."); return; }
  if (quiz()) { toast("Termina antes el ejercicio."); return; }
  if (!Lib.ready) { toast("La biblioteca aún se está cargando…"); return; }
  const node = cur();
  if (!ui.libId || !Lib.games.has(ui.libId)) {
    if (!confirm("Para marcar posiciones, la partida tiene que estar en tu biblioteca.\n\n¿Guardarla ahora?")) return;
    if (!(await saveToLibrary({}))) return;
  } else if (ui.dirty) await saveToLibrary({ silent: true });
  const path = Pgn.pathTo(node).slice(1).map(n => n.uci);
  const existing = marksOfGame(ui.libId).find(m => m.path.join(" ") === path.join(" "));
  ui.markCtx = { node, path, existing, trainTouched: !!existing, cat: existing ? existing.cat : "idea" };
  const rec = Lib.games.get(ui.libId);
  $("markWhere").textContent = `${rec.title} · ${node.parent ? "tras " + numPrefix(node.parent.state) + dispSan(node) : "posición inicial"}`;
  $("markNote").value = existing ? existing.note : (node.comment || "");
  const sel = $("markTrain");
  sel.value = existing ? existing.train : (DEFAULT_TRAIN[ui.markCtx.cat] || "move");
  [...sel.options].forEach(o => { o.disabled = !node.parent && o.value !== "none"; });
  if (!node.parent) sel.value = "none";
  $("markDeleteBtn").hidden = !existing;
  $("markInfo").textContent = node.parent ? "" : "En la posición inicial no hay jugada que entrenar.";
  renderCatChips();
  openModal("markModal");
  setTimeout(() => $("markNote").focus(), 30);
}
function renderCatChips() {
  const box = $("markCats");
  box.innerHTML = "";
  for (const [k, c] of Object.entries(CATS)) {
    const b = document.createElement("button");
    b.className = "sm-btn cat-chip" + (ui.markCtx.cat === k ? " active" : "");
    b.textContent = `${c.icon} ${c.name}`;
    b.onclick = () => {
      ui.markCtx.cat = k;
      if (!ui.markCtx.trainTouched && ui.markCtx.node.parent) $("markTrain").value = DEFAULT_TRAIN[k] || "move";
      renderCatChips();
    };
    box.append(b);
  }
}
async function saveMark() {
  const ctx = ui.markCtx;
  if (!ctx) return;
  const node = ctx.node;
  let train = node.parent ? $("markTrain").value : "none", answer = null, info = "";
  const btn = $("markSaveBtn");
  if (train === "move") answer = node.uci;
  if (train === "best") {
    let best = node.parent.eval && (node.parent.eval.depth || 0) >= 8 ? node.parent.eval.best : null;
    if (!best) {
      btn.disabled = true;
      $("markInfo").textContent = "⏳ Preguntando al motor cuál era la mejor jugada…";
      const job = await Engine.analyse(node.parent, { purpose: "mark", movetime: 1500, multipv: 1 });
      btn.disabled = false;
      if (job) { storeEval(node.parent, job); best = job.best; }
    }
    if (!best) { train = "move"; answer = node.uci; info = "No se pudo consultar al motor: se entrenará la jugada marcada."; }
    else if (best === node.uci) { train = "move"; answer = node.uci; info = "El motor cree que la jugada marcada ya es la mejor: se entrenará como «encontrar la jugada marcada»."; }
    else answer = best;
  }
  const prev = ctx.existing;
  const rec = Object.assign(prev ? Object.assign({}, prev) : { created: Date.now(), srs: null }, {
    gameId: ui.libId, path: ctx.path, fen: Chess.toFen(node.state), fenBefore: node.parent ? Chess.toFen(node.parent.state) : null,
    san: node.san || "", num: node.parent ? numPrefix(node.parent.state) : "", color: node.parent ? node.parent.state.t : 1,
    cat: ctx.cat, note: $("markNote").value.trim(), train, answer, updated: Date.now()
  });
  if (prev && (prev.train !== train || prev.answer !== answer)) rec.srs = null;
  try { await DB.put("marks", rec); } catch (e) { toast("❌ No se pudo guardar el marcador: " + e.message); return; }
  Lib.marks.set(rec.id, rec);
  closeModals();
  toast(info || `📌 Marcador ${prev ? "actualizado" : "guardado"} (${CATS[rec.cat].icon} ${CATS[rec.cat].name}).`, info ? 5000 : 2600);
  refreshLibraryViews();
  renderMoves();
}
async function deleteMark(id, ask = true) {
  const m = Lib.marks.get(id);
  if (!m) return;
  if (ask && !confirm(`¿Borrar el marcador ${CATS[m.cat].icon} ${markLabel(m)}?`)) return;
  try { await DB.delMany("marks", [id]); } catch (e) { toast("❌ No se pudo borrar el marcador: " + e.message, 5000); return; }
  Lib.marks.delete(id);
  refreshLibraryViews();
  renderMoves();
}
function miniBoard(fen) {
  let s;
  try { s = Chess.parseFen(fen); } catch { return ""; }
  let html = "";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = s.b[r * 16 + c];
    html += `<span class="${(r + c) % 2 ? "d" : "l"}${p !== "." ? (p < "a" ? " w" : " b") : ""}">${p !== "." ? glyphUnicode[p.toUpperCase()] : ""}</span>`;
  }
  return `<div class="mini-board" aria-hidden="true">${html}</div>`;
}
function srsText(srs) {
  if (!srs) return "nueva";
  const d = Math.ceil((srs.due - Date.now()) / 864e5);
  return d <= 0 ? "pendiente hoy" : d === 1 ? "mañana" : `en ${d} días`;
}
function renderMarks() {
  const list = $("markList");
  const cat = $("markCatFilter").value, q = norm($("markFilter").value).split(/\s+/).filter(Boolean);
  $("markCount").textContent = Lib.marks.size;
  const arr = [...Lib.marks.values()].filter(m => {
    if (cat && m.cat !== cat) return false;
    if (!q.length) return true;
    const g = Lib.games.get(m.gameId);
    const hay = norm([m.note, g && g.title, markLabel(m), CATS[m.cat].name].join(" "));
    return q.every(w => hay.includes(w));
  }).sort((a, b) => b.updated - a.updated);
  list.innerHTML = "";
  if (!arr.length) {
    list.innerHTML = `<div class="small">${Lib.marks.size ? "Ningún marcador coincide." : "Aún no tienes marcadores. En cualquier jugada pulsa «📌 Marcar posición» para guardarla como idea, táctica, error típico…"}</div>`;
    return;
  }
  for (const m of arr.slice(0, 300)) {
    const g = Lib.games.get(m.gameId);
    const card = document.createElement("div");
    card.className = "mark-card";
    card.innerHTML = `${miniBoard(m.fen)}
      <div><div class="mark-head">${CATS[m.cat].icon} ${esc(CATS[m.cat].name)} · ${esc(markLabel(m))}</div>
      ${m.note ? `<div class="mark-note">${esc(m.note)}</div>` : ""}
      <div class="mark-meta">${esc(g ? g.title : "partida borrada")} · ${m.train === "none" ? "no se entrena" : "🧠 tarjeta: " + srsText(m.srs)}</div></div>
      <div class="mark-actions"><button class="sm-btn" data-edit title="Editar">✏</button><button class="sm-btn danger" data-del title="Borrar">🗑</button></div>`;
    card.querySelector("[data-edit]").onclick = e => { e.stopPropagation(); if (openLibGame(m.gameId, m.path)) { switchTab("study"); openMarkDialog(); } };
    card.querySelector("[data-del]").onclick = e => { e.stopPropagation(); deleteMark(m.id); };
    card.onclick = () => { if (openLibGame(m.gameId, m.path)) switchTab("study"); };
    list.append(card);
  }
}

/* ---------- B7. Buscar en comentarios y notas ---------- */
/* Normaliza conservando la correspondencia con las posiciones del texto original */
function normMap(t) {
  let n = "";
  const map = [];
  for (let i = 0; i < t.length;) {
    const ch = String.fromCodePoint(t.codePointAt(i));
    const nn = norm(ch);
    for (let k = 0; k < nn.length; k++) map.push(i);
    n += nn;
    i += ch.length;
  }
  map.push(t.length);
  return { n, map };
}
function highlight(text, q) {
  const t = String(text), { n, map } = normMap(t), i = n.indexOf(q);
  if (i < 0) return esc(t);
  const a = map[i], b = i + q.length < map.length ? map[i + q.length] : t.length;
  return esc(t.slice(0, a)) + "<mark>" + esc(t.slice(a, b)) + "</mark>" + esc(t.slice(b));
}
function snippet(text, q) {
  const t = String(text), { n, map } = normMap(t), ni = n.indexOf(q);
  const i = ni < 0 ? -1 : map[ni];
  if (t.length <= 220 || i < 0) return t.length > 220 ? t.slice(0, 217) + "…" : t;
  const a = Math.max(0, i - 80);
  return (a ? "…" : "") + t.slice(a, a + 220) + (a + 220 < t.length ? "…" : "");
}
async function searchComments() {
  const raw = $("commentSearch").value.trim().replace(/\s+/g, " "), q = norm(raw);
  const box = $("searchResults");
  if (q.length < 2) { box.innerHTML = `<div class="small">Escribe al menos 2 letras.</div>`; return; }
  box.innerHTML = `<div class="small">Buscando…</div>`;
  const results = [];
  let scanned = 0;
  for (const m of Lib.marks.values()) if (norm(m.note).includes(q)) results.push({ mark: m });
  for (const rec of Lib.games.values()) {
    if (++scanned % 100 === 0) await new Promise(r => setTimeout(r, 0));
    if (!norm(rec.pgn.replace(/\s+/g, " ")).includes(q)) continue;
    const r = Pgn.parseGame(rec.pgn, { lang: "en" });
    Pgn.walk(r.game.root, n => {
      if (n.comment && norm(n.comment).includes(q)) results.push({ rec, path: Pgn.pathTo(n).slice(1).map(x => x.uci), label: n.parent ? numPrefix(n.parent.state) + dispSan(n) : "Inicio", text: n.comment });
    });
    if (results.length > 400) break;
  }
  box.innerHTML = "";
  if (!results.length) { box.innerHTML = `<div class="small">No aparece «${esc(raw)}» en ningún comentario ni marcador de tu biblioteca.</div>`; return; }
  const head = document.createElement("div");
  head.className = "small";
  head.textContent = `${results.length > 400 ? "Más de 400" : results.length} resultado${results.length === 1 ? "" : "s"}`;
  box.append(head);
  for (const res of results.slice(0, 400)) {
    const div = document.createElement("div");
    div.className = "mark-card no-board";
    if (res.mark) {
      const m = res.mark, g = Lib.games.get(m.gameId);
      div.innerHTML = `<div><div class="mark-head">📌 ${CATS[m.cat].icon} ${esc(markLabel(m))}</div><div class="mark-note">${highlight(snippet(m.note, q), q)}</div><div class="mark-meta">${esc(g ? g.title : "")} · marcador</div></div><div></div>`;
      div.onclick = () => { if (openLibGame(m.gameId, m.path)) switchTab("study"); };
    } else {
      div.innerHTML = `<div><div class="mark-head">💬 ${esc(res.label)}</div><div class="mark-note">${highlight(snippet(res.text, q), q)}</div><div class="mark-meta">${esc(res.rec.title)}</div></div><div></div>`;
      div.onclick = () => { if (openLibGame(res.rec.id, res.path)) switchTab("study"); };
    }
    box.append(div);
  }
}

/* ---------- B8. Tarjetas de entrenamiento (de los marcadores) ---------- */
const Cards = { queue: [], stash: null, done: 0, ok: 0 };
function trainableMarks(all) {
  const now = Date.now();
  return [...Lib.marks.values()].filter(m => m.train !== "none" && m.answer && m.fenBefore && (all || !m.srs || m.srs.due <= now));
}
function startCards(all) {
  const q = trainableMarks(all);
  if (!q.length) { toast(all ? "No tienes marcadores entrenables. Marca posiciones con «📌 Marcar posición»." : "¡No tienes tarjetas pendientes hoy! 🎉", 4000); return; }
  if (!stashBoard()) return;
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  Cards.queue = q;
  Cards.done = 0;
  Cards.ok = 0;
  $("cardsBackBtn").hidden = false;
  nextCard();
}
function nextCard() {
  const m = Cards.queue.shift();
  if (!m) { endCards(); return; }
  let g;
  try { g = Pgn.newGame(m.fenBefore); } catch { nextCard(); return; }
  const mv = Chess.moveFromUci(g.root.state, m.answer);
  if (!mv) { nextCard(); return; }
  Pgn.addMove(g.root, mv);
  g.headers.Event = "Tarjeta";
  const src = Lib.games.get(m.gameId);
  setGame(g, { noConfirm: true, keepTrainer: false, name: `🧠 ${CATS[m.cat].icon} ${src ? src.title : "Tarjeta"}` });
  startTraining({ side: g.root.state.t, markId: m.id, card: true });
}
function endCards() {
  trainFeedback(`🧠 Repaso terminado: ${Cards.ok} de ${Cards.done} a la primera.<br><span class="small">Pulsa «↩ Volver a la partida» para seguir donde estabas.</span>`, Cards.ok === Cards.done ? "ok" : "");
}
function restoreStash() {
  const st = Cards.stash;
  Cards.stash = null;
  Cards.queue = [];
  $("cardsBackBtn").hidden = true;
  const onCard = (trainer.active && (trainer.card || trainer.puzzle)) || ["Tarjeta", "Ejercicio", "Problema"].includes(game.headers.Event);
  if (Retry.active && retryNode() && retryNode().__drill) retryEnd(true);
  if (!onCard && !confirmLeave()) { Cards.stash = st; $("cardsBackBtn").hidden = false; return; }
  if (trainer.active) stopTraining(true);
  if (!st) return;
  ui.flipped = !!st.flipped;
  setGame(st.game, { noConfirm: true, libId: st.libId && Lib.games.has(st.libId) ? st.libId : null, name: st.name, fav: st.fav, tags: st.tags, current: st.current });
  if (st.dirty) { ui.dirty = true; updateSaveState(); }
}
async function finishCard(perfect) {
  const m = Lib.marks.get(trainer.markId);
  logActivity("card");
  Cards.done++;
  if (perfect) Cards.ok++;
  let msg = perfect ? "🏆 ¡Correcto a la primera!" : "✔ Tarjeta resuelta.";
  if (m) {
    m.srs = srsStep(m.srs || { box: 0, due: Date.now(), reps: 0 }, perfect);
    try { await DB.put("marks", m); } catch {}
    const g = Lib.games.get(m.gameId);
    msg += ` ${CATS[m.cat].icon} ${esc(g ? g.title : "")}, ${esc(markLabel(m))}.`;
    if (m.note) msg += `<br>📝 ${esc(m.note)}`;
    msg += `<br><span class="small">Próximo repaso: ${srsText(m.srs)}.</span>`;
  }
  msg += Cards.queue.length ? `<br><button id="nextCardBtn" class="primary sm-btn" style="margin-top:6px">Siguiente tarjeta ▶ (quedan ${Cards.queue.length})</button>` : `<br><b>Fin del repaso:</b> ${Cards.ok} de ${Cards.done} a la primera.`;
  trainFeedback(msg, perfect ? "ok" : "");
  const nb = $("nextCardBtn");
  if (nb) nb.onclick = nextCard;
  refreshLibraryViews();
}

/* ---------- B9. Medidor de ocupación ---------- */
const updateStorage = debounce(async () => {
  const lb = libBytes(), soft = LIB_SOFT();
  const setMeter = (id, used, max) => {
    const el = $(id), pct = Math.min(100, (used / max) * 100);
    el.style.width = Math.max(used ? 1.5 : 0, pct) + "%";
    el.className = pct > 90 ? "bad" : pct > 60 ? "warn" : "";
  };
  setMeter("meterLib", lb, soft);
  $("meterLibTxt").textContent = `${fmtBytes(lb)} de ${fmtBytes(soft)} recomendados`;
  setMeter("meterColl", Coll.bytes, COLL_SOFT);
  $("meterCollTxt").textContent = Coll.games.length ? `${fmtBytes(Coll.bytes)} de ${fmtBytes(COLL_SOFT)}` : "ninguno abierto";
  const parts = [`${Lib.games.size} partidas y ${Lib.marks.size} marcadores guardados`];
  if (Coll.games.length) parts.push(`${Coll.games.length} partidas abiertas en memoria`);
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      parts.push(`Navegador: ${fmtBytes(e.usage)} usados de ${fmtBytes(e.quota)} disponibles para esta página`);
    }
  } catch {}
  if (performance.memory) parts.push(`Memoria de la página: ${fmtBytes(performance.memory.usedJSHeapSize)}`);
  let detail = parts.join(" · ") + ".";
  if (DB.kind === "ls") detail += " ⚠ Este navegador no permite la base interna (IndexedDB) aquí: la biblioteca usa un almacén pequeño de unos 5 MB. Ábrela directamente en Chrome, Edge o Firefox para tener más espacio.";
  if (lb > soft) detail += " ⚠ La biblioteca supera lo recomendado: exporta una copia y borra lo que no uses.";
  if (Coll.bytes > COLL_SOFT) detail += " ⚠ El fichero abierto ocupa mucho: ciérralo cuando acabes.";
  $("storageDetail").textContent = detail;
  try {
    if (navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      $("storagePersist").textContent = p ? "🔒 Datos protegidos" : "";
      $("persistBtn").hidden = p || !navigator.storage.persist;
    } else $("persistBtn").hidden = true;
  } catch { $("persistBtn").hidden = true; }
}, 250);

/* ---------- B10. Copias de seguridad, migración y arranque de la biblioteca ---------- */
function legacyStudyGame(it) {
  try {
    if (it.v === 2) return Pgn.parseGame(it.pgn || "").game;
    const r = Pgn.parseGame(it.pgn || "", { fen: it.base || Chess.START_FEN });
    const notes = it.notes || {};
    Pgn.walk(r.game.root, n => { const t = notes[Chess.toFen(n.state)]; if (t) n.comment = t; });
    return r.game;
  } catch { return null; }
}
function isSampleDb(raw) {
  const a = Pgn.splitGames(raw), b = Pgn.splitGames(SAMPLE_MULTI_PGN);
  return a.length === b.length && a.every((g, i) => g.headers.White === b[i].headers.White && g.headers.Black === b[i].headers.Black);
}
async function importRecords(games, marks) {
  const bySig = new Map([...Lib.games.values()].map(r => [r.sig, r.id]));
  const idMap = new Map(), fresh = [];
  let dup = 0;
  for (const g of games) {
    if (!g || !g.pgn) continue;
    const oldId = g.id;
    if (g.sig && bySig.has(g.sig)) { idMap.set(oldId, bySig.get(g.sig)); dup++; continue; }
    const rec = Object.assign({}, g);
    delete rec.id;
    if (!rec.sig) { const r = Pgn.parseGame(rec.pgn, { lang: "en" }); Object.assign(rec, recordFromGame(r.game, { title: rec.title, fav: rec.fav, tags: rec.tags || [], srs: rec.srs || null, created: rec.created || Date.now() })); }
    rec._old = oldId;
    fresh.push(rec);
    bySig.set(rec.sig, -1);
  }
  for (let k = 0; k < fresh.length; k += 250) await DB.putMany("games", fresh.slice(k, k + 250));
  for (const r of fresh) { idMap.set(r._old, r.id); delete r._old; Lib.games.set(r.id, r); }
  const freshMarks = [];
  const have = new Set([...Lib.marks.values()].map(m => m.gameId + "|" + m.path.join(" ")));
  for (const m of marks || []) {
    const gid = idMap.get(m.gameId);
    if (gid == null) continue;
    const key = gid + "|" + (m.path || []).join(" ");
    if (have.has(key)) continue;
    have.add(key);
    const rec = Object.assign({}, m, { gameId: gid });
    delete rec.id;
    freshMarks.push(rec);
  }
  if (freshMarks.length) await DB.putMany("marks", freshMarks);
  for (const m of freshMarks) Lib.marks.set(m.id, m);
  LocalIdx = null;
  return { games: fresh.length, dup, marks: freshMarks.length };
}
async function migrateLegacy() {
  if (LS.get("ajedrezMigratedV3", false)) return;
  const recs = [];
  let nStudies = 0, nBase = 0;
  const studies = LS.get("ajedrezStudioSaves", []);
  if (Array.isArray(studies)) for (const it of studies) {
    const g = legacyStudyGame(it);
    if (!g || !g.root.children.length) continue;
    recs.push(recordFromGame(g, { title: it.name || defaultTitle(g.headers), srs: it.srs && it.srs.reps > 0 ? it.srs : null, created: it.date || Date.now(), updated: it.date || Date.now() }));
    nStudies++;
  }
  const rawDb = LS.get("ajedrezStudioDb", null);
  if (typeof rawDb === "string" && rawDb.trim() && !isSampleDb(rawDb)) {
    for (const part of Pgn.splitGames(rawDb)) {
      const r = Pgn.parseGame(part);
      if (!r.count) continue;
      recs.push(recordFromGame(r.game, { tags: ["base antigua"] }));
      nBase++;
    }
  }
  try {
    const res = await importRecords(recs, []);
    try { localStorage.removeItem("ajedrezStudioSaves"); localStorage.removeItem("ajedrezStudioDb"); } catch {}
    LS.set("ajedrezMigratedV3", true);
    if (nStudies || nBase) toast(`📚 Biblioteca nueva: se han pasado ${nStudies} estudios${nBase ? ` y ${nBase} partidas de tu base PGN anterior (etiqueta «base antigua»)` : ""}${res.dup ? ` (${res.dup} duplicados omitidos)` : ""}.`, 7000);
  } catch (e) { console.warn("Migración pendiente:", e); }
}
/* Otra pestaña ha cambiado la biblioteca: se recarga lo guardado (no la partida del tablero) */
const reloadLibraryFromOtherTab = debounce(async () => {
  try {
    const games = await DB.all("games"), marks = await DB.all("marks");
    Lib.games = new Map(games.map(r => [r.id, r]));
    Lib.marks = new Map(marks.map(m => [m.id, m]));
  } catch { return; }
  LocalIdx = null;
  if (ui.libId && !Lib.games.has(ui.libId)) { ui.libId = null; toast("⚠ La partida del tablero se ha borrado de la biblioteca en otra pestaña.", 5000); }
  else if (ui.libId && ui.recUpdated && Lib.games.get(ui.libId).updated > ui.recUpdated) toast("⚠ Esta partida se ha modificado en otra pestaña. Vuelve a abrirla desde la biblioteca para ver esos cambios.", 6000);
  refreshLibraryViews();
  renderMoves();
}, 300);
if (libChannel) libChannel.onmessage = e => { if (e.data && e.data.tab !== TAB_ID && Lib.ready) reloadLibraryFromOtherTab(); };

async function initLibrary() {
  await DB.open();
  try {
    for (const r of await DB.all("games")) Lib.games.set(r.id, r);
    for (const m of await DB.all("marks")) Lib.marks.set(m.id, m);
  } catch (e) { toast("❌ No se pudo leer la biblioteca: " + e.message, 6000); }
  await migrateLegacy();
  Lib.ready = true;
  if (ui.libId && !Lib.games.has(ui.libId)) ui.libId = null;
  if (!ui.libId && ui.legacyStudy) {
    const r = [...Lib.games.values()].find(x => x.title === ui.legacyStudy);
    if (r) ui.libId = r.id;
  }
  if (ui.libId) { const r = Lib.games.get(ui.libId); ui.recUpdated = ui.recUpdated || r.updated; ui.fav = !!r.fav; if (!ui.tags.length) ui.tags = (r.tags || []).slice(); $("gameTags").value = ui.tags.join(", "); }
  refreshLibraryViews();
  renderMoves();
}
function refreshLibraryViews() {
  if (!Lib.ready) { updateSaveState(); return; }
  renderTagOptions();
  renderLibrary();
  renderMarks();
  const now = Date.now();
  const gDue = [...Lib.games.values()].filter(r => r.srs && r.srs.due <= now).length;
  $("gameDueBadge").textContent = `${gDue} pendiente${gDue === 1 ? "" : "s"}`;
  $("gameDueBadge").className = "srs-pill" + (gDue ? " due" : "");
  renderMyReps();
  renderGameMarks();
  const cDue = trainableMarks(false).length;
  $("cardDueBadge").textContent = `${cDue} pendiente${cDue === 1 ? "" : "s"}`;
  $("cardDueBadge").className = "srs-pill" + (cDue ? " due" : "");
  updateSaveState();
  updateStorage();
  renderStatsSoon();
  renderDrillInfoSoon();
}
const renderDrillInfoSoon = debounce(() => renderDrillInfo(), 500);

/* ---------- B11. Explorador «Mi biblioteca + .pgn abierto» ---------- */
async function buildLocalIndex() {
  if (LocalIdxBuilding) return;
  LocalIdxBuilding = true;
  const idx = new Map();
  const sources = [...[...Lib.games.values()].map(r => ({ lib: r.id })), ...Coll.games.map((g, i) => ({ coll: i }))];
  for (let k = 0; k < sources.length; k++) {
    const src = sources[k];
    let r, h;
    if (src.lib != null) { const rec = Lib.games.get(src.lib); if (!rec) continue; r = Pgn.parseGame(rec.pgn, { lang: "en" }); }
    else r = Pgn.parseGame(Coll.games[src.coll], { lang: "auto" });
    h = r.game.headers;
    const res = (h.Result || "*").trim();
    const wElo = +h.WhiteElo || 0, bElo = +h.BlackElo || 0;
    let n = r.game.root;
    while (n.children.length) {
      const c = n.children[0];
      let e = idx.get(n.key);
      if (!e) { e = { moves: new Map(), games: [] }; idx.set(n.key, e); }
      let mv = e.moves.get(c.san);
      if (!mv) { mv = { san: c.san, white: 0, draws: 0, black: 0, elo: 0, eloN: 0 }; e.moves.set(c.san, mv); }
      if (res === "1-0") mv.white++; else if (res === "0-1") mv.black++; else mv.draws++;
      if (wElo && bElo) { mv.elo += (wElo + bElo) / 2; mv.eloN++; }
      if (e.games.length < 30 && (!e.games.length || e.games[e.games.length - 1].k !== k)) e.games.push(Object.assign({ h, k, path: Pgn.pathTo(n).slice(1).map(x => x.uci) }, src));
      n = c;
    }
    if (k % 25 === 24) {
      $("explorerMovesBody").innerHTML = `<tr><td colspan="5" class="small">Indexando: ${k + 1} / ${sources.length} partidas…</td></tr>`;
      await new Promise(r2 => setTimeout(r2, 0));
    }
  }
  LocalIdx = idx;
  LocalIdxBuilding = false;
}
async function renderLocalExplorer(node) {
  const tbody = $("explorerMovesBody"), gbody = $("explorerGamesBody");
  $("explorerHint").textContent = "Estadísticas de las partidas de tu biblioteca y del .pgn que tengas abierto. Funciona sin conexión.";
  $("explorerOpening").textContent = "";
  if (!Lib.games.size && !Coll.games.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="small">Tu biblioteca está vacía y no hay ningún .pgn abierto (pestaña «📚 Biblioteca»).</td></tr>`;
    gbody.innerHTML = `<tr><td colspan="5" class="small">—</td></tr>`;
    return;
  }
  if (!LocalIdx) await buildLocalIndex();
  if (cur() !== node || ui.activeTab !== "explorer" || $("explorerDbSelect").value !== "local") return;
  const e = LocalIdx && LocalIdx.get(node.key);
  const rows = e ? [...e.moves.values()].map(m => Object.assign({}, m, { averageRating: m.eloN ? Math.round(m.elo / m.eloN) : 0 })).sort((a, b) => (b.white + b.draws + b.black) - (a.white + a.draws + a.black)) : [];
  explorerMoveRows(node, rows);
  gbody.innerHTML = "";
  if (!e || !e.games.length) { gbody.innerHTML = `<tr><td colspan="5" class="small">Ninguna partida tuya pasa por aquí.</td></tr>`; return; }
  for (const src of e.games) {
    const h = src.h;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(h.White || "?")}</td><td>${esc(h.Black || "?")}</td><td><b>${esc(h.Result || "*")}</b></td><td>${esc((h.Date || "").slice(0, 4))}</td><td>${src.lib != null ? `<span class="srs-pill ok" title="En tu biblioteca">📚</span>` : `<span class="srs-pill" title="Del .pgn abierto">🗂</span>`}</td>`;
    tr.onclick = () => {
      if (src.lib != null) { if (openLibGame(src.lib, src.path)) switchTab("study"); }
      else loadCollGame(src.coll);
    };
    gbody.append(tr);
  }
}

function renderLocalEcoList() {
  const q = ($("ecoSearchInput").value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tbody = $("ecoLocalList");
  tbody.innerHTML = "";
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const item of ECO_BOOK.filter(x => x.ucis && (!q || norm(x.name).includes(q) || x.eco.toLowerCase().includes(q)))) {
    const tr = document.createElement("tr");
    const r = Pgn.parseGame(item.moves, { lang: "en" });
    const txt = Pgn.mainlineFrom(r.game.root).map(n => (n.parent.state.t === 1 ? n.parent.state.full + "." : "") + dispSan(n)).join(" ");
    tr.innerHTML = `<td><b>${esc(item.eco)}</b></td><td>${esc(item.name)}</td><td class="small">${esc(txt)}</td>`;
    tr.onclick = () => {
      const r2 = Pgn.parseGame(item.moves, { lang: "en" });
      r2.game.headers.Event = item.name;
      r2.game.headers.ECO = item.eco;
      setGame(r2.game, { name: item.name, current: Pgn.mainlineFrom(r2.game.root).pop() });
    };
    tbody.append(tr);
  }
}

