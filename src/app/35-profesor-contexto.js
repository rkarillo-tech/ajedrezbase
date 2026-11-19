/* ---------- 19d. 🤖 Profesor IA: contexto además del motor ----------
   Para que la IA pueda razonar como un entrenador (y no sólo traducir al motor) se le dan, como DATOS comprobados:
   · tu repertorio: si la posición está en tus líneas, qué tienes preparado o dónde te saliste de ellas;
   · el explorador: lo que juegan los maestros y los jugadores de Lichess (con tu token) y lo que hay en tus partidas;
   · partidas modelo: partidas de tu biblioteca, del .pgn que tengas abierto (puedes abrir la base que quieras) y de
     los cursos que pasan por esta posición o tienen la misma estructura de peones, con lo que se jugó después
     y los comentarios del curso.
   Nada de esto lo inventa la IA: todo sale de aquí y se le dice de dónde viene. Las jugadas recomendadas siguen
   siendo sólo las del motor; el resto lo puede citar atribuyéndolo («en tu repertorio», «los maestros juegan»…). */
const AI_CTX_COURSES = ["partidas", "planes", "estrategia", "aperturas", "trampas", "decisiones", "finales"];
const AICtx = { cache: new Map() };
const aiSan = (state, uci) => { const t = lineText(state, [uci], 1); return t.replace(/^\d+\.(\.\.)?/, ""); };
const aiClip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

