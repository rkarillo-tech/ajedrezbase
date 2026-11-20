/* ---------- 19f. 🤖 Profesor IA: comentario de la partida y preguntas sin escribir ----------
   · Comentario de la partida: tras «🤖 Analizar y comentar» (o el informe del entrenador al jugar contra la CPU), el
     profesor comenta como un entrenador los momentos clave: qué pasó, qué era mejor y por qué, y la lección. Todo
     sale del análisis del motor (jugadas, valoraciones, mejor línea) y de la lista de piezas de cada momento; lo que
     diga de las piezas se comprueba y las jugadas se pueden pulsar. Se puede guardar como comentario de la partida.
   · Preguntas sin escribir: los botones del recuadro del profesor cambian con la jugada seleccionada («¿Por qué
     12.Cf3?», «¿12.Cf3 o 12.Ae2?» si hay variantes, «¿Qué amenaza el rival?»). */
const AIRev = { busy: false, token: 0 };

/* Los datos de la partida para la IA: jugadores, apertura, resumen y, de cada momento clave, la posición, lo jugado,
   lo que era mejor y la línea del motor */
function aiReviewFacts(R, side) {
  const h = game.headers, name = c => (c === 1 ? h.White || "Blancas" : h.Black || "Negras");
  const moments = R.key.filter(x => !side || x.info.mover === side).slice(0, 3);
  const lines = [], states = [], resolverLines = [];
  lines.push(`Partida: ${name(1)} (blancas) contra ${name(-1)} (negras)${h.Result && h.Result !== "*" ? `, resultado ${h.Result}` : ""}.`);
  if (R.eco) lines.push(`Apertura: ${R.eco.entry.eco} ${R.eco.entry.name}.`);
  lines.push(`Resumen del motor: ${R.summary}`);
  lines.push(R.players.map(p => p.verdict).join(" "));
  if (side) lines.push(`El alumno jugó con las ${side === 1 ? "blancas" : "negras"}; comenta sobre todo sus jugadas.`);
  moments.forEach((x, i) => {
    const n = x.n, p = n.parent, pe = p.eval || {};
    const label = numPrefix(p.state) + aiSan(p.state, n.uci);
    const best = pe.best && pe.best !== n.uci ? pe.best : null;
    const pv = best && pe.pv ? pe.pv.slice(0, 8) : best ? [best] : [];
    lines.push(`\nMomento clave ${i + 1}: ${label}${n.nag || x.info.cls || ""}, jugada de las ${p.state.t === 1 ? "blancas" : "negras"} (${name(p.state.t)}), en la ${x.phase}.`,
      `Posición antes de la jugada (FEN): ${Chess.toFen(p.state)}`, aiPiecesText(p.state),
      `Qué pasó: ${x.theme.txt}; la valoración pasa de ${fmtEval(pe)} a ${fmtEval(x.info.after || n.eval)} (pierde ${Math.round(x.info.loss)} puntos de probabilidad de ganar).`,
      best ? `Lo mejor era ${aiSan(p.state, best)}; línea del motor: ${lineText(p.state, pv, 8)}.` : "");
    states.push(p.state, n.state, ...aiLineStates(p.state, pv));
    resolverLines.push({ state: p.state, ucis: [n.uci] }, { state: p.state, ucis: pv });
  });
  const practice = [...new Set(R.players.filter(p => !side || p.c === side).flatMap(p => p.practice))];
  if (practice.length) lines.push(`\nQué practicar según el análisis: ${practice.join(" ")}`);
  return { text: lines.filter(Boolean).join("\n"), moments, states, resolverLines };
}
function aiReviewSystem() {
  return aiSystem().replace(`unas ${aiDepth().words} palabras`, `unas ${aiDepth().review} palabras`) +
    `\n5. Estás comentando una partida ya jugada: no hay «posición actual»; habla de cada momento clave con su jugada y su número.`;
}
/* Pide el comentario y lo pinta en `box`; `side` (1 / -1) para centrarse en las jugadas del alumno */
async function aiGameReview(box, side) {
  const R = ui.report;
  if (!R) { toast("Analiza antes la partida («🤖 Analizar y comentar»)."); return; }
  if (!aiProvider()) { toast("Elige antes un proveedor en ⚙ Ajustes › 🤖 Profesor IA."); openSettings("ia"); return; }
  if (AIRev.busy) return;
  // Sin color indicado, si la partida lleva el nombre del alumno, se comenta desde su lado
  if (!side) { try { const names = myNameList(), h = game.headers; if (names.length) { if (names.includes(norm(h.White || "").trim())) side = 1; else if (names.includes(norm(h.Black || "").trim())) side = -1; } } catch {} }
  const F = aiReviewFacts(R, side);
  if (!F.moments.length) { box.innerHTML = `<div class="small">No hubo errores importantes${side ? " tuyos" : ""}: no hay momentos clave que comentar. ¡Buena partida!</div>`; return; }
  AIRev.busy = true;
  const tok = ++AIRev.token;
  box.hidden = false;
  box.innerHTML = `<div class="retry-head">🤖 El profesor comenta la partida</div><div class="small">⏳ Preguntando a ${esc(AI_PROVIDERS[aiProvider()].name.split(" (")[0])}…</div>`;
  try {
    const { text, errs } = await aiCallChecked(aiReviewSystem(), `${F.text}\n\nComenta la partida como un entrenador: empieza con un resumen de dos frases; después, para cada momento clave, qué pasó, qué era mejor y por qué, y la lección; termina con qué entrenar.`, F.states, side || 0);
    if (tok !== AIRev.token) return;
    const last = (ui.analysedLine && ui.analysedLine[ui.analysedLine.length - 1]) || cur();
    const resolver = aiMoveResolver(last, F.resolverLines), allowed = aiAllowedMoves([F.text]), stats = {};
    const html = aiMarkClaims(aiFormat(text, h => aiMoveMarkup(h, allowed, resolver, stats)), errs);
    box.innerHTML = `<div class="retry-head">🤖 El profesor comenta la partida <span class="small">· ${esc(AI_PROVIDERS[aiProvider()].name.split(" (")[0])} (${esc(aiModel())})</span></div>
      <div class="ai-text">${html}</div>
      <div class="ai-models small">📍 Ir a: ${F.moments.map((x, i) => `<button class="sm-btn" data-rv-go="${i}">${esc(numPrefix(x.n.parent.state) + dispSan(x.n) + (x.n.nag || ""))}</button>`).join(" ")}</div>
      <div class="controls"><button class="sm-btn" data-rv-save title="Lo añade al comentario del principio de la partida">💾 Guardar en la partida</button></div>
      <div class="small">Las jugadas y valoraciones salen de ${esc(Engine.name || "el motor")}; el comentario es de la IA, que puede equivocarse.</div>`;
    box.querySelectorAll("[data-rv-go]").forEach(b => b.onclick = () => { const x = F.moments[+b.dataset.rvGo]; if (x && !quiz()) goTo(x.n); });
    box.querySelector("[data-rv-save]").onclick = () => {
      const note = `Comentario del profesor IA: ${String(text).replace(/\*\*/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim()}`;
      game.root.comment = game.root.comment ? `${game.root.comment} ${note}` : note;
      markDirty(); render();
      toast(ui.libId ? "💾 Añadido al comentario inicial de la partida (se guarda solo)." : "Añadido al comentario inicial de la partida. Guárdala en la biblioteca para conservarlo.", 4000);
    };
  } catch (e) {
    if (tok === AIRev.token) box.innerHTML = `<div class="retry-head">🤖 El profesor comenta la partida</div><div class="msg-err">No se pudo obtener el comentario: ${esc(e.message || String(e))}.</div>`;
  } finally { if (tok === AIRev.token) { AIRev.busy = false; requestLive(); } }
}

