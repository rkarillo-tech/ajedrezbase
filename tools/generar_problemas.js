#!/usr/bin/env node
/* Genera el banco de problemas tácticos de AjedrezBase (cursos/problemas.json) con Stockfish,
   con el mismo método que se usa para crear problemas a partir de partidas:
   1) Stockfish juega partidas consigo mismo a nivel bajo, desde aperturas variadas del libro ECO;
   2) se buscan los momentos en los que una jugada da al rival una ventaja decisiva;
   3) se calcula la solución exigiendo que, en cada paso, la mejor jugada sea claramente mejor que la segunda;
   4) se clasifican por temas y se estima su dificultad.

   SF=ruta/stockfish-19-lite-single.js node tools/generar_problemas.js [número de partidas] [semilla]
   Para buscar problemas más difíciles: NIVEL_MIN y NIVEL_MAX (nivel de Stockfish en las partidas, 0-20; por defecto 0-8:
   a más nivel, errores más sutiles) y DIFICULTAD_MIN (sólo guarda los problemas de esa dificultad estimada o más).
   Se puede ejecutar varias veces: añade problemas nuevos a los que ya hay (sin repetir posiciones). */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");
const src = ["core.js", "pgn.js", "eco.js"].map(f => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");
const { Chess, Pgn, ECO_BOOK } = new Function(src + ";return { Chess, Pgn, ECO_BOOK };")();
const OUT = path.join(ROOT, "cursos", "problemas.json");
const GAMES = +process.argv[2] || 50;
let seed = +process.argv[3] || Date.now() % 100000;
const SKILL_MIN = Math.max(0, Math.min(20, +process.env.NIVEL_MIN || 0));
const SKILL_MAX = Math.max(SKILL_MIN, Math.min(20, process.env.NIVEL_MAX ? +process.env.NIVEL_MAX : 8));
const MIN_RATING = +process.env.DIFICULTAD_MIN || 0;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/* ---------- Motor ---------- */
function engine(bin) {
  const p = spawn(process.execPath, [bin]);
  let buf = "", cb = null;
  p.stdout.on("data", d => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (cb) cb(l); }
  });
  const send = c => p.stdin.write(c + "\n");
  send("uci"); send("setoption name Hash value 32");
  return {
    go(fen, { depth, movetime, multipv = 1, skill = 20 }) {
      return new Promise(res => {
        const lines = [];
        cb = l => {
          if (l.startsWith("info") && l.includes(" pv ") && l.includes(" score ") && !l.includes("bound")) {
            const t = l.split(" "), k = t.indexOf("score"), mp = +(t[t.indexOf("multipv") + 1] || 1);
            lines[mp - 1] = { mate: t[k + 1] === "mate" ? +t[k + 2] : null, cp: t[k + 1] === "cp" ? +t[k + 2] : null, pv: t.slice(t.indexOf("pv") + 1) };
          } else if (l.startsWith("bestmove")) { cb = null; res({ best: l.split(" ")[1], lines: lines.filter(Boolean) }); }
        };
        send(`setoption name MultiPV value ${multipv}`);
        send(`setoption name Skill Level value ${skill}`);
        send("position fen " + fen);
        send(depth ? `go depth ${depth}` : `go movetime ${movetime}`);
      });
    },
    quit() { send("quit"); }
  };
}
/* Probabilidad de ganar (0-100) del bando que mueve */
const win = l => (!l ? 50 : l.mate != null ? (l.mate > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * l.cp)) - 1));
/* ¿Es la mejor jugada claramente la única buena? En los mates, que sea el más rápido con diferencia */
function isUnique(b1, b2) {
  if (!b2) return true;
  if (b1.mate != null && b1.mate > 0) return !(b2.mate != null && b2.mate > 0) || b2.mate >= b1.mate + 2;
  return win(b1) - win(b2) >= 22;
}
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(s, c) {
  let m = 0;
  for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (p !== "." && Chess.color(p) === c) m += VAL[p.toLowerCase()]; }
  return m;
}
function pieceCount(s) { let n = 0; for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (s.b[i] !== "." && "pPkK".indexOf(s.b[i]) < 0) n++; } return n; }

