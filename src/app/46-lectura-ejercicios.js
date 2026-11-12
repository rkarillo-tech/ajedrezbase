/* ---------- 26v. Ejercicios del método «Lee el tablero» y de geometría ----------
   ⚡ Jaques y capturas: en posiciones de los problemas, encontrar TODAS las jugadas forzadas (jaques y capturas)
      antes de calcular: es el hábito que más táctica descubre.
   🍴 Doble ataque: geometría de la horquilla. Tu pieza tiene que ir a la casilla desde la que ataca a la vez al rey
      y a otra pieza del rival sin que se la puedan comer. */

/* --- ⚡ Jaques y capturas --- */
function visForcingQ() {
  for (let t = 0; t < 60; t++) {
    const p = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
    let st;
    try { st = Chess.parseFen(p.fen); const m = Chess.moveFromUci(st, p.moves[0]); if (!m) continue; st = Chess.apply(st, m); } catch { continue; }
    const L = Chess.legal(st), want = L.filter(m => m.captured !== "." || Chess.inCheck(Chess.apply(st, m))).map(m => Chess.uci(m));
    if (want.length >= 2 && want.length <= 9) return { st, want: [...new Set(want)], found: [], wrong: 0, sel: null };
  }
  return null;
}
function visForcingClick(v) {
  const q = Vis.q, st = q.st;
  if (typeof v !== "number") return;
  if (q.sel == null || (st.b[v] !== "." && Chess.color(st.b[v]) === st.t)) {
    if (st.b[v] === "." || Chess.color(st.b[v]) !== st.t) return;
    q.sel = v; Vis.marks = { ok: v }; renderBoard(); return;
  }
  const L = Chess.legal(st), m = L.find(x => x.from === q.sel && x.to === v && (!x.promo || "qQ".includes(x.promo)));
  q.sel = null; Vis.marks = {};
  const u = m && Chess.uci(m);
  if (u && q.want.includes(u) && !q.found.includes(u)) {
    q.found.push(u);
    ui.visShapes.push({ color: "green", from: m.from, to: m.to });
    Sound.play("move");
    Vis.msg = `✔ ${esc(formatSan(Chess.san(st, m, L), settings.lang, st.t))}${q.found.length === q.want.length ? " — <b>¡las tienes todas!</b>" : ""}`;
    if (q.found.length === q.want.length) visForcingEnd();
  } else if (u && q.found.includes(u)) Vis.msg = "Esa ya la tenías.";
  else {
    q.wrong++;
    Sound.play("error");
    Vis.marks = { bad: v };
    Vis.msg = m ? "✖ Esa jugada no da jaque ni captura nada." : "✖ Esa jugada no es legal.";
  }
  renderBoard(); visPanel();
}
function visForcingEnd() {
  const q = Vis.q, st = q.st, L = Chess.legal(st), missed = q.want.filter(u => !q.found.includes(u));
  for (const u of missed) { const m = Chess.moveFromUci(st, u, L); if (m) ui.visShapes.push({ color: "blue", from: m.from, to: m.to }); }
  const ok = !missed.length && q.wrong === 0;
  Vis.n++; if (ok) Vis.ok++; else Vis.bad++;
  Vis.state = "answered";
  Vis.msg = (missed.length ? `Te faltaron (flechas azules): <b>${missed.map(u => esc(formatSan(Chess.san(st, Chess.moveFromUci(st, u, L), L), settings.lang, st.t))).join(", ")}</b>. ` : "✔ <b>Las encontraste todas.</b> ")
    + (q.wrong ? `${q.wrong} intento${q.wrong > 1 ? "s" : ""} que no eran ni jaque ni captura.` : "")
    + `<br><span class="small">Recuerda: casi todas las combinaciones empiezan con un jaque, una captura o una amenaza. Mirarlas todas, también las que parecen absurdas, es el primer paso antes de calcular.</span>`;
  Sound.play(ok ? "ok" : "end");
  renderBoard();
}
function visForcingPanel() {
  const q = Vis.q, side = q.st.t === 1 ? "blancas" : "negras";
  return `<div class="retry-head">⚡ Jaques y capturas · ${Vis.state === "answered" ? Vis.n : Vis.n + 1} de ${Vis.total} · aciertos ${Vis.ok}</div>
    <div>Juegan las <b>${side}</b>. Encuentra <b>todos los jaques y todas las capturas</b> (${q.want.length} en total; llevas ${q.found.length}). Pulsa la pieza y después la casilla.</div>`;
}

