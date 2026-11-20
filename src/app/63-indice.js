/* ---------- B13b. Índice de posiciones de tus partidas (biblioteca y .pgn abierto) ----------
   Antes, el explorador de tus partidas, «Buscar posición», las partidas modelo del profesor IA y el rival humano
   volvían a leer y comprobar TODAS las partidas cada vez (unos 2,5 ms por partida: 13 s con 5.000).
   Ahora cada partida se lee una sola vez, en segundo plano (un Web Worker con core.js y pgn.js, como el motor
   interno), y se guarda un resumen compacto de su línea principal: una huella numérica de cada posición, de su
   estructura de peones y de su material, y las jugadas. Todo lo demás consulta ese índice.
   Las partidas de la biblioteca se identifican por id y fecha de modificación (si cambian, se vuelven a leer);
   las del .pgn abierto, por el propio objeto (al cerrar el fichero, su índice desaparece solo). */
const GIdx = { lib: new Map(), coll: new WeakMap(), workers: null, broken: false, seq: 0, waiting: new Map(), building: null };

/* Huellas: la de la posición es la de Zobrist de core.js; la de los peones y la del material, de su texto */
function gidxStrHash(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519) + 7; }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
}
function gidxPawnHash(s) {
  let w = "", b = "";
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (s.b[i] === "P") w += i + ","; else if (s.b[i] === "p") b += i + ","; }
  return gidxStrHash(w + "|" + b);
}
function gidxMatHash(s) {
  const cnt = {};
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (p !== "." && p.toLowerCase() !== "k") cnt[p] = (cnt[p] || 0) + 1; }
  return gidxStrHash("QRBNPqrbnp".split("").map(p => p + (cnt[p] || 0)).join(""));
}
/* Lee una partida y resume su línea principal (se ejecuta en el worker o, si no hay, aquí mismo) */
function gidxGame(g, lang) {
  const r = Pgn.parseGame(g, { lang });
  const root = r.game.root, k = [], pw = [], mt = [], st = [], u = [], sn = [];
  for (let n = root; ; n = n.children[0]) {
    k.push(Chess.hash(n.state)); pw.push(gidxPawnHash(n.state)); mt.push(gidxMatHash(n.state)); st.push(pawnStruct(n.state.b));
    if (!n.children.length) break;
    u.push(n.children[0].uci); sn.push(n.children[0].san);
  }
  const fen = Chess.toFen(root.state);
  return { k: Float64Array.from(k), pw: Float64Array.from(pw), mt: Float64Array.from(mt), st: Uint8Array.from(st), u: u.join(" "), sn: sn.join(" "), fen: fen === Chess.START_FEN ? "" : fen };
}
/* Varios workers a la vez (según los núcleos del dispositivo) para que la primera vez tarde menos */
function gidxWorkers() {
  if (GIdx.workers || GIdx.broken) return GIdx.workers || [];
  GIdx.workers = [];
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  try {
    const src = [$("coreLib").textContent, $("pgnLib").textContent, gidxStrHash, gidxPawnHash, gidxMatHash, pawnStruct, gidxGame].map(String).join("\n") +
      `\nself.onmessage = e => { const { id, items } = e.data; const out = items.map(it => { try { return gidxGame(it.g, it.lang); } catch (err) { return null; } });
        self.postMessage({ id, out }, out.filter(Boolean).flatMap(o => [o.k.buffer, o.pw.buffer, o.mt.buffer, o.st.buffer])); };`;
    const url = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.onmessage = e => { const f = GIdx.waiting.get(e.data.id); if (f) { GIdx.waiting.delete(e.data.id); f(e.data.out); } };
      w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); GIdx.broken = true; GIdx.workers = null; for (const f of GIdx.waiting.values()) f(null); GIdx.waiting.clear(); };
      GIdx.workers.push(w);
    }
  } catch { GIdx.broken = true; GIdx.workers = null; }
  return GIdx.workers || [];
}
async function gidxRun(items, slot = 0) {
  const ws = gidxWorkers();
  if (ws.length) {
    const w = ws[slot % ws.length];
    const out = await new Promise(res => { const id = ++GIdx.seq; GIdx.waiting.set(id, res); w.postMessage({ id, items }); });
    if (out) return out;
  }
  // Sin worker (o si falla): aquí mismo, dejando respirar a la página
  const out = [];
  for (let i = 0; i < items.length; i++) {
    try { out.push(gidxGame(items[i].g, items[i].lang)); } catch { out.push(null); }
    if (i % 20 === 19) await new Promise(r => setTimeout(r, 0));
  }
  return out;
}
const gidxLibKey = rec => `${rec.id}:${rec.updated || 0}`;
function gidxHeaders(src) {
  if (src.coll != null) return (Coll.games[src.coll] && Coll.games[src.coll].headers) || {};
  const rec = Lib.games.get(src.lib);
  if (!rec) return {};
  if (rec.white !== undefined) return { White: rec.white, Black: rec.black, Result: rec.result, Date: rec.date, Event: rec.event, Site: rec.site, ECO: rec.eco, WhiteElo: rec.whiteElo, BlackElo: rec.blackElo };
  try { return Pgn.splitGames(rec.pgn)[0].headers; } catch { return {}; }
}
/* Todas las partidas indexadas: [{ src: { lib } | { coll }, e }]. Lee en segundo plano sólo las que faltan */
async function gameIndex(onProgress, opts = {}) {
  while (GIdx.building) await GIdx.building;
  const recs = Lib.ready ? [...Lib.games.values()].filter(r => opts.reps || !isRepRec(r)) : [];
  const todo = [];
  for (const r of recs) if (!GIdx.lib.has(gidxLibKey(r))) todo.push({ g: r.pgn, lang: "en", lib: r });
  Coll.games.forEach(g => { if (!GIdx.coll.has(g)) todo.push({ g, lang: "auto", coll: g }); });
  if (todo.length) {
    let finish = () => {};
    GIdx.building = new Promise(r => { finish = r; });
    try {
      // Tandas de 200 repartidas entre los workers: cada uno coge la siguiente cuando acaba la suya
      const B = 200, parts = [];
      for (let i = 0; i < todo.length; i += B) parts.push(todo.slice(i, i + B));
      let next = 0, done = 0;
      const lane = async slot => {
        while (next < parts.length) {
          const part = parts[next++];
          const out = await gidxRun(part.map(t => ({ g: t.g, lang: t.lang })), slot);
          part.forEach((t, j) => { const e = out[j] || { k: new Float64Array(0), pw: new Float64Array(0), mt: new Float64Array(0), st: new Uint8Array(0), u: "", sn: "", fen: "" }; if (t.lib) GIdx.lib.set(gidxLibKey(t.lib), e); else GIdx.coll.set(t.coll, e); });
          done += part.length;
          if (onProgress) onProgress(done, todo.length);
        }
      };
      const lanes = Math.max(1, Math.min(parts.length, gidxWorkers().length || 1));
      await Promise.all(Array.from({ length: lanes }, (_, i) => lane(i)));
      // Lo que ya no está en la biblioteca (borrado o modificado) sobra
      if (GIdx.lib.size > recs.length * 1.5 + 50) { const keep = new Set(recs.map(gidxLibKey)); for (const k of GIdx.lib.keys()) if (!keep.has(k)) GIdx.lib.delete(k); }
    } finally { GIdx.building = null; finish(); }
  }
  const out = [];
  for (const r of recs) { const e = GIdx.lib.get(gidxLibKey(r)); if (e && e.k.length) out.push({ src: { lib: r.id }, e }); }
  Coll.games.forEach((g, i) => { const e = GIdx.coll.get(g); if (e && e.k.length) out.push({ src: { coll: i }, e }); });
  return out;
}
/* Datos de una partida en un momento (ply) de su línea principal */
const gidxUcis = e => (e.u ? e.u.split(" ") : []);
const gidxSans = e => (e.sn ? e.sn.split(" ") : []);
function gidxStateAt(e, ply) {
  let s = Chess.parseFen(e.fen || Chess.START_FEN);
  const u = gidxUcis(e);
  for (let i = 0; i < ply && i < u.length; i++) { const m = Chess.moveFromUci(s, u[i]); if (!m) break; s = Chess.apply(s, m); }
  return s;
}
/* «tras 5...Cf6»: el texto de la jugada que lleva al momento ply */
function gidxLabel(e, ply) {
  if (!ply) return "posición inicial";
  const prev = gidxStateAt(e, ply - 1), u = gidxUcis(e)[ply - 1];
  return numPrefix(prev) + (() => { try { const L = Chess.legal(prev), m = Chess.moveFromUci(prev, u, L); return formatSan(Chess.san(prev, m, L), settings.lang, prev.t); } catch { return u; } })();
}
/* Se prepara por adelantado, cuando la página está desocupada: al abrir un .pgn y al cargar la biblioteca */
const gidxWarm = debounce(() => {
  const go = () => { gameIndex(null, { reps: true }).catch(() => {}); };
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
}, 1500);
