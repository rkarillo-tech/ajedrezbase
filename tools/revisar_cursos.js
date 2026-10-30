#!/usr/bin/env node
/* Revisa los cursos (cursos/*.pgn): que cada lección se lea sin errores, que tenga título y número,
   y, si se indica Stockfish, que las jugadas de la línea principal no pierdan mucho sin estar
   marcadas con ? o ?? (y que las marcadas con ?? o ? sean de verdad malas).

   node tools/revisar_cursos.js                                   sólo lectura y etiquetas
   SF=ruta/a/stockfish-19-lite-single.js node tools/revisar_cursos.js [curso] [ms]
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");
const src = ["core.js", "pgn.js"].map(f => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");
const { Chess, Pgn } = new Function(src + ";return { Chess, Pgn };")();

const only = process.argv[2] || "";
const ms = +process.argv[3] || 400;
const files = fs.readdirSync(path.join(ROOT, "cursos")).filter(f => f.endsWith(".pgn") && (!only || f.startsWith(only)));
let problems = 0;
const report = msg => { problems++; console.log("  ✗ " + msg); };

function engine(bin) {
  const p = spawn(process.execPath, [bin]);
  let buf = "", waiting = null;
  p.stdout.on("data", d => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (waiting) waiting(line);
    }
  });
  const send = c => p.stdin.write(c + "\n");
  send("uci"); send("setoption name Hash value 64");
  return {
    eval(fen) {
      return new Promise(res => {
        let last = null;
        waiting = line => {
          if (line.startsWith("info") && line.includes(" score ") && !line.includes("bound")) {
            const t = line.split(" "), k = t.indexOf("score");
            last = t[k + 1] === "mate" ? { mate: +t[k + 2] } : { cp: +t[k + 2] };
          } else if (line.startsWith("bestmove")) { waiting = null; res({ ev: last, best: line.split(" ")[1] }); }
        };
        send("position fen " + fen); send(`go movetime ${ms}`);
      });
    },
    quit() { send("quit"); }
  };
}
/* Puntuación desde el bando que mueve, en «centipeones» acotados (mate = ±2000) */
const score = ev => (!ev ? 0 : ev.mate != null ? (ev.mate > 0 ? 2000 - ev.mate : -2000 - ev.mate) : Math.max(-1500, Math.min(1500, ev.cp)));
const fmt = v => (Math.abs(v) >= 1900 ? (v > 0 ? "#" : "-#") : (v / 100).toFixed(2));

(async () => {
  const sf = process.env.SF ? engine(process.env.SF) : null;
  let lessons = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, "cursos", f), "utf8");
    const parts = Pgn.splitGames(text);
    console.log(`${f}: ${parts.length} lecciones`);
    for (const part of parts) {
      lessons++;
      const r = Pgn.parseGame(part, { lang: "en" });
      const h = r.game.headers, name = `${f} · ${h.Round || "?"}. ${h.Title || "(sin título)"}`;
      if (r.error) { report(`${name}: ${r.error.label}: ${r.error.message}`); continue; }
      if (!h.Title || !h.Round) report(`${name}: falta [Title] o [Round]`);
      if (!r.game.root.comment) report(`${name}: falta el comentario inicial`);
      if (!sf) continue;
      const line = Pgn.mainlineFrom(r.game.root);
      const checks = [];
      for (const n of line) {
        // ¿Pierde mucho la jugada? Se compara la mejor del motor con la jugada hecha
        const before = n.parent.state;
        if (!Chess.legal(before).length) continue;
        checks.push(n);
        for (const v of n.parent.children.slice(1)) if (v.nag === "?" || v.nag === "??") checks.push(v);
      }
      for (const n of checks) {
        const fenB = Chess.toFen(n.parent.state), fenA = Chess.toFen(n.state);
        const a = await sf.eval(fenB);
        let after;
        if (!Chess.legal(n.state).length) after = Chess.inCheck(n.state) ? 2000 : 0;
        else after = -score((await sf.eval(fenA)).ev);
        const best = score(a.ev), drop = best - after;
        const label = `${name}: ${Chess.toFen(n.parent.state).split(" ")[1] === "w" ? n.parent.state.full + "." : n.parent.state.full + "..."}${n.san}${n.nag || ""}`;
        const bad = n.nag === "?" || n.nag === "??";
        const decided = (best > 900 && after > 600) || (best < -300 && after < -300);   // ya ganada o ya perdida
        if (!bad && drop > 150 && !decided) report(`${label} pierde ${fmt(drop)} (mejor ${a.best}: ${fmt(best)} → ${fmt(after)})`);
        if (n.nag === "??" && drop < 150) report(`${label} marcada ?? pero sólo pierde ${fmt(drop)}`);
        if (n.nag === "?" && drop < 50) report(`${label} marcada ? pero sólo pierde ${fmt(drop)}`);
      }
      const end = line.length ? line[line.length - 1].state : r.game.root.state;
      if (Chess.legal(end).length) {
        const e = await sf.eval(Chess.toFen(end));
        console.log(`    ${name}: final ${fmt(score(e.ev) * end.t)} (blancas)`);
      } else console.log(`    ${name}: final ${Chess.inCheck(end) ? "mate" : "ahogado"}`);
    }
  }
  if (sf) sf.quit();
  console.log(problems ? `\n${problems} problema(s) en ${lessons} lecciones` : `\nCursos correctos: ${lessons} lecciones.`);
  process.exit(problems ? 1 : 0);
})();
