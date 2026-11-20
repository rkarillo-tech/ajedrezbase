/* ---------- 19e. 🧪 Profesor IA: la IA propone sus propias jugadas y Stockfish las comprueba ----------
   1. La IA piensa la posición SIN ver al motor (sólo la posición, la partida y el contexto) y propone hasta tres
      líneas con su idea, en JSON.
   2. Aquí se comprueba cada jugada con las reglas (las ilegales se descartan) y Stockfish valora la primera jugada
      de cada línea frente a la mejor, la posición al final de la línea y, si falla, cuál es la refutación.
   3. La respuesta final se escribe con esas propuestas ya juzgadas: sólo puede recomendar las buenas o jugables, y
      de las malas puede explicar por qué fallan (enseña mucho).
   4. Por último, cualquier jugada que aparezca en la respuesta y que no venga de algo comprobado (motor, propuestas
      comprobadas o contexto) se marca con ⚠: nunca se presenta como buena una jugada que nadie ha comprobado. */
const AI_VERDICT = {
  buena: { icon: "✔", label: "buena", cls: "ok" },
  jugable: { icon: "≈", label: "jugable", cls: "meh" },
  dudosa: { icon: "?!", label: "dudosa", cls: "warn" },
  error: { icon: "✗", label: "error", cls: "bad" },
  ilegal: { icon: "⛔", label: "ilegal", cls: "bad" }
};

function aiProposeSystem(side) {
  return `Eres un entrenador de ajedrez fuerte que hace de tutor. Piensa la posición por tu cuenta (no tienes motor de análisis), como lo haría un buen profesor delante del tablero: mira primero las amenazas, las piezas sueltas y los jaques, y después el plan. Propón las jugadas que tú jugarías o enseñarías para responder a la pregunta del alumno, cada una con su porqué; un motor las comprobará después.
Responde SÓLO con JSON, sin ningún texto alrededor, con este formato exacto:
{"lineas":[{"jugadas":"Cf3 Cc6 Ab5","idea":"desarrollar y presionar e5"}]}
Reglas:
- De 1 a 3 líneas distintas, cada una de 1 a 6 medias jugadas, empezando por una jugada de las ${side}.
- Jugadas en notación algebraica española (R rey, D dama, T torre, A alfil, C caballo), separadas por espacios y sin números de jugada.
- "idea": la idea de la línea y su porqué en menos de 25 palabras.`;
}
/* Saca las líneas del JSON aunque venga entre ```json, con texto alrededor o con razonamiento <think> */
function aiParseProposals(text) {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return [];
  let data;
  try { data = JSON.parse(t.slice(a, b + 1)); } catch { return []; }
  const list = Array.isArray(data) ? data : data.lineas || data.lines || data.candidatas || [];
  return list.map(x => typeof x === "string" ? { jugadas: x, idea: "" } : { jugadas: String(x.jugadas || x.moves || x.linea || ""), idea: String(x.idea || x.plan || "") })
    .filter(x => x.jugadas.trim()).slice(0, 3);
}
async function aiPropose(node, ctx, question) {
  const side = node.state.t === 1 ? "blancas" : "negras";
  // Consulta interna y rápida: sólo unas pocas líneas en JSON (con un límite de longitud) y del contexto lo más útil
  // (repertorio y apertura); la explicación larga es la de la respuesta final
  const ctxShort = ctx && ctx.text ? ctx.text.split("\n").filter(l => /^(Repertorio|Apertura explicada)/.test(l)).map(l => aiClip(l, 400)).join("\n") : "";
  const user = `${aiPositionText(node)}${ctxShort ? "\n\nContexto (datos comprobados):\n" + ctxShort : ""}\n\nPregunta del alumno: ${question}`;
  return aiParseProposals(await aiCall(aiProposeSystem(side), user, { maxTokens: 450 }));
}