/* ---------- Temas ---------- */
function themesOf(start, sol) {
  // start: posición tras el error (le toca al que resuelve); sol: jugadas de la solución (UCI), empezando por el que resuelve
  const me = start.t, th = new Set();
  let s = start;
  const states = [s];
  const moves = [];
  for (const u of sol) { const m = Chess.moveFromUci(s, u); moves.push(m); s = Chess.apply(s, m); states.push(s); }
  const end = s, userMoves = Math.ceil(sol.length / 2);
  const mated = !Chess.legal(end).length && Chess.inCheck(end);
  if (mated) {
    th.add("mateIn" + userMoves);
    const k = Chess.kingSq(end.b, end.t), last = moves[moves.length - 1], pc = last.piece.toLowerCase();
    const row = k >> 4;
    if ((row === 0 || row === 7) && (pc === "r" || pc === "q") && (last.to >> 4) === row) th.add("backRankMate");
    if (pc === "n") {
      let smothered = true;
      for (const d of [-17, -16, -15, -1, 1, 15, 16, 17]) { const q = k + d; if (q & 0x88) continue; const p = end.b[q]; if (p === "." || Chess.color(p) !== end.t) { smothered = false; break; } }
      if (smothered) th.add("smotheredMate");
    }
  }
  const first = moves[0], afterFirst = states[1];
  if (first.promotion || moves.some((m, i) => i % 2 === 0 && m.promotion)) th.add("promotion");
  if (first.captured !== "." && first.captured) {
    // Pieza colgada: lo que se captura no estaba defendido
    const victim = first.captured.toLowerCase();
    const defended = Chess.attackers ? Chess.attackers(afterFirst.b, first.to, -me).length > 0 : Chess.attacked(afterFirst.b, first.to, -me);
    if (!defended && VAL[victim] >= 3) th.add("hangingPiece");
  }
  // Jaque a la descubierta y jaque doble
  moves.forEach((m, i) => {
    if (i % 2) return;
    const after = states[i + 1];
    if (!Chess.inCheck(after)) return;
    const k = Chess.kingSq(after.b, after.t);
    const checkers = Chess.attackers ? Chess.attackers(after.b, k, me) : [];
    if (checkers.length >= 2) th.add("doubleCheck");
    else if (checkers.length === 1 && checkers[0] !== m.to) th.add("discoveredAttack");
  });
  // Horquilla: la pieza que mueve ataca a la vez dos piezas valiosas (o el rey y otra)
  moves.forEach((m, i) => {
    if (i % 2 || th.has("fork")) return;
    const after = states[i + 1], pc = m.piece.toLowerCase();
    if (pc === "k") return;
    let targets = 0;
    const L = Chess.legal(Object.assign(Chess.clone(after), { t: me }));
    const hit = new Set();
    for (const x of L) if (x.from === m.to && x.captured && x.captured !== "." && !hit.has(x.to)) {
      const v = x.captured.toLowerCase();
      if (v === "k" || VAL[v] > VAL[pc] || (VAL[v] >= 3 && !Chess.attacked(after.b, x.to, -me))) { targets++; hit.add(x.to); }
    }
    if (Chess.inCheck(after) && Chess.attackers && Chess.attackers(after.b, Chess.kingSq(after.b, after.t), me).includes(m.to)) targets++;
    if (targets >= 2) th.add("fork");
  });
  // Clavada absoluta: tras la primera jugada, una pieza rival valiosa queda clavada contra su rey
  {
    const k = Chess.kingSq(afterFirst.b, -me);
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) { i += 7; continue; }
      const p = afterFirst.b[i];
      if (p === "." || Chess.color(p) !== -me || p.toLowerCase() === "k" || VAL[p.toLowerCase()] < 3) continue;
      const b2 = afterFirst.b.slice(); b2[i] = ".";
      if (Chess.attacked(b2, k, me) && !Chess.attacked(afterFirst.b, k, me)) { th.add("pin"); break; }
    }
  }
  // Sacrificio: tras la respuesta del rival, el que resuelve tiene menos material que al empezar
  if (states.length > 2 && material(states[2], me) - material(states[2], -me) < material(start, me) - material(start, -me) - 1) th.add("sacrifice");
  if (!mated && sol.length <= 2) th.add("short");
  if (pieceCount(start) <= 6) th.add("endgame");
  return [...th];
}
function estimateRating(start, sol, themes) {
  const userMoves = Math.ceil(sol.length / 2);
  const m = Chess.moveFromUci(start, sol[0]);
  const quiet = (!m.captured || m.captured === ".") && !Chess.inCheck(Chess.apply(start, m));
  let r = 900 + 330 * (userMoves - 1);
  if (quiet) r += 300;
  if (themes.includes("sacrifice")) r += 220;
  if (themes.includes("hangingPiece")) r -= 250;
  if (themes.includes("mateIn1")) r -= 150;
  if (themes.includes("doubleCheck") || themes.includes("discoveredAttack")) r += 80;
  if (themes.includes("endgame")) r += 120;
  return Math.max(600, Math.min(2400, Math.round(r / 10) * 10));
}