/* Preguntas rápidas que dependen de la jugada seleccionada */
function renderAiQuick() {
  const box = $("aiQuick");
  if (!box || $("aiBox").hidden) return;
  const n = cur(), qs = [["¿Qué hago ahora?", "¿Qué debería hacer ahora y por qué?"]];
  if (n.parent && n.move) {
    const lbl = numPrefix(n.parent.state) + dispSan(n);
    qs.push([`¿Por qué ${lbl}?`, `¿Por qué se jugó ${lbl}? ¿Qué idea tiene y fue buena?`]);
    const sib = n.parent.children.find(c => c !== n);
    if (sib) {
      const s = numPrefix(n.parent.state) + dispSan(sib);
      qs.push([`¿${dispSan(n)} o ${dispSan(sib)}?`, `Compara ${lbl} con ${s}: ¿cuál es mejor en esta posición y por qué?`]);
    }
  }
  qs.push(["¿Qué amenaza el rival?", "¿Qué amenaza o qué quiere hacer el rival ahora?"], ["¿Cuál es el plan?", "¿Cuál es el plan para los dos bandos en esta posición?"]);
  const sig = qs.map(q => q[0]).join("|");
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = qs.map(([l, q]) => `<button class="sm-btn" data-aiq="${esc(q)}">${esc(l)}</button>`).join("");
  box.querySelectorAll("[data-aiq]").forEach(b => b.onclick = () => { $("aiQuestion").value = b.dataset.aiq; aiAsk(b.dataset.aiq); });
}
/* Para «¿Por qué…?» y «¿… o …?»: la valoración de la jugada y de sus alternativas desde la posición anterior */
async function aiMoveFacts(node) {
  if (!node.parent || !node.move) return "";
  const p = node.parent, mover = p.state.t, out = [];
  const before = p.eval && p.eval.best ? p.eval : null;
  let best = before;
  if (!best) { const r = await evalState(p.state, Engine.kind === "stockfish" ? 1200 : 1500, 2); const l = r && r.lines && r.lines[0]; if (l) best = { cp: l.cp, mate: l.mate, winner: l.winner, best: l.pv[0], pv: l.pv }; }
  if (best && best.best) out.push(`Antes de ${numPrefix(p.state)}${aiSan(p.state, node.uci)}, lo mejor según el motor era ${aiSan(p.state, best.best)} (${fmtEval(best)})${best.pv ? `; línea: ${lineText(p.state, best.pv, 6)}` : ""}.`);
  for (const c of p.children.slice(0, 4)) {
    let ev = c.eval;
    if (!ev) { const r = await evalState(c.state, Engine.kind === "stockfish" ? 900 : 1200, 1); const l = r && r.lines && r.lines[0]; ev = l ? { cp: l.cp, mate: l.mate, winner: l.winner } : null; }
    if (!ev || !best) continue;
    const loss = Math.max(0, aiWinFor(best, mover) - aiWinFor(ev, mover));
    out.push(`${c === node ? "Jugada elegida" : "Alternativa jugada en la partida o en otra variante"}: ${numPrefix(p.state)}${aiSan(p.state, c.uci)} → valoración ${fmtEval(ev)} (pierde ${Math.round(loss)} puntos de probabilidad de ganar respecto a la mejor).`);
  }
  return out.join("\n");
}
