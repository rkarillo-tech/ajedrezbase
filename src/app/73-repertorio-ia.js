/* ---------- 25d. 🤖 Comentar tu repertorio con el profesor IA (1.55) ----------
   Primero Stockfish revisa cada jugada tuya (si pierde mucho, se avisa en el comentario con la mejor) y busca las
   respuestas del rival que no tienes preparadas; después la IA explica la idea de cada jugada y qué hacer si el rival
   se sale, sólo con esos datos. Lo que dice de la posición se comprueba en el tablero (aiCheckClaims): si se equivoca
   y no lo corrige, ese comentario no se guarda. Los comentarios van en el PGN del repertorio, empiezan por «🤖» (así
   se reconocen y se sustituyen si lo vuelves a comentar) y nunca borran los tuyos. Antes de cambiar nada, el
   repertorio queda en 🕘 Versiones, así que se puede volver atrás. */
const RepAI = { busy: false, cancel: false };
const REPAI_MAX = 40, REPAI_BATCH = 10;
const REPAI_MARK = "🤖 ";

/* Las jugadas del repertorio que se comentan: las tuyas, por orden de profundidad (primero las de la apertura) */
function repAiNodes(root, side) {
  const out = [];
  (function walk(n, d) {
    if (n.parent && n.parent.state.t === side) out.push(n);
    if (d < 24) n.children.forEach(c => walk(c, d + 1));
  })(root, 0);
  return out.sort((a, b) => Pgn.pathTo(a).length - Pgn.pathTo(b).length).slice(0, REPAI_MAX);
}
/* Quita los comentarios de la IA de una pasada anterior, conservando lo que escribiste tú */
function repAiStrip(comment) {
  return String(comment || "").split(/\s*(?=🤖 )/).filter(part => !part.startsWith(REPAI_MARK)).join(" ").trim();
}
function repAiSystem(side) {
  const words = { short: 25, normal: 40, deep: 70 }[settings.aiDepth] || 40;
  return `Eres el profesor de ajedrez de AjedrezBase y comentas el repertorio de aperturas de un alumno, que juega con las ${side === 1 ? "blancas" : "negras"}. Respondes en español de España.
${aiTutorRole("que prepara su repertorio de aperturas")}
Reglas estrictas:
1. Para cada jugada que se te da, escribe un comentario breve (unas ${words} palabras como máximo) con la IDEA de la jugada: qué busca, qué plan prepara o qué evita. Nada de generalidades vacías.
2. Si se te dan «respuestas del rival que no tienes preparadas», añade en «siSeSale» una frase sobre cómo reaccionar ante la más importante, usando sólo las jugadas que se te dan. Si no hay, deja «siSeSale» vacío.
3. Sólo puedes citar jugadas que aparezcan en los datos (las del repertorio, las del motor y las del rival). No inventes jugadas ni variantes. No valores tú las jugadas con cifras: de eso se encarga el motor.
4. Para saber qué pieza hay en cada casilla y de qué color es, usa SÓLO la lista de piezas que se te da.
5. Notación algebraica española (R rey, D dama, T torre, A alfil, C caballo). Nunca las letras inglesas.
6. Responde SÓLO con un array JSON, sin texto antes ni después, con un objeto por jugada: [{"id": "n1", "comentario": "…", "siSeSale": "…"}]`;
}
function repAiParse(text) {
  const t = String(text || ""), a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a < 0 || b <= a) return null;
  try { const arr = JSON.parse(t.slice(a, b + 1)); return Array.isArray(arr) ? arr : null; } catch { return null; }
}