/* Recorre todo el árbol (también las variantes) buscando la posición; devuelve el primer nodo con esa clave */
function aiFindInTree(root, key, limit = 30000) {
  const stack = [root];
  let seen = 0;
  while (stack.length && seen++ < limit) {
    const n = stack.pop();
    if (n.key === key) return n;
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return null;
}

/* 🗂 Repertorio: tus repertorios (biblioteca, etiqueta «repertorio») y, si no estás en ninguno, los del curso */
function aiRepertoireFacts(node) {
  let trees;
  try { trees = repertoireTrees(); } catch { return null; }
  if (!trees.length) return null;
  const mine = trees.filter(t => t.lib), course = trees.filter(t => !t.lib);
  const label = t => `${t.lib ? "tu repertorio" : "el repertorio del curso"} «${t.title}» (con ${t.side === 1 ? "blancas" : "negras"})`;
  const s = node.state;
  const describe = (t, hit) => {
    const ch = hit.children;
    if (!ch.length) return `La posición está en ${label(t)}, pero es el final de la línea preparada: a partir de aquí no hay nada en el repertorio.`;
    const moves = ch.map(c => aiSan(hit.state, c.uci));
    const note = ch[0].comment ? ` Comentario del repertorio a ${moves[0]}: «${aiClip(ch[0].comment, 220)}».` : "";
    return s.t === t.side
      ? `La posición está en ${label(t)}. Jugada preparada: ${moves[0]}${moves.length > 1 ? ` (alternativas preparadas: ${moves.slice(1).join(", ")})` : ""}.${note}`
      : `La posición está en ${label(t)}. Le toca al rival; respuestas suyas que tienes preparadas: ${moves.join(", ")}.${note}`;
  };
  const exactIn = pool => { for (const t of pool) { const hit = aiFindInTree(t.g.root, node.key); if (hit) return { text: describe(t, hit), source: `🗂 ${t.title}` }; } return null; };
  // Mandan tus repertorios: primero si la posición está en ellos, luego dónde te saliste y, sólo si no, los del curso
  const own = exactIn(mine);
  if (own) return own;
  const path = Pgn.pathTo(node);
  for (let i = path.length - 2; i >= 0 && i >= path.length - 41; i--) {
    const anc = path[i], next = path[i + 1];
    for (const t of mine) {
      const hit = aiFindInTree(t.g.root, anc.key);
      if (!hit || !hit.children.length) continue;
      const who = anc.state.t === t.side ? "Tú te saliste" : "El rival se salió";
      const prep = hit.children.map(c => aiSan(hit.state, c.uci)).join(" o ");
      return { text: `${who} de ${label(t)} en ${numPrefix(anc.state)}${aiSan(anc.state, next.uci)}: el repertorio tenía preparado ${prep}.`, source: `🗂 ${t.title}` };
    }
  }
  const fromCourse = exactIn(course);
  if (fromCourse) return fromCourse;
  return mine.length ? { text: "Esta posición no está en ninguno de tus repertorios.", source: "" } : null;
}

/* 🌍 Explorador: maestros (y Lichess online si los maestros no tienen partidas) con tu token; y tus partidas */
async function aiExplorerRaw(db, state) {
  const url = explorerUrl(db, Chess.toFen(state));
  if (explorerCache.has(url)) return explorerCache.get(url);
  const ask = (async () => {
    const res = await Lichess.fetch(url, { headers: authHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    explorerCache.set(url, data);
    return data;
  })().catch(() => null);
  // Sin esperar más de 6 s: si Lichess tarda o pide una pausa, la pregunta sigue sin estos datos
  return Promise.race([ask, new Promise(r => setTimeout(() => r(null), 6000))]);
}
function aiMovesLine(moves, total, color) {
  return moves.slice(0, 5).map(m => {
    const n = m.white + m.draws + m.black;
    return `${formatSan(m.san, settings.lang, color)} (${pct(n, total)} % de las partidas; ganan blancas ${pct(m.white, n)} %, tablas ${pct(m.draws, n)} %, ganan negras ${pct(m.black, n)} %)`;
  }).join("; ");
}
async function aiExplorerFacts(node) {
  const out = [], sources = [];
  const s = node.state;
  if (settings.aiCtxLichess && settings.token) {
    for (const db of ["masters", "lichess"]) {
      const d = await aiExplorerRaw(db, s);
      if (!d) continue;
      const total = d.white + d.draws + d.black;
      if (!total) continue;
      const name = db === "masters" ? "partidas de maestros" : "partidas de Lichess (1800-2500, blitz a clásicas)";
      const mv = d.moves || [];   // en SAN inglés: se pasan a la notación elegida
      out.push(`Explorador de Lichess, ${name}: ${total.toLocaleString("es")} partidas en esta posición${d.opening ? ` (${d.opening.eco} ${d.opening.name})` : ""}.` +
        (mv.length ? ` Lo más jugado: ${aiMovesLine(mv, total, s.t)}.` : ""));
      const top = (d.topGames || []).slice(0, 5).map(g => `${(g.white && g.white.name) || "?"} (${(g.white && g.white.rating) || "?"}) – ${(g.black && g.black.name) || "?"} (${(g.black && g.black.rating) || "?"}), ${g.year || ""}, ${g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "½-½"}`);
      if (top.length) out.push(`Partidas destacadas que pasan por aquí: ${top.join("; ")}.`);
      sources.push(db === "masters" ? `🌍 maestros (${total.toLocaleString("es")})` : `🌍 Lichess (${total.toLocaleString("es")})`);
      if (db === "masters" && total >= 20) break;   // con bastantes partidas de maestros no hace falta la base online
    }
  }
  if (settings.aiCtxGames && (Lib.games.size || Coll.games.length)) {
    try {
      const e = (await localMoveIndex()).get(Chess.hash(node.state));
      const moves = e ? [...e.values()].sort((a, b) => b.n - a.n) : [];
      const total = moves.reduce((a, m) => a + m.n, 0);
      if (total) {
        out.push(`En las partidas de tu biblioteca y del .pgn abierto: ${total} partida${total === 1 ? " pasa" : "s pasan"} por aquí. Lo más jugado: ${aiMovesLine(moves, total, s.t)}.`);
        sources.push(`📚 tus partidas (${total})`);
      }
    } catch {}
  }
  return { text: out.join("\n"), sources };
}

/* ♟ Partidas modelo: la misma posición (y, si hay pocas, la misma estructura de peones) */
async function aiModelGames(node) {
  const s = node.state, key = node.key, pk = pawnKey(s);
  const ply = Pgn.pathTo(node).length - 1;
  const usePawns = ply >= 12 && pk !== "|";   // en la apertura la estructura de peones se repite demasiado
  const sig = `${key}|${settings.aiCtxGames}|${Lib.games.size}|${Coll.games.length}|${ui.libId}`;
  if (AICtx.cache.has(sig)) return AICtx.cache.get(sig);
  const exact = [], pawns = [];
  const item = (src, h, kind, label, after, comment, path) => Object.assign({
    kind, h, path,
    title: src.course ? `${(COURSES.find(c => c.id === src.course) || {}).name || "Curso"} · ${h.Title || "Lección"}` : `${h.White || "?"} – ${h.Black || "?"}`,
    where: src.lib != null ? "tu biblioteca" : src.coll != null ? "el .pgn abierto" : "los cursos",
    label, after, comment: comment ? aiClip(comment, 260) : ""
  }, src);
  // 1. Tus partidas y el .pgn abierto: con el índice (instantáneo una vez preparado)
  if (settings.aiCtxGames && (Lib.games.size || Coll.games.length)) {
    const H = Chess.hash(s), P = usePawns ? gidxPawnHash(s) : null;
    for (const { src, e } of await gameIndex()) {
      if (src.lib != null && src.lib === ui.libId) continue;
      let at = -1, kind = "";
      for (let i = 0; i < e.k.length; i++) if (e.k[i] === H) { at = i; kind = "exact"; break; }
      if (at < 0 && P != null && pawns.length < 6) for (let i = 10; i < e.pw.length; i++) if (e.pw[i] === P) { at = i; kind = "pawns"; break; }
      if (at < 0) continue;
      const u = gidxUcis(e), st = gidxStateAt(e, at);
      const it = item(src, gidxHeaders(src), kind, gidxLabel(e, at), lineText(st, u.slice(at, at + 10), 10), "", u.slice(0, at));
      it.afterLine = { state: st, ucis: u.slice(at, at + 10) };
      (kind === "exact" ? exact : pawns).push(it);
      if (exact.length >= 12) break;
    }
  }
  // 2. Los cursos: se recorren también las variantes, que es donde están muchas ideas comentadas
  for (const id of AI_CTX_COURSES) {
    const ls = courseLessons(id);
    for (let i = 0; i < ls.length; i++) {
      let g;
      try { g = Pgn.parseGame(ls[i].g, { lang: "en" }).game; } catch { continue; }
      const hit = aiFindInTree(g.root, key, 4000);
      if (!hit) continue;
      const after = [];
      let m = hit;
      for (let j = 0; j < 10 && m.children.length; j++) { m = m.children[0]; after.push(m.uci); }
      let comment = "";
      for (let j = 0, c = hit; j < 4 && c; j++, c = c.children[0]) if (c.comment && c.comment.trim().length > 12) { comment = c.comment; break; }
      const ci = item({ course: id, i }, g.headers, "exact", hit.parent ? `${numPrefix(hit.parent.state)}${aiSan(hit.parent.state, hit.uci)}` : "el inicio",
        after.length ? lineText(hit.state, after, 10) : "", comment, Pgn.pathTo(hit).slice(1).map(x => x.uci));
      ci.afterLine = { state: hit.state, ucis: after };
      exact.push(ci);
    }
  }
  // Primero las comentadas de los cursos y las de verdad con Elo; como mucho cinco
  const rank = x => (x.course ? 0 : 1) + (x.comment ? 1 : 0) + (x.h.WhiteElo ? 1 : 0);
  const games = exact.sort((a, b) => rank(b) - rank(a)).slice(0, 5);
  if (games.length < 3) games.push(...pawns.slice(0, 3 - games.length));
  const out = { games, partial: false };
  AICtx.cache.set(sig, out);
  if (AICtx.cache.size > 60) AICtx.cache.delete(AICtx.cache.keys().next().value);
  return out;
}
function aiModelGamesText(mg) {
  if (!mg.games.length) return "";
  const de = w => (w.startsWith("el ") ? "del " + w.slice(3) : "de " + w);
  return "Partidas modelo (" + [...new Set(mg.games.map(g => de(g.where)))].join(", ") + "):\n" + mg.games.map((g, i) => {
    const h = g.h, meta = [h.Result && h.Result !== "*" ? h.Result : "", (h.Date || "").slice(0, 4).replace(/\?+/, ""), h.Event && !["?", "Estudio"].includes(h.Event) && !g.course ? h.Event : ""].filter(Boolean).join(", ");
    return `${i + 1}. ${g.title}${meta ? ` (${meta})` : ""}, ${de(g.where)}: ${g.kind === "exact" ? `llega a esta misma posición tras ${g.label}` : `misma estructura de peones (otra posición), tras ${g.label}`}.` +
      (g.after ? ` Después se jugó: ${g.after}.` : "") + (g.comment ? ` Comentario: «${g.comment}».` : "");
  }).join("\n");
}

/* Junta todo el contexto; cada parte puede faltar sin que falle la pregunta */
async function aiContext(node) {
  const parts = [], sources = [];
  let games = [];
  const oa = settings.aiCtxModels ? openingArticleText(node) : "";
  if (oa) { parts.push(oa); sources.push("📖 apertura explicada"); }
  if (settings.aiCtxRep) {
    const r = aiRepertoireFacts(node);
    if (r) { parts.push("Repertorio: " + r.text); if (r.source) sources.push(r.source); }
  }
  const [ex, mg] = await Promise.all([
    aiExplorerFacts(node).catch(() => ({ text: "", sources: [] })),
    settings.aiCtxModels ? aiModelGames(node).catch(() => ({ games: [] })) : Promise.resolve({ games: [] })
  ]);
  if (ex.text) { parts.push(ex.text); sources.push(...ex.sources); }
  const mt = aiModelGamesText(mg);
  if (mt) { parts.push(mt); games = mg.games; sources.push(`♟ ${mg.games.length} partida${mg.games.length === 1 ? "" : "s"} modelo`); }
  return { text: parts.join("\n"), sources, games };
}

/* Abre una partida modelo en el momento en que llega a la posición */
function aiOpenModel(g) {
  if (g.lib != null) { if (openLibGame(g.lib, g.path)) switchTab("study"); return; }
  if (g.coll != null) { loadCollGame(g.coll); if (Coll.games[g.coll]) goTo(resolvePath(game.root, g.path)); return; }
  const idx = COURSES.findIndex(c => c.id === g.course);
  if (idx < 0) return;
  switchTab("courses");
  if (openLesson(g.course, g.i)) goTo(resolvePath(game.root, g.path));
}

/* Casillas «Usar como contexto» del recuadro del profesor */
function syncAiCtxForm() {
  for (const [id, k] of [["aiPropose", "aiPropose"], ["aiCtxRep", "aiCtxRep"], ["aiCtxModels", "aiCtxModels"], ["aiCtxGames", "aiCtxGames"], ["aiCtxLichess", "aiCtxLichess"]]) if ($(id)) $(id).checked = !!settings[k];
  if ($("aiCtxLichessNote")) $("aiCtxLichessNote").hidden = !settings.aiCtxLichess || !!settings.token;
}
for (const id of ["aiPropose", "aiCtxRep", "aiCtxModels", "aiCtxGames", "aiCtxLichess"]) {
  $(id).onchange = e => { settings[id] = e.target.checked; saveSettings(); AICtx.cache.clear(); syncAiCtxForm(); };
}
syncAiCtxForm();
