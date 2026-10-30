#!/usr/bin/env node
/* Pruebas del núcleo sin navegador: reglas (perft), motor interno, lector/escritor PGN y libro ECO.
   Uso: node tests/test_reglas.js */
"use strict";
const fs = require("fs");
const path = require("path");
const src = ["core.js", "pgn.js", "eco.js"].map(f => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8")).join("\n");
const { Chess, Pgn, ECO_BOOK, CLASSIC_ENDGAMES, SAMPLE_MULTI_PGN } = new Function(src + ";return { Chess, Pgn, ECO_BOOK, CLASSIC_ENDGAMES, SAMPLE_MULTI_PGN };")();

const fallos = [];
function comprobar(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) { fallos.push(msg); if (process.env.GITHUB_ACTIONS) console.log(`::error title=Prueba fallida::${msg}`); }
}
function perft(s, d) {
  if (d === 0) return 1;
  const L = Chess.legal(s);
  if (d === 1) return L.length;
  let n = 0;
  for (const m of L) n += perft(Chess.apply(s, m), d - 1);
  return n;
}

console.log("Reglas (perft contra valores de referencia)");
[
  [Chess.START_FEN, 4, 197281, "posición inicial"],
  ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97862, "«Kiwipete» (enroques, al paso)"],
  ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 5, 674624, "final con clavadas y al paso"],
  ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 4, 422333, "coronaciones y jaques"],
  ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62379, "coronación con captura"],
  ["r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 3, 89890, "medio juego"]
].forEach(([fen, d, exp, name]) => comprobar(perft(Chess.parseFen(fen), d) === exp, `${name}: perft(${d}) = ${exp}`));

console.log("Motor interno");
let s = Chess.parseFen("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1");
comprobar(Chess.san(s, Chess.search(s, { movetime: 800 }).bestMove) === "Rd8#", "encuentra el mate del pasillo (Td8#)");
s = Chess.parseFen("rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3");
comprobar(Chess.san(s, Chess.search(s, { movetime: 800 }).bestMove) === "Nxd5", "captura la dama colgada (Cxd5)");

console.log("Lector y escritor PGN");
const es = "1. e4 e5 2. Cf3 Cc6 3. Ab5 {La española} a6 (3... Cf6 4. O-O Cxe4 {Berlinesa} (4... Ae7?! 5. Te1) 5. d4) 4. Aa4 Cf6 5. O-O Ae7 6. Te1 b5 7. Ab3 d6 8. c3 O-O 9. h3 Rh8!? $14 10. d4 *";
let r = Pgn.parseGame(es);
comprobar(!r.error && r.count === 25, "notación española con variantes anidadas, comentarios y símbolos");
const out = Pgn.exportPgn(r.game);
comprobar(Pgn.exportPgn(Pgn.parseGame(out).game) === out, "exportar → importar → exportar da el mismo PGN");
r = Pgn.parseGame("1. e4 e5 2. Ac4 Ac5 3. Rf1 Cf6");
comprobar(!r.error && Pgn.mainlineFrom(r.game.root)[4].san === "Kf1", "«Rf1» se entiende como rey en una partida en español");
comprobar(Pgn.parseGame("1. e4 e5 2. ♘f3 ♞c6 3. ♗b5").count === 5, "figurines");
comprobar(Pgn.parseGame("e2e4 e7e5 g1f3", { lang: "uci" }).count === 3, "coordenadas UCI");
comprobar(Pgn.parseGame("1. e2-e4 e7-e5 2. Cg1-f3").count === 3, "notación larga");
r = Pgn.parseGame('[FEN "8/P7/8/8/8/8/6k1/4K3 w - - 0 1"]\n\n1. a8=D Rh3 2. Dh1+ *');
comprobar(!r.error && Pgn.mainlineFrom(r.game.root)[0].san === "a8=Q+", "coronación en español (a8=D)");
r = Pgn.parseGame("1. e4 e5 2. Cf3 Cc6 3. Ab6");
comprobar(r.error && r.count === 4 && r.error.token === "Ab6", "informa de la jugada ilegal y conserva lo anterior");
r = Pgn.parseGame("1. e4 { [%csl Gd4][%cal Ge2e4,Rd7d5] buena [%eval 0.3] } e5");
const n1 = r.game.root.children[0];
comprobar(n1.shapes.length === 3 && n1.comment === "buena" && n1.eval.cp === 30, "flechas, círculos y [%eval] de Lichess");

console.log("Estructura y casillas fuertes");
{
  const s1 = Chess.parseFen("4k3/8/8/3P4/8/2P5/2P1P3/4K3 w - - 0 1");
  const ps = Chess.pawnStructure(s1)[1].passed.map(Chess.sqName).sort().join(), iso = Chess.pawnStructure(s1)[1].isolated.map(Chess.sqName).sort().join();
  comprobar(ps === "c3,d5,e2" && Chess.pawnStructure(s1)[1].doubled.join() === "2" && iso === "", "peones pasados y doblados");
  const s2 = Chess.parseFen("4k3/pp4pp/8/4N3/3P4/8/8/4K3 w - - 0 1");
  comprobar(Chess.isOutpost(s2, Chess.sqIdx("e5"), 1), "e5 es casilla fuerte para el caballo");
  const s3 = Chess.parseFen("4k3/pp3ppp/8/4N3/3P4/8/8/4K3 w - - 0 1");
  comprobar(!Chess.isOutpost(s3, Chess.sqIdx("e5"), 1), "no es casilla fuerte si un peón rival puede echar al caballo");
  comprobar(Chess.bishopPair(Chess.parseFen(Chess.START_FEN), 1), "pareja de alfiles en la posición inicial");
}

console.log("Datos incluidos");
let ecoOk = true;
for (const e of ECO_BOOK) if (Pgn.parseGame(e.moves, { lang: "en" }).error) { ecoOk = false; console.log("    ECO con error: " + e.name); }
comprobar(ecoOk && ECO_BOOK.length > 150, `las ${ECO_BOOK.length} líneas del libro ECO son legales`);
comprobar(CLASSIC_ENDGAMES.every(e => { try { Chess.parseFen(e.fen); return true; } catch { return false; } }), "posiciones de los finales clásicos válidas");
const games = Pgn.splitGames(SAMPLE_MULTI_PGN);
comprobar(games.length === 6 && games.every(g => !Pgn.parseGame(g).error), "la antología de clásicos se lee entera");
for (const c of ["aperturas", "tactica", "estrategia", "finales"]) {
  const lecciones = Pgn.splitGames(fs.readFileSync(path.join(__dirname, "..", "cursos", c + ".pgn"), "utf8"));
  const malas = lecciones.filter(g => { const r = Pgn.parseGame(g, { lang: "en" }); return r.error || !r.game.headers.Title || !r.game.root.comment || !r.game.root.children.length; });
  malas.forEach(g => console.log("    Lección con error en " + c + ": " + (Pgn.parseGame(g, { lang: "en" }).game.headers.Title || "?")));
  comprobar(lecciones.length >= 8 && !malas.length, `curso de ${c}: ${lecciones.length} lecciones legales, con título y explicación`);
}

if (fallos.length) { console.log(`\n${fallos.length} prueba(s) fallida(s)`); process.exit(1); }
console.log("\nTodas las pruebas del núcleo superadas.");
