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
const AI = { busy: false, sdk: null, token: 0, arrow: null };
const aiProvider = () => (AI_PROVIDERS[settings.aiProvider] && settings.aiProvider !== "none" ? settings.aiProvider : "");
const aiModel = () => (settings.aiModel || "").trim() || (AI_PROVIDERS[aiProvider()] || {}).model || "";

/* Lo que se le da a la IA: hechos calculados aquí, nunca inventados por ella */
/* La posición sin nada del motor: lo que ve la IA cuando propone sus propias jugadas */
function aiPositionText(node) {
  const s = node.state, me = s.t;
  const side = me === 1 ? "blancas" : "negras";
  const path = Pgn.pathTo(node).slice(1);
  const moves = path.length ? lineText(game.root.state, path.map(n => n.uci), 400) : "(ninguna: posición inicial de la lección o de la partida)";
  const eco = ECO.detect(node);
  const danger = piecesInDanger(s, me).map(x => `${PIECE_ES[s.b[x.sq].toLowerCase()]} de ${Chess.sqName(x.sq)} (${x.why})`);
  const chances = piecesInDanger(s, -me).map(x => `${PIECE_ES[s.b[x.sq].toLowerCase()]} de ${Chess.sqName(x.sq)} (${x.why})`);
  const st = gameStatus(node);
  return [
    `Posición (FEN): ${Chess.toFen(s)}`,
    aiPiecesText(s),
    `Juegan las ${side}.${st.over ? " " + st.text + "." : Chess.inCheck(s) ? " Están en jaque." : ""}`,
    `Jugadas hasta aquí: ${moves}`,
    eco ? `Apertura: ${eco.entry.eco} ${eco.entry.name}.` : "",
    danger.length ? `Piezas de las ${side} en peligro: ${danger.join("; ")}.` : `Ninguna pieza de las ${side} está en peligro inmediato.`,
    chances.length ? `Piezas del rival que se pueden ganar: ${chances.join("; ")}.` : ""
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
function aiSystem() {
  const lvl = { basic: "INICIACIÓN: tono cálido y sencillo, sin cifras de valoración ni términos técnicos sin explicar; termina con una regla general para recordar.",
    club: "CLUB: terminología de ajedrez precisa pero accesible (clavadas, horquillas, columnas abiertas, estructura de peones).",
    advanced: "AVANZADO: análisis concreto, con variantes y valoraciones, y los matices estratégicos." }[settings.explainLevel] || "";
  return `Eres el profesor de ajedrez de AjedrezBase. Respondes siempre en español de España, de forma breve (unas 200 palabras como máximo) y didáctica.
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
async function aiCall(system, user) {
  const p = aiProvider(), model = aiModel();
  if (p === "ollama") {
    if (!model) throw Error("elige antes un modelo (pulsa «🔌 Probar» para ver los que tienes instalados)");
    let res;
    try {
      res = await fetch(`${ollamaBase()}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
    } catch (e) { throw Error(ollamaBlockedMsg()); }
    if (!res.ok) {
      let detail = "";
      try { detail = ((await res.json()) || {}).error || ""; } catch {}
      if (res.status === 404) throw Error(`Ollama no tiene el modelo «${model}». Escríbelo tal como sale en «ollama list» (con lo que va tras los dos puntos) o descárgalo con «ollama pull ${model}»`);
      if (/does not support (chat|generate)|embedding/i.test(detail)) throw Error(`«${model}» es un modelo de «embeddings», que no sirve para conversar: elige otro`);
      throw Error(`Ollama respondió con un error ${res.status}${detail ? ": " + detail : ""}`);
    }
    const data = await res.json();
    // Los modelos que «piensan» (deepseek-r1, qwen3…) pueden escribir su razonamiento entre <think> y </think>: se quita
    const text = String((data && data.message && data.message.content) || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "").trim();
    if (!text) throw Error("Ollama no ha devuelto ninguna respuesta");
    return text;
  }
  if (!settings.aiKey) throw Error("falta la clave: ponla en ⚙ Ajustes › Profesor IA");
  if (p === "gemini") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": settings.aiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] }) });
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
    const req = { model, max_tokens: 16000, system, messages: [{ role: "user", content: user }] };
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
    const [facts, ctx, props] = await Promise.all([aiFacts(node), ctxP, propP]);
    if (token !== AI.token || cur() !== node) return;
    let checked = [];
    if (Array.isArray(props) && props.length) {
      status(`⏳ ${Engine.name || "El motor"} comprueba las ${props.length} propuestas de la IA…`);
      checked = await aiVerify(node, props, facts.lines);
      if (token !== AI.token || cur() !== node) return;
    }
    const propText = aiProposalsText(checked);
    status(`⏳ Preguntando a ${AI_PROVIDERS[aiProvider()].name.split(" (")[0]}…`);
    // Lo que diga de las piezas se comprueba en el tablero (y en las primeras jugadas de las líneas conocidas)
    const states = [node.state, ...facts.lines.flatMap(l => aiLineStates(node.state, l.pv)), ...checked.filter(p => p.ucis && p.ucis.length).flatMap(p => aiLineStates(p.state0, p.ucis))];
    const { text, errs: claimErrs } = await aiCallChecked(aiSystem(), `${facts.text}${propText ? "\n\n" + propText : ""}${ctx.text ? "\n\nContexto (datos comprobados, no del motor):\n" + ctx.text : ""}\n\nPregunta del alumno: ${question}`, states, node.state.t);
    if (token !== AI.token) return;
    // Lo que cuenta como comprobado: el motor, las propuestas legales con su refutación, el contexto y la partida
    const allowed = aiAllowedMoves([facts.text, ctx.text, ...checked.filter(p => p.status !== "ilegal").map(p => `${p.text} ${p.refutation ? p.refutation.text : ""}`)]);
    const stats = {};
    const resolver = aiMoveResolver(node, [...facts.lines.map(l => ({ state: node.state, ucis: l.pv })),
      ...checked.filter(p => p.ucis && p.ucis.length).map(p => ({ state: p.state0, ucis: p.ucis })),
      ...checked.filter(p => p.refutation).map(p => ({ state: p.refutation.state, ucis: p.refutation.pv })),
      ...(ctx.games || []).filter(g => g.afterLine).map(g => g.afterLine)]);
    const answer = aiMarkClaims(aiFormat(text, html => aiMoveMarkup(html, allowed, resolver, stats)), claimErrs);
    box.innerHTML = `<div class="retry-head">🤖 Profesor IA <span class="small">· ${esc(AI_PROVIDERS[aiProvider()].name.split(" (")[0])} (${esc(aiModel())})</span></div>
      <div class="ai-q small">❓ ${esc(question)}</div><div class="ai-text">${answer}</div>
      ${aiProposalsHtml(checked)}${props && props.error ? `<div class="small">🧪 No se pudieron obtener las propuestas de la IA (${esc(props.error)}); la respuesta usa sólo el motor.</div>` : ""}
      ${stats.flagged ? `<div class="small ai-unverified-note">⚠ ${stats.flagged === 1 ? "Una jugada de la respuesta no está comprobada" : `${stats.flagged} jugadas de la respuesta no están comprobadas`} por el motor: tómala${stats.flagged === 1 ? "" : "s"} con cautela.</div>` : ""}
      ${ctx.games.length ? `<div class="ai-models small">♟ Partidas modelo: ${ctx.games.map((g, i) => `<button class="sm-btn" data-ai-model="${i}" title="Abrir en esta posición">${esc(g.title)}</button>`).join(" ")}</div>` : ""}
      <div class="small">Las jugadas y valoraciones salen de ${esc(Engine.name || "el motor")}${ctx.sources.length ? `; contexto: ${esc(ctx.sources.join(" · "))}` : ""}. La explicación es de la IA, que puede equivocarse.</div>`;
    box.querySelectorAll("[data-ai-model]").forEach(b => b.onclick = () => aiOpenModel(ctx.games[+b.dataset.aiModel]));
  } catch (e) {
    if (token !== AI.token) return;
    box.innerHTML = `<div class="retry-head">🤖 Profesor IA</div><div class="msg-err">No se pudo obtener la respuesta: ${esc(e.message || String(e))}.</div>`;
  } finally {
    if (token === AI.token) { AI.busy = false; $("aiAskBtn").disabled = false; }
  }
}
/* El recuadro sólo se ve con un proveedor elegido, y no en los ejercicios */
function renderAiBox() {
  const box = $("aiBox");
  if (!box) return;
  box.hidden = !aiProvider() || editor.active || (quiz() && !cpuHelpMode());
  if (box.hidden) $("aiAnswer").hidden = true;
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
document.querySelectorAll("[data-aiq]").forEach(b => b.onclick = () => { $("aiQuestion").value = b.dataset.aiq; aiAsk(b.dataset.aiq); });
