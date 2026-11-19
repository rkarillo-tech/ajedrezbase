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
  return `Eres un entrenador de ajedrez fuerte. Piensa la posición por tu cuenta (no tienes motor de análisis) y propón las jugadas que tú jugarías o enseñarías para responder a la pregunta del alumno.
Responde SÓLO con JSON, sin ningún texto alrededor, con este formato exacto:
{"lineas":[{"jugadas":"Cf3 Cc6 Ab5","idea":"desarrollar y presionar e5"}]}
Reglas:
- De 1 a 3 líneas distintas, cada una de 1 a 6 medias jugadas, empezando por una jugada de las ${side}.
- Jugadas en notación algebraica española (R rey, D dama, T torre, A alfil, C caballo), separadas por espacios y sin números de jugada.
- "idea": la idea de la línea en menos de 15 palabras.`;
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
  const user = `${aiPositionText(node)}${ctx && ctx.text ? "\n\nContexto (datos comprobados):\n" + ctx.text : ""}\n\nPregunta del alumno: ${question}`;
  return aiParseProposals(await aiCall(aiProposeSystem(side), user));
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
/* Recibe el HTML ya escapado de un párrafo y envuelve las jugadas no comprobadas */
function aiMarkUnverified(html, allowed, stats) {
  return html.replace(AI_MOVE_RE, (all, num, mv, chk) => {
    if (/^[a-h][1-8]/.test(mv) && !num) return all;
    const ok = allowed.has(aiCanon(mv, "es")) || allowed.has(aiCanon(mv, settings.lang === "en" ? "en" : "es"));
    if (ok) return all;
    stats.flagged = (stats.flagged || 0) + 1;
    return `<span class="ai-unverified" title="Esta jugada no la ha comprobado el motor: tómala con cautela">${all}⚠</span>`;
  });
}
