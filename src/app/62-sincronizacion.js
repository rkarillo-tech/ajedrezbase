/* ---------- B11. Sincronización entre dispositivos: un archivo .json compartido ---------- */
/*
  El usuario vincula un archivo (lo normal: dentro de su carpeta de Google Drive, OneDrive o Dropbox).
  Cada cambio se guarda ahí; cuando otro dispositivo lo ha modificado, se COMBINA con lo de este:
   · partidas y marcadores se casan por «uid»; si están en los dos lados gana el modificado más tarde («_m»);
   · lo que se borró en un lado (lápida más reciente que su última modificación) no vuelve;
   · el progreso (problemas, repasos, actividad, cursos…) se une entrada a entrada.
  La misma mezcla sirve para «⬆ Restaurar copia» (ahí nunca se borra nada: sólo se añade).
*/
var syncState = "none";          // var: LS.set y DB lo consultan antes de que se ejecute este archivo
var syncTimer = null;
let syncHandle = null, syncSeen = 0, syncBusy = false, syncAgain = false, syncDirty = false, syncErr = "", syncLast = 0;
const SYNC_OK = typeof window.showSaveFilePicker === "function" && typeof window.showOpenFilePicker === "function";
const SYNC_TYPES = [{ description: "Archivo de sincronización de AjedrezBase", accept: { "application/json": [".json"] } }];
const SYNC_TOMB_KEY = "ajedrezSyncBorrados";
const SYNC_DEVICE_SETTINGS = ["token", "engine", "boardSize", "welcomed", "board3d", "board3dLook", "board3dColors", "board3dLight", "board3dGloss"];   // propios de cada dispositivo: no viajan
const newUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
function strHash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
/* Texto canónico (claves ordenadas) para comparar dos valores sin que importe el orden de las claves */
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

/* --- Lápidas: qué se ha borrado aquí y cuándo --- */
const syncTombs = () => LS.get(SYNC_TOMB_KEY, {});
function syncSaveTombs(t) {
  const old = Date.now() - 365 * 864e5, out = {};
  for (const [k, v] of Object.entries(t || {})) if (v > old) out[k] = v;
  LS.set(SYNC_TOMB_KEY, out, true);
}
function syncTomb(keys) {
  if (!keys.length) return;
  const t = syncTombs(), now = Date.now();
  keys.forEach(k => { t[k] = now; });
  syncSaveTombs(t);
}

/* --- Cómo se une cada dato de progreso y de ajustes --- */
const byEntry = better => (a, b) => {
  const out = Object.assign({}, a);
  for (const [k, y] of Object.entries(b)) { const x = out[k]; if (x === undefined || better(x, y)) out[k] = y; }
  return out;
};
const moreReps = (x, y) => (y.reps || 0) > (x.reps || 0) || ((y.reps || 0) === (x.reps || 0) && (y.due || 0) > (x.due || 0));
const maxNums = (a, b) => {
  const out = Object.assign({}, a);
  for (const [k, v] of Object.entries(b)) out[k] = typeof v === "number" && typeof out[k] === "number" ? Math.max(out[k], v) : out[k] === undefined ? v : out[k];
  return out;
};
const sharedSettings = s => { const c = Object.assign({}, s); SYNC_DEVICE_SETTINGS.forEach(k => delete c[k]); return c; };
const SYNC_LS = {
  ajedrezSettings: { obj: true, merge: (a, b) => ((b._m || 0) > (a._m || 0) ? Object.assign({}, a, b) : a) },
  ajedrezProblemas: { obj: true, merge: byEntry(moreReps) },
  ajedrezRepasos: { obj: true, merge: byEntry(moreReps) },
  ajedrezNivelProblemas: { obj: true, merge: (a, b) => ((b.n || 0) > (a.n || 0) ? b : a) },
  ajedrezExamenes: { merge: (a, b) => { const m = new Map(); a.concat(b).forEach(x => m.set(x.t, x)); return [...m.values()].sort((x, y) => x.t - y.t).slice(-30); } },
  ajedrezActividad: { obj: true, merge: (a, b) => { const out = Object.assign({}, a); for (const [d, v] of Object.entries(b)) out[d] = isObj(out[d]) && isObj(v) ? maxNums(out[d], v) : out[d] || v; return out; } },
  ajedrezCursos: { obj: true, merge: (a, b) => { const out = Object.assign({}, a); for (const [id, v] of Object.entries(b)) out[id] = [...new Set([...(out[id] || []), ...(v || [])])].sort((x, y) => x - y); return out; } },
  ajedrezCursosPropios: {
    merge: (a, b, tomb) => {
      const m = new Map();
      a.concat(b).forEach(c => { const p = m.get(c.id); if (!p || (c.added || 0) > (p.added || 0)) m.set(c.id, c); });
      return [...m.values()].filter(c => !((tomb["curso:" + c.id] || 0) > (c.added || 0))).sort((x, y) => (x.added || 0) - (y.added || 0));
    }
  },
  ajedrezCpuAdaptativa: { obj: true, merge: (a, b) => ((b.games || []).length > (a.games || []).length ? b : a) },
  ajedrezVisRecords: { obj: true, merge: maxNums }
};

