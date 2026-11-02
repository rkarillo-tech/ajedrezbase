#!/usr/bin/env node
/* Depura el banco de problemas (cursos/problemas.json) antes de publicarlo:
   1) vuelve a comprobar cada problema con un análisis más profundo: la primera jugada de la solución
      tiene que seguir siendo la mejor y claramente mejor que la segunda (o el mate más rápido);
   2) equilibra el banco: los de «comerse una pieza colgada» en una jugada no pasan de la proporción indicada;
   3) da a cada problema un identificador estable (huella de la posición).
   SF=ruta/stockfish-19-lite-single.js node tools/depurar_problemas.js [ms por posición] [proporción máxima de fáciles] */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");
const src = ["core.js"].map(f => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");
const { Chess } = new Function(src + ";return { Chess };")();
const FILE = path.join(ROOT, "cursos", "problemas.json");
const ms = +process.argv[2] || 900;
const maxEasy = +process.argv[3] || 0.25;

function engine(bin) {
  const p = spawn(process.execPath, [bin]);
  let buf = "", cb = null;
  p.stdout.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (cb) cb(l); } });
  const send = c => p.stdin.write(c + "\n");
  send("uci"); send("setoption name MultiPV value 2");
  return {
    go(fen) {
      return new Promise(res => {
        const lines = [];
        cb = l => {
          if (l.startsWith("info") && l.includes(" pv ") && l.includes(" score ") && !l.includes("bound")) {
            const t = l.split(" "), k = t.indexOf("score"), mp = +(t[t.indexOf("multipv") + 1] || 1);
            lines[mp - 1] = { mate: t[k + 1] === "mate" ? +t[k + 2] : null, cp: t[k + 1] === "cp" ? +t[k + 2] : null, pv: t.slice(t.indexOf("pv") + 1) };
          } else if (l.startsWith("bestmove")) { cb = null; res(lines.filter(Boolean)); }
        };
        send("position fen " + fen); send(`go movetime ${ms}`);
      });
    },
    quit() { send("quit"); }
  };
}
const win = l => (!l ? 50 : l.mate != null ? (l.mate > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * l.cp)) - 1));
function unique(b1, b2) {
  if (!b2) return true;
  if (b1.mate != null && b1.mate > 0) return !(b2.mate != null && b2.mate > 0) || b2.mate >= b1.mate + 2;
  return win(b1) - win(b2) >= 20;
}

(async () => {
  if (!process.env.SF) { console.error("Indica Stockfish con SF=…"); process.exit(1); }
  const sf = engine(process.env.SF);
  const bank = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const good = [];
  let dropped = 0;
  for (const p of bank) {
    // Legalidad de todas las jugadas
    let s = Chess.parseFen(p.fen), legal = true;
    for (const u of p.moves) { const m = Chess.moveFromUci(s, u); if (!m) { legal = false; break; } s = Chess.apply(s, m); }
    if (!legal) { dropped++; continue; }
    // Cada jugada del que resuelve tiene que ser la mejor y única (o mate)
    let st = Chess.apply(Chess.parseFen(p.fen), Chess.moveFromUci(Chess.parseFen(p.fen), p.moves[0])), ok = true;
    for (let i = 1; i < p.moves.length; i++) {
      const m = Chess.moveFromUci(st, p.moves[i]);
      if (i % 2 === 1) {
        const after = Chess.apply(st, m);
        const mate = !Chess.legal(after).length && Chess.inCheck(after);
        if (!mate) {
          const [b1, b2] = await sf.go(Chess.toFen(st));
          if (!b1 || b1.pv[0] !== p.moves[i] || !unique(b1, b2) || win(b1) < 70) { ok = false; break; }
        }
      }
      st = Chess.apply(st, m);
    }
    if (ok) good.push(p); else dropped++;
  }
  sf.quit();
  // Equilibrio: limita los muy fáciles (pieza colgada en una jugada)
  const easy = good.filter(p => p.themes.includes("hangingPiece") && p.moves.length === 2);
  const rest = good.filter(p => !easy.includes(p));
  const keepEasy = Math.min(easy.length, Math.floor(rest.length * maxEasy / (1 - maxEasy)));
  const final = rest.concat(easy.slice(0, keepEasy)).sort((a, b) => a.rating - b.rating);
  // Identificador estable (huella de la posición y la solución): el progreso de cada usuario se guarda por él
  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  final.forEach(p => { p.id = "p" + fnv(p.fen + " " + p.moves.join(" ")); });
  fs.writeFileSync(FILE, JSON.stringify(final));
  console.log(`cursos/problemas.json: ${final.length} problemas (${dropped} descartados en la revisión, ${easy.length - keepEasy} fáciles de sobra)`);
})();
