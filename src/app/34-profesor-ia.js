/* ---------- 19c. 🤖 Profesor IA (opcional): preguntas libres sobre la posición ----------
   Las jugadas y las valoraciones salen SIEMPRE de Stockfish (o del motor interno): la IA sólo las explica en lenguaje
   natural, adaptada al nivel elegido, y no puede proponer jugadas que no estén en las líneas del motor.
   Proveedores: Ollama (un modelo en tu propio ordenador, privado y gratuito), Claude (Anthropic) o Gemini (Google) con
   una clave tuya. La clave se guarda sólo en este navegador (no se sincroniza ni va en las copias de seguridad).
   Con Claude se usa el SDK oficial de Anthropic, que se descarga de jsDelivr sólo si eliges ese proveedor. */
const AI_SDK_URL = "{{ANTHROPIC_SDK}}";
const AI_PROVIDERS = {
  none: { name: "Desactivado" },
  ollama: { name: "Ollama (un modelo en tu ordenador)", model: "qwen2.5:7b" },
  claude: { name: "Claude (Anthropic, con tu clave)", model: "claude-opus-5-5" },
  gemini: { name: "Gemini (Google, con tu clave)", model: "gemini-3-flash-preview" }
};
// Modelos de Claude que admiten la reserva automática en el servidor (fallbacks) y el control de esfuerzo
const AI_CLAUDE_CURRENT = /^claude-(fable-5-[12]|opus-5-5|opus-5|sonnet-5-5)$/;
const AI = { busy: false, sdk: null, token: 0, arrow: null, hist: { key: "", items: [] } };
const aiProvider = () => (AI_PROVIDERS[settings.aiProvider] && settings.aiProvider !== "none" ? settings.aiProvider : "");
const aiModel = () => (settings.aiModel || "").trim() || (AI_PROVIDERS[aiProvider()] || {}).model || "";

/* Lo que se le da a la IA: hechos calculados aquí, nunca inventados por ella */
/* Con qué color juega el alumno (para que «tú / tus piezas» sea siempre lo mismo): en la partida contra la CPU, su
   color; en el entrenador, el bando que mueve; si la partida lleva su nombre, ese color; si no, el lado del tablero
   que tiene abajo. Antes no se decía y la IA suponía que el alumno era quien movía, mezclando blancas y negras */