/* --- Lo que viaja: una foto completa de este dispositivo --- */
function syncPayload() {
  const gUid = new Map();
  const games = [...Lib.games.values()].map(r => { gUid.set(r.id, r.uid); const c = Object.assign({}, r); delete c.id; return c; });
  const marks = [...Lib.marks.values()].filter(m => gUid.has(m.gameId)).map(m => { const c = Object.assign({}, m, { g: gUid.get(m.gameId) }); delete c.id; delete c.gameId; return c; });
  const byUid = (x, y) => (x.uid < y.uid ? -1 : x.uid > y.uid ? 1 : 0);
  const ls = {};
  for (const k of Object.keys(SYNC_LS)) {
    const v = LS.get(k, null);
    if (v != null) ls[k] = k === "ajedrezSettings" ? sharedSettings(v) : v;
  }
  return { app: "AjedrezBase", version: 4, sync: 1, saved: new Date().toISOString(), games: games.sort(byUid), marks: marks.sort(byUid), tomb: syncTombs(), ls };
}

/* --- Mezcla de dos listas con «uid» --- */
function syncMergeList(la, ra, tomb, keyOf, out) {
  const dead = x => (tomb[x.uid] || 0) > (x._m || 0);
  const lm = new Map(la.map(x => [x.uid, x])), rm = new Map(ra.map(x => [x.uid, x]));
  // Lo mismo guardado por separado en los dos lados (otro «uid»): se queda uno solo
  const pool = new Map();
  for (const x of la) {
    if (rm.has(x.uid) || dead(x)) continue;
    const k = keyOf(x);
    if (k) { if (!pool.has(k)) pool.set(k, []); pool.get(k).push(x); }
  }
  for (const y of ra) {
    if (lm.has(y.uid) || dead(y)) continue;
    const list = pool.get(keyOf(y)), x = list && list.shift();
    if (!x) continue;
    const my = y._m || 0, mx = x._m || 0;
    if (my > mx || (my === mx && y.uid < x.uid)) { out.put.push({ rec: y, from: x.uid, same: true }); out.alias.set(x.uid, y.uid); lm.delete(x.uid); }
    else { out.alias.set(y.uid, x.uid); out.write = true; }
    rm.delete(y.uid);
  }
  for (const [uid, x] of lm) {
    const y = rm.get(uid);
    if (!y) { if (dead(x)) out.del.push(uid); else out.write = true; continue; }
    const pick = (y._m || 0) > (x._m || 0) ? y : x;
    if (dead(pick)) { out.del.push(uid); out.write = true; }
    else if (pick === y) out.put.push({ rec: y, from: uid });
    else if ((x._m || 0) > (y._m || 0)) out.write = true;
  }
  for (const [uid, y] of rm) {
    if (lm.has(uid)) continue;
    if (dead(y)) out.write = true; else out.put.push({ rec: y, from: null });
  }
}
/* Compara este dispositivo (L) con otra versión (R) y dice qué hay que cambiar aquí y si hay que reescribir el archivo */
function syncMerge(L, R, opts = {}) {
  const now = Date.now();
  let tomb = Object.assign({}, L.tomb || {});
  let rGames = (R.games || []).filter(x => x && x.uid && x.pgn), rMarks = (R.marks || []).filter(x => x && x.uid && x.g);
  if (opts.restore) {
    // Restaurar una copia sólo añade: lo que se borró aquí vuelve (y como «recién cambiado», para que tampoco lo borre otro dispositivo)
    const back = x => { if (!tomb[x.uid]) return x; delete tomb[x.uid]; return Object.assign({}, x, { _m: now }); };
    rGames = rGames.map(back); rMarks = rMarks.map(back);
    (R.ls && R.ls.ajedrezCursosPropios || []).forEach(c => { delete tomb["curso:" + c.id]; });
  } else if (isObj(R.tomb)) {
    for (const [k, v] of Object.entries(R.tomb)) if (!(tomb[k] >= v)) tomb[k] = v;
  }
  const res = { games: { put: [], del: [], alias: new Map(), write: false }, marks: { put: [], del: [], alias: new Map(), write: false }, ls: {}, tomb, write: !!opts.restore };
  syncMergeList(L.games, rGames, tomb, x => x.sig, res.games);
  // Marcadores: van con su partida (que puede haber cambiado de «uid» al unificarse)
  const ga = u => res.games.alias.get(u) || u;
  const alive = new Set(L.games.map(x => ga(x.uid)));
  res.games.put.forEach(p => alive.add(p.rec.uid));
  res.games.del.forEach(u => alive.delete(u));
  const mk = m => ga(m.g) + "|" + (m.path || []).join(" ");
  const lMarks = L.marks.map(m => Object.assign({}, m, { g: ga(m.g) })), goneMarks = lMarks.filter(m => !alive.has(m.g));
  syncMergeList(lMarks.filter(m => alive.has(m.g)), rMarks.map(m => Object.assign({}, m, { g: ga(m.g) })).filter(m => alive.has(m.g)), tomb, mk, res.marks);
  goneMarks.forEach(m => res.marks.del.push(m.uid));
  if (rMarks.some(m => !alive.has(ga(m.g)))) res.marks.write = true;
  // Progreso y ajustes
  const Lls = L.ls || {}, Rls = isObj(R.ls) ? R.ls : {};
  for (const [k, def] of Object.entries(SYNC_LS)) {
    const a = Lls[k], b = Rls[k], okType = v => (def.obj ? isObj(v) : Array.isArray(v));
    let m;
    if (!okType(b)) m = a;
    else if (!okType(a)) m = def.merge(def.obj ? {} : [], b, tomb);
    else m = def.merge(a, b, tomb);
    if (m === undefined) continue;
    const cm = canon(m);
    if (cm !== canon(a === undefined ? null : a)) res.ls[k] = m;
    if (cm !== canon(b === undefined ? null : b)) res.write = true;
  }
  if (canon(tomb) !== canon(isObj(R.tomb) ? R.tomb : {})) res.write = true;
  res.tombChanged = canon(tomb) !== canon(L.tomb || {});
  res.write = res.write || res.games.write || res.marks.write;
  return res;
}

