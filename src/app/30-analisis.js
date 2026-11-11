/* ---------- 19. Análisis completo y comentarios automáticos ---------- */
function materialBalance(st) {
  const v = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let sum = 0;
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const x = st.b[i]; if (x !== ".") sum += Chess.color(x) * v[x.toLowerCase()]; }
  return sum;
}
function playUcis(st, ucis, max) {
  let s = st;
  for (const u of ucis.slice(0, max)) { const m = Chess.moveFromUci(s, u); if (!m) break; s = Chess.apply(s, m); }
  return s;
}
function hangingInfo(node) {
  const m = node.move, s = node.state, mover = node.parent.state.t;
  const p = s.b[m.to];
  if (!p || p === "." || "kp".includes(p.toLowerCase())) return null;
  const att = Chess.attackers(s.b, m.to, -mover);
  if (!att.length) return null;
  const def = Chess.attackers(s.b, m.to, mover);
  const val = Chess.VAL[p.toLowerCase()];
  const minAtt = Math.min(...att.map(x => Chess.VAL[s.b[x].toLowerCase()] || 1000));
  if (!def.length || minAtt < val) return `Ojo: ${PIECE_ART[p.toLowerCase()]} de ${Chess.sqName(m.to)} queda ${def.length ? "atacad" + (["r", "q"].includes(p.toLowerCase()) ? "a" : "o") + " por una pieza de menor valor" : "sin defensa"}.`;
  return null;
}
/* Ideas estratégicas de una jugada, comparando la posición antes y después.
   Devuelve [{ txt, w }]: w = importancia (3 alta, 1 baja). */