function aiStudentSide(node) {
  if (Coach.active && Coach.ex) return Coach.ex.node.state.t;
  if (ui.cpu.on && !ui.cpu.two) return -ui.cpu.side;
  try {
    const names = myNameList(), h = game.headers;
    if (names.length) { const w = norm(h.White || "").trim(), b = norm(h.Black || "").trim(); if (names.includes(w)) return 1; if (names.includes(b)) return -1; }
  } catch {}
  return ui.flipped ? -1 : 1;
}
/* La posición sin nada del motor: lo que ve la IA cuando propone sus propias jugadas */
function aiPositionText(node) {
  const s = node.state, me = s.t, student = aiStudentSide(node);
  const col = c => (c === 1 ? "blancas" : "negras");
  const side = me === 1 ? "blancas" : "negras";
  const path = Pgn.pathTo(node).slice(1);
  const moves = path.length ? lineText(game.root.state, path.map(n => n.uci), 400) : "(ninguna: posición inicial de la lección o de la partida)";
  const eco = ECO.detect(node);
  const danger = piecesInDanger(s, me).map(x => `${PIECE_ES[s.b[x.sq].toLowerCase()]} de ${Chess.sqName(x.sq)} (${x.why})`);
  const chances = piecesInDanger(s, -me).map(x => `${PIECE_ES[s.b[x.sq].toLowerCase()]} de ${Chess.sqName(x.sq)} (${x.why})`);
  const st = gameStatus(node);
  return [
    `El alumno juega con las ${col(student)}: cuando le hables de «tú», «tus piezas» o «tu alfil», son siempre las ${col(student)}; las ${col(-student)} son las del rival.`,
    aiPiecesText(s),
    `Turno: mueven las ${side}${me === student ? " (le toca al alumno)" : " (le toca al rival del alumno)"}.${st.over ? " " + st.text + "." : Chess.inCheck(s) ? ` Las ${side} están en jaque.` : ""}`,
    `Jugadas hasta aquí: ${moves}`,
    eco ? `Apertura: ${eco.entry.eco} ${eco.entry.name}.` : "",
    danger.length ? `Piezas de las ${side} (el bando que mueve) en peligro: ${danger.join("; ")}.` : `Ninguna pieza de las ${side} (el bando que mueve) está en peligro inmediato.`,
    chances.length ? `Piezas de las ${col(-me)} que se pueden ganar: ${chances.join("; ")}.` : "",
    `FEN (referencia técnica; para saber qué pieza hay en cada casilla usa la lista de piezas de arriba): ${Chess.toFen(s)}`
  ].filter(Boolean).join("\n");
}
async function aiFacts(node) {
  const s = node.state, strong = Engine.kind === "stockfish";
  const top = Engine.ready ? await evalState(s, strong ? 1600 : 2000, strong ? 3 : 1) : null;
  const lines = ((top && top.lines) || []).filter(l => l && l.pv && l.pv.length);
  const fmt = l => `${fmtEval({ cp: l.cp, mate: l.mate, winner: l.winner })} (${evalVerdict({ cp: l.cp, mate: l.mate, winner: l.winner }).toLowerCase()}): ${lineText(s, l.pv, 8)}`;
  let last = "";
  if (node.parent && node.move) {
    const info = classifyMove(node);
    const san = numPrefix(node.parent.state) + dispSan(node);
    last = info ? `${san}: ${info.cls ? { "??": "error grave", "?": "error", "?!": "imprecisión", "!": "muy buena" }[info.cls] : "correcta"} (pierde ${Math.round(info.loss)} puntos de probabilidad de ganar)${node.parent.eval && node.parent.eval.best ? `; lo mejor era ${lineText(node.parent.state, [node.parent.eval.best], 1)}` : ""}` : `${san} (sin valorar todavía)`;
  }
  return { lines, text: [
    aiPositionText(node),
    lines.length ? `Mejores líneas del motor (${Engine.name || "motor"}), de mejor a peor, valoración desde el punto de vista de las blancas:\n${lines.map((l, i) => `${i + 1}. ${fmt(l)}`).join("\n")}` : "No hay análisis del motor.",
    last ? `Última jugada: ${last}.` : ""
  ].filter(Boolean).join("\n") };
}
/* 📏 Profundidad de las respuestas: cuánto se extiende y cuánto explica el porqué (profesor, comentario de la partida y entrenador) */
const AI_DEPTHS = {
  short: { name: "Breve", words: 100, coach: 60, review: 180, how: "Ve a lo esencial: la idea principal y su porqué en pocas frases." },
  normal: { name: "Normal", words: 200, coach: 90, review: 280, how: "Explica el porqué de lo importante: amenazas, piezas en peligro, plan." },
  deep: { name: "Detallada", words: 400, coach: 180, review: 450, how: "Explica a fondo: el porqué de cada jugada que cites, las ideas de fondo (estructura, piezas buenas y malas, casillas clave), los planes de los dos bandos y qué pasaría con la alternativa tentadora." }
};
const aiDepth = () => AI_DEPTHS[settings.aiDepth] || AI_DEPTHS.normal;
/* El papel de la IA: un tutor que enseña a pensar, no un oráculo de jugadas. Va antes de las reglas en el profesor,
   el comentario de la partida y el entrenador; a los modelos pequeños les cambia mucho el tono */