async function commentRepertoire(id) {
  const rec = Lib.games.get(id);
  if (!rec) return;
  if (!aiProvider()) { toast("Para comentar el repertorio hace falta el profesor IA: elige un proveedor en ⚙ Ajustes › 🤖 Profesor IA."); openSettings("ia"); return; }
  if (RepAI.busy || RepReview.busy) { toast("Ya hay una revisión en marcha."); return; }
  if (!Engine.ready) { toast("Espera a que el motor esté listo."); return; }
  const side = repSideOf(rec);
  const probe = repAiNodes(Pgn.parseGame(rec.pgn, { lang: "en" }).game.root, side);
  if (!probe.length) { toast("Este repertorio aún no tiene jugadas tuyas que comentar."); return; }
  const calls = Math.ceil(probe.length / REPAI_BATCH);
  const prov = (AI_PROVIDERS[aiProvider()] || {}).name || aiProvider();
  if (!confirm(`🤖 Comentar «${rec.title}»\n\nStockfish revisará ${probe.length} jugada${probe.length === 1 ? "" : "s"} tuya${probe.length === 1 ? "" : "s"} y después el profesor IA (${prov}) las comentará en ${calls} consulta${calls === 1 ? "" : "s"}${aiProvider() === "ollama" ? "" : " (pueden tener coste según tu proveedor)"}.\nSe envían las jugadas del repertorio y la posición de cada una, nada más.\n\nLos comentarios se guardan en el repertorio; la versión actual queda en 🕘 Versiones por si quieres volver atrás.`)) return;
  // Se trabaja sobre el repertorio abierto en el tablero: así se guarda solo, con su foto en 🕘 Versiones
  if (!openLibGame(id, [])) return;
  const root = game.root, g0 = game, out = $("repReviewOut");
  const nodes = repAiNodes(root, side);
  RepAI.busy = true; RepAI.cancel = false;
  const status = txt => { out.innerHTML = `<div class="note-box">🤖 Comentando «${esc(rec.title)}»… ${txt} <button class="sm-btn danger" id="repAiStop">⏹ Parar</button></div>`; $("repAiStop").onclick = () => { RepAI.cancel = true; }; };
  out.scrollIntoView({ block: "nearest" });
  const items = [];
  let saved = 0, dropped = 0, failed = "";
  try {
    // 1) Stockfish: cada jugada tuya frente a la mejor, y las mejores respuestas del rival después
    ui.analysing = true;
    Engine.cancel("live");
    const ms = Engine.kind === "stockfish" ? 350 : 600, cache = new Map();
    const ev = async (state, mpv) => {
      const k = Chess.toFen(state) + "|" + mpv;
      if (!cache.has(k)) { const r = await evalState(state, ms, mpv); cache.set(k, ((r && r.lines) || []).filter(l => l && l.pv)); }
      return cache.get(k);
    };
    for (let i = 0; i < nodes.length && !RepAI.cancel; i++) {
      const n = nodes[i];
      status(`Stockfish revisa tus jugadas (${i + 1} de ${nodes.length})…`);
      const before = await ev(n.parent.state, 1), after = await ev(n.state, 3);
      const b0 = before[0], a0 = after[0];
      const it = { n, id: "n" + (i + 1), path: Pgn.pathTo(n).slice(1) };
      if (b0 && a0) {
        const drop = (winnerCp(b0) - winnerCp(a0)) * side;
        if (drop >= 80 && b0.pv[0] && b0.pv[0] !== n.uci && !(winnerCp(a0) * side > 400))
          it.dubious = { drop, best: lineText(n.parent.state, [b0.pv[0]], 1) };
        it.evalAfter = fmtEval(a0);
      }
      // Respuestas del rival según el motor que no están en tu repertorio
      if (Chess.legal(n.state).length) {
        const have = new Set(n.children.map(c => c.uci));
        it.prepared = n.children.map(c => lineText(n.state, [c.uci], 1));
        it.deviations = after.filter(l => l.pv[0] && !have.has(l.pv[0])).slice(0, 2)
          .map(l => ({ san: lineText(n.state, [l.pv[0]], 1), uci: l.pv[0], ev: fmtEval(l), reply: l.pv.length > 1 ? lineText(Chess.apply(n.state, Chess.moveFromUci(n.state, l.pv[0])), l.pv.slice(1, 3), 2) : "" }));
      }
      it.engineLine = a0 && a0.pv.length ? lineText(n.state, a0.pv.slice(0, 4), 4) : "";
      items.push(it);
    }
    ui.analysing = false;
    // 2) La IA, por tandas
    const system = repAiSystem(side);
    const describe = it => {
      const n = it.n, moves = lineText(root.state, it.path.map(x => x.uci), 60);
      return [`[${it.id}] Tras ${moves}: la jugada del alumno es ${lineText(n.parent.state, [n.uci], 1)}.`,
        aiPiecesText(n.state).replace(/\n/g, " "),
        it.dubious ? `Stockfish: es dudosa, pierde ${(it.dubious.drop / 100).toFixed(1).replace(".", ",")} peones; lo mejor era ${it.dubious.best}. Explica la idea de la jugada del alumno, pero no la defiendas como la mejor.` : it.evalAfter ? `Stockfish: buena (valoración ${it.evalAfter}).` : "",
        it.engineLine ? `Línea del motor después: ${it.engineLine}.` : "",
        it.prepared && it.prepared.length ? `Respuestas del rival que ya tiene preparadas: ${it.prepared.join(", ")}.` : "",
        it.deviations && it.deviations.length ? `Respuestas del rival que NO tiene preparadas (según Stockfish): ${it.deviations.map(d => `${d.san} (${d.ev})${d.reply ? `, y el motor sigue con ${d.reply}` : ""}`).join("; ")}.` : ""
      ].filter(Boolean).join("\n");
    };
    const check = (it, text) => {
      const states = [it.n.state, it.n.parent.state, ...(it.deviations || []).map(d => Chess.apply(it.n.state, Chess.moveFromUci(it.n.state, d.uci)))];
      return aiCheckClaims(text, states, side);
    };
    for (let k = 0; k < items.length && !RepAI.cancel; k += REPAI_BATCH) {
      const batch = items.slice(k, k + REPAI_BATCH);
      status(`El profesor IA comenta tus jugadas (${Math.min(k + REPAI_BATCH, items.length)} de ${items.length})…`);
      const user = `Repertorio «${rec.title}», del alumno con las ${side === 1 ? "blancas" : "negras"}. Comenta estas ${batch.length} jugadas:\n\n${batch.map(describe).join("\n\n")}`;
      let arr = repAiParse(await aiCall(system, user));
      if (!arr) arr = repAiParse(await aiCall(system, `${user}\n\nIMPORTANTE: responde SÓLO con el array JSON, sin ningún texto alrededor.`));
      if (!arr) { failed = "la IA no ha respondido en el formato pedido"; break; }
      // Lo que diga de la posición, comprobado; si falla, se le pide corregir esos comentarios (una vez)
      const bad = [];
      for (const it of batch) {
        const a = arr.find(x => x && String(x.id) === it.id);
        if (!a || !String(a.comentario || "").trim()) continue;
        it.text = String(a.comentario).trim();
        it.ifOut = String(a.siSeSale || "").trim();
        it.errs = check(it, `${it.text} ${it.ifOut}`);
        if (it.errs.length) bad.push(it);
      }
      if (bad.length && !RepAI.cancel) {
        const fix = repAiParse(await aiCall(system, `${user}\n\nEn tu respuesta anterior hay errores sobre la posición:\n${bad.map(it => `[${it.id}] «${it.text} ${it.ifOut}»: ${it.errs.map(e => `dijiste «${e.text}», pero ${e.why}`).join("; ")}`).join("\n")}\nDevuelve el array JSON sólo con esos comentarios corregidos. Consulta SIEMPRE la lista de piezas.`).catch(() => "")) || [];
        for (const it of bad) {
          const a = fix.find(x => x && String(x.id) === it.id);
          if (!a) continue;
          const t = String(a.comentario || "").trim(), o = String(a.siSeSale || "").trim(), e2 = check(it, `${t} ${o}`);
          if (t && !e2.length) { it.text = t; it.ifOut = o; it.errs = []; }
        }
      }
    }
  } catch (e) { failed = e.message || String(e); }
  finally { ui.analysing = false; RepAI.busy = false; }
  // 3) Guardar: sólo si el repertorio sigue abierto en el tablero
  if (game === g0) {
    for (const it of items) {
      const notes = [];
      if (it.text && !(it.errs && it.errs.length)) notes.push(it.text + (!it.ifOut ? "" : /^si\b/i.test(it.ifOut) ? " " + it.ifOut : ` Si el rival se sale: ${it.ifOut}`));
      else if (it.text) dropped++;
      if (it.dubious) notes.push(`⚠ Stockfish: esta jugada pierde ${(it.dubious.drop / 100).toFixed(1).replace(".", ",")} peones; era mejor ${it.dubious.best}.`);
      if (!notes.length) continue;
      const mine = repAiStrip(it.n.comment);
      it.n.comment = [mine, ...notes.map(t => REPAI_MARK + t)].filter(Boolean).join(" ");
      saved++;
    }
    if (saved) { markDirty(); render(); }
  }
  const dub = items.filter(x => x.dubious).length;
  out.innerHTML = `<div class="note-box"><b>🤖 Comentarios de «${esc(rec.title)}»</b><br>
    ${saved ? `✔ ${saved} jugada${saved === 1 ? "" : "s"} comentada${saved === 1 ? "" : "s"}` : "No se ha guardado ningún comentario"}${dub ? ` · ⚠ ${dub} jugada${dub === 1 ? "" : "s"} dudosa${dub === 1 ? "" : "s"} según Stockfish (avisado en su comentario)` : ""}${dropped ? ` · ${dropped} comentario${dropped === 1 ? "" : "s"} descartado${dropped === 1 ? "" : "s"} porque la IA se equivocó sobre la posición` : ""}.
    ${RepAI.cancel ? "<br>Interrumpido: sólo se han guardado los que estaban listos." : ""}${failed ? `<br>❌ ${esc(failed)}.` : ""}
    <br><span class="small">Están en el tablero (pestaña 📖 Estudio): recorre las jugadas para leerlos. Empiezan por 🤖 y no tocan tus comentarios; si no te convencen, vuelve a la versión anterior con 🕘 Versiones.</span></div>`;
}