function strategicNotes(node) {
  const p = node.parent, before = p.state, after = node.state, m = node.move, me = before.t, them = -me;
  const pc = m.piece.toLowerCase(), notes = [];
  // En mitad de un cambio (se puede recapturar en la misma casilla) la estructura aún no es la definitiva
  if (m.captured !== "." && Chess.attackers(after.b, m.to, them).length) return notes;
  const sb = Chess.pawnStructure(before), sa = Chess.pawnStructure(after);
  const nm = sq => Chess.sqName(sq);
  // Peones pasados propios nuevos
  const newPassed = sa[me].passed.filter(x => !sb[me].passed.includes(x) && !(pc === "p" && x === m.to && sb[me].passed.includes(m.from)));
  const advanced = pc === "p" && sb[me].passed.includes(m.from) && sa[me].passed.includes(m.to);
  if (newPassed.length) notes.push({ txt: `Crea un peón pasado en ${nm(newPassed[0])}.`, w: 3 });
  else if (advanced) {
    const rank = me === 1 ? 8 - (m.to >> 4) : (m.to >> 4) + 1;
    notes.push({ txt: rank >= 6 ? `El peón pasado avanza a ${nm(m.to)}, cada vez más cerca de coronar.` : `Empuja el peón pasado a ${nm(m.to)}.`, w: rank >= 6 ? 3 : 2 });
  }
  // Debilidades en la estructura rival / propia
  const isoThem = sa[them].isolated.filter(x => !sb[them].isolated.includes(x));
  if (isoThem.length) notes.push({ txt: `Deja aislado el peón rival de ${nm(isoThem[0])}.`, w: 2 });
  const dblThem = sa[them].doubled.filter(c => !sb[them].doubled.includes(c));
  if (dblThem.length) notes.push({ txt: `Dobla los peones rivales en la columna ${"abcdefgh"[dblThem[0]]}.`, w: 2 });
  const isoMe = sa[me].isolated.filter(x => !sb[me].isolated.includes(x) && x !== m.to);
  if (isoMe.length && m.captured !== ".") notes.push({ txt: `A cambio, se queda con un peón aislado en ${nm(isoMe[0])}.`, w: 1 });
  const dblMe = sa[me].doubled.filter(c => !sb[me].doubled.includes(c));
  if (dblMe.length) notes.push({ txt: `Acepta peones doblados en la columna ${"abcdefgh"[dblMe[0]]}.`, w: 1 });
  // Pareja de alfiles
  if (Chess.bishopPair(before, me) && !Chess.bishopPair(after, me) && Chess.bishopPair(after, them)) notes.push({ txt: "Cede la pareja de alfiles.", w: 2 });
  if (Chess.bishopPair(before, them) && !Chess.bishopPair(after, them) && Chess.bishopPair(after, me)) notes.push({ txt: "Elimina la pareja de alfiles rival y se queda con la suya.", w: 2 });
  // Casilla fuerte para el caballo (o el alfil)
  if ((pc === "n" || pc === "b") && Chess.isOutpost(after, m.to, me)) notes.push({ txt: `Instala ${PIECE_ART[pc]} en ${nm(m.to)}, una casilla fuerte apoyada por un peón y que ningún peón rival puede atacar.`, w: 3 });
  // Torre en séptima
  if ((pc === "r" || pc === "q") && (me === 1 ? m.to >> 4 === 1 : m.to >> 4 === 6) && (me === 1 ? m.from >> 4 !== 1 : m.from >> 4 !== 6)) notes.push({ txt: `${pc === "r" ? "La torre" : "La dama"} llega a la séptima fila, donde ataca los peones y encierra al rey.`, w: 2 });
  // Cambio de damas
  const queens = st => { let n = 0; for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (st.b[i] === "Q" || st.b[i] === "q") n++; } return n; };
  if (m.captured.toLowerCase() === "q" && queens(after) === 0) notes.push({ txt: "Se cambian las damas: la partida se encamina hacia el final.", w: 2 });
  // Debilitar el enroque
  if (pc === "p") {
    const k = Chess.kingSq(before.b, me), kf = k & 7, home = me === 1 ? 7 : 0;
    const castledK = (k >> 4) === home && kf >= 5, castledQ = (k >> 4) === home && kf <= 2;
    const f = m.from & 7, fromHome = (m.from >> 4) === (me === 1 ? 6 : 1);
    if (fromHome && ((castledK && f >= 5) || (castledQ && f <= 2))) notes.push({ txt: "Avanza un peón del enroque: debilita la protección del rey.", w: 1 });
  }
  return notes;
}
function describeMotif(node) {
  const p = node.parent, s = p.state, m = node.move, pc = m.piece.toLowerCase(), to = Chess.sqName(m.to);
  const out = [];
  const ply = Pgn.pathTo(node).length - 1;
  if (m.flag === "castle") out.push(m.to > m.from ? "Enroque corto: el rey se pone a salvo y la torre entra en juego." : "Enroque largo: el rey se refugia en el flanco de dama y la torre llega a la columna d.");
  else if (m.promotion) out.push(`Corona ${m.promotion === "q" ? "una dama" : "en " + PIECE_ES[m.promotion]}.`);
  else if (m.captured !== ".") out.push(`${cap(PIECE_ART[pc])} captura ${PIECE_ART[m.captured.toLowerCase()]} de ${to}.`);
  else if (pc === "p" && ply <= 24 && ["d4", "e4", "d5", "e5", "c4", "c5", "f4", "f5"].includes(to)) out.push(`Peón a ${to}: gana espacio y pelea por el centro.`);
  else if ((pc === "n" || pc === "b") && (m.from >> 4) === (s.t === 1 ? 7 : 0)) out.push(`Desarrolla ${PIECE_ART[pc]} a ${to}.`);
  else if (pc === "r") {
    const f = m.to & 7;
    let own = false, any = false;
    for (let r = 0; r < 8; r++) { const x = node.state.b[r * 16 + f]; if (x === "P" || x === "p") { any = true; if (Chess.color(x) === s.t) own = true; } }
    if (!any) out.push(`La torre ocupa la columna ${"abcdefgh"[f]} abierta.`);
    else if (!own) out.push(`La torre se sitúa en la columna ${"abcdefgh"[f]} semiabierta.`);
  } else if (pc === "k" && (s.c & (s.t === 1 ? 3 : 12))) out.push("El rey se mueve y pierde el derecho a enrocar.");
  else if (pc === "p") {
    const rank = s.t === 1 ? 8 - (m.to >> 4) : (m.to >> 4) + 1;
    if (rank >= 6) out.push(`El peón avanza a ${to}, cada vez más cerca de coronar.`);
  }
  if (Chess.inCheck(node.state)) out.push(Chess.legal(node.state).length ? "Da jaque." : "¡Jaque mate!");
  // Hasta dos ideas estratégicas, las más importantes
  const strat = strategicNotes(node).sort((a, b) => b.w - a.w).slice(0, 2).map(x => x.txt);
  // Evitar repetir lo del peón que avanza
  if (strat.some(t => t.startsWith("El peón pasado avanza"))) { const i = out.findIndex(t => t.startsWith("El peón avanza")); if (i >= 0) out.splice(i, 1); }
  return out.concat(strat).join(" ");
}
function classifyMove(n) {
  const p = n.parent;
  if (!p || !p.eval || !n.eval) return null;
  const mover = p.state.t;
  // Si la jugada es una de las líneas calculadas desde la posición anterior, usamos ESA
  // evaluación (misma búsqueda): elimina el ruido de comparar dos búsquedas distintas.
  let after = n.eval;
  if (p.eval.best === n.uci && p.eval.mate !== 0) after = p.eval;
  else if (p.eval.second && p.eval.second.uci === n.uci) after = p.eval.second;
  if (n.eval.mate === 0) after = n.eval;
  const wb = mover === 1 ? winPct(p.eval) : 100 - winPct(p.eval);
  const wa = mover === 1 ? winPct(after) : 100 - winPct(after);
  const book = ECO.byKey.has(n.key);
  const loss = book ? 0 : Math.max(0, wb - wa);
  const cpOf = ev => (ev.mate != null ? (ev.mate === 0 ? ev.winner * 1000 : Math.sign(ev.mate) * 1000) : Math.max(-1000, Math.min(1000, ev.cp)));
  const cpl = book ? 0 : Math.max(0, (cpOf(p.eval) - cpOf(after)) * mover);
  const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  let cls = loss >= 15 ? "??" : loss >= 10 ? "?" : loss >= 5 ? "?!" : "";
  // Jugada única: coincide con el motor y la segunda opción era claramente peor
  const obvious = Chess.inCheck(p.state) || n.move.captured !== ".";
  if (!cls && !book && !obvious && p.eval.best === n.uci && p.eval.second) {
    const ws = mover === 1 ? winPct(p.eval.second) : 100 - winPct(p.eval.second);
    if (wb - ws >= 20 && wb < 97) cls = "!";
  }
  // Dejar escapar un mate forzado se marca siempre
  const hadMate = p.eval.mate != null && p.eval.mate !== 0 && p.eval.mate * mover > 0;
  const keepsMate = (after.mate != null && after.mate !== 0 && after.mate * mover > 0) || (after.mate === 0 && after.winner === mover);
  if (hadMate && !keepsMate && (!cls || cls === "?!" || cls === "!")) cls = "?";
  return { loss, cpl, acc, cls, mover, after, book };
}
function buildComment(n, info) {
  const p = n.parent, mover = p.state.t, parts = [];
  const lang = settings.lang;
  const eco = ECO.byKey.get(n.key);
  if (eco && !n.children.some(c => ECO.byKey.has(c.key))) parts.push(`Teoría: ${eco.eco} ${eco.name}.`);
  const cls = info ? info.cls : "";
  if (cls === "!") parts.push("¡Muy buena! Era prácticamente la única jugada que mantenía la valoración.");
  if (["?!", "?", "??"].includes(cls)) {
    const label = { "?!": "Imprecisión", "?": "Error", "??": "Error grave" }[cls];
    let s = `${label} (${cls}).`;
    const pe = p.eval, ne = info.after || n.eval;
    if (pe.mate != null && pe.mate * mover > 0 && !(ne.mate != null && ne.mate * mover > 0)) s += ` Se escapa un mate en ${Math.abs(pe.mate)}.`;
    else if (ne.mate != null && ne.mate !== 0 && ne.mate * mover < 0) s += ` Permite mate en ${Math.abs(ne.mate)}.`;
    else s += ` La valoración pasa de ${fmtEval(pe)} a ${fmtEval(ne)}.`;
    if (pe.best && pe.best !== n.uci) {
      const txt = lineText(p.state, pe.pv && pe.pv.length ? pe.pv : [pe.best], 5);
      if (txt) s += ` Era mejor ${txt}.`;
    }
    const refUci = n.eval.best;
    if (refUci) {
      const L = Chess.legal(n.state), rm = Chess.moveFromUci(n.state, refUci, L);
      if (rm) {
        const pv = n.eval.pv && n.eval.pv.length ? n.eval.pv : [refUci];
        s += ` La respuesta precisa es ${lineText(n.state, pv, cls === "?!" ? 1 : 3)}`;
        s += n.eval.mate != null && n.eval.mate !== 0 && n.eval.mate * mover < 0 ? ", que lleva al mate." : ".";
        const lost = (materialBalance(p.state) - materialBalance(playUcis(n.state, pv, 8))) * mover;
        if (lost >= 2 && !(n.eval.mate != null && n.eval.mate * mover < 0)) {
          s += ` El rival gana material (unos ${Math.round(lost)} puntos).`;
          if (rm.captured !== "." && rm.to === n.move.to) { const hang = hangingInfo(n); if (hang) s += " " + hang; }
        }
      }
    }
    parts.push(s);
  }
  const motif = describeMotif(n);
  if (motif) parts.push(motif);
  return parts.join(" ");
}
async function analyseGame(opts = {}) {
  if (Batch.running) { toast("Ahora se están analizando tus partidas de la biblioteca: espera a que termine o detenlo en «📊 Estadísticas»."); return; }
  if (ui.analysing) return;
  const quick = !!opts.quick;
  // Por defecto, la línea principal; con opts.variation, la línea que pasa por la jugada actual
  const nodes = opts.variation ? [...Pgn.pathTo(cur()), ...Pgn.mainlineFrom(cur())] : [game.root, ...Pgn.mainlineFrom(game.root)];
  ui.analysedLine = nodes;
  if (nodes.length < 2) { toast("No hay jugadas que analizar."); return; }
  if (quiz()) { toast("Termina antes el ejercicio."); return; }
  ui.analysing = true;
  ui.cancelAnalysis = false;
  Engine.cancel("live");
  $("autoAnnotateBtn").disabled = true;
  $("cancelAnalysisBtn").hidden = false;
  $("analysisProgress").classList.add("show");
  const bar = $("analysisProgress").firstElementChild;
  const minDepth = quick ? (Engine.kind === "stockfish" ? 8 : 4) : (Engine.kind === "stockfish" ? 12 : 5);
  const t0 = Date.now();
  for (let i = 0; i < nodes.length && !ui.cancelAnalysis; i++) {
    const n = nodes[i];
    const term = terminalEval(n);
    if (term) n.eval = term;
    else if (!(n.eval && n.eval.source !== "pgn" && (n.eval.depth || 0) >= minDepth && (quick || n.eval.second !== undefined || Engine.kind !== "stockfish"))) {
      const job = await Engine.analyse(n, quick
        ? { purpose: "batch", movetime: Math.min(300, +settings.analysisMs), multipv: 1 }
        : { purpose: "batch", movetime: +settings.analysisMs, multipv: Engine.kind === "stockfish" ? 2 : 1 });
      if (job) storeEval(n, job, true);
    }
    bar.style.width = ((i + 1) / nodes.length * 100).toFixed(1) + "%";
    $("analysisStatus").textContent = `${quick ? "Completando el gráfico" : "Analizando"} con ${Engine.name}: posición ${i + 1} de ${nodes.length}…`;
    if (i % 3 === 0) renderEvalChart();
  }
  const cancelled = ui.cancelAnalysis;
  ui.analysing = false;
  $("autoAnnotateBtn").disabled = false;
  $("cancelAnalysisBtn").hidden = true;
  $("analysisProgress").classList.remove("show");
  bar.style.width = "0";
  if (cancelled) { $("analysisStatus").textContent = "Análisis detenido. Las evaluaciones obtenidas se conservan."; render(); return; }
  if (quick) { $("analysisStatus").textContent = "📈 Gráfico completado. Para marcar errores y redactar comentarios usa «🤖 Analizar y comentar»."; if (ui.libId) markDirty(); render(); return; }
  const st = annotateNodes(nodes);
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const harm = a => a.length / a.reduce((x, y) => x + 1 / Math.max(1, y), 0);
  for (const [k, pre] of [[1, "W"], [-1, "B"]]) {
    const S = st[k];
    $(`rep${pre}Acc`).textContent = S.acc.length ? Math.round((mean(S.acc) + harm(S.acc)) / 2) + "%" : "–";
    $(`rep${pre}Acpl`).textContent = S.cpl.length ? Math.round(mean(S.cpl)) : "–";
    $(`rep${pre}Good`).textContent = S.good;
    $(`rep${pre}Inacc`).textContent = S.inacc;
    $(`rep${pre}Mistake`).textContent = S.mistake;
    $(`rep${pre}Blunder`).textContent = S.blunder;
  }
  $("repWName").textContent = game.headers.White || "Blancas";
  $("repBName").textContent = game.headers.Black || "Negras";
  ui.report = buildGameReport(nodes);
  if (!opts.variation) game.analysis = analysisSummary(ui.report, game.root, "motor");
  renderGameReport();
  $("reportBox").classList.add("show");
  $("analysisStatus").textContent = `✔ Análisis ${opts.variation ? "de la variante " : ""}completado con ${Engine.name} en ${Math.round((Date.now() - t0) / 1000)} s. Se han marcado y comentado las jugadas críticas.`;
  markDirty();
  render();
  renderRetryStart();
}
/* Clasifica las jugadas (??, ?, ?!, !) y redacta los comentarios automáticos de una línea ya evaluada */
function annotateNodes(nodes) {
  const st = { 1: { acc: [], cpl: [], good: 0, inacc: 0, mistake: 0, blunder: 0 }, "-1": { acc: [], cpl: [], good: 0, inacc: 0, mistake: 0, blunder: 0 } };
  for (const n of nodes.slice(1)) {
    const info = classifyMove(n);
    if (!info) continue;
    const S = st[info.mover];
    S.acc.push(info.acc); S.cpl.push(info.cpl);
    if (info.cls === "!") S.good++;
    if (info.cls === "?!") S.inacc++;
    if (info.cls === "?") S.mistake++;
    if (info.cls === "??") S.blunder++;
    if (!n.nag || n.nagAuto) { n.nag = info.cls; n.nagAuto = Boolean(info.cls); }
    const important = info.cls || ECO.byKey.has(n.key) && !n.children.some(c => ECO.byKey.has(c.key)) || !Chess.legal(n.state).length;
    if (important && (!n.comment || n.commentAuto)) {
      const txt = buildComment(n, info);
      if (txt) { n.comment = txt; n.commentAuto = true; }
    } else if (!n.comment || n.commentAuto) {
      // Jugadas tranquilas con una idea estratégica clara: un comentario breve
      const strat = strategicNotes(n).filter(x => x.w >= 2).sort((a, b) => b.w - a.w);
      if (strat.length) { n.comment = strat.slice(0, 2).map(x => x.txt).join(" "); n.commentAuto = true; }
      else if (n.commentAuto) { n.comment = ""; n.commentAuto = false; }
    }
  }
  return st;
}
/* ---------- 19a. Informe pedagógico de la partida ---------- */
const PHASES = [["apertura", "Apertura"], ["medio", "Medio juego"], ["final", "Final"]];
function phaseOfNode(n, ply) {
  if (Chess.nonPawnCount(n.parent.state) <= 6) return "final";
  if (ply <= 20 || (ply <= 30 && ECO.byKey.has(n.parent.key))) return "apertura";
  return "medio";
}
function evalCategory(w) {
  return w >= 85 ? "ganada para las blancas" : w >= 65 ? "con ventaja de las blancas" : w > 35 ? "equilibrada" : w > 15 ? "con ventaja de las negras" : "ganada para las negras";
}
function moveTheme(n, info) {
  const p = n.parent, mover = info.mover, pe = p.eval, ne = info.after || n.eval;
  if (pe.mate != null && pe.mate !== 0 && pe.mate * mover > 0 && !(ne.mate != null && ne.mate * mover > 0)) return { key: "mateMissed", txt: `se le escapó un mate en ${Math.abs(pe.mate)}` };
  if (n.eval.mate != null && n.eval.mate !== 0 && n.eval.mate * mover < 0) return { key: "mateAllowed", txt: `permitió un mate en ${Math.abs(n.eval.mate)}` };
  let after = null;
  if (n.eval.pv && n.eval.pv.length) after = playUcis(n.state, n.eval.pv, 8);
  else { let k = n; for (let i = 0; i < 6 && k.children.length; i++) k = k.children[0]; after = k.state; }
  const lost = (materialBalance(p.state) - materialBalance(after)) * mover;
  if (lost >= 2) return { key: "material", txt: `perdió material (unos ${Math.round(lost)} puntos)` };
  const wb = mover === 1 ? winPct(pe) : 100 - winPct(pe);
  if (wb >= 80 && wb - info.loss < 65) return { key: "wasted", txt: "dejó escapar una posición ganadora" };
  return info.loss >= 15 ? { key: "positional", txt: "cometió un error decisivo de planteamiento" } : { key: "positional", txt: "empeoró su posición" };
}
function buildGameReport(nodes, h = game.headers) {
  const moves = [];
  nodes.slice(1).forEach((n, k) => {
    const info = classifyMove(n);
    if (!info) return;
    moves.push({ n, info, ply: k + 1, phase: phaseOfNode(n, k + 1), w: winPct(info.after || n.eval) });
  });
  if (!moves.length) return null;
  const name = c => (c === 1 ? h.White || "Blancas" : h.Black || "Negras");
  // Momentos clave: las jugadas que más cambiaron la partida
  const key = moves.filter(x => x.info.loss >= 7 && ["?!", "?", "??"].includes(x.info.cls)).sort((a, b) => b.info.loss - a.info.loss).slice(0, 5)
    .map(x => Object.assign(x, { theme: moveTheme(x.n, x.info) }));
  // Precisión por fases
  const mean = a => a.reduce((s2, y) => s2 + y, 0) / (a.length || 1);
  const harm = a => a.length / a.reduce((s2, y) => s2 + 1 / Math.max(1, y), 0);
  const phases = {};
  for (const [ph] of PHASES) for (const c of [1, -1]) {
    const accs = moves.filter(x => x.phase === ph && x.info.mover === c).map(x => x.info.acc);
    phases[ph + c] = accs.length ? Math.round((mean(accs) + harm(accs)) / 2) : null;
  }
  // Resumen: tramos de valoración (ignorando vaivenes de una sola jugada)
  const cats = [{ ply: 0, cat: evalCategory(winPct(nodes[0].eval || { cp: 0 })) }];
  for (let i = 0; i < moves.length; i++) {
    const c = evalCategory(moves[i].w);
    const next = moves[i + 1] ? evalCategory(moves[i + 1].w) : c;
    if (c !== cats[cats.length - 1].cat && (next === c || i === moves.length - 1)) cats.push({ ply: moves[i].ply, cat: c, m: moves[i] });
  }
  const lbl = m => `${numPrefix(m.n.parent.state)}${dispSan(m.n)}${m.n.nag || ""}`;
  const sentences = [];
  const eco = ECO.detect(nodes[nodes.length - 1]);
  if (eco) sentences.push(`Apertura: ${eco.entry.eco} ${eco.entry.name}.`);
  sentences.push(`La partida empezó ${cats[0].cat}.`);
  const changes = cats.slice(1);
  const shown = changes.length > 5 ? changes.filter(c => key.some(k => Math.abs(k.ply - c.ply) <= 1)).slice(0, 4) : changes;
  for (const c of shown) sentences.push(`Tras ${lbl(c.m)} pasó a estar ${c.cat}.`);
  if (changes.length > shown.length) sentences.push(`La valoración cambió de manos ${changes.length} veces: fue una partida muy disputada.`);
  const lastNode = nodes[nodes.length - 1], st = gameStatus(lastNode), res = h.Result;
  if (st.over) sentences.push(`Terminó así: ${st.text.toLowerCase()}.`);
  else if (res === "1-0" || res === "0-1") sentences.push(`${name(res === "1-0" ? 1 : -1)} ganó la partida${changes.length ? "" : " sin que la valoración cambiara de manos"}.`);
  else if (res === "1/2-1/2") sentences.push("Terminó en tablas.");
  else sentences.push(`Al final la posición está ${evalCategory(moves[moves.length - 1].w)}.`);
  // Por jugador: precisión y qué practicar
  const players = [1, -1].map(c => {
    const mine = moves.filter(x => x.info.mover === c);
    const accs = mine.map(x => x.info.acc);
    const errs = mine.filter(x => x.info.cls === "?" || x.info.cls === "??");
    const counts = { "?!": mine.filter(x => x.info.cls === "?!").length, "?": mine.filter(x => x.info.cls === "?").length, "??": mine.filter(x => x.info.cls === "??").length };
    const themes = {};
    for (const e of errs) { const t = moveTheme(e.n, e.info); themes[t.key] = (themes[t.key] || 0) + 1; themes["ph_" + e.phase] = (themes["ph_" + e.phase] || 0) + 1; }
    const practice = [];
    if (themes.mateMissed) practice.push("Ejercicios de mate en 2 y 3: se te pasó algún mate.");
    if (themes.mateAllowed) practice.push("Seguridad del rey y patrones de mate: permitiste un ataque decisivo.");
    if (themes.material) practice.push("Táctica: piezas colgadas, dobles ataques y clavadas (repasa los errores con 🎯).");
    if (themes.wasted) practice.push("Convertir posiciones ganadas: simplifica cuando vas por delante y evita riesgos innecesarios.");
    if ((themes.ph_apertura || 0) >= 1) practice.push(`La apertura${eco ? ` (${eco.entry.name})` : ""}: repasa las primeras jugadas con el explorador o la enciclopedia ECO.`);
    if ((themes.ph_final || 0) >= 1) practice.push("Técnica de finales: practica en la pestaña 👑 Finales contra la tabla perfecta.");
    if (!practice.length && errs.length) practice.push("Planes y valoración de posiciones: repasa los momentos clave con «🎯 Aprende de tus errores» para ver qué idea fallaba.");
    if (!practice.length && counts["?!"] >= 3) practice.push("Precisión en posiciones tranquilas: muchas imprecisiones pequeñas; dedica más tiempo a comparar candidatas.");
    const acc = accs.length ? Math.round((mean(accs) + harm(accs)) / 2) : null;
    let verdict = `${name(c)}: ${acc != null ? acc + " % de precisión" : "sin datos"}`;
    const parts = [];
    if (counts["??"]) parts.push(`${counts["??"]} error${counts["??"] > 1 ? "es" : ""} grave${counts["??"] > 1 ? "s" : ""}`);
    if (counts["?"]) parts.push(`${counts["?"]} error${counts["?"] > 1 ? "es" : ""}`);
    if (counts["?!"]) parts.push(`${counts["?!"]} imprecisi${counts["?!"] > 1 ? "ones" : "ón"}`);
    verdict += parts.length ? `, con ${parts.join(", ")}.` : ", sin errores.";
    const phErr = {};
    for (const e of errs) phErr[e.phase] = (phErr[e.phase] || 0) + 1;
    const th = {};
    for (const k of ["material", "mateMissed", "mateAllowed", "wasted", "positional"]) if (themes[k]) th[k] = themes[k];
    return { c, verdict, practice, acc, n: mine.length, cpl: mine.length ? Math.round(mean(mine.map(x => x.info.cpl))) : null, counts, th, phErr };
  });
  return { key, phases, summary: sentences.join(" "), players, moves, eco };
}
/* Resumen compacto del análisis que se guarda con la partida (estadísticas y ejercicios) */
function lineHash(root) {
  let x = 5381;
  for (const n of Pgn.mainlineFrom(root)) for (let i = 0; i < n.uci.length; i++) x = ((x << 5) + x + n.uci.charCodeAt(i)) | 0;
  return (x >>> 0).toString(36);
}
const compactEval = ev => (ev ? (ev.mate != null ? { mate: ev.mate, winner: ev.winner } : { cp: ev.cp }) : null);
function analysisSummary(R, root, src) {
  if (!R) return null;
  const p = {};
  for (const pl of R.players) p[pl.c] = { acc: pl.acc, n: pl.n, cpl: pl.cpl, c: pl.counts, th: pl.th, phErr: pl.phErr, ph: { apertura: R.phases["apertura" + pl.c], medio: R.phases["medio" + pl.c], final: R.phases["final" + pl.c] } };
  const err = R.moves.filter(x => x.info.cls === "?" || x.info.cls === "??").map(x => {
    const n = x.n, pe = n.parent.eval, t = moveTheme(n, x.info);
    return {
      ply: x.ply, cls: x.info.cls, loss: Math.round(x.info.loss), th: t.key, ph: x.phase, mover: x.info.mover,
      fen: Chess.toFen(n.parent.state), uci: n.uci, ev: compactEval(pe), evAfter: compactEval(x.info.after || n.eval),
      best: pe.best && pe.best !== n.uci ? pe.best : null, pv: pe.best && pe.best !== n.uci && pe.pv ? pe.pv.slice(0, 8) : null
    };
  });
  return { v: 1, at: Date.now(), src, engine: src === "pgn" ? "" : Engine.name, hash: lineHash(root), plies: R.moves.length, eco: R.eco ? R.eco.entry.eco : "", p, err };
}
const analysisOf = g => (g.analysis && g.analysis.hash === lineHash(g.root) ? g.analysis : null);
/* ⏰ El reloj en el informe: tiempo medio, la jugada más pensada, los apuros y los errores cometidos con poco tiempo */
function timeReportHtml(R) {
  if (!gameHasClocks()) return "";
  const h = game.headers, tc = tcOf(h), line = Pgn.mainlineFrom(game.root);
  const low = tc ? Math.max(30, tc.base * 0.1) : 30;
  const out = [];
  for (const c of [1, -1]) {
    const mine = line.filter(n => n.parent.state.t === c && n.clk != null);
    if (mine.length < 3) continue;
    const spent = mine.map(n => ({ n, s: spentOn(n) })).filter(x => x.s != null);
    const avg = spent.length ? spent.reduce((a, x) => a + x.s, 0) / spent.length : null;
    const longest = spent.slice().sort((a, b) => b.s - a.s)[0];
    const firstLow = mine.find(n => n.clk < low);
    const errs = R.moves.filter(x => x.info.mover === c && (x.info.cls === "?" || x.info.cls === "??"));
    const errsLow = errs.filter(x => x.n.clk != null && x.n.clk < low);
    const who = esc(c === 1 ? h.White || "Blancas" : h.Black || "Negras");
    let t = `<b>${who}</b>: `;
    t += avg != null ? `${fmtSecs(avg)} por jugada de media` : "";
    if (longest && longest.s >= 10) t += `; la jugada que más pensó fue <a href="#" data-tm="${longest.n.id}">${esc(numPrefix(longest.n.parent.state) + dispSan(longest.n))}</a> (${fmtSecs(longest.s)})`;
    t += firstLow ? `. Se quedó con menos de ${fmtSecs(low)} desde <a href="#" data-tm="${firstLow.id}">${esc(numPrefix(firstLow.parent.state) + dispSan(firstLow))}</a>` : ". Nunca se apuró de tiempo";
    if (errs.length) t += errsLow.length ? `, y <b>${errsLow.length} de sus ${errs.length} errores los cometió con poco tiempo</b>${errsLow.length / errs.length >= 0.5 ? ": administrar mejor el reloj le habría ahorrado puntos" : ""}.` : `; ninguno de sus errores fue por falta de tiempo.`;
    else t += ".";
    out.push(`<div class="rep-player">${t}</div>`);
  }
  return out.length ? `<h3>⏰ El reloj</h3>` + out.join("") : "";
}
function renderGameReport() {
  const box = $("reportExtra"), R = ui.report;
  if (!R) { box.innerHTML = ""; return; }
  const h = game.headers, nm = c => esc(c === 1 ? h.White || "Blancas" : h.Black || "Negras");
  const pcell = v => (v == null ? "–" : v + "%");
  let html = `<h3>📝 Resumen</h3><p class="rep-summary">${esc(R.summary)}</p>`;
  html += `<h3>📍 Momentos clave</h3>`;
  if (R.key.length) {
    html += `<ol class="rep-key">` + R.key.map((x, i) => {
      const n = x.n, p = n.parent;
      return `<li><a href="#" data-k="${i}"><b>${esc(numPrefix(p.state) + dispSan(n) + (n.nag || ""))}</b></a> (${esc(p.state.t === 1 ? h.White || "blancas" : h.Black || "negras")}): ${esc(x.theme.txt)}; la valoración pasa de ${esc(fmtEval(p.eval))} a ${esc(fmtEval(x.info.after || n.eval))}.</li>`;
    }).join("") + `</ol>`;
  } else html += `<p class="small">No hubo errores importantes: ninguna jugada cambió el rumbo de la partida.</p>`;
  html += `<h3>⏱ Precisión por fases</h3><table class="rep-phases"><thead><tr><th></th><th>${nm(1)}</th><th>${nm(-1)}</th></tr></thead><tbody>` +
    PHASES.map(([k, label]) => `<tr><td>${label}</td><td>${pcell(R.phases[k + 1])}</td><td>${pcell(R.phases[k + -1])}</td></tr>`).join("") + `</tbody></table>`;
  html += timeReportHtml(R);
  html += `<h3>🎯 Qué practicar</h3>` + R.players.map(pl => `<div class="rep-player"><b>${esc(pl.verdict)}</b>${pl.practice.length ? `<ul>${pl.practice.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : `<div class="small">Nada destacable: ¡buena partida!</div>`}</div>`).join("");
  box.innerHTML = html;
  box.querySelectorAll("[data-k]").forEach(a => a.onclick = e => { e.preventDefault(); const x = R.key[+a.dataset.k]; if (x && !quiz()) goTo(x.n); });
  box.querySelectorAll("[data-tm]").forEach(a => a.onclick = e => { e.preventDefault(); const n = Pgn.findById(game.root, +a.dataset.tm); if (n && !quiz()) goTo(n); });
}

async function explainCurrentMove() {
  const n = cur();
  if (!n.parent) { toast("Sitúate en una jugada para comentarla."); return; }
  const btn = $("explainMoveBtn");
  btn.disabled = true;
  btn.textContent = "⏳ Analizando…";
  try {
    for (const x of [n.parent, n]) {
      const term = terminalEval(x);
      if (term) { x.eval = term; continue; }
      if (!x.eval || x.eval.source === "pgn" || (x.eval.depth || 0) < (Engine.kind === "stockfish" ? 12 : 5)) {
        const job = await Engine.analyse(x, { purpose: "explain", movetime: Math.max(800, +settings.analysisMs * 1.5), multipv: Engine.kind === "stockfish" ? 2 : 1 });
        if (job) storeEval(x, job, true);
      }
    }
    const info = classifyMove(n);
    const txt = buildComment(n, info) || describeMotif(n) || "Jugada tranquila que mantiene el equilibrio.";
    n.comment = txt;
    n.commentAuto = false;
    if (info && (!n.nag || n.nagAuto)) { n.nag = info.cls; n.nagAuto = Boolean(info.cls); }
    $("annotation").value = txt;
    markDirty();
  } finally {
    btn.disabled = false;
    btn.textContent = "✍ Redactar comentario con el motor";
    render();
  }
}

/* ---------- 19b. «Ver amenaza»: qué jugaría el rival si le tocara mover ---------- */
const Threat = { node: null, from: -1, to: -1, busy: false };
function clearThreat() { Threat.node = null; render(); }
async function showThreat() {
  const node = cur();
  if (Threat.node === node) { clearThreat(); return; }
  if (editor.active || quiz() || Threat.busy) return;
  const s = node.state;
  if (gameStatus(node).over) { toast("La partida ha terminado."); return; }
  if (Chess.inCheck(s)) { toast("Estás en jaque: la amenaza es el propio jaque."); return; }
  const t = Chess.clone(s);
  t.t = -s.t;
  t.ep = -1;
  if (!Chess.legal(t).length) { toast("El rival no tendría ninguna jugada."); return; }
  Threat.busy = true;
  $("threatBtn").textContent = "⏳ Amenaza";
  Engine.cancel("live");
  ui.liveNode = null;
  const job = await new Promise(resolve => Engine.start({ purpose: "threat", fen: Chess.toFen(t), moves: [], stm: t.t, movetime: Math.max(900, Math.min(2500, +settings.analysisMs * 1.5)), multipv: 1, resolve }));
  Threat.busy = false;
  $("threatBtn").textContent = "👁 Amenaza";
  const l = job && job.lines && job.lines[0];
  const u = (l && l.pv[0]) || (job && job.best);
  if (!u || cur() !== node) { render(); return; }
  Threat.node = node;
  Threat.from = Chess.sqIdx(u.slice(0, 2));
  Threat.to = Chess.sqIdx(u.slice(2, 4));
  const ev = l ? { cp: l.cp, mate: l.mate, winner: l.winner } : null;
  const who = t.t === 1 ? "las blancas" : "las negras";
  const L = Chess.legal(t), m = Chess.moveFromUci(t, u, L);
  const san = m ? formatSan(Chess.san(t, m, L), settings.lang, t.t) : u;
  const capt = m && m.captured !== "." ? `, capturando ${PIECE_ART[m.captured.toLowerCase()]} de ${Chess.sqName(m.to)}` : "";
  $("threatInfo").innerHTML = `👁 <b>Amenaza:</b> si les tocara, ${who} jugarían <b>${esc(san)}</b>${esc(capt)}${ev ? ` (${esc(fmtEval(ev))})` : ""}. <span class="small">${l && l.pv.length > 1 ? "Línea: " + esc(lineText(t, l.pv, 5)) : ""}</span>`;
  render();
}

/* ---------- 19b2. «🧠 Piensa conmigo»: el razonamiento detrás de la mejor jugada ----------
   Con Stockfish (varias líneas), la amenaza del rival y la descripción de cada jugada, explica en palabras:
   la situación, la mejor jugada y su idea, la línea esperada paso a paso, las alternativas y la jugada tentadora que falla. */
const Think = { busy: false, node: null };
function attackedTargets(st, sq, mover) {
  const out = [];
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const x = st.b[i];
    if (x === "." || Chess.color(x) !== -mover || x.toLowerCase() === "k") continue;
    if (Chess.attackers(st.b, i, mover).includes(sq)) out.push(i);
  }
  return out.sort((a, b) => Chess.VAL[st.b[b].toLowerCase()] - Chess.VAL[st.b[a].toLowerCase()]);
}
/* Qué hace una jugada, en palabras (para la línea del razonamiento) */
function thinkStepText(c, nextUci) {
  const m = c.move, mover = c.parent.state.t, pc = m.piece.toLowerCase();
  const parts = [];
  const motif = describeMotif(c);
  if (motif) parts.push(motif);
  // Piezas que ataca la pieza movida (las que no están bien defendidas o valen más), salvo si el rival la captura en seguida
  const recaptured = nextUci && nextUci.slice(2, 4) === Chess.sqName(m.to);
  if (recaptured && m.captured !== ".") parts.push("Es un cambio: el rival recupera en esa casilla.");
  else if (!Chess.inCheck(c.state) || Chess.legal(c.state).length) {
    const tg = attackedTargets(c.state, m.to, mover).filter(i => {
      const v = Chess.VAL[c.state.b[i].toLowerCase()];
      return !Chess.attackers(c.state.b, i, -mover).length || v > Chess.VAL[pc];
    });
    if (tg.length) {
      const names = tg.slice(0, 2).map(i => `${PIECE_ART[c.state.b[i].toLowerCase()]} de ${Chess.sqName(i)}`);
      parts.push(tg.length > 1 ? `Ataca a la vez ${names.join(" y ")}.` : `Ataca ${names[0]}.`);
    }
  }
  if (!parts.length) parts.push(pc === "p" ? `Avanza el peón a ${Chess.sqName(m.to)}.` : `Mejora ${PIECE_ART[pc]}, que pasa de ${Chess.sqName(m.from)} a ${Chess.sqName(m.to)}.`);
  return parts.join(" ");
}
async function thinkWithMe() {
  ExpEval.token++;
  const node = cur(), s = node.state, me = s.t, box = $("thinkBox");
  if (Think.busy) return;
  if (Think.node === node && !box.hidden) { box.hidden = true; Think.node = null; return; }
  const blocked = helpBlocked();
  if (blocked) { toast(blocked); return; }
  if (!Engine.ready) { toast("El motor aún se está cargando."); return; }
  if (gameStatus(node).over) { toast("La partida ha terminado en esta posición."); return; }
  Think.busy = true; Think.node = node;
  noteCpuHelp();
  $("thinkBtn").disabled = true;
  box.hidden = false;
  const say = t => { box.innerHTML = `<div class="retry-head">🧠 Piensa conmigo</div><div class="small">⏳ ${esc(t)}</div>`; };
  ui.analysing = true;
  Engine.cancel("live");
  const strong = Engine.kind === "stockfish";
  const sanOf = (st, u) => { const m = Chess.moveFromUci(st, u); return m ? formatSan(Chess.san(st, m), settings.lang, st.t) : u; };
  const moveTxt = (st, u) => numPrefix(st) + sanOf(st, u);
  const mine = (w, l) => (me === 1 ? winPct(l) : 100 - winPct(l));
  const evTxt = l => { const ev = { cp: l.cp, mate: l.mate, winner: l.winner }; return `${fmtEval(ev)} (${evalVerdict(ev).toLowerCase()})`; };
  try {
    say("Mirando la posición: qué amenaza el rival y qué jugadas tengo…");
    const top = await evalState(s, strong ? 3000 : 3500, strong ? 3 : 1);
    if (!top || !top.lines || !top.lines[0] || cur() !== node) { box.hidden = true; return; }
    const lines = top.lines.filter(l => l && l.pv && l.pv.length);
    const best = lines[0], bestM = Chess.moveFromUci(s, best.pv[0]);
    // La amenaza del rival: qué jugaría si le tocara mover
    let threat = null;
    if (!Chess.inCheck(s)) {
      const t = Chess.clone(s); t.t = -me; t.ep = -1;
      if (Chess.legal(t).length) {
        const j = await evalState(t, strong ? 1200 : 1500, 1);
        const l = j && j.lines && j.lines[0], u = l && l.pv[0], m = u && Chess.moveFromUci(t, u);
        if (m) {
          const gainMate = l.mate != null && l.mate !== 0 && Math.sign(l.mate) === -me;
          const capt = m.captured !== "." ? Chess.VAL[m.captured.toLowerCase()] : 0;
          const swing = (winPct(l) - winPct(best)) * -me;   // cuánto ganaría el rival si pudiera jugar ya
          if (gainMate || (capt >= 3 && swing > 8) || swing > 20) threat = { t, u, m, l, gainMate, capt };
        }
      }
    }
    if (cur() !== node) { box.hidden = true; return; }
    // La línea esperada, jugada a jugada
    say("Calculando la línea y buscando las trampas…");
    const g = Pgn.newGame(Chess.toFen(s));
    let n = g.root;
    const steps = [];
    for (let k = 0; k < Math.min(7, best.pv.length); k++) {
      const u = best.pv[k], m = Chess.moveFromUci(n.state, u);
      if (!m) break;
      const c = Pgn.addMove(n, m);
      steps.push({ mine: n.state.t === me, txt: `${numPrefix(n.state)}${formatSan(c.san, settings.lang, n.state.t)}`, why: thinkStepText(c, best.pv[k + 1]) });
      n = c;
    }
    const endState = playUcis(s, best.pv, 10);
    const matDiff = Math.round((materialBalance(endState) - materialBalance(s)) * me);
    // La idea principal
    const ideas = [];
    const mating = best.mate != null && best.mate !== 0 && Math.sign(best.mate) === me;
    if (mating) ideas.push(`Hay <b>mate en ${Math.abs(best.mate)}</b>: la línea de abajo lo fuerza.`);
    if (threat && bestM && !mating) {
      if (bestM.to === threat.m.from) ideas.push("Elimina la pieza con la que el rival te amenazaba.");
      else if (bestM.from === threat.m.to) ideas.push("Aparta la pieza que estaba amenazada.");
      else if (threat.gainMate) ideas.push("Cubre la amenaza de mate.");
    }
    if (matDiff >= 2 && !(best.mate != null)) ideas.push(`Al final de la línea <b>ganas material</b> (unos ${matDiff} puntos).`);
    else if (matDiff <= -2 && mine(0, best) >= 45) ideas.push(`<b>Entregas material</b> (unos ${-matDiff} puntos), pero a cambio consigues ${mine(0, best) >= 60 ? "una posición ganadora" : "compensación suficiente"}: es un sacrificio.`);
    if (!ideas.length) ideas.push(steps[0] ? steps[0].why : "");
    // Alternativas: por qué no las otras candidatas
    const alts = [];
    for (const l of lines.slice(1, 3)) {
      const loss = mine(0, best) - mine(0, l);
      const u = l.pv[0];
      if (loss < 4) { alts.push(`<b>${esc(moveTxt(s, u))}</b> también es buena: casi igual que la mejor (${esc(fmtEval({ cp: l.cp, mate: l.mate, winner: l.winner }))}).`); continue; }
      const s1 = playUcis(s, [u], 1), r = l.pv[1];
      alts.push(`<b>${esc(moveTxt(s, u))}</b> es peor: ${r ? `el rival respondería <b>${esc(moveTxt(s1, r))}</b> y ` : ""}la valoración baja a ${esc(fmtEval({ cp: l.cp, mate: l.mate, winner: l.winner }))}.`);
    }
    // La jugada tentadora: la captura (o el jaque) más llamativa que no está entre las buenas, y por qué falla
    let trap = null;
    const L = Chess.legal(s), goodU = new Set(lines.map(l => l.pv[0]));
    const tempting = L.filter(m => !goodU.has(Chess.uci(m)) && (m.captured !== "." || Chess.inCheck(Chess.apply(s, m))))
      .sort((a, b) => (b.captured !== "." ? Chess.VAL[b.captured.toLowerCase()] : 0.5) - (a.captured !== "." ? Chess.VAL[a.captured.toLowerCase()] : 0.5))[0];
    if (tempting && cur() === node) {
      const after = Chess.apply(s, tempting);
      const j = await evalState(after, strong ? 1200 : 1500, 1);
      const l = j && j.lines && j.lines[0];
      if (l) {
        const loss = mine(0, best) - mine(0, l);
        if (loss >= 10) {
          const r = l.pv[0];
          const lost = Math.round((materialBalance(s) - materialBalance(playUcis(after, l.pv, 8))) * me);
          trap = `<b>${esc(moveTxt(s, Chess.uci(tempting)))}</b> parece atractiva, pero ${r ? `tras <b>${esc(moveTxt(after, r))}</b> ` : ""}${l.mate != null && Math.sign(l.mate) === -me ? "te dan mate" : lost >= 2 ? `pierdes material (unos ${lost} puntos)` : `la valoración cae a ${esc(fmtEval({ cp: l.cp, mate: l.mate, winner: l.winner }))}`}.`;
        }
      }
    }
    if (cur() !== node) { box.hidden = true; return; }
    const mat = Math.round(materialBalance(s) * me);
    const situation = [`Valoración: <b>${esc(evTxt(best))}</b>.`, mat ? `Material: ${mat > 0 ? `tienes ${mat} punto${mat === 1 ? "" : "s"} de ventaja` : `tienes ${-mat} punto${mat === -1 ? "" : "s"} menos`}.` : "Material igualado."];
    if (Chess.inCheck(s)) situation.push("<b>Estás en jaque</b>: lo primero es salir de él.");
    else if (threat) situation.push(`<b>Amenaza del rival:</b> si le tocara, jugaría <b>${esc(formatSan(Chess.san(threat.t, threat.m), settings.lang, threat.t.t))}</b>${threat.gainMate ? ", con mate" : threat.capt ? `, ganando ${PIECE_ART[threat.m.captured.toLowerCase()]} de ${Chess.sqName(threat.m.to)}` : ""}. Hay que tenerlo en cuenta.`);
    else situation.push("El rival no tiene ninguna amenaza inmediata: puedes pensar en tus planes.");
    box.innerHTML = `<div class="retry-head">🧠 Piensa conmigo · juegan las ${me === 1 ? "blancas" : "negras"}</div>
      <h3>1. La situación</h3><div>${situation.join(" ")}</div>
      <h3>2. La mejor jugada: ${esc(moveTxt(s, best.pv[0]))}</h3><div>${ideas.join(" ")}</div>
      <h3>3. Lo que va a pasar (si los dos jugáis lo mejor)</h3>
      <ol>${steps.map(x => `<li><span class="think-who ${x.mine ? "think-mine" : "think-their"}">${x.mine ? "Tú" : "Rival"}: ${esc(x.txt)}</span> — ${esc(x.why)}</li>`).join("")}</ol>
      ${alts.length ? `<h3>4. ¿Y las otras jugadas?</h3><div>${alts.map(a => `<div>• ${a}</div>`).join("")}</div>` : ""}
      ${trap ? `<h3>${alts.length ? 5 : 4}. ⚠ Cuidado con la jugada tentadora</h3><div>${trap}</div>` : ""}
      <div class="controls"><button class="sm-btn primary" data-t="play">▶ Jugar ${esc(sanOf(s, best.pv[0]))}</button><button class="sm-btn" data-t="line" title="Añade la línea como variante para recorrerla en el tablero">➕ Ver la línea en el tablero</button><button class="sm-btn" data-t="close">Cerrar</button></div>
      <div class="small">Es el razonamiento del motor puesto en palabras: úsalo para entender la idea, no como verdad absoluta.</div>`;
    box.querySelector("[data-t=play]").onclick = () => { if (cur() !== node || !canUserMove() || !bestM) return; box.hidden = true; Think.node = null; playMove(bestM, "user"); };
    box.querySelector("[data-t=line]").onclick = () => {
      if (cur() !== node) { toast("La posición ha cambiado: vuelve a pulsar «Piensa conmigo»."); return; }
      let x = node;
      for (const u of best.pv.slice(0, 8)) { const m = Chess.moveFromUci(x.state, u); if (!m) break; x = Pgn.addMove(x, m); }
      markDirty();
      goTo(node.children.find(c => c.uci === best.pv[0]) || node);
      toast("➕ Línea añadida como variante: recórrela con ▶.");
    };
    box.querySelector("[data-t=close]").onclick = () => { box.hidden = true; Think.node = null; };
  } finally {
    ui.analysing = false;
    Think.busy = false;
    $("thinkBtn").disabled = false;
    requestLive();
  }
}

/* ---------- 19b3. «🗣 Habla con tus piezas»: el método de la peor pieza ----------
   1) La entrevista: cada pieza (sin peones ni rey) dice si está contenta, según su actividad y su sitio.
   2) La casilla soñada de la más infeliz (o de la que elijas): puesto avanzado, diagonal o columna abierta.
   3) La ruta para llegar, sin pisar casillas que atacan los peones rivales, revisada con el motor. */
const Talk = { busy: false, node: null, side: 1, shapes: [], sel: null };
const TALK_N = [-33, -31, -18, -14, 14, 18, 31, 33], TALK_B = [-17, -15, 15, 17], TALK_R = [-16, -1, 1, 16];
const onB = i => (i & 0x88) === 0;
const relRank = (sq, c) => (c === 1 ? 8 - (sq >> 4) : (sq >> 4) + 1);
const isOwn = (p, c) => p !== "." && Chess.color(p) === c;
function pawnHits(b, sq, by) {   // ¿ataca un peón de «by» la casilla sq?
  const P = by === 1 ? "P" : "p", d = by === 1 ? [15, 17] : [-15, -17];
  return d.some(x => onB(sq + x) && b[sq + x] === P);
}
/* ¿Puede algún peón rival llegar a atacar esta casilla? (si no, es una casilla fuerte para nosotros) */
function pawnCanEverHit(b, sq, c) {
  const enemy = c === 1 ? "p" : "P", r = sq >> 4, f = sq & 7;
  for (const ff of [f - 1, f + 1]) {
    if (ff < 0 || ff > 7) continue;
    for (let rr = 0; rr < 8; rr++) {
      if (b[rr * 16 + ff] !== enemy) continue;
      if (c === 1 ? rr < r : rr > r) return true;   // el peón negro aún está por delante (puede bajar y atacar)
    }
  }
  return false;
}
function talkTargets(b, sq, p) {
  const t = p.toLowerCase(), c = Chess.color(p), out = [];
  const dirs = t === "n" ? TALK_N : t === "b" ? TALK_B : t === "r" ? TALK_R : TALK_B.concat(TALK_R);
  for (const d of dirs) {
    for (let x = sq + d; onB(x); x += d) {
      if (isOwn(b[x], c)) break;
      out.push(x);
      if (b[x] !== "." || t === "n") break;
    }
  }
  return out;
}
const PIECE_TYPICAL = { n: 4, b: 6, r: 6, q: 10 };   // casillas seguras de una pieza «normal» en el medio juego
/* La entrevista a una pieza: puntuación de 0 a 100, cara y lo que «dice» */
function interviewPiece(st, sq, c) {
  const b = st.b, p = b[sq], t = p.toLowerCase(), f = sq & 7, rr = relRank(sq, c);
  const targets = talkTargets(b, sq, p), safe = targets.filter(x => !pawnHits(b, x, -c));
  const mob = safe.length;
  let score = Math.round(Math.min(mob / PIECE_TYPICAL[t], 1.4) * 55), says = [];
  const opening = Chess.nonPawnCount(st) > 10;
  const home = c === 1 ? 7 : 0;
  // Piezas atacadas y sin defensa: lo primero
  const att = Chess.attackers(b, sq, -c), def = Chess.attackers(b, sq, c);
  const hanging = att.length && (!def.length || att.some(x => Chess.VAL[b[x].toLowerCase()] < Chess.VAL[t]));
  if (t === "n") {
    if (f === 0 || f === 7) { score -= 20; says.push("Estoy en la banda: «caballo en el borde, caballo muerto»."); }
    if (Chess.isOutpost(st, sq, c)) { score += 35; says.push("Estoy en un puesto avanzado, apoyado por un peón: ningún peón rival puede echarme."); }
    else if (rr >= 4 && !pawnCanEverHit(b, sq, c)) { score += 15; says.push("Ningún peón rival puede echarme de aquí."); }
  }
  if (t === "b") {
    const light = ((sq >> 4) + f) % 2 === 0;
    let ownSame = 0;
    for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (b[i] === (c === 1 ? "P" : "p") && (((i >> 4) + (i & 7)) % 2 === 0) === light) ownSame++; }
    if (ownSame >= 4 && mob <= 5) { score -= 20; says.push(`Mis propios peones (${ownSame} en casillas de mi color) me tapan: soy un alfil malo.`); }
    else if (mob >= 8) says.push("Tengo una diagonal larga y abierta.");
  }
  if (t === "r") {
    let own = false, enemy = false;
    for (let r2 = 0; r2 < 8; r2++) { const x = b[r2 * 16 + f]; if (x === "P" || x === "p") { if (Chess.color(x) === c) own = true; else enemy = true; } }
    if (!own && !enemy) { score += 25; says.push(`Domino la columna ${"abcdefgh"[f]}, que está abierta.`); }
    else if (!own) { score += 12; says.push(`Estoy en la columna ${"abcdefgh"[f]}, semiabierta: presiono un peón rival.`); }
    else if (mob <= 3) { score -= 10; says.push(`Mi columna está cerrada por mi propio peón: apenas tengo juego.`); }
    if (rr === 7) { score += 25; says.push("Estoy en la séptima fila, atacando peones y encerrando al rey."); }
  }
  if ((t === "n" || t === "b") && (sq >> 4) === home && opening && st.full > 10) { score -= 20; says.push("Sigo en mi casilla inicial: aún no he entrado en juego."); }
  if ([2, 3, 4, 5].includes(f) && rr >= 4 && rr <= 6 && t !== "r") score += 8;
  // En la apertura, las torres y la dama esperan: no se las cuenta como «infelices» por estar atrás
  if (opening && t === "r" && rr === 1 && score < 38 && !says.some(x => /abierta|semiabierta/.test(x))) { score = 38; says.length = 0; says.push("Las torres entran en juego cuando se abren columnas: de momento espero en la primera fila."); }
  if (opening && t === "q" && sq === (c === 1 ? 0x73 : 0x03) && score < 40) { score = 40; says.length = 0; says.push("La dama sale más tarde: de momento estoy bien protegida."); }
  const fem = t === "r" || t === "q";
  if (hanging) says.unshift(`¡Cuidado! Me atacan y no estoy bien defendid${fem ? "a" : "o"}.`);
  if (!says.length) says.push(mob <= 2 ? `Casi no puedo moverme: sólo tengo ${mob} casilla${mob === 1 ? "" : "s"} segura${mob === 1 ? "" : "s"}.` : `Controlo ${mob} casillas seguras.`);
  score = Math.max(0, Math.min(100, score));
  return { sq, p, t, score, mob, hanging, says, face: score >= 55 ? "😊" : score >= 35 ? "😐" : "😤" };
}
const pawnsOnRank = (b, r, c) => { for (let f = 0; f < 8; f++) if (b[r * 16 + f] === (c === 1 ? "P" : "p")) return true; return false; };
/* Camino más corto de una pieza por casillas vacías que no atacan los peones rivales */
function talkPath(b, from, to, p, maxD = 4) {
  const c = Chess.color(p), prev = new Map([[from, -1]]), q = [[from, 0]];
  while (q.length) {
    const [x, d] = q.shift();
    if (x === to) { const path = []; for (let y = to; y !== -1; y = prev.get(y)) path.unshift(y); return path; }
    if (d >= maxD) continue;
    const bb = b.slice(); bb[from] = "."; bb[x] = p;
    for (const y of talkTargets(bb, x, p)) {
      if (prev.has(y) || b[y] !== "." || pawnHits(b, y, -c)) continue;
      const by = bb.slice(); by[x] = "."; by[y] = p;
      const at = Chess.attackers(by, y, -c);
      if (at.some(a => Chess.VAL[by[a].toLowerCase()] < Chess.VAL[p.toLowerCase()]) || at.length > Chess.attackers(by, y, c).length) continue;   // casillas de paso seguras
      prev.set(y, x); q.push([y, d + 1]);
    }
  }
  return null;
}
/* La casilla soñada de una pieza y la ruta para llegar */
function dreamSquare(st, sq, c) {
  const b = st.b, p = b[sq], t = p.toLowerCase(), f0 = sq & 7;
  const now = talkTargets(b, sq, p).filter(x => !pawnHits(b, x, -c)).length;
  let best = null;
  for (let x = 0; x < 128; x++) {
    if (x & 0x88) { x += 7; continue; }
    if (x === sq || b[x] !== "." || pawnHits(b, x, -c)) continue;
    { // un hogar seguro: ninguna pieza rival de menos valor la ataca allí, y si la atacan, está defendida
      const bx = b.slice(); bx[sq] = "."; bx[x] = p;
      const at = Chess.attackers(bx, x, -c), df = Chess.attackers(bx, x, c);
      if (at.some(a => Chess.VAL[bx[a].toLowerCase()] < Chess.VAL[t]) || at.length > df.length) continue;
    }
    let val = 0, why = "";
    const f = x & 7, rr = relRank(x, c);
    if (t === "n") {
      if (rr < 4 || rr > 6 || pawnCanEverHit(b, x, c)) continue;
      const bb = b.slice(); bb[sq] = "."; bb[x] = p;
      val = 30 + (Chess.isOutpost(Object.assign({}, st, { b: bb }), x, c) ? 30 : 0) + ([3, 4].includes(f) ? 15 : [2, 5].includes(f) ? 10 : 0) + (rr >= 5 ? 5 : 0);
      why = Chess.isOutpost(Object.assign({}, st, { b: bb }), x, c) ? "un puesto avanzado, apoyado por un peón y donde ningún peón rival podrá echarlo" : "una casilla avanzada de la que ningún peón rival podrá echarlo";
    } else {
      const bb = b.slice(); bb[sq] = "."; bb[x] = p;
      const mob = talkTargets(bb, x, p).filter(y => !pawnHits(bb, y, -c)).length;
      val = t === "r" ? (rr <= 2 ? 5 : 0) : (mob - now) * 4;   // la torre, mejor desde atrás en su columna
      if (t === "q") continue;   // la dama es flexible: no se la lleva de paseo
      if (t === "r") {
        let own = false, enemy = false;
        for (let r2 = 0; r2 < 8; r2++) { const y = b[r2 * 16 + f]; if (y === "P" || y === "p") { if (Chess.color(y) === c) own = true; else enemy = true; } }
        let ownNow = false;
        for (let r2 = 0; r2 < 8; r2++) { const y = b[r2 * 16 + f0]; if (y === (c === 1 ? "P" : "p")) ownNow = true; }
        if (rr === 7 && pawnsOnRank(b, x >> 4, -c)) { val += 40; why = "la séptima fila, donde atacaría los peones rivales"; }
        else if (!own && !enemy && f !== f0) { val += 30; why = `la columna ${"abcdefgh"[f]}, que está abierta`; }
        else if (!own && enemy && f !== f0 && ownNow) { val += 15; why = `la columna ${"abcdefgh"[f]}, semiabierta (presionaría un peón rival)`; }
        else continue;
      } else {
        if (mob - now < 4 || mob < 6) continue;
        why = `una diagonal más abierta: desde allí controlaría ${mob} casillas seguras (ahora ${now})`;
      }
      if (val < 12) continue;
    }
    const path = talkPath(b, sq, x, p, t === "n" ? 4 : 2);
    if (!path) continue;
    val -= (path.length - 1) * 7;
    if (!best || val > best.val) best = { sq: x, path, val, why };
  }
  return best;
}
async function talkToPieces(opts = {}) {
  const node = cur(), st = node.state, box = $("talkBox");
  if (Talk.busy) return;
  if (!opts.keep && Talk.node === node && !box.hidden && opts.side == null && opts.sel == null) { closeTalk(); return; }
  const blocked = helpBlocked();
  if (blocked) { toast(blocked); return; }
  if (!opts.keep) noteCpuHelp();
  const side = opts.side != null ? opts.side : opts.keep ? Talk.side : st.t;
  const c = side;
  Talk.node = node; Talk.side = side;
  // 1) La entrevista
  const list = [];
  for (let x = 0; x < 128; x++) { if (x & 0x88) { x += 7; continue; } const p = st.b[x]; if (isOwn(p, c) && "nbrq".includes(p.toLowerCase())) list.push(interviewPiece(st, x, c)); }
  if (!list.length) { box.hidden = false; box.innerHTML = `<div class="retry-head">🗣 Habla con tus piezas</div><div class="small">Sólo quedan el rey y los peones: aquí manda el cálculo del final (el rey activo y los peones pasados).</div><div class="controls"><button class="sm-btn" data-k="close">Cerrar</button></div>`; box.querySelector("[data-k=close]").onclick = closeTalk; return; }
  list.sort((a, b) => a.score - b.score);
  let target = opts.sel != null ? list.find(x => x.sq === opts.sel) || list[0] : list[0];
  // 2) y 3) Casilla soñada y ruta (si la más infeliz no tiene adónde ir, se escucha a la siguiente)
  let dream = opts.sel == null && target.score >= 55 ? null : dreamSquare(st, target.sq, c), skipped = null;
  if (!dream && opts.sel == null) {
    for (const x of list.slice(1, 4)) { if (x.score >= 55) break; const d = dreamSquare(st, x.sq, c); if (d) { skipped = target; target = x; dream = d; break; } }
  }
  Talk.sel = target.sq;
  const name = x => `${cap(PIECE_ART[x.t])} de ${Chess.sqName(x.sq)}`;
  const sym = { n: "C", b: "A", r: "T", q: "D" }[target.t];
  Talk.shapes = [{ color: "red", from: Chess.sqName(target.sq), to: Chess.sqName(target.sq) }];
  let routeTxt = "";
  if (dream) {
    for (let i = 1; i < dream.path.length; i++) Talk.shapes.push({ color: "yellow", from: Chess.sqName(dream.path[i - 1]), to: Chess.sqName(dream.path[i]) });
    Talk.shapes.push({ color: "green", from: Chess.sqName(dream.sq), to: Chess.sqName(dream.sq) });
    routeTxt = dream.path.map((x, i) => (i === 0 ? sym : "") + Chess.sqName(x)).join(" → ");
  }
  // Filtro de seguridad: piezas propias colgadas y jaque
  const hanging = list.filter(x => x.hanging);
  const mine = c === st.t;
  const safety = Chess.inCheck(Object.assign({}, st, { t: c })) ? `<b>⚠ Primero, el jaque:</b> antes de pensar en planes hay que salir del jaque.`
    : hanging.length ? `<b>⚠ Primero, lo táctico:</b> ${hanging.map(name).map(esc).join(", ")} ${hanging.length > 1 ? "están atacadas y mal defendidas" : `está atacad${"rq".includes(hanging[0].t) ? "a" : "o"} y mal defendid${"rq".includes(hanging[0].t) ? "a" : "o"}`}. Resuélvelo antes de maniobrar.`
    : `✔ No veo piezas ${mine ? "tuyas" : "suyas"} colgando ni jaques. Aun así, mira antes si ${mine ? "el rival amenaza algo" : "tienes algo concreto"} (👁 Amenaza): si no, es momento de hablar con las piezas.`;
  box.hidden = false;
  const allHappy = list[0].score >= 55;
  box.innerHTML = `<div class="retry-head">🗣 Habla con ${mine ? "tus" : "sus"} piezas · ${c === 1 ? "blancas" : "negras"}${mine ? "" : " (el rival)"}</div>
    <div class="small">${safety}</div>
    <h3>1. La entrevista: «¿estás contenta ahí?»</h3>
    ${list.map(x => `<button class="talk-row${x.sq === target.sq ? " sel" : ""}" data-sq="${x.sq}" title="Pulsa para buscar su casilla soñada"><span class="talk-face">${x.face}</span><span class="talk-who">${esc(name(x))}</span><span class="talk-say">«${esc(x.says.join(" "))}»</span></button>`).join("")}
    <div class="small">Los peones no se entrevistan: son la estructura, y avanzarlos sin motivo deja debilidades para siempre.${allHappy ? " <b>Todas tus piezas están contentas:</b> busca un plan con los peones (una ruptura) o atiende a lo que quiere hacer el rival." : ""}</div>
    <h3>2. La casilla soñada ${opts.sel != null ? "de la pieza elegida" : skipped ? "de la siguiente más infeliz" : "de la más infeliz"}: ${esc(name(target))}</h3>
    ${skipped ? `<div class="small">${esc(name(skipped))} es la que menos aporta, pero ahora mismo no tiene una casilla mejor y segura (quizá necesite una ruptura de peones que le abra líneas). Escuchamos a la siguiente.</div>` : ""}
    <div>${dream ? `Su hogar ideal sería <b>${Chess.sqName(dream.sq)}</b>: ${esc(dream.why)}.` : opts.sel == null && target.score >= 55 ? "Todas están bien colocadas: no hace falta mover a ninguna sólo por moverla. Puedes pulsar una para ver si tendría una casilla aún mejor." : "Ahora mismo no encuentro una casilla claramente mejor y segura para ella. Quizá haga falta antes una ruptura de peones que le abra líneas, o cambiarla por una pieza rival."}</div>
    ${dream ? `<h3>3. La ruta</h3><div><span class="talk-route">${esc(routeTxt)}</span> <span class="small">(${dream.path.length - 1} jugada${dream.path.length === 2 ? "" : "s"}, sin pisar casillas que atacan los peones rivales)</span></div><div class="small" id="talkEngine">${mine && Engine.ready ? "⏳ El motor revisa que la primera jugada no pierda nada…" : ""}</div>` : ""}
    <div class="controls">${dream && mine ? `<button class="sm-btn primary" data-k="play">▶ Jugar ${esc(sym + Chess.sqName(dream.path[1]))}</button>` : ""}<button class="sm-btn info-btn" data-k="rival">${mine ? "👂 Escuchar al rival (profilaxis)" : "🗣 Volver a mis piezas"}</button><button class="sm-btn" data-k="close">Cerrar</button></div>
    <div class="small">${mine ? "Es un método para posiciones tranquilas: busca la pieza que menos aporta y dale un buen destino." : "Profilaxis («método Karpov»): ésta es la pieza que el rival querría mejorar; piensa cómo impedírselo."}</div>`;
  box.querySelectorAll("[data-sq]").forEach(btn => btn.onclick = () => talkToPieces({ keep: true, sel: +btn.dataset.sq }));
  box.querySelector("[data-k=rival]").onclick = () => talkToPieces({ side: mine ? -st.t : st.t });
  box.querySelector("[data-k=close]").onclick = closeTalk;
  const playBtn = box.querySelector("[data-k=play]");
  if (playBtn) playBtn.onclick = () => {
    const m = Chess.legal(st).find(x => x.from === dream.path[0] && x.to === dream.path[1]);
    if (!m || cur() !== node || !canUserMove()) { toast("Esa jugada no es posible ahora mismo."); return; }
    closeTalk(); playMove(m, "user");
  };
  renderShapes();
  // Revisión con el motor de la primera jugada de la ruta
  if (dream && mine && Engine.ready) {
    const m = Chess.legal(st).find(x => x.from === dream.path[0] && x.to === dream.path[1]);
    const out = () => $("talkEngine");
    if (!m) { if (out()) out().textContent = "⚠ La primera jugada de la ruta no es legal ahora mismo (quizá por una clavada)."; return; }
    Talk.busy = true; ui.analysing = true; ExpEval.token++; Engine.cancel("live");
    try {
      const top = await evalState(st, Engine.kind === "stockfish" ? 1200 : 1500, 1);
      const aft = await evalState(Chess.apply(st, m), Engine.kind === "stockfish" ? 1000 : 1200, 1);
      if (cur() !== node || !out()) return;
      if (top && aft && top.lines[0] && aft.lines[0]) {
        const loss = (winnerCp(top.lines[0]) - winnerCp(aft.lines[0])) * c;
        const bestU = top.lines[0].pv[0], bm = bestU && Chess.moveFromUci(st, bestU);
        out().innerHTML = loss <= 60 ? `✔ El motor está de acuerdo: la maniobra es segura${loss <= 15 ? " y de las mejores de la posición" : ""}.`
          : `⚠ Ojo: según el motor, ahora mismo esa jugada pierde ${(loss / 100).toFixed(1).replace(".", ",")} peones${bm ? `; hay algo más urgente, como <b>${esc(numPrefix(st) + formatSan(Chess.san(st, bm), settings.lang, st.t))}</b>` : ""}. El plan es bueno, pero quizá no sea el momento.`;
      }
    } finally { Talk.busy = false; ui.analysing = false; requestLive(); }
  }
}
function closeTalk() { $("talkBox").hidden = true; Talk.node = null; Talk.shapes = []; renderShapes(); }

/* ---------- 19c. «Aprende de tus errores»: rehacer los ? y ?? de la partida ---------- */
const Retry = { active: false, busy: false, queue: [], i: 0, attempts: 0, hint: 0, hintSq: -1, state: "", results: [], arrows: [], msg: "", prevFlip: false };
function mistakesOf(side) {
  const line = ui.analysedLine || [game.root, ...Pgn.mainlineFrom(game.root)];
  return line.slice(1).filter(n => (n.nag === "?" || n.nag === "??") && n.parent && n.parent.eval && n.parent.eval.best && n.parent.eval.best !== n.uci && (!side || n.parent.state.t === side));
}
function renderRetryStart() {
  const box = $("retryStart");
  const w = mistakesOf(1).length, b = mistakesOf(-1).length;
  if (!w && !b) { box.hidden = false; box.innerHTML = `<span class="small">🎯 No hay errores (? ni ??) que repasar en esta partida.</span>`; return; }
  const h = game.headers;
  box.hidden = false;
  box.innerHTML = `<b>🎯 Aprende de tus errores:</b>
    <button class="sm-btn primary" data-s="1" ${w ? "" : "disabled"}>${esc(h.White || "Blancas")} (${w})</button>
    <button class="sm-btn primary" data-s="-1" ${b ? "" : "disabled"}>${esc(h.Black || "Negras")} (${b})</button>
    <button class="sm-btn" data-s="0">Todos (${w + b})</button>`;
  box.querySelectorAll("button").forEach(btn => btn.onclick = () => startRetry(+btn.dataset.s));
}
function startRetry(side, queue) {
  const q = queue || mistakesOf(side);
  if (!q.length) { toast("No hay errores que repasar."); return; }
  if (Batch.running) { toast("Espera a que termine el análisis de tus partidas (o detenlo)."); return; }
  if (trainer.active) stopTraining(true);
  if (ui.cpu.on) stopCpu(true);
  if (Guess.active) guessStop();
  if (Vis.active) visStop(true);
  if (editor.active) closeEditor();
  stopAutoplay();
  Threat.node = null;
  Engine.cancel("live");
  Object.assign(Retry, { active: true, busy: false, queue: q, i: 0, results: [], prevFlip: ui.flipped });
  retryShow();
  const box = $("retryBox");
  setTimeout(() => { const r = $("boardWrap").getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) $("topBar").scrollIntoView({ block: "start", behavior: "smooth" }); }, 40);
  if (box) box.focus && box.focus();
}
const retryNode = () => Retry.queue[Retry.i];
function retryDesc(node) {
  const p = node.parent, side = p.state.t === 1 ? "las blancas" : "las negras";
  if (node.__drill) {
    const d = node.__drill, th = d.e.th && THEMES[d.e.th] ? ` · ${THEMES[d.e.th].icon} ${esc(THEMES[d.e.th].name)}` : "";
    return `<span class="small">📚 ${esc(d.title)}${d.date && !/^\?/.test(d.date) ? ` (${esc(d.date.slice(0, 4))})` : ""}${th}</span><br>En la partida, ${side} jugaron <b>${esc(numPrefix(p.state) + dispSan(node) + (node.nag || ""))}</b> y la valoración pasó de ${esc(fmtEval(p.eval))} a ${esc(fmtEval(node.eval))}.`;
  }
  return `En la partida, ${side} jugaron <b>${esc(numPrefix(p.state) + dispSan(node) + (node.nag || ""))}</b> y la valoración pasó de ${esc(fmtEval(p.eval))} a ${esc(fmtEval(node.eval))}.`;
}
async function retryShow() {
  const node = retryNode();
  if (node.__game && game !== node.__game) {
    Retry.active = false;
    setGame(node.__game, { noConfirm: true, name: `🎯 Ejercicio · ${node.__drill.title}` });
    Retry.active = true;
  }
  Object.assign(Retry, { attempts: 0, hint: 0, hintSq: -1, state: "ask", arrows: [], msg: "" });
  if (node.__drill && !(node.parent.eval && node.parent.eval.best)) {
    game.current = node.parent;
    ui.flipped = node.parent.state.t === -1;
    render();
    const ok = await prepareDrill(node);
    if (!Retry.active || retryNode() !== node) return;
    if (!ok || node.parent.eval.best === node.uci) { Retry.i++; if (Retry.i >= Retry.queue.length) retryEnd(false); else retryShow(); return; }
    Retry.state = "ask";
  }
  game.current = node.parent;
  ui.selected = null;
  ui.flipped = node.parent.state.t === -1;
  render();
  retryPanel();
}
function retryPanel() {
  const box = $("retryBox");
  if (!box) return;
  box.hidden = false;
  if (!Retry.active) return;
  const node = retryNode(), n = Retry.queue.length;
  const who = node.parent.state.t === 1 ? "las blancas" : "las negras";
  let html = `<div class="retry-head">🎯 ${node.__drill ? "Ejercicio" : "Error"} ${Retry.i + 1} de ${n}</div><div>${retryDesc(node)}</div>`;
  if (Retry.state === "ask" || Retry.state === "wrong") html += `<div class="retry-q">¿Qué era mejor para ${who}? Haz la jugada en el tablero.</div>`;
  if (Retry.msg) html += `<div class="retry-msg">${Retry.msg}</div>`;
  const open = Retry.state === "ask" || Retry.state === "wrong";
  html += `<div class="controls">`;
  if (open) html += `<button class="sm-btn" data-a="hint">💡 Pista</button><button class="sm-btn" data-a="show">👁 Ver solución</button><button class="sm-btn" data-a="skip">⏭ Saltar</button>`;
  if (Retry.state === "checking") html += `<span class="small">⏳ Comprobando tu jugada con el motor…</span>`;
  if (Retry.state === "preparing") html += `<span class="small">⏳ El motor está calculando la mejor jugada de esta posición…</span>`;
  if (Retry.state === "solved" || Retry.state === "shown") {
    html += `<button class="sm-btn warn-btn" data-a="card">📌 Guardar como tarjeta</button>`;
    html += Retry.i + 1 < n ? `<button class="sm-btn primary" data-a="next">Siguiente ▶</button>` : `<button class="sm-btn primary" data-a="next">Ver resumen ▶</button>`;
  }
  html += `<button class="sm-btn danger" data-a="end">⏹ Terminar</button>${node.__drill && Cards.stash ? `<button class="sm-btn" data-a="back" title="Deja los ejercicios y vuelve a la partida que tenías">↩ Volver a tu partida</button>` : ""}</div>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-a]").forEach(b => b.onclick = () => retryAction(b.dataset.a));
}
function bestOf(node) {
  const p = node.parent, best = p.eval.best;
  const L = Chess.legal(p.state), m = Chess.moveFromUci(p.state, best, L);
  return { uci: best, move: m, san: m ? formatSan(Chess.san(p.state, m, L), settings.lang, p.state.t) : best, line: lineText(p.state, p.eval.pv && p.eval.pv.length ? p.eval.pv : [best], 6) };
}
function retryAction(a) {
  const node = retryNode();
  if (a === "end") { retryEnd(false); return; }
  if (a === "next") { Retry.i++; if (Retry.i >= Retry.queue.length) retryEnd(false); else retryShow(); return; }
  if (a === "back") { restoreStash(); return; }
  if (a === "skip") { Retry.results.push({ node, ok: false, skipped: true }); Retry.i++; if (Retry.i >= Retry.queue.length) retryEnd(false); else retryShow(); return; }
  if (a === "card") { retrySaveCard(node); return; }
  if (a === "hint") {
    const b = bestOf(node);
    Retry.hint++;
    if (Retry.hint === 1 && b.move) { Retry.hintSq = b.move.from; Retry.msg = "💡 La pieza que debes mover está marcada en azul."; }
    else if (b.move) { Retry.arrows = [{ color: "blue", from: b.move.from, to: b.move.to }]; Retry.msg = "💡 La flecha azul indica la jugada."; }
    renderBoard(); retryPanel(); return;
  }
  if (a === "show") { retryShowSolution(); return; }
}
async function retryMove(move) {
  const node = retryNode(), p = node.parent, u = Chess.uci(move);
  if (Retry.busy || Retry.state === "solved" || Retry.state === "shown" || Retry.state === "preparing") return;
  const L = Chess.legal(p.state), san = formatSan(Chess.san(p.state, move, L), settings.lang, p.state.t);
  if (u === p.eval.best) { retrySolved(move, san, 0); return; }
  if (u === node.uci) { Retry.attempts++; Retry.state = "wrong"; Retry.msg = `❌ ${esc(san)} es justo la jugada de la partida, la que fue un error. Busca otra.`; Sound.play("error"); retryPanel(); return; }
  Retry.busy = true;
  Retry.state = "checking";
  retryPanel();
  const fake = { parent: p, uci: u, state: Chess.apply(p.state, move) };
  let ev = terminalEval(fake);
  if (!ev) {
    const job = await Engine.analyse(fake, { purpose: "retry", movetime: Math.max(700, +settings.analysisMs), multipv: 1 });
    const l = job && job.lines && job.lines[0];
    ev = l ? { cp: l.cp, mate: l.mate, winner: l.winner } : null;
  }
  Retry.busy = false;
  if (!Retry.active || retryNode() !== node) return;
  if (!ev) { Retry.state = "ask"; Retry.msg = "No se ha podido comprobar la jugada: inténtalo otra vez."; retryPanel(); return; }
  const mover = p.state.t;
  const wBest = mover === 1 ? winPct(p.eval) : 100 - winPct(p.eval);
  const wUser = mover === 1 ? winPct(ev) : 100 - winPct(ev);
  const loss = Math.max(0, wBest - wUser);
  if (loss <= 5) { retrySolved(move, san, loss); return; }
  Retry.attempts++;
  Retry.state = "wrong";
  Retry.arrows = [{ color: "red", from: move.from, to: move.to }];
  Sound.play("error");
  Retry.msg = `❌ Con ${esc(san)} la valoración sería ${esc(fmtEval(ev))}: sigue sin ser buena. ${Retry.attempts >= 3 ? "" : "Prueba otra."}`;
  renderShapes();
  if (Retry.attempts >= 3) { retryShowSolution(Retry.msg + "<br>"); return; }
  retryPanel();
}
function retrySolved(move, san, loss) {
  const node = retryNode(), b = bestOf(node);
  Retry.state = "solved";
  Retry.hintSq = -1;
  Retry.results.push({ node, ok: Retry.attempts === 0 && Retry.hint === 0 });
  if (node.__drill) drillRecord(node, Retry.attempts === 0 && Retry.hint === 0);
  Retry.arrows = [{ color: "green", from: move.from, to: move.to }];
  if (b.move && Chess.uci(move) !== b.uci) Retry.arrows.push({ color: "blue", from: b.move.from, to: b.move.to });
  Sound.play("ok");
  Retry.msg = loss === 0
    ? `✔ <b>¡Exacto!</b> ${esc(san)} era la mejor jugada. Línea: ${esc(b.line)}`
    : `✔ <b>¡Bien!</b> ${esc(san)} también vale (casi tan buena como la del motor). La mejor era ${esc(b.san)} (flecha azul): ${esc(b.line)}`;
  renderBoard();
  retryPanel();
}
function retryShowSolution(prefix = "") {
  const node = retryNode(), b = bestOf(node);
  Retry.state = "shown";
  Retry.hintSq = -1;
  Retry.results.push({ node, ok: false });
  if (node.__drill) drillRecord(node, false);
  Retry.arrows = b.move ? [{ color: "green", from: b.move.from, to: b.move.to }] : [];
  Retry.msg = `${prefix}👁 La buena era <b>${esc(b.san)}</b> (flecha verde). Línea: ${esc(b.line)}`;
  renderBoard();
  retryPanel();
}
function retryEnd(silent) {
  const res = Retry.results, done = res.filter(r => !r.skipped).length, first = res.filter(r => r.ok).length;
  const last = Retry.queue[Math.min(Retry.i, Retry.queue.length - 1)];
  Retry.active = false;
  Retry.arrows = [];
  Retry.hintSq = -1;
  ui.flipped = Retry.prevFlip;
  const box = $("retryBox");
  if (silent) { box.hidden = true; return; }
  if (last) game.current = last;
  box.hidden = false;
  const drill = Retry.queue.some(n => n.__drill);
  box.innerHTML = `<div class="retry-head">🏁 Repaso terminado</div><div>Has repasado ${done} ${drill ? `ejercicio${done === 1 ? "" : "s"}` : `error${done === 1 ? "" : "es"}`}: <b>${first}</b> resuelto${first === 1 ? "" : "s"} a la primera${done - first > 0 ? `, ${done - first} con ayuda` : ""}${res.length - done ? ` y ${res.length - done} saltado${res.length - done === 1 ? "" : "s"}` : ""}.</div>
    <div class="small">${drill ? "Los que fallaste vuelven mañana; los acertados se espacian (3, 7, 16… días)." : "Guarda como tarjeta 📌 los que quieras repasar más adelante en «🎯 Entrenar › Tarjetas»."}</div>
    <div class="controls">${drill && Cards.stash ? `<button class="sm-btn primary" data-back-retry>↩ Volver a tu partida</button>` : ""}<button class="sm-btn" data-close-retry>Cerrar</button></div>`;
  box.querySelector("[data-close-retry]").onclick = () => { box.hidden = true; };
  const bk = box.querySelector("[data-back-retry]");
  if (bk) bk.onclick = () => { box.hidden = true; restoreStash(); };
  render();
}
async function retrySaveCard(node) {
  if (!Lib.ready) return;
  if (node.__drill) {
    const d = node.__drill, src = Lib.games.get(d.recId);
    if (!src) { toast("La partida de este ejercicio ya no está en la biblioteca."); return; }
    const b = bestOf(node), path = pathOfPly(src, d.e.ply), p = node.parent;
    const prev = marksOfGame(src.id).find(m => m.path.join(" ") === path.join(" "));
    const rec = Object.assign(prev ? Object.assign({}, prev) : { created: Date.now(), srs: null }, {
      gameId: src.id, path, fen: Chess.toFen(node.state), fenBefore: Chess.toFen(p.state), san: node.san, num: numPrefix(p.state), color: p.state.t,
      cat: "error", note: `En la partida se jugó ${numPrefix(p.state)}${dispSan(node)}${node.nag || ""}. La buena era ${b.san}.`, train: "best", answer: b.uci, updated: Date.now()
    });
    try { await DB.put("marks", rec); } catch (e) { toast("❌ No se pudo guardar la tarjeta: " + e.message); return; }
    Lib.marks.set(rec.id, rec);
    toast("📌 Guardada como tarjeta (⚠ Error típico).", 3000);
    refreshLibraryViews();
    return;
  }
  if (!ui.libId || !Lib.games.has(ui.libId)) {
    if (!confirm("Para guardar tarjetas, la partida tiene que estar en tu biblioteca.\n\n¿Guardarla ahora?")) return;
    if (!(await saveToLibrary({}))) return;
  }
  const p = node.parent, b = bestOf(node);
  const path = Pgn.pathTo(node).slice(1).map(n => n.uci);
  const prev = marksOfGame(ui.libId).find(m => m.path.join(" ") === path.join(" "));
  const rec = Object.assign(prev ? Object.assign({}, prev) : { created: Date.now(), srs: null }, {
    gameId: ui.libId, path, fen: Chess.toFen(node.state), fenBefore: Chess.toFen(p.state), san: node.san, num: numPrefix(p.state), color: p.state.t,
    cat: "error", note: `En la partida se jugó ${numPrefix(p.state)}${dispSan(node)}${node.nag || ""}. La buena era ${b.san}.`, train: "best", answer: b.uci, updated: Date.now()
  });
  try { await DB.put("marks", rec); } catch (e) { toast("❌ No se pudo guardar la tarjeta: " + e.message); return; }
  Lib.marks.set(rec.id, rec);
  toast("📌 Guardada como tarjeta (⚠ Error típico). La repasarás en «🎯 Entrenar › Tarjetas».", 4000);
  refreshLibraryViews();
}