/* ---------- Generación ---------- */
(async () => {
  if (!process.env.SF) { console.error("Indica Stockfish con SF=…"); process.exit(1); }
  const sf = engine(process.env.SF);
  const bank = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
  // Posiciones ya usadas (la del problema es la que queda tras la primera jugada, el error del rival)
  const seen = new Set(bank.map(p => { const s = Chess.parseFen(p.fen); return Chess.toFen(Chess.apply(s, Chess.moveFromUci(s, p.moves[0]))).split(" ").slice(0, 4).join(" "); }));
  const SHORT_KEEP = +(process.env.CORTOS || 1);   // proporción de problemas de una sola jugada (sin mate) que se conservan
  let nextId = bank.length + 1;   // provisional: tools/depurar_problemas.js pone el identificador definitivo
  const t0 = Date.now();
  for (let g = 0; g < GAMES; g++) {
    // Apertura del libro ECO (las primeras jugadas) y después Stockfish a nivel bajo contra sí mismo
    const line = ECO_BOOK[Math.floor(rnd() * ECO_BOOK.length)];
    let s = Chess.parseFen(Chess.START_FEN);
    try {
      const r = Pgn.parseGame(line.moves, { lang: "en" });
      for (const n of Pgn.mainlineFrom(r.game.root)) s = n.state;
    } catch { continue; }
    const skill = SKILL_MIN + Math.floor(rnd() * (SKILL_MAX - SKILL_MIN + 1));   // por defecto 0-8: cometen errores de todo tipo
    let prevEval = null, found = 0;
    for (let ply = 0; ply < 120; ply++) {
      if (!Chess.legal(s).length || Chess.insufficient(s) || s.half >= 80) break;
      const fenBefore = Chess.toFen(s);
      // Juego «humano»: casi siempre una de las buenas, a veces la 2.ª-4.ª opción y, de vez en cuando, un descuido
      const opts = await sf.go(fenBefore, { movetime: 40, multipv: 4, skill });
      if (!opts.best || opts.best === "(none)") break;
      const r = rnd(), L = Chess.legal(s);
      let pick = opts.best;
      if (r < 0.025 && L.length > 1) pick = Chess.uci(L[Math.floor(rnd() * L.length)]);
      else if (r < 0.3 && opts.lines.length > 1) pick = opts.lines[1 + Math.floor(rnd() * (opts.lines.length - 1))].pv[0];
      const mv = { best: pick };
      const m = Chess.moveFromUci(s, mv.best);
      if (!m) break;
      const after = Chess.apply(s, m);
      if (!Chess.legal(after).length) break;
      const quick = await sf.go(Chess.toFen(after), { depth: 10, multipv: 2 });
      const wAfter = win(quick.lines[0]);                       // para el que resuelve
      const wBefore = prevEval == null ? 50 : 100 - prevEval;  // la misma persona, antes del error del rival
      prevEval = wAfter;
      s = after;
      const [q0, q1] = quick.lines;
      const mateFound = q0 && q0.mate != null && q0.mate > 0 && q0.mate <= 4 && wBefore <= 95;   // «encuentra el mate»
      const tactic = wAfter >= 75 && wBefore <= 85 && (!q1 || wAfter - win(q1) >= 20);           // hay una jugada única que gana
      if (!mateFound && !tactic) continue;
      const key = Chess.toFen(after).split(" ").slice(0, 4).join(" ");
      if (seen.has(key)) continue;
      // Solución: cada jugada del que resuelve tiene que ser única
      let p = after;
      const sol = [];
      let ok = true;
      for (let step = 0; step < 4; step++) {
        const a = await sf.go(Chess.toFen(p), { movetime: 350, multipv: 2 });
        const [b1, b2] = a.lines;
        if (!b1) { ok = false; break; }
        const unique = isUnique(b1, b2);
        if (!unique) { if (step === 0) ok = false; break; }
        const um = Chess.moveFromUci(p, b1.pv[0]);
        sol.push(b1.pv[0]);
        p = Chess.apply(p, um);
        if (!Chess.legal(p).length) break;                       // mate (o ahogado, que se descarta después)
        if (b1.mate == null && win(b1) >= 97 && step >= 1) break;  // ventaja ya aplastante
        const reply = await sf.go(Chess.toFen(p), { movetime: 250 });
        if (!reply.best || reply.best === "(none)") break;
        const rm = Chess.moveFromUci(p, reply.best);
        // La partida sigue tras la respuesta sólo si la siguiente jugada del que resuelve también es única
        const probe = Chess.apply(p, rm);
        const a2 = await sf.go(Chess.toFen(probe), { movetime: 300, multipv: 2 });
        const [c1, c2] = a2.lines;
        const unique2 = c1 && isUnique(c1, c2);
        if (!unique2 || (c1 && win(c1) < 85)) break;
        sol.push(reply.best);
        p = probe;
      }
      if (!ok || !sol.length) continue;
      if (sol.length % 2 === 0) sol.pop();                       // termina siempre con una jugada del que resuelve
      const endS = sol.reduce((x, u) => Chess.apply(x, Chess.moveFromUci(x, u)), after);
      if (!Chess.legal(endS).length && !Chess.inCheck(endS)) continue;   // ahogado
      const themes = themesOf(after, sol);
      seen.add(key);
      // Los de «comerse una pieza colgada» en una jugada son muy fáciles y abundan: se conserva sólo una parte
      if (themes.includes("hangingPiece") && sol.length === 1 && rnd() < 0.8) continue;
      if (sol.length === 1 && !themes.some(x => x.startsWith("mateIn")) && rnd() > SHORT_KEEP) continue;
      const rating = estimateRating(after, sol, themes);
      if (rating < MIN_RATING) continue;
      bank.push({ id: "n" + nextId++, fen: fenBefore, moves: [mv.best, ...sol], themes, rating });
      found++;
      fs.writeFileSync(OUT, JSON.stringify(bank));
    }
    console.log(`partida ${g + 1}/${GAMES} (nivel ${skill}, ${line.name}): ${found} problema(s) · total ${bank.length} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  sf.quit();
  fs.writeFileSync(OUT, JSON.stringify(bank));
  console.log(`cursos/problemas.json: ${bank.length} problemas`);
})();