/* Valoración desde el punto de vista del que mueve en `state` (0-100) */
const aiWinFor = (ev, color) => (color === 1 ? winPct(ev) : 100 - winPct(ev));
const aiEv = l => (l ? { cp: l.cp, mate: l.mate, winner: l.winner } : null);
async function aiVerify(node, props, engineLines) {
  const s0 = node.state, me = s0.t, strong = Engine.kind === "stockfish";
  // Si el motor no tenía aún las líneas de la posición (se estaba cargando), se calculan ahora
  if (!engineLines.length && Engine.ready) {
    const r = await evalState(s0, strong ? 1600 : 2000, 1);
    engineLines = ((r && r.lines) || []).filter(l => l && l.pv && l.pv.length);
  }
  const best = aiEv(engineLines[0]);
  const out = [], seen = new Set();
  for (const p of props) {
    const toks = p.jugadas.replace(/…/g, "...").split(/\s+/).map(x => x.replace(/^\d+\.+/, "")).filter(x => x && !/^\d+\.*$/.test(x) && !/^(1-0|0-1|½-½|1\/2-1\/2|\*)$/.test(x));
    const ucis = [];
    let s = s0, bad = null;
    for (const tk of toks.slice(0, 8)) {
      try { const { move } = Chess.parseMove(s, tk, "auto"); ucis.push(Chess.uci(move)); s = Chess.apply(s, move); }
      catch { bad = tk; break; }
    }
    const item = { raw: p.jugadas, idea: aiClip(p.idea, 120), ucis, bad, state0: s0 };
    if (!ucis.length) { item.status = "ilegal"; out.push(item); continue; }
    if (seen.has(ucis.join(" "))) continue;
    seen.add(ucis.join(" "));
    item.text = lineText(s0, ucis, 8);
    // La primera jugada: si es una de las líneas del motor, se usa ESA búsqueda (sin ruido de comparar dos distintas)
    const same = engineLines.find(l => l.pv[0] === ucis[0]);
    const s1 = Chess.apply(s0, Chess.moveFromUci(s0, ucis[0]));
    let after = aiEv(same), reply = null;
    if (!after && Engine.ready) {
      const r = await evalState(s1, strong ? 1200 : 1500, 1);
      const l = r && r.lines && r.lines[0];
      after = aiEv(l);
      reply = l && l.pv && l.pv.length ? l.pv : null;
    }
    if (best && after) {
      item.loss = Math.max(0, aiWinFor(best, me) - aiWinFor(after, me));
      item.after = after;
      item.status = item.loss < 3 ? "buena" : item.loss < 8 ? "jugable" : item.loss < 15 ? "dudosa" : "error";
      if (item.loss >= 8 && reply) item.refutation = { state: s1, pv: reply.slice(0, 4), text: lineText(s1, reply, 4) };
    } else item.status = "sin-motor";
    if (ucis.length > 1 && Engine.ready && item.status !== "error") {
      const r = await evalState(s, strong ? 800 : 1000, 1);
      item.end = aiEv(r && r.lines && r.lines[0]);
    }
    out.push(item);
  }
  return out;
}
function aiProposalsText(list) {
  if (!list.length) return "";
  const eng = Engine.name || "el motor";
  return `Tus propuestas (las pensaste sin motor), comprobadas por ${eng}:\n` + list.map((p, i) => {
    if (p.status === "ilegal") return `${i + 1}. «${p.raw}»: ILEGAL, descartada (no es una jugada legal en esta posición). No la menciones como jugada.`;
    const v = p.status === "sin-motor" ? "SIN COMPROBAR (no hay motor)" : p.status.toUpperCase();
    return `${i + 1}. ${p.text}${p.idea ? ` (tu idea: ${p.idea})` : ""}: ${v}` +
      (p.loss != null ? ` — tras la primera jugada la valoración es ${fmtEval(p.after)}, pierde ${Math.round(p.loss)} puntos de probabilidad de ganar respecto a la mejor del motor` : "") +
      (p.bad ? `; la línea se corta antes de «${p.bad}», que no es legal` : "") +
      (p.end ? `; al final de la línea: ${fmtEval(p.end)}` : "") +
      (p.refutation ? `; la refutación del motor: ${p.refutation.text}` : "") + ".";
  }).join("\n");
}
function aiProposalsHtml(list) {
  if (!list.length) return "";
  return `<div class="ai-props"><div class="small"><b>🧪 Lo que propuso la IA (sin ver al motor), comprobado por ${esc(Engine.name || "el motor")}</b></div>` + list.map(p => {
    const v = AI_VERDICT[p.status] || { icon: "·", label: "sin comprobar", cls: "" };
    const body = p.status === "ilegal"
      ? `<s>${esc(p.raw)}</s> <span class="small">no es legal aquí</span>`
      : `${lineSpans(p.state0, p.ucis, 8)}${p.loss != null ? ` <span class="small">· ${esc(fmtEval(p.after))}${p.loss >= 1 ? `, −${Math.round(p.loss)} % de probabilidad de ganar` : ""}</span>` : ""}` +
        (p.idea ? `<div class="small">💭 ${esc(p.idea)}</div>` : "") +
        (p.bad ? `<div class="small">⛔ se corta antes de «${esc(p.bad)}» (ilegal)</div>` : "") +
        (p.refutation ? `<div class="small">↯ Refutación: ${lineSpans(p.refutation.state, p.refutation.pv, 4)}</div>` : "");
    return `<div class="ai-prop"><span class="ai-verdict ${v.cls}" title="${esc(v.label)}">${esc(v.icon)} ${esc(v.label)}</span><div>${body}</div></div>`;
  }).join("") + `</div>`;
}