/* Todas las partidas y marcadores necesitan un «uid» estable (el mismo en todos los dispositivos para lo que ya existía) */
async function syncEnsureUids() {
  for (const store of ["games", "marks"]) {
    const fix = [...Lib[store].values()].filter(r => !r.uid);
    if (!fix.length) continue;
    const used = new Set([...Lib[store].values()].map(r => r.uid).filter(Boolean));
    for (const r of fix) {
      const base = store === "games" ? "g" + strHash(r.sig + "|" + (r.created || 0)) : "m" + strHash(((Lib.games.get(r.gameId) || {}).uid || "") + "|" + (r.path || []).join(" ") + "|" + (r.created || 0));
      let uid = base, n = 1;
      while (used.has(uid)) uid = base + "-" + n++;
      used.add(uid);
      r.uid = uid;
      r._m = r._m || r.updated || r.created || 1;
    }
    for (let k = 0; k < fix.length; k += 250) await DB.putMany(store, fix.slice(k, k + 250), { raw: true });
  }
}

/* Aplica aquí lo que trae otra versión de los datos (el archivo vinculado o una copia de seguridad) */
async function syncApply(R, opts = {}) {
  await syncEnsureUids();
  const res = syncMerge(syncPayload(), R, opts);
  const stats = { added: 0, updated: 0, deleted: 0, marks: 0, progress: 0 };
  // Partidas
  const gid = new Map([...Lib.games.values()].map(r => [r.uid, r.id]));
  const gPuts = res.games.put.map(p => { const c = Object.assign({}, p.rec); if (p.from != null) c.id = gid.get(p.from); if (p.from == null) stats.added++; else if (!p.same) stats.updated++; return c; });
  for (let k = 0; k < gPuts.length; k += 250) await DB.putMany("games", gPuts.slice(k, k + 250), { raw: true });
  gPuts.forEach(c => Lib.games.set(c.id, c));
  const gDel = res.games.del.map(u => gid.get(u)).filter(id => id != null);
  await DB.delMany("games", gDel, { raw: true });
  gDel.forEach(id => { Lib.games.delete(id); Lib.sel.delete(id); });
  stats.deleted = gDel.length;
  // Marcadores
  const gid2 = new Map([...Lib.games.values()].map(r => [r.uid, r.id])), mid = new Map([...Lib.marks.values()].map(m => [m.uid, m.id]));
  const mPuts = [];
  for (const p of res.marks.put) {
    const c = Object.assign({}, p.rec, { gameId: gid2.get(p.rec.g) });
    delete c.g;
    if (c.gameId == null) continue;
    if (p.from != null) c.id = mid.get(p.from);
    mPuts.push(c);
  }
  if (mPuts.length) await DB.putMany("marks", mPuts, { raw: true });
  mPuts.forEach(c => Lib.marks.set(c.id, c));
  const mDel = res.marks.del.map(u => mid.get(u)).filter(id => id != null);
  await DB.delMany("marks", mDel, { raw: true });
  mDel.forEach(id => Lib.marks.delete(id));
  stats.marks = mPuts.length + mDel.length;
  // Progreso y ajustes
  for (const [k, v] of Object.entries(res.ls)) {
    if (k === "ajedrezSettings") { Object.assign(settings, v); LS.set(k, settings, true); }
    else LS.set(k, v, true);
    stats.progress++;
  }
  if (res.tombChanged) syncSaveTombs(res.tomb);
  // La pantalla se pone al día sin recargar
  LocalIdx = null;
  if (ui.libId && !Lib.games.has(ui.libId)) { ui.libId = null; toast("⚠ La partida del tablero se ha borrado en otro dispositivo.", 5000); }
  else if (ui.libId && ui.recUpdated && Lib.games.get(ui.libId).updated > ui.recUpdated) toast("⚠ Esta partida se ha modificado en otro dispositivo. Vuelve a abrirla desde la biblioteca para ver esos cambios.", 6000);
  if (stats.added || stats.updated || stats.deleted || stats.marks) { try { refreshLibraryViews(); renderMoves(); } catch (e) { console.warn(e); } }
  if (stats.progress) syncRefreshProgress(res.ls);
  return { write: res.write, stats };
}
function syncRefreshProgress(changed) {
  try {
    if (changed.ajedrezSettings) {
      $("pieceStyleSelect").value = settings.pieceStyle; $("displayLang").value = settings.lang; $("themeSelect").value = settings.theme;
      document.body.dataset.theme = settings.theme;
      applyUiTheme(); buildEditorPalettes(); render();
    }
    if (changed.ajedrezCursosPropios) {
      const list = changed.ajedrezCursosPropios, ids = new Set(list.map(c => c.id));
      for (let i = COURSES.length - 1; i >= 0; i--) if (COURSES[i].user && !ids.has(COURSES[i].id)) { delete COURSE_PGN[COURSES[i].id]; delete courseCache[COURSES[i].id]; COURSES.splice(i, 1); }
      list.forEach(registerUserCourse);
    }
    renderCourses();
    renderToday();
  } catch (e) { console.warn("Sincronización: no se pudo refrescar la pantalla:", e); }
}
function syncStatsText(s) {
  const p = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  return [s.added && p(s.added, "partida nueva", "partidas nuevas"), s.updated && p(s.updated, "actualizada", "actualizadas"), s.deleted && p(s.deleted, "borrada", "borradas"),
    s.marks && p(s.marks, "marcador", "marcadores"), s.progress && "progreso y ajustes"].filter(Boolean).join(", ");
}