/* --- 🍴 Doble ataque (geometría de la horquilla) --- */
const FORK_PIECES = ["N", "N", "N", "Q", "B", "R"];
function visForkQ() {
  for (let t = 0; t < 4000; t++) {
    const pc = FORK_PIECES[Math.floor(Math.random() * FORK_PIECES.length)], other = Math.random() < 0.7 ? "r" : "q";
    const from = randomSq(), k = randomSq(), o = randomSq();
    if (new Set([from, k, o]).size < 3) continue;
    const st = Chess.parseFen("8/8/8/8/8/8/8/8 w - - 0 1");
    st.b[from] = pc; st.b[k] = "k"; st.b[o] = other;
    // Al principio no ataca a ninguna, ni la pueden comer
    if (Chess.attackers(st.b, k, 1).length || Chess.attackers(st.b, o, 1).length || Chess.attacked(st.b, from, -1)) continue;
    const L = Chess.legal(Object.assign(Chess.clone(st), { t: 1 })).filter(m => m.from === from && m.captured === ".");
    const good = [];
    for (const m of L) {
      const b2 = st.b.slice(); b2[m.to] = pc; b2[from] = ".";
      if (Chess.attackers(b2, k, 1).includes(m.to) && Chess.attackers(b2, o, 1).includes(m.to) && !Chess.attacked(b2, m.to, -1)) good.push(m.to);
    }
    if (good.length >= 1 && good.length <= 2) return { from, pc, k, o, other, good };
  }
  return null;
}
function visForkClick(v) {
  const q = Vis.q, N = Chess.sqName;
  if (typeof v !== "number" || v === q.from) return;
  const ok = q.good.includes(v);
  Vis.n++; if (ok) Vis.ok++; else Vis.bad++;
  Vis.state = "answered";
  ui.visShapes = q.good.map(x => ({ color: "green", from: q.from, to: x })).concat(q.good.flatMap(x => [{ color: "red", from: x, to: q.k }, { color: "red", from: x, to: q.o }]));
  Vis.marks = ok ? { ok: v } : { bad: v };
  const tip = q.pc === "N" ? `El caballo salta siempre a una casilla de <b>otro color</b>: para atacar a la vez al rey y ${q.other === "q" ? "a la dama" : "a la torre"}, los dos tienen que estar en casillas del <b>mismo color</b> y a «salto de caballo» de la casilla de la horquilla.`
    : q.pc === "B" ? "El alfil sólo ve su color: la horquilla de alfil sale cuando el rey y la otra pieza están en dos diagonales que se cruzan en una casilla segura."
    : q.pc === "R" ? "La torre ataca en cruz: busca la casilla donde se cortan la fila de una pieza y la columna de la otra."
    : "La dama junta las dos geometrías, la de la torre y la del alfil: mira las filas, columnas y diagonales de cada pieza y dónde se cruzan.";
  Vis.msg = `${ok ? "✔ <b>¡Horquilla!</b>" : `✖ Desde ${N(v)} no atacas a las dos a la vez sin que te la coman.`} La buena: <b>${q.good.map(N).join(" o ")}</b>.<br><span class="small">💡 ${tip}</span>`;
  Sound.play(ok ? "ok" : "error");
  renderBoard(); visPanel();
}
function visForkPanel() {
  const q = Vis.q, N = Chess.sqName, name = { N: "el caballo", Q: "la dama", B: "el alfil", R: "la torre" }[q.pc];
  return `<div class="retry-head">🍴 Doble ataque · ${Vis.state === "answered" ? Vis.n : Vis.n + 1} de ${Vis.total} · aciertos ${Vis.ok}</div>
    <div>Lleva ${name} de <b>${N(q.from)}</b>, en una jugada, a la casilla desde la que ataca <b>a la vez al rey y ${q.other === "q" ? "a la dama" : "a la torre"}</b> sin que se lo puedan comer. Pulsa esa casilla.</div>`;
}