/* ⚠ Jugadas de la respuesta que no vienen de nada comprobado.
   Se comparan en una forma canónica (letras inglesas, sin jaque, sin número), porque los datos van en la notación
   elegida y la respuesta, en española. Los avances de peón sólo se miran con número delante («12.e5»): «e5»
   suelto suele ser una casilla. */
const AI_PIECE = { es: { R: "K", D: "Q", T: "R", A: "B", C: "N" }, en: { K: "K", Q: "Q", R: "R", B: "B", N: "N" },
  fig: { "♔": "K", "♚": "K", "♕": "Q", "♛": "Q", "♖": "R", "♜": "R", "♗": "B", "♝": "B", "♘": "N", "♞": "N" } };
const AI_MOVE_RE = /(\d+\.(?:\.\.)?\s?)?(O-O-O|O-O|0-0-0|0-0|[RDTACKQBN♔-♟][a-h]?[1-8]?x?[a-h][1-8](?:=[DTACQRBN])?|[a-h]x[a-h][1-8](?:=[DTACQRBN])?|[a-h][1-8](?:=[DTACQRBN])?)([+#]?)/g;
function aiCanon(tok, lang) {
  const map = AI_PIECE[lang] || AI_PIECE.es;
  const t = tok.replace(/0/g, "O");
  return t.replace(/^[RDTACKQBN♔-♟]/, c => map[c] || "?").replace(/=([DTACQRBN])/, (_, c) => "=" + ((AI_PIECE[lang] || AI_PIECE.es)[c] || c));
}
function aiAllowedMoves(texts) {
  const lang = settings.lang === "fig" ? "fig" : settings.lang === "en" ? "en" : "es";
  const set = new Set();
  for (const t of texts) for (const m of String(t || "").matchAll(AI_MOVE_RE)) set.add(aiCanon(m[2], lang));
  return set;
}
/* Las jugadas que la aplicación conoce para esta respuesta: las legales en la posición, las de las líneas del
   motor, las propuestas, las refutaciones, las partidas modelo y las ya jugadas. Clave: la jugada en SAN inglés sin
   jaque; valor: la posición después (para el minitablero), las casillas y si se puede jugar ya en el tablero */
function aiMoveResolver(node, lines) {
  const map = new Map();
  const add = (state, ucis, onBoard, max = 12) => {
    let s = state;
    for (let i = 0; i < Math.min(ucis.length, max); i++) {
      const L = Chess.legal(s), m = Chess.moveFromUci(s, ucis[i], L);
      if (!m) break;
      const en = Chess.san(s, m, L).replace(/[+#]/g, ""), s2 = Chess.apply(s, m);
      if (!map.has(en)) map.set(en, { fen: Chess.toFen(s2), from: m.from, to: m.to, t: s.t, onBoard: onBoard && i === 0 });
      s = s2;
    }
  };
  try {
    for (const m of Chess.legal(node.state)) add(node.state, [Chess.uci(m)], true, 1);
    for (const l of lines || []) if (l && l.state && l.ucis && l.ucis.length) add(l.state, l.ucis, l.state === node.state);
    const path = Pgn.pathTo(node).slice(1);   // lo ya jugado («tu última jugada, Cxe5…»)
    if (path.length) add(game.root.state, path.map(n => n.uci), false, 400);
  } catch {}
  return map;
}
/* Una jugada escrita por la IA, en la notación que sea, a su forma canónica (SAN inglés sin jaque).
   B, N, Q y K sólo existen en inglés; D, T, A y C sólo en español; la R puede ser rey (es) o torre (en): se decide
   por lo que la aplicación conoce y, si no, se toma como española, que es lo que se le pide a la IA */
function aiCanonOf(mv, known) {
  const t = mv.replace(/0/g, "O");
  if (/^[BNQK]/.test(t)) return aiCanon(t, "en");
  if (/^[DTAC]/.test(t)) return aiCanon(t, "es");
  if (/^[♔-♟]/.test(t)) return aiCanon(t, "fig");
  if (/^R/.test(t)) { const es = aiCanon(t, "es"), en = aiCanon(t, "en"); return known(es) ? es : known(en) ? en : es; }
  return aiCanon(t, "es");
}
/* Recibe el HTML ya escapado de un párrafo: pasa cada jugada a la notación elegida, la hace pulsable si la
   aplicación la conoce (minitablero y, si se puede jugar ya, flecha en el tablero) y marca con ⚠ las no comprobadas */
function aiMoveMarkup(html, allowed, resolver, stats) {
  return html.replace(AI_MOVE_RE, (all, num, mv, chk, at, whole) => {
    // Un avance de peón sin número («e5») suele ser una casilla: sólo se hace pulsable si es una jugada conocida, y nunca se marca
    const bare = /^[a-h][1-8]/.test(mv) && !num;
    // «el caballo de a4», «la casilla e5», «la columna d»: es una casilla, no una jugada
    if (bare && /(rey|dama|reina|torre|alfil|caballo|pe[oó]n|casilla|punto)(es|s)?\s+(\S+\s+)?(de|en|a|hacia|sobre)?\s*$/i.test(whole.slice(Math.max(0, at - 30), at))) return all;
    const canon = aiCanonOf(mv, k => (resolver && resolver.has(k)) || allowed.has(k));
    const r = resolver && resolver.get(canon);
    if (bare && !r) return all;
    const shown = (num || "") + formatSan(canon, settings.lang, r ? r.t : 1) + (chk || "");
    const ok = bare || allowed.has(canon);
    const txt = r ? `<span class="pv-mv ai-mv" role="button" tabindex="0" data-fen="${esc(r.fen)}" data-from="${r.from}" data-to="${r.to}"${r.onBoard ? ` data-board="1"` : ""} title="Ver la jugada">${esc(shown)}</span>` : esc(shown);
    if (ok) return txt;
    stats.flagged = (stats.flagged || 0) + 1;
    return `<span class="ai-unverified" title="Esta jugada no la ha comprobado el motor: tómala con cautela">${txt}⚠</span>`;
  });
}
const aiMarkUnverified = (html, allowed, stats) => aiMoveMarkup(html, allowed, null, stats);
/* Pulsar (o tocar) una jugada de la IA: minitablero junto a ella y, si se puede jugar ya, flecha en el tablero */
document.addEventListener("click", e => {
  const el = e.target.closest && e.target.closest(".ai-mv");
  if (!el) { if (AI.arrow && !e.target.closest(".hover-board")) { AI.arrow = null; hoverTip.hidden = true; renderShapes(); } return; }
  e.preventDefault();
  // Primero la flecha (redibujar cierra el minitablero) y después el minitablero junto a la jugada
  AI.arrow = el.dataset.board ? { node: cur(), from: +el.dataset.from, to: +el.dataset.to } : null;
  renderShapes();
  const r = el.getBoundingClientRect();
  setTimeout(() => { try { showHoverBoard({ clientX: r.left, clientY: r.bottom }, Chess.parseFen(el.dataset.fen), { from: +el.dataset.from, to: +el.dataset.to }); } catch {} }, 0);
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.closest && e.target.closest(".ai-mv")) e.target.click(); });

/* ---------- Lo que la IA dice de las piezas, comprobado en el tablero ----------
   Los modelos (sobre todo los pequeños) se equivocan al leer la posición: «el alfil de d7» donde hay un caballo, o
   «tu caballo de a4» siendo del rival. Se buscan esas afirmaciones en el texto y se comprueban en el tablero (y, para
   lo que diga de lo que pasará, en las primeras jugadas de las líneas conocidas). Si alguna es falsa, se le pide a
   la IA que corrija su respuesta; si vuelve a fallar, se marca con ⚠ y se explica qué hay de verdad. */
const AI_PIECE_WORD = { rey: "k", dama: "q", reina: "q", torre: "r", alfil: "b", caballo: "n", peon: "p" };
const AI_CLAIM_RE = /(?:\b(tu|tus|mi|mis|el|la|los|las|un|una|del|al|su|sus)\s+)?\b(rey|dama|reina|torres?|alfil(?:es)?|caballos?|pe[oó]n(?:es)?)\s+(?:(blanc[oa]s?|negr[oa]s?|rival(?:es)?|enemig[oa]s?|contrari[oa]s?)\s+)?(?:de|en|situad[oa] en|que est[aá] en)\s+([a-h][1-8])\b(?:\s+(del rival|rival|enemig[oa]|contrari[oa]|de las blancas|de las negras|blanc[oa]|negr[oa]))?/gi;
const AI_PIECE_NAME = { k: ["un rey", "rey", "rey"], q: ["una dama", "dama", "dama"], r: ["una torre", "torre", "torres"], b: ["un alfil", "alfil", "alfiles"], n: ["un caballo", "caballo", "caballos"], p: ["un peón", "peón", "peones"] };
const aiFem = t => t === "q" || t === "r";
const aiNameOf = p => { const t = p.toLowerCase(), white = p !== t; return `${AI_PIECE_NAME[t][0]} ${white ? (aiFem(t) ? "blanca" : "blanco") : aiFem(t) ? "negra" : "negro"}`; };
const aiPieceType = word => AI_PIECE_WORD[norm(word).replace(/^peones$/, "peon").replace(/^alfiles$/, "alfil").replace(/s$/, "")];
/* La lista de piezas en palabras, cada una con su color pegado («rey blanco en e1»), para que la IA no tenga que leer
   la FEN ni arrastrar el color de un título: a los modelos pequeños les cuesta mucho menos */
function aiPiecesText(s) {
  const out = [];
  for (const [color, up] of [["blancas", true], ["negras", false]]) {
    const items = [];
    for (const t of "kqrbnp") for (let i = 0; i < 128; i++) {
      if (i & 0x88) { i += 7; continue; }
      const p = s.b[i];
      if (p !== "." && (p === p.toUpperCase()) === up && p.toLowerCase() === t) items.push(`${aiNameOf(p).replace(/^(un|una) /, "")} en ${Chess.sqName(i)}`);
    }
    out.push(`Piezas de las ${color}: ${items.join("; ")}.`);
  }
  return out.join("\n");
}
/* Posiciones en las que una afirmación puede ser cierta: la del tablero y las primeras jugadas de las líneas conocidas */
function aiLineStates(state, ucis, n = 4) {
  const out = [];
  let s = state;
  for (let i = 0; i < Math.min(n, (ucis || []).length); i++) { const m = Chess.moveFromUci(s, ucis[i]); if (!m) break; s = Chess.apply(s, m); out.push(s); }
  return out;
}
function aiCheckClaims(text, states, me) {
  const errs = [], s0 = states[0], plain = String(text).replace(/\*\*/g, "");
  // El tutor no juega: «mi dama», «mis peones»… confunde de quién son las piezas
  const first = plain.match(/\b(mi|mis)\s+(rey|dama|reina|torres?|alfil(?:es)?|caballos?|pe[oó]n(?:es)?|piezas?)\b/i);
  if (first) errs.push({ text: first[0], why: `hablas en primera persona («${first[0]}»), pero tú no juegas: di «tu…» si es del alumno o «del rival» si es del otro bando` });
  for (const m of plain.matchAll(AI_CLAIM_RE)) {
    const [all, det, word, adj, sqName, suf] = m;
    const type = aiPieceType(word);
    if (!type) continue;
    const tag = norm(`${adj || ""} ${suf || ""}`);
    const color = /blanc/.test(tag) ? 1 : /negr/.test(tag) ? -1 : /rival|enemig|contrari/.test(tag) ? -me : /^(tu|tus)$/i.test(det || "") ? me : 0;
    const sq = Chess.sqIdx(sqName);
    const fits = st => { const p = st.b[sq]; return p !== "." && p.toLowerCase() === type && (!color || (p === p.toUpperCase() ? 1 : -1) === color); };
    if (states.some(fits)) continue;
    const p = s0.b[sq], who = c => (c === me ? "tuyo" : "del rival");
    const why = p === "." ? `en ${sqName} no hay ninguna pieza`
      : p.toLowerCase() !== type ? `en ${sqName} hay ${aiNameOf(p)}, no ${AI_PIECE_NAME[type][0]}`
      : `la pieza de ${sqName} es ${p === p.toUpperCase() ? "blanca" : "negra"} (${who(p === p.toUpperCase() ? 1 : -1)})`;
    if (!errs.some(e => e.why === why)) errs.push({ text: all.trim(), why });
  }
  aiCheckFacts(plain, states, me).forEach(e => { if (!errs.some(x => x.why === e.why)) errs.push(e); });
  return errs;
}
/* 1.55: otras afirmaciones que se pueden comprobar en el tablero sin dudas: amenazas de mate, jaques, piezas sin
   defensa o clavadas y el enroque. Como con las piezas, basta con que sean ciertas en la posición o en las primeras
   jugadas de las líneas conocidas; ante la duda, no se marca nada (mejor dejar pasar un error que acusar sin razón) */
const AI_FACT_PIECE = "(rey|dama|reina|torres?|alfil(?:es)?|caballos?|pe[oó]n(?:es)?)";
const AI_HANG_RE = new RegExp(`\\b${AI_FACT_PIECE}\\s+(?:(?:blanc[oa]s?|negr[oa]s?|rival|enemig[oa]|contrari[oa])\\s+)?(?:de|en)\\s+([a-h][1-8])\\s+(?:(?:est[aá]|queda|se queda|sigue|ya est[aá])\\s+)?(colgad[oa]|indefens[oa]|sin defensa|sin defender|sin proteger|desprotegid[oa]|clavad[oa])\\b`, "gi");
const AI_CHECK_RE = /\b(?:(el rey blanco|las blancas)|(el rey negro|las negras)|(tu rey|est[aá]s)|(el rey rival|el rival))\s+(?:est[aá]n?|queda|se queda)\s+en\s+jaque\b/gi;
const AI_MATE_RE = /\b(amenaza(?:n|s)?(?:\s+con)?\s+(?:dar\s+)?(?:(?:jaque\s+)?mate|un\s+mate)|amenaza\s+de\s+mate|mate\s+en\s+(?:una|1|uno)(?:\s+jugada)?)\b/gi;
const AI_CASTLE_RE = /(?:\b(las blancas|el rey blanco)|\b(las negras|el rey negro)|\b(tu rey|t[uú]))?\s*\b(ya no puede[ns]?|no puede[ns]?|todav[ií]a puede[ns]?|a[uú]n puede[ns]?|puede[ns]?)\s+enrocar\b/gi;
const AI_DIRS = { r: [-16, 16, -1, 1], b: [-17, -15, 15, 17] };
/* ¿Está clavada la pieza de sq? Un alfil, torre o dama rival la ataca y detrás está su rey o una pieza de más valor */
function aiIsPinned(b, sq) {
  const p = b[sq], c = Chess.color(p), VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  for (const [kind, dirs] of Object.entries(AI_DIRS)) for (const d of dirs) {
    let x = sq + d, front = -1, back = -1;
    while (!(x & 0x88)) { if (b[x] !== ".") { front = x; break; } x += d; }
    x = sq - d;
    while (!(x & 0x88)) { if (b[x] !== ".") { back = x; break; } x -= d; }
    if (front < 0 || back < 0) continue;
    const att = b[front], beh = b[back];
    if (Chess.color(att) !== -c || Chess.color(beh) !== c) continue;
    const at = att.toLowerCase();
    if (!(at === "q" || at === kind)) continue;
    if (VAL[beh.toLowerCase()] > VAL[p.toLowerCase()]) return true;
  }
  return false;
}
/* ¿Puede el bando c dar mate en una o dos jugadas si le tocara mover? (búsqueda corta del motor interno) */
function aiMateSoon(s, c) {
  if (Chess.inCheck(s, -c)) return true;                 // el otro rey ya está en jaque: nada que discutir
  if (s.t !== c) { if (Chess.inCheck(s, s.t)) return false; s = Object.assign(Chess.clone(s), { t: c, ep: -1 }); }
  if (!Chess.legal(s).length) return false;
  try { const r = Chess.search(s, { depth: 4, movetime: 150 }); return r.score >= Chess.MATE - 50; } catch { return true; }
}
function aiCheckFacts(plain, states, me) {
  const errs = [], s0 = states[0], colorName = c => (c === 1 ? "blancas" : "negras");
  for (const m of plain.matchAll(AI_HANG_RE)) {
    const [all, word, sqName, what] = m;
    const type = aiPieceType(word), sq = Chess.sqIdx(sqName);
    if (!type) continue;
    const pinned = /clavad/i.test(what);
    const holds = st => { const p = st.b[sq]; if (p === "." || p.toLowerCase() !== type) return null; return pinned ? aiIsPinned(st.b, sq) : !Chess.attackers(st.b, sq, Chess.color(p)).length; };
    const res = states.map(holds);
    if (res.some(x => x === true) || res.every(x => x === null)) continue;   // cierta en alguna, o la pieza no está (eso ya lo dice la otra comprobación)
    const p = s0.b[sq];
    const why = pinned ? `${aiNameOf(p).replace(/^(un|una) /, "el ").replace(/^el (dama|torre)/, "la $1")} de ${sqName} no está clavad${aiFem(p.toLowerCase()) ? "a" : "o"}`
      : `${aiNameOf(p).replace(/^(un|una) /, "el ").replace(/^el (dama|torre)/, "la $1")} de ${sqName} está defendid${aiFem(p.toLowerCase()) ? "a" : "o"}`;
    if (!errs.some(e => e.why === why)) errs.push({ text: all.trim(), why });
  }
  for (const m of plain.matchAll(AI_CHECK_RE)) {
    const c = m[1] ? 1 : m[2] ? -1 : m[3] ? me : -me;
    if (states.some(st => Chess.inCheck(st, c))) continue;
    errs.push({ text: m[0].trim(), why: `el rey de las ${colorName(c)} no está en jaque` });
  }
  const mate = plain.match(AI_MATE_RE);
  if (mate && !states.some(st => aiMateSoon(st, 1) || aiMateSoon(st, -1)))
    errs.push({ text: mate[0].trim(), why: "no hay ninguna amenaza de mate inmediata: ningún bando puede dar mate en una o dos jugadas" });
  for (const m of plain.matchAll(AI_CASTLE_RE)) {
    // De quién habla: el sujeto, o «puedes» (el alumno); con «puede» sin sujeto no se sabe y no se comprueba
    const c = m[1] ? 1 : m[2] ? -1 : m[3] || /puedes$/i.test(m[4]) ? me : 0, can = !/no puede/i.test(m[4]);
    if (!c) continue;
    const rights = (s0.c & (c === 1 ? 3 : 12)) !== 0;
    if (can === rights) continue;
    errs.push({ text: m[0].trim(), why: rights ? `las ${colorName(c)} todavía pueden enrocar (no han perdido el derecho)` : `las ${colorName(c)} ya no pueden enrocar (han movido el rey o las torres)` });
  }
  return errs;
}
/* Pregunta a la IA y comprueba lo que dice de las piezas; si se equivoca, le pide una corrección (una vez) */
async function aiCallChecked(system, user, states, me) {
  let text = await aiCall(system, user);
  let errs = aiCheckClaims(text, states, me);
  if (errs.length) {
    const fix = await aiCall(system, `${user}\n\nTu respuesta anterior fue:\n«${text}»\nTiene errores sobre la posición: ${errs.map((e, i) => `(${i + 1}) dijiste «${e.text}», pero ${e.why}`).join("; ")}.\nEscribe de nuevo la respuesta corrigiéndolos. Consulta SIEMPRE la lista de piezas para saber qué pieza hay en cada casilla y de qué color es.`).catch(() => "");
    if (fix) { const e2 = aiCheckClaims(fix, states, me); if (e2.length <= errs.length) { text = fix; errs = e2; } }
  }
  return { text, errs };
}
/* Marca en el HTML ya formateado las afirmaciones falsas que queden, y una nota que dice la verdad */
function aiMarkClaims(html, errs) {
  if (!errs.length) return html;
  for (const e of errs) {
    const t = esc(e.text);
    const i = html.indexOf(t);
    if (i >= 0) html = html.slice(0, i) + `<span class="ai-unverified" title="${esc(e.why)}">${t}⚠</span>` + html.slice(i + t.length);
  }
  return html + `<div class="small ai-unverified-note">⚠ La IA se ha equivocado sobre la posición: ${errs.map(e => esc(e.why)).join("; ")}.</div>`;
}

/* ⚡ Vigilancia en una sola consulta (1.58): las jugadas que la respuesta recomienda y que no son de las líneas del
   motor se valoran con Stockfish. Se ignoran las que cita como malas («no juegues…», «sería un error…»), para no
   pedirle que corrija lo que ya desaconseja. Es mala si pierde 8 puntos de probabilidad de ganar o más (dudosa o error) */
const AI_NEG_BEFORE = /(no\s+(?:juegues|jugar[ií]a|conviene|es buena|vale)|evita[rs]?|un error|error|mala|malo|pierde|perder[ií]as?|falla|dudosa|cuidado con|peor|en lugar de|en vez de)[^.!?]{0,30}$/i;
async function aiWatchCheck(node, text, engineLines) {
  const s = node.state, plain = String(text).replace(/\*\*/g, ""), engineFirst = new Set((engineLines || []).map(l => l.pv && l.pv[0]).filter(Boolean));
  const picked = [], seen = new Set();
  for (const m of plain.matchAll(AI_MOVE_RE)) {
    if (AI_NEG_BEFORE.test(plain.slice(Math.max(0, m.index - 45), m.index))) continue;
    let move = null;
    for (const tok of [m[2], m[2].replace(/^R/, "K")]) { try { move = Chess.parseMove(s, tok, "auto").move; break; } catch {} }
    if (!move) continue;
    const uci = Chess.uci(move);
    if (seen.has(uci)) continue;
    seen.add(uci);
    if (engineFirst.has(uci)) continue;   // ya está en las líneas del motor: comprobada
    picked.push(lineText(s, [uci], 1));
    if (picked.length >= 3) break;
  }
  const bestEv = engineLines && engineLines[0] ? aiEv(engineLines[0]) : null;
  const r = picked.length ? await aiMovesInQuestion(node, picked.join(" "), bestEv) : { items: [] };
  const items = r.items.map(it => Object.assign(it, { san: lineText(s, [it.uci], 1), isBad: it.loss != null && it.loss >= 8 }));
  return { items, bad: items.filter(i => i.isBad), fixed: null };
}
function aiWatchHtml(w) {
  const icon = l => (l == null ? "•" : l < 3 ? "✔" : l < 8 ? "≈" : l < 15 ? "?!" : "✗");
  const parts = [];
  parts.push(w.items.length ? `Stockfish ha revisado ${w.items.length === 1 ? "la jugada" : `las ${w.items.length} jugadas`} que la IA recomienda fuera de sus líneas: ${w.items.map(i => `${icon(i.loss)} ${esc(i.san)}`).join(", ")}` : "las jugadas que recomienda la IA son las del motor");
  if (w.fixed && w.fixed.length) parts.push(`se le pidió corregir la respuesta porque recomendaba ${esc(w.fixed.join(", "))}`);
  if (w.bad.length) parts.push(`⚠ aun así recomienda ${esc(w.bad.map(b => b.san).join(", "))}, que el motor ve mal: no le hagas caso en eso`);
  return `<div class="small ai-watch">⚡ Vigilancia en una sola consulta: ${parts.join(" · ")}.</div>`;
}

/* Jugadas que el alumno menciona en su pregunta («¿y si juego Ae3?», «¿por qué no Dxd5?»), valoradas por el motor
   desde la posición dada: así la IA puede contestar con datos y no a ojo */
async function aiMovesInQuestion(node, question, bestEv) {
  const s = node.state, items = [], seen = new Set();
  for (const m of String(question).matchAll(AI_MOVE_RE)) {
    let move = null;
    for (const tok of [m[2], m[2].replace(/^R/, "K")]) { try { move = Chess.parseMove(s, tok, "auto").move; break; } catch {} }
    if (!move) continue;
    const uci = Chess.uci(move);
    if (seen.has(uci) || items.length >= 3) continue;
    seen.add(uci);
    const after = Chess.apply(s, move);
    let ev = terminalEval({ state: after }), reply = null;
    if (!ev) { const r = await evalState(after, Engine.kind === "stockfish" ? 1000 : 1300, 1); const l = r && r.lines && r.lines[0]; ev = aiEv(l); reply = l && l.pv && l.pv.length ? l.pv.slice(0, 6) : null; }
    if (!ev) continue;
    const loss = bestEv ? Math.max(0, aiWinFor(bestEv, s.t) - aiWinFor(ev, s.t)) : null;
    const san = lineText(s, [uci], 1);
    const verdict = loss == null ? "" : loss < 3 ? "buena (casi tan buena como la mejor)" : loss < 8 ? "jugable" : loss < 15 ? "dudosa" : "un error";
    const text = `${san}: valoración ${fmtEval(ev)}${verdict ? `, ${verdict}` : ""}${loss != null && loss >= 1 ? ` (pierde ${Math.round(loss)} puntos de probabilidad de ganar respecto a la mejor)` : ""}${reply ? `; lo que seguiría según el motor: ${lineText(after, reply, 6)}` : ""}.`;
    items.push({ uci, after, reply, ev, loss, text });
  }
  return { items, text: items.map(i => i.text).join("\n") };
}