function aiTutorRole(where) {
  return `Tu papel:
- Eres un tutor de ajedrez paciente y exigente que acompaña a un alumno ${where}. Tu objetivo no es darle la jugada, sino enseñarle a pensar: que entienda el porqué y sepa aplicarlo en sus propias partidas.
- Cómo enseñas: parte de lo que pregunta y de lo que se ve en el tablero (amenazas, piezas sueltas, seguridad del rey); da la idea principal y su porqué con conceptos de ajedrez (principios de apertura, estructura de peones, piezas buenas y malas, casillas débiles, columnas, iniciativa, jugadas forzadas); relaciónala con un principio general que pueda reutilizar; y, si ayuda, termina con una pregunta corta que le haga pensar o con qué debe mirar en su próxima jugada.
- Eres honesto: si algo no está claro en los datos, lo dices. Animas sin adular: reconoces lo que el alumno hace bien y corriges con claridad.
- Te apoyas en Stockfish como un profesor en un buen libro de referencia: el motor da las jugadas y las valoraciones exactas; tú pones las ideas, los planes y el porqué.
- Tú no juegas la partida: nunca digas «mi dama», «mis piezas» ni «yo juego». Habla siempre de «tus piezas» (las del alumno) y de «las del rival», o de «las blancas» y «las negras».`;
}
function aiSystem() {
  const lvl = { basic: "INICIACIÓN: tono cálido y sencillo, sin cifras de valoración ni términos técnicos sin explicar; termina con una regla general para recordar.",
    club: "CLUB: terminología de ajedrez precisa pero accesible (clavadas, horquillas, columnas abiertas, estructura de peones).",
    advanced: "AVANZADO: análisis concreto, con variantes y valoraciones, y los matices estratégicos." }[settings.explainLevel] || "";
  return `Eres el profesor de ajedrez de AjedrezBase. Respondes siempre en español de España, de forma didáctica (unas ${aiDepth().words} palabras como máximo). ${aiDepth().how}
${aiTutorRole("mientras estudia sus partidas y posiciones en AjedrezBase")}
Nivel del alumno: ${lvl}
Reglas estrictas:
1. Las únicas jugadas que puedes recomendar o citar como buenas son las de las «Mejores líneas del motor» y, si las hay, las de «Tus propuestas» marcadas como BUENA o JUGABLE. No inventes jugadas ni variantes y no contradigas al motor; si algo no está en los datos, dilo.
1a. Tus propuestas las pensaste tú sin motor y el motor las ha juzgado: defiende las buenas con tus ideas; las DUDOSAS o ERROR no las recomiendes, pero explica por qué fallan usando la refutación del motor (eso enseña mucho); las ILEGALES ni las menciones.
1b. Además del motor puedes recibir contexto comprobado: el repertorio del alumno, estadísticas del explorador y partidas modelo. Úsalo como lo haría un entrenador: relaciona la posición con su repertorio, con lo que juegan los maestros y con los planes de las partidas modelo, y cítalo siempre diciendo de dónde sale («en tu repertorio…», «los maestros juegan…», «en la partida X–Y se siguió…»). Si la jugada del repertorio o la más jugada no coincide con la mejor del motor, dilo con claridad. Las partidas con la misma estructura de peones sirven para explicar planes, no jugadas concretas de esta posición.
2. Escribe las jugadas en notación algebraica española (R rey, D dama, T torre, A alfil, C caballo; por ejemplo Cf3, Axc6, O-O). Nunca uses las letras inglesas (K, Q, B, N, ni R para la torre).
2b. Para saber qué pieza hay en cada casilla y de qué color es, usa SÓLO la lista de piezas que se te da; no lo deduzcas de la FEN ni lo supongas. Si nombras una pieza, di bien su casilla y su color.
3. Explica el porqué (amenazas, piezas en peligro, desarrollo, seguridad del rey, plan), no sólo la jugada.
4. Usa como mucho unas pocas viñetas y **negritas** para lo importante; nada de tablas ni bloques de código.`;
}
async function aiCall(system, user, opts = {}) {
  const p = aiProvider(), model = aiModel();
  if (p === "ollama") {
    if (!model) throw Error("elige antes un modelo (pulsa «🔌 Probar» para ver los que tienes instalados)");
    // Dos ajustes para que los modelos locales respondan bien:
    // · think: false — los modelos que «razonan» (qwen3, deepseek-r1…) se pasaban muchísimo rato pensando y a veces
    //   no llegaban a escribir respuesta; si el modelo no admite la opción, se repite sin ella.
    // · num_ctx — Ollama usa por defecto una ventana pequeña y recortaba sin avisar el principio de las preguntas
    //   largas (las instrucciones y la posición): se ajusta al tamaño de cada pregunta (≈ 3 caracteres por token).
    const need = Math.ceil((system.length + user.length) / 3) + 1500;
    const num_ctx = Math.min(32768, Math.max(4096, Math.ceil(need / 2048) * 2048));
    const ask = think => fetch(`${ollamaBase()}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ model, stream: false, keep_alive: "15m", options: Object.assign({ num_ctx }, opts.maxTokens ? { num_predict: opts.maxTokens } : {}), messages: [{ role: "system", content: system }, { role: "user", content: user }] }, think === false ? { think: false } : {})) });
    let res, detail = "";
    try { res = await ask(false); } catch (e) { throw Error(ollamaBlockedMsg()); }
    if (!res.ok) {
      try { detail = ((await res.json()) || {}).error || ""; } catch {}
      if (res.status === 400 && /think/i.test(detail)) { try { res = await ask(null); detail = ""; } catch (e) { throw Error(ollamaBlockedMsg()); } }
    }
    if (!res.ok) {
      if (!detail) { try { detail = ((await res.json()) || {}).error || ""; } catch {} }
      if (res.status === 404) throw Error(`Ollama no tiene el modelo «${model}». Escríbelo tal como sale en «ollama list» (con lo que va tras los dos puntos) o descárgalo con «ollama pull ${model}»`);
      if (/does not support (chat|generate)|embedding/i.test(detail)) throw Error(`«${model}» es un modelo de «embeddings», que no sirve para conversar: elige otro`);
      throw Error(`Ollama respondió con un error ${res.status}${detail ? ": " + detail : ""}`);
    }
    const data = await res.json();
    // Si aun así escribe su razonamiento entre <think> y </think> (versiones antiguas de Ollama), se quita
    const text = String((data && data.message && data.message.content) || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "").trim();
    if (!text) throw Error(data && data.message && data.message.thinking ? `«${model}» se ha quedado razonando sin llegar a responder; prueba con otro modelo (por ejemplo uno que no «razone»)` : "Ollama no ha devuelto ninguna respuesta");
    return text;
  }
  if (!settings.aiKey) throw Error("falta la clave: ponla en ⚙ Ajustes › Profesor IA");
  if (p === "gemini") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": settings.aiKey },
      body: JSON.stringify(Object.assign({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] }, opts.maxTokens ? { generationConfig: { maxOutputTokens: opts.maxTokens } } : {})) });
    if (res.status === 400 || res.status === 401 || res.status === 403) throw Error("Google rechaza la petición: revisa la clave y el nombre del modelo");
    if (res.status === 429) throw Error("Google pide esperar (demasiadas peticiones o sin saldo)");
    if (!res.ok) throw Error(`Google respondió con un error ${res.status}`);
    const data = await res.json();
    const text = (((data.candidates || [])[0] || {}).content || {}).parts;
    const out = (text || []).map(x => x.text || "").join("").trim();
    if (!out) throw Error("Gemini no ha devuelto ninguna respuesta");
    return out;
  }
  // Claude: SDK oficial de Anthropic, cargado sólo cuando hace falta
  if (!AI.sdk) {
    try { AI.sdk = await import(AI_SDK_URL); }
    catch (e) { throw Error("no se pudo descargar el SDK de Anthropic (hace falta conexión con cdn.jsdelivr.net)"); }
  }
  const Anthropic = AI.sdk.default;
  const client = new Anthropic({ apiKey: settings.aiKey, dangerouslyAllowBrowser: true });
  const current = AI_CLAUDE_CURRENT.test(model);
  let res;
  try {
    const req = { model, max_tokens: opts.maxTokens ? Math.max(1024, opts.maxTokens) : 16000, system, messages: [{ role: "user", content: user }] };
    if (current) {
      req.output_config = { effort: "low" };   // respuestas cortas de chat: el esfuerzo bajo basta y responde antes
      res = await client.beta.messages.create(Object.assign(req, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }));
    } else res = await client.messages.create(req);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw Error("Anthropic rechaza la clave");
    if (e instanceof Anthropic.PermissionDeniedError) throw Error("la clave no tiene permiso para usar ese modelo");
    if (e instanceof Anthropic.NotFoundError) throw Error(`no existe el modelo «${model}»`);
    if (e instanceof Anthropic.RateLimitError) throw Error("Anthropic pide esperar (límite de peticiones o sin saldo)");
    if (e instanceof Anthropic.BadRequestError) throw Error("Anthropic rechaza la petición: " + (e.message || "revisa el modelo"));
    if (e instanceof Anthropic.APIConnectionError) throw Error("no hay conexión con Anthropic");
    if (e instanceof Anthropic.APIError) throw Error(`Anthropic respondió con un error ${e.status || ""}`.trim());
    throw e;
  }
  if (res.stop_reason === "refusal") throw Error("el modelo no ha querido responder a esta pregunta");
  const out = res.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!out) throw Error("Claude no ha devuelto ninguna respuesta");
  return out;
}
/* El texto de la IA se muestra como texto (nunca como HTML): sólo se interpretan **negritas**, viñetas y saltos de línea */
function aiFormat(text, mark = h => h) {
  return String(text).split(/\n{2,}/).map(par => {
    const lines = par.split("\n");
    const html = lines.map(l => mark(esc(l)).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/^\s*[-*•]\s+/, "• ")).join("<br>");
    return `<p>${html}</p>`;
  }).join("");
}
async function aiAsk(question) {
  question = String(question || "").trim();
  if (!question) { $("aiQuestion").focus(); return; }
  if (!aiProvider()) { toast("Elige antes un proveedor en ⚙ Ajustes › 🤖 Profesor IA."); openModal("settingsModal"); return; }
  const blocked = helpBlocked();
  if (blocked) { toast(blocked); return; }
  if (AI.busy) return;
  AI.busy = true;
  Engine.cancel("live");
  const token = ++AI.token, node = cur(), box = $("aiAnswer");
  noteCpuHelp();
  box.hidden = false;
  box.innerHTML = `<div class="retry-head">🤖 Profesor IA</div><div class="small">⏳ Analizando la posición con el motor…</div>`;
  $("aiAskBtn").disabled = true;
  try {
    // El motor, el contexto (repertorio, explorador, partidas modelo) y las propuestas de la IA se preparan a la vez:
    // la IA piensa sus jugadas mientras el motor analiza, y sin ver lo que dice el motor
    const status = t => { if (token === AI.token) box.querySelector(".small").textContent = t; };
    const ctxP = aiContext(node).catch(() => ({ text: "", sources: [], games: [] }));
    const propP = settings.aiPropose && !gameStatus(node).over
      ? ctxP.then(ctx => aiPropose(node, ctx, question)).catch(e => ({ error: e.message || String(e) }))
      : Promise.resolve([]);
    if (settings.aiPropose) status("⏳ El motor analiza mientras la IA piensa sus propias jugadas (sin ver al motor)…");
    const aboutMove = /por qu[eé] se jug|compar|alternativ|en vez de|mejor que|[uú]ltima jugada|fue buena/i.test(question);
    const [facts, ctx, props, moveFacts] = await Promise.all([aiFacts(node), ctxP, propP, aboutMove ? aiMoveFacts(node).catch(() => "") : Promise.resolve("")]);
    if (moveFacts) facts.text += "\n" + moveFacts;
    if (token !== AI.token || cur() !== node) return;
    let checked = [];
    if (Array.isArray(props) && props.length) {
      status(`⏳ ${Engine.name || "El motor"} comprueba las ${props.length} propuestas de la IA…`);
      checked = await aiVerify(node, props, facts.lines);
      if (token !== AI.token || cur() !== node) return;
    }
    const propText = aiProposalsText(checked);
    // Las jugadas que el alumno menciona en la pregunta («¿y si juego Ae3?»), valoradas por el motor
    const alt = await aiMovesInQuestion(node, question, facts.lines[0] ? aiEv(facts.lines[0]) : null).catch(() => ({ items: [], text: "" }));
    if (token !== AI.token || cur() !== node) return;
    // Lo ya preguntado en esta misma posición, para poder encadenar preguntas
    if (AI.hist.key !== node.key) AI.hist = { key: node.key, items: [] };
    const histText = AI.hist.items.slice(-3).map(h => `Alumno: ${h.q}\nProfesor: ${h.a}`).join("\n");
    status(`⏳ Preguntando a ${AI_PROVIDERS[aiProvider()].name.split(" (")[0]}…`);
    // Lo que diga de las piezas se comprueba en el tablero (y en las primeras jugadas de las líneas conocidas)
    const states = [node.state, ...facts.lines.flatMap(l => aiLineStates(node.state, l.pv)), ...checked.filter(p => p.ucis && p.ucis.length).flatMap(p => aiLineStates(p.state0, p.ucis)), ...alt.items.flatMap(a => [a.after, ...aiLineStates(a.after, a.reply || [])])];
    const { text, errs: claimErrs } = await aiCallChecked(aiSystem(), `${facts.text}${propText ? "\n\n" + propText : ""}${alt.text ? "\n\nJugadas que menciona el alumno, valoradas por el motor:\n" + alt.text : ""}${ctx.text ? "\n\nContexto (datos comprobados, no del motor):\n" + ctx.text : ""}${histText ? "\n\nConversación anterior sobre esta misma posición:\n" + histText : ""}\n\nPregunta del alumno: ${question}`, states, aiStudentSide(node));
    AI.hist.items.push({ q: question, a: String(text).replace(/\s+/g, " ").slice(0, 500) });
    if (token !== AI.token) return;
    // Lo que cuenta como comprobado: el motor, las propuestas legales con su refutación, el contexto y la partida
    const allowed = aiAllowedMoves([facts.text, ctx.text, alt.text, ...checked.filter(p => p.status !== "ilegal").map(p => `${p.text} ${p.refutation ? p.refutation.text : ""}`)]);
    const stats = {};
    const resolver = aiMoveResolver(node, [...facts.lines.map(l => ({ state: node.state, ucis: l.pv })),
      ...checked.filter(p => p.ucis && p.ucis.length).map(p => ({ state: p.state0, ucis: p.ucis })),
      ...checked.filter(p => p.refutation).map(p => ({ state: p.refutation.state, ucis: p.refutation.pv })),
      ...(ctx.games || []).filter(g => g.afterLine).map(g => g.afterLine),
      ...alt.items.map(a => ({ state: node.state, ucis: [a.uci, ...(a.reply || [])] }))]);
    const answer = aiMarkClaims(aiFormat(text, html => aiMoveMarkup(html, allowed, resolver, stats)), claimErrs);
    box.innerHTML = `<div class="retry-head">🤖 Profesor IA <span class="small">· ${esc(AI_PROVIDERS[aiProvider()].name.split(" (")[0])} (${esc(aiModel())})</span></div>
      <div class="ai-q small">❓ ${esc(question)}</div><div class="ai-text">${answer}</div>
      ${aiProposalsHtml(checked)}${props && props.error ? `<div class="small">🧪 No se pudieron obtener las propuestas de la IA (${esc(props.error)}); la respuesta usa sólo el motor.</div>` : ""}
      ${stats.flagged ? `<div class="small ai-unverified-note">⚠ ${stats.flagged === 1 ? "Una jugada de la respuesta no está comprobada" : `${stats.flagged} jugadas de la respuesta no están comprobadas`} por el motor: tómala${stats.flagged === 1 ? "" : "s"} con cautela.</div>` : ""}
      ${ctx.games.length ? `<div class="ai-models small">♟ Partidas modelo: ${ctx.games.map((g, i) => `<button class="sm-btn" data-ai-model="${i}" title="Abrir en esta posición">${esc(g.title)}</button>`).join(" ")}</div>` : ""}
      <div class="controls"><button class="sm-btn" data-ai-save title="Guarda esta respuesta en el comentario de la jugada">💾 Añadir como comentario</button>${AI.hist.items.length > 1 ? `<span class="small">💬 Recuerda ${AI.hist.items.length - 1} pregunta${AI.hist.items.length === 2 ? "" : "s"} anterior${AI.hist.items.length === 2 ? "" : "es"} sobre esta posición</span>` : ""}</div>
      <div class="small">Las jugadas y valoraciones salen de ${esc(Engine.name || "el motor")}${ctx.sources.length ? `; contexto: ${esc(ctx.sources.join(" · "))}` : ""}. La explicación es de la IA, que puede equivocarse.</div>`;
    box.querySelector("[data-ai-save]").onclick = () => {
      const note = `Profesor IA (${question}): ${String(text).replace(/\*\*/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim()}`;
      node.comment = node.comment ? `${node.comment} ${note}` : note;
      markDirty(); render();
      toast(ui.libId ? "💾 Añadido al comentario de la jugada (se guarda solo)." : "Añadido al comentario de la jugada. Guarda la partida en la biblioteca para conservarlo.", 4000);
    };
    box.querySelectorAll("[data-ai-model]").forEach(b => b.onclick = () => aiOpenModel(ctx.games[+b.dataset.aiModel]));
  } catch (e) {
    if (token !== AI.token) return;
    box.innerHTML = `<div class="retry-head">🤖 Profesor IA</div><div class="msg-err">No se pudo obtener la respuesta: ${esc(e.message || String(e))}.</div>`;
  } finally {
    if (token === AI.token) { AI.busy = false; $("aiAskBtn").disabled = false; requestLive(); }
  }
}
/* El recuadro sólo se ve con un proveedor elegido, y no en los ejercicios */
function renderAiBox() {
  const box = $("aiBox");
  if (!box) return;
  box.hidden = !aiProvider() || editor.active || (quiz() && !cpuHelpMode());
  if (box.hidden) $("aiAnswer").hidden = true;
  renderAiQuick();
}
function syncAiSettingsForm() {
  const p = settings.aiProvider in AI_PROVIDERS ? settings.aiProvider : "none";
  $("setAiProvider").value = p;
  $("setAiModel").value = settings.aiModel || "";
  $("setAiModel").placeholder = (AI_PROVIDERS[p] || {}).model || "";
  $("setAiKey").value = settings.aiKey || "";
  $("setAiUrl").value = settings.aiUrl || "http://localhost:11434";
  $("aiKeyRow").hidden = !["claude", "gemini"].includes(p);
  $("aiUrlRow").hidden = p !== "ollama";
  $("aiModelRow").hidden = p === "none";
  $("aiTestBtn").hidden = p === "none";
  if (p === "ollama") ollamaModels().then(fillOllamaModels).catch(() => {});   // para elegir el modelo de una lista
  $("aiNote").innerHTML = p === "ollama" ? `Privado y gratuito: el modelo funciona en tu ordenador. Instala <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a> y descarga un modelo para conversar (por ejemplo <code>ollama pull qwen2.5:7b</code>). Además, Ollama tiene que dar permiso a esta página: <a href="#" class="help-link" data-help="help-ollama">cómo se hace, paso a paso</a>. Luego pulsa «🔌 Probar» y elige el modelo de la lista. <b>Para ajedrez van mejor los modelos grandes</b> (de 14B en adelante, si tu ordenador puede con ellos): los pequeños, como los de 7B, confunden a menudo las piezas; la aplicación comprueba lo que dicen, pero no puede arreglarlo todo. Claude y Gemini son los más fiables.`
    : p === "claude" ? "Necesitas una clave de la API de Anthropic (<a href=\"https://platform.claude.com\" target=\"_blank\" rel=\"noopener noreferrer\">platform.claude.com</a>), con su coste por uso. Se guarda sólo en este navegador y se envía sólo a Anthropic, con la posición y tu pregunta."
    : p === "gemini" ? "Necesitas una clave de la API de Google AI Studio. Se guarda sólo en este navegador y se envía sólo a Google, con la posición y tu pregunta."
    : "Desactivado: la aplicación no envía nada a ninguna IA. Las explicaciones de «Piensa conmigo» no necesitan IA.";
}
$("setAiProvider").onchange = e => { settings.aiProvider = e.target.value; settings.aiModel = ""; saveSettings(); syncAiSettingsForm(); renderAiBox(); };
$("setAiModel").onchange = e => { settings.aiModel = e.target.value.trim(); saveSettings(); };
$("setAiKey").onchange = e => { settings.aiKey = e.target.value.trim(); saveSettings(); };
$("setAiUrl").onchange = e => { settings.aiUrl = e.target.value.trim(); saveSettings(); };
/* Ollama: dirección, mensaje cuando no deja entrar a esta página y la lista de modelos instalados */
const ollamaBase = () => (settings.aiUrl || "http://localhost:11434").trim().replace(/\/+$/, "") || "http://localhost:11434";
const pageOrigin = () => (/^https?:$/.test(location.protocol) ? location.origin : "un archivo abierto desde tu ordenador");
function ollamaBlockedMsg() {
  return `no se puede conectar con Ollama en ${ollamaBase()}. Si Ollama está en marcha, es que no deja entrar a esta página (${pageOrigin()}): hay que darle permiso con la variable OLLAMA_ORIGINS y reiniciarlo. Los pasos están en ❓ Ayuda › «Problemas frecuentes» › «Conectar Ollama»`;
}
async function ollamaModels() {
  let res;
  try { res = await fetch(`${ollamaBase()}/api/tags`); } catch (e) { throw Error(ollamaBlockedMsg()); }
  if (!res.ok) throw Error(`Ollama respondió con un error ${res.status} al pedir la lista de modelos`);
  const data = await res.json();
  return ((data && data.models) || []).map(m => m.name || m.model).filter(Boolean);
}
const isEmbedModel = n => /embed|bge-|minilm/i.test(n);
function fillOllamaModels(names) {
  const list = $("aiModelList");
  list.innerHTML = names.filter(n => !isEmbedModel(n)).map(n => `<option value="${esc(n)}">`).join("");
}
$("aiTestBtn").onclick = async () => {
  const out = $("aiTestResult");
  out.className = "small"; out.textContent = "⏳ Probando…";
  try {
    if (aiProvider() === "ollama") {
      const names = await ollamaModels();
      fillOllamaModels(names);
      const chat = names.filter(n => !isEmbedModel(n));
      if (!chat.length) throw Error("Ollama funciona, pero no tiene ningún modelo para conversar: descarga uno, por ejemplo con «ollama pull qwen2.5:7b»");
      let m = aiModel();
      // Sin etiqueta («qwen3.5»), Ollama buscaría «qwen3.5:latest»: si sólo hay una versión instalada, se completa el nombre
      if (m && !m.includes(":") && !names.includes(m + ":latest")) {
        const same = chat.filter(n => n.split(":")[0] === m);
        if (same.length === 1) { m = same[0]; settings.aiModel = m; saveSettings(); $("setAiModel").value = m; }
      }
      const has = n => n === m || n === m + ":latest";
      if (!m || !names.some(has)) {
        out.className = "small msg-err";
        out.textContent = `✔ Ollama funciona y deja entrar a esta página, pero ${m ? `no tiene el modelo «${m}»` : "falta elegir el modelo"}. Tus modelos para conversar: ${chat.join(", ")}. Elige uno en «Modelo» (al pulsar en la casilla salen en la lista) y vuelve a pulsar «Probar».`;
        $("setAiModel").focus();
        return;
      }
      if (isEmbedModel(m)) throw Error(`«${m}» es un modelo de «embeddings», que no sirve para conversar: elige otro`);
      out.textContent = `⏳ Ollama responde. Cargando «${m}» (la primera vez puede tardar un minuto)…`;
    }
    const t = await aiCall("Responde en español con una sola palabra.", "Di «hola».");
    out.className = "small msg-ok"; out.textContent = `✔ Funciona. Respuesta: «${t.slice(0, 60)}»`;
  } catch (e) {
    out.className = "small msg-err"; out.textContent = "❌ " + (e.message || e);
    if (/OLLAMA_ORIGINS/.test(e.message || "")) out.insertAdjacentHTML("beforeend", ` <a href="#" class="help-link" data-help="help-ollama">Ver los pasos</a>`);
  }
};
$("aiAskBtn").onclick = () => aiAsk($("aiQuestion").value);
$("aiQuestion").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); aiAsk($("aiQuestion").value); } });
renderAiQuick();

/* 📏 Profundidad: los botones del recuadro y el desplegable de Ajustes */
function syncAiDepth() {
  const d = AI_DEPTHS[settings.aiDepth] ? settings.aiDepth : "normal";
  document.querySelectorAll("[data-ai-depth]").forEach(b => { b.classList.toggle("on", b.dataset.aiDepth === d); b.setAttribute("aria-pressed", b.dataset.aiDepth === d); });
  if ($("setAiDepth")) $("setAiDepth").value = d;
}
document.querySelectorAll("[data-ai-depth]").forEach(b => b.onclick = () => { settings.aiDepth = b.dataset.aiDepth; saveSettings(); syncAiDepth(); toast(`📏 Respuestas ${{ short: "breves", normal: "normales", deep: "detalladas" }[settings.aiDepth]}`); });
$("setAiDepth").onchange = e => { settings.aiDepth = e.target.value; saveSettings(); syncAiDepth(); };
syncAiDepth();