/* --- El archivo vinculado --- */
const SyncStore = {
  _db() {
    return new Promise((res, rej) => {
      const req = indexedDB.open("ajedrezbase-sync", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async get(k) { try { const db = await this._db(); return await new Promise((res, rej) => { const r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch { return undefined; } },
  async set(k, v) { try { const db = await this._db(); await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); if (v === undefined) t.objectStore("kv").delete(k); else t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); } catch (e) { console.warn("Sincronización: no se pudo recordar el archivo:", e); } }
};
function syncTouch() {
  if (syncState !== "ok") return;
  syncDirty = true;
  if (syncBusy) { syncAgain = true; return; }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 2500);
  renderSync();
}
async function syncNow(opts = {}) {
  if (!syncHandle || syncState !== "ok" || !Lib.ready) return false;
  if (syncBusy) { syncAgain = true; return false; }
  syncBusy = true;
  clearTimeout(syncTimer); syncTimer = null;
  renderSync();
  let stats = null, ok = false;
  try {
    await syncEnsureUids();
    const f = await syncHandle.getFile();
    let write = syncDirty;
    syncDirty = false;
    if (f.lastModified !== syncSeen || opts.force) {
      const txt = await f.text();
      if (txt.trim()) {
        let R = null;
        try { R = JSON.parse(txt); } catch {}
        if (!R || R.app !== "AjedrezBase" || !R.sync || !Array.isArray(R.games)) throw Error("«" + syncHandle.name + "» no es un archivo de sincronización de AjedrezBase (no se ha tocado)");
        const res = await syncApply(R);
        write = write || res.write;
        stats = res.stats;
      } else write = true;
      syncSeen = f.lastModified;
    }
    if (write) {
      const w = await syncHandle.createWritable();
      await w.write(JSON.stringify(syncPayload()));
      await w.close();
      syncSeen = (await syncHandle.getFile()).lastModified;
    }
    syncErr = ""; syncLast = Date.now(); ok = true;
  } catch (e) {
    syncDirty = true;
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) syncState = "perm";
    else syncErr = (e && e.message) || String(e);
  }
  syncBusy = false;
  renderSync();
  if (stats) { const t = syncStatsText(stats); if (t) toast("🔄 Sincronizado: " + t + ".", 4500); }
  if (syncAgain) { syncAgain = false; if (ok) syncTouch(); }
  return ok;
}
/* ¿Lo ha cambiado otro dispositivo? (mirar la fecha del archivo es barato) */
async function syncCheck() {
  if (!syncHandle || syncState !== "ok" || syncBusy || !Lib.ready) return;
  try { if ((await syncHandle.getFile()).lastModified !== syncSeen || syncErr) await syncNow(); }
  catch (e) { if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) { syncState = "perm"; renderSync(); } }
}
async function syncUse(h) {
  syncHandle = h; syncState = "ok"; syncSeen = 0; syncErr = ""; syncDirty = true;
  await SyncStore.set("handle", h);
  return syncNow({ force: true });
}
async function syncLinkNew() {
  let h;
  try { h = await window.showSaveFilePicker({ suggestedName: "ajedrezbase-sync.json", types: SYNC_TYPES }); }
  catch (e) { if (e.name !== "AbortError") toast("No se pudo crear el archivo: " + e.message, 5000); return; }
  if (await syncUse(h)) toast(`🔗 Vinculado a «${h.name}»: cada cambio se guardará ahí solo.`, 4500);
}
async function syncLinkOpen() {
  let h;
  try { [h] = await window.showOpenFilePicker({ types: SYNC_TYPES, multiple: false }); }
  catch (e) { if (e.name !== "AbortError") toast("No se pudo abrir el archivo: " + e.message, 5000); return; }
  let perm = "denied";
  try { perm = await h.requestPermission({ mode: "readwrite" }); } catch {}
  if (perm !== "granted") { toast("Sin permiso de escritura no se puede vincular el archivo.", 4500); return; }
  if (await syncUse(h)) toast(`🔗 Vinculado a «${h.name}»: lo de este dispositivo y lo del archivo se han combinado.`, 5000);
}
async function syncReconnect() {
  if (!syncHandle) return;
  let perm = "denied";
  try { perm = await syncHandle.requestPermission({ mode: "readwrite" }); } catch {}
  if (perm !== "granted") { toast("El navegador no ha dado permiso para usar el archivo.", 4000); return; }
  syncState = "ok"; syncDirty = true;
  await syncNow({ force: true });
}
async function syncUnlink() {
  if (!syncHandle || !confirm(`¿Dejar de sincronizar con «${syncHandle.name}»?\n\nEl archivo sigue donde está y tus datos siguen en este navegador.`)) return;
  syncHandle = null; syncState = "none"; syncErr = ""; clearTimeout(syncTimer); syncTimer = null;
  renderSync();
  await SyncStore.set("handle", undefined);
  toast("Archivo desvinculado.");
}
function renderSync() {
  const st = $("syncStatus"), btns = $("syncBtns"), chip = $("syncChip");
  if (!st) return;
  const name = syncHandle ? esc(syncHandle.name) : "";
  let txt, html, ico = "", tip = "";
  if (syncState === "unsupported") {
    txt = "Este navegador no puede vincular un archivo (sí pueden Chrome y Edge, en ordenador y en Android). Aquí puedes pasar tus datos a mano con <b>⬇ Copia de seguridad</b> y <b>⬆ Restaurar copia</b>, en la pestaña Biblioteca: la copia lleva también el progreso y los ajustes, y al restaurarla se combina con lo que ya tengas.";
    html = "";
  } else if (syncState === "none") {
    txt = "⚪ Sin archivo vinculado: tus datos sólo están en este navegador.";
    html = '<button class="sm-btn primary" data-sync="new">🔗 Crear archivo nuevo</button><button class="sm-btn" data-sync="open">📂 Usar un archivo que ya existe</button>';
  } else if (syncState === "perm") {
    txt = `🟡 El navegador necesita que vuelvas a autorizar «${name}».`;
    html = '<button class="sm-btn primary" data-sync="reconnect">Reconectar</button><button class="sm-btn" data-sync="unlink">Desvincular</button>';
    ico = "⚠"; tip = "Sincronización en pausa: pulsa para volver a autorizar el archivo";
  } else {
    if (syncErr) { txt = `🔴 No se pudo sincronizar con «${name}»: ${esc(syncErr)}.`; ico = "⚠"; tip = "No se pudo sincronizar: pulsa para reintentarlo"; }
    else if (syncBusy) { txt = `🔄 Sincronizando con «${name}»…`; ico = "🔄"; tip = "Sincronizando…"; }
    else if (syncDirty || syncTimer) { txt = `⏳ Cambios pendientes de guardar en «${name}»…`; ico = "⏳"; tip = "Guardando los cambios en el archivo de sincronización…"; }
    else { txt = `🟢 Al día con «${name}»${syncLast ? " · última vez a las " + new Date(syncLast).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}.`; ico = "☁"; tip = `Sincronizado con «${syncHandle ? syncHandle.name : ""}». Pulsa para sincronizar ahora`; }
    html = '<button class="sm-btn info-btn" data-sync="now">🔄 Sincronizar ahora</button><button class="sm-btn" data-sync="unlink">Desvincular</button>';
  }
  st.innerHTML = txt;
  st.dataset.state = syncState === "ok" ? (syncErr ? "error" : syncBusy ? "busy" : syncDirty || syncTimer ? "pending" : "ok") : syncState;
  if (btns.dataset.html !== html) { btns.innerHTML = html; btns.dataset.html = html; }
  chip.hidden = !ico;
  chip.classList.toggle("quiet", ico !== "⚠");   // en el móvil sólo se enseña si hace falta tu atención
  chip.textContent = ico;
  chip.title = tip;
  chip.setAttribute("aria-label", tip);
}
$("syncBtns").onclick = e => {
  const b = e.target.closest("[data-sync]");
  if (!b) return;
  ({ new: syncLinkNew, open: syncLinkOpen, reconnect: syncReconnect, unlink: syncUnlink, now: () => syncNow({ force: true }) })[b.dataset.sync]();
};
$("syncChip").onclick = () => { if (syncState === "perm") syncReconnect(); else syncNow({ force: true }); };
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (syncTimer) syncNow(); } else syncCheck(); });
setInterval(() => { if (!document.hidden) syncCheck(); }, 60000);

async function initSync() {
  try { await syncEnsureUids(); } catch (e) { console.warn("Sincronización: identificadores:", e); }
  if (!SYNC_OK) { syncState = "unsupported"; renderSync(); return; }
  const h = await SyncStore.get("handle");
  if (h && typeof h.getFile === "function") {
    syncHandle = h;
    let perm = "prompt";
    try { perm = await h.queryPermission({ mode: "readwrite" }); } catch {}
    syncState = perm === "granted" ? "ok" : "perm";
    if (syncState === "ok") syncNow();
  }
  renderSync();
}
