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

r = Pgn.parseGame("1. e4 e5 (1... c5 2. -- d6 3. Nf3) 2. Nf3 (2. Bc4 Nf6) Nc6");
comprobar(!r.error && r.nullSkipped === 1 && Pgn.mainlineFrom(r.game.root).length === 4 && r.game.root.children[0].children.length === 2 && r.game.root.children[0].children[1].children.length === 0,
  "una jugada nula («--», de ChessBase) en una variante deja fuera el resto de esa variante y la partida se lee entera");
comprobar(!!Pgn.parseGame("1. e4 -- 2. d4").error, "en la línea principal, la jugada nula se avisa como error");
comprobar(Pgn.parseGame("1. e4 a6 2. e5 d5 3. exd6 e.p. cxd6").count === 6 && Pgn.parseGame("1. e4 1… e5 2… Nc6").count === 2, "se ignoran «e.p.» y los números con «…»");

console.log("Símbolos PGN (1.59.1)");
{
  const ida = mt => Pgn.exportPgn(Pgn.parseGame(mt, { lang: "en" }).game).trim().split("\n").pop();
  comprobar([36, 37, 40, 41, 132, 142, 146, 22].every(c => ida(`1. e4 $${c} e5 *`) === `1. e4 $${c} e5 *`), "se conservan al exportar los símbolos sin tabla propia ($36 iniciativa, $40 ataque, $132 contrajuego, $142, $146…)");
  const r36 = Pgn.parseGame("1. e4 $36 e5 $37 *", { lang: "en" }).game.root.children[0];
  comprobar(r36.posNag === "→" && r36.children[0].posNag === "→" && ida("1. e4 $36 e5 $37 *") === "1. e4 $36 e5 $37 *", "$36 y $37 se ven igual («→») pero cada uno conserva su bando al exportar");
  comprobar(ida("1. e4 $1 $14 $36 $142 e5 *") === "1. e4! $14 $36 $142 e5 *", "varios símbolos en la misma jugada");
  comprobar(ida("1. e4 $1 $3 e5 *") === "1. e4! $3 e5 *" && ida("1. e4 $14 $16 e5 *") === "1. e4 $14 $16 e5 *", "un segundo símbolo de jugada o de posición no sustituye al primero");
  comprobar(Pgn.nagSymbol(36) === "→" && Pgn.nagSymbol(142) === "⌓" && Pgn.nagSymbol(250) === "$250", "símbolo para enseñar cada código (o el número si no tiene)");
}

console.log("Triple repetición y captura al paso (1.59.1)");
{
  const fin = mt => { const g = Pgn.parseGame(mt, { lang: "en" }).game; const l = Pgn.mainlineFrom(g.root); return l[l.length - 1]; };
  const cuenta = n => { const k = Chess.repKey(n.state); let c = 0; for (let x = n; x; x = x.parent) if (Chess.repKey(x.state) === k) c++; return c; };
  // Tras 2...d5 se puede capturar al paso (exd6): esa posición no es igual a las que vienen después
  const conAlPaso = fin("1. e4 Nf6 2. e5 d5 3. Nf3 Nfd7 4. Ng1 Nf6 5. Nf3 Nfd7 6. Ng1 Nf6 *");
  comprobar(cuenta(conAlPaso) === 2, "la posición en que se podía capturar al paso no cuenta para la triple repetición");
  comprobar(cuenta(fin("1. e4 Nf6 2. e5 d5 3. Nf3 Nfd7 4. Ng1 Nf6 5. Nf3 Nfd7 6. Ng1 Nf6 7. Nf3 Nfd7 8. Ng1 Nf6 *")) === 3, "…y la tercera repetición de verdad sí se cuenta");
  // Casilla al paso sin captura legal (no hay peón blanco al lado): la posición sí es la misma
  const s1 = Chess.parseFen("rnbqkbnr/ppp1pppp/8/3p4/8/5N2/PPPPPPPP/RNBQKB1R w KQkq d6 0 2"), s2 = Chess.parseFen("rnbqkbnr/ppp1pppp/8/3p4/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2");
  comprobar(Chess.repKey(s1) === Chess.repKey(s2), "una casilla al paso sin captura legal no cambia la posición");
  // Captura al paso que dejaría al rey en jaque: no es legal, así que tampoco cuenta
  const s3 = Chess.parseFen("8/8/8/K2Pp2r/8/8/8/6k1 w - e6 0 1"), s4 = Chess.parseFen("8/8/8/K2Pp2r/8/8/8/6k1 w - - 0 1");
  comprobar(Chess.repKey(s3) === Chess.repKey(s4) && Chess.repKey(Chess.parseFen("8/8/8/3Pp3/8/8/8/K5k1 w - e6 0 1")) !== Chess.repKey(Chess.parseFen("8/8/8/3Pp3/8/8/8/K5k1 w - - 0 1")), "sólo cuenta si la captura al paso es legal (no si deja al rey en jaque)");
}

console.log("Notación descriptiva española (1.63)");
{
  const opera = "1.P4R P4R 2.C3AR P3D 3.P4D A5CR 4.PxP AxC 5.DxA PxP 6.A4AD C3AR 7.D3CD D2R 8.C3A P3AD 9.A5CR P4CD 10.CxP PxC 11.AxPC+ CD2D 12.0-0-0 T1D 13.TxC TxT 14.T1D D3R 15.AxT+ CxA 16.D8C+ CxD 17.T8D++ 1-0";
  const r = Pgn.parseGame(opera);
  const sans = Pgn.mainlineFrom(r.game.root).map(n => n.san).join(" ");
  comprobar(r.lang === "desc" && !r.error && sans === "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#",
    "lee la Ópera de Morphy en descriptiva (se detecta sola), con las filas contadas desde cada bando");
  comprobar(Pgn.mainlineFrom(r.game.root).map(n => Pgn.descFor(n.parent.state, n.move)).join(" ") === "P4R P4R C3AR P3D P4D A5C PxP AxC DxA PxP A4AD C3AR D3CD D2R C3A P3A A5CR P4C CxP PxC AxPC+ CD2D 0-0-0 T1D TxC TxT T1D D3R AxT+ CxA D8C+ CxD T8D++",
    "escribe cada jugada en la forma más corta que no es ambigua (A4AD porque A4A también podría ser Af4)");
  // Ida y vuelta: todas las jugadas legales de posiciones difíciles (enroques, al paso, coronaciones, clavadas)
  let total = 0, malas = [];
  for (const fen of [Chess.START_FEN, "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4",
    "4k3/8/8/2pP4/8/8/8/4K3 w - c6 0 1", "1r2k3/2P5/8/8/8/8/8/4K3 w - - 0 1"]) {
    const st = Chess.parseFen(fen), L = Chess.legal(st);
    for (const m of L) { total++; const d = Pgn.descFor(st, m, L), f = Pgn.descMoves(st, d, L); if (f.length !== 1 || !Pgn.sameMove(f[0], m) || (f[0].promotion || "") !== (m.promotion || "")) malas.push(d); }
  }
  comprobar(!malas.length && total > 150, `ida y vuelta: las ${total} jugadas legales de 8 posiciones difíciles se escriben y se vuelven a leer como la misma jugada` + (malas.length ? ": " + malas.join(", ") : ""));
  // Ambigua: se para, dice las opciones y sigue al elegir
  const amb = Pgn.parseGame("1. P4R P4D 2. P4AD PxP 3. C3AD", { lang: "desc" });
  comprobar(amb.count === 3 && JSON.stringify(amb.error.choices) === '["d5c4","d5e4"]' && amb.error.message.includes("admite 2 jugadas"), "«PxP» con dos capturas posibles: se para y dice cuáles encajan");
  const r2 = amb.reparse({ [amb.error.key]: "d5e4" });
  comprobar(!r2.error && Pgn.mainlineFrom(r2.game.root).map(n => n.san).join(" ") === "e4 d5 c4 dxe4 Nc3", "…y al elegir una sigue leyendo el resto de la partida");
  // Formas de los libros: guiones, espacios, paréntesis, «a.p.», orden inverso, origen
  const g = t => { const x = Pgn.parseGame(t, { lang: "auto" }); return x.error ? "ERROR " + x.error.message : Pgn.mainlineFrom(x.game.root).map(n => n.san).join(" "); };
  comprobar(g("1. P-4R P-4R 2. C-3AR C-3AD 3. A-5C P-3TD 4. A x C PD x A 5. 0-0") === "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O", "con guiones y capturas con espacios («A x C», «PD x A»)");
  comprobar(g("1. P4R P4AD 2. P5R P4D 3. PxP a.p.") === "e4 c5 e5 d5 exd6", "captura al paso («a.p.»)");
  comprobar(g("1. R4P? P4R") === "ERROR Jugada descriptiva no reconocida o ilegal: R4P?" && g("1. P4D C3AR 2. P4AD P3R 3. C3AD A5C 4. D2A 0-0 5. P4TD P4D 6. P5TD P4A 7. P6T") === "d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a4 d5 a5 c5 a6", "orden de los números, enroque y P6T sin flanco (sólo un peón puede)");
  const prom = Chess.parseFen("1r2k3/2P5/8/8/8/8/8/4K3 w - - 0 1");
  comprobar(Pgn.descMoves(prom, "P8AD").map(m => m.promotion).join() === "q" && Pgn.descMoves(prom, "P8A(C)").map(m => m.promotion).join() === "n" && Pgn.descMoves(prom, "PxT=T").map(m => Chess.uci(m)).join() === "c7b8r", "coronación: dama si no se dice, «(C)» o «=T» para otra pieza");
  comprobar(Pgn.descMoves(Chess.parseFen("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4"), "CD4T").map(m => Chess.uci(m)).join() === "c6a5", "origen por flanco: CD4T (el caballo de dama, a5 es la cuarta fila de las negras)");
  comprobar(Pgn.detectLang("1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. O-O Cf6") === "es" && Pgn.detectLang("1. P4R P4R 2. C3AR C3AD") === "desc" && Pgn.looksDesc("PxP") && !Pgn.looksDesc("Cxe4") && !Pgn.looksDesc("e4"), "no confunde la algebraica española con la descriptiva");
}

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
for (const c of ["aperturas", "decisiones", "repertorios", "tactica", "estrategia", "finales", "partidas"]) {
  const lecciones = Pgn.splitGames(fs.readFileSync(path.join(__dirname, "..", "cursos", c + ".pgn"), "utf8"));
  const malas = lecciones.filter(g => { const r = Pgn.parseGame(g, { lang: "en" }); return r.error || !r.game.headers.Title || !r.game.root.comment || !r.game.root.children.length; });
  malas.forEach(g => console.log("    Lección con error en " + c + ": " + (Pgn.parseGame(g, { lang: "en" }).game.headers.Title || "?")));
  comprobar(lecciones.length >= 3 && !malas.length, `curso de ${c}: ${lecciones.length} lecciones legales, con título y explicación`);
}

const problemas = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cursos", "problemas.json"), "utf8"));
const malos = problemas.filter(p => {
  try {
    let s = Chess.parseFen(p.fen);
    for (const u of p.moves) { const m = Chess.moveFromUci(s, u); if (!m) return true; s = Chess.apply(s, m); }
    return !(p.moves.length % 2 === 0) || !p.id || !Array.isArray(p.themes) || !(p.rating > 0);
  } catch { return true; }
});
comprobar(problemas.length >= 100 && !malos.length && new Set(problemas.map(p => p.id)).size === problemas.length, `los ${problemas.length} problemas de táctica son legales, con tema, dificultad e identificador único`);

// Paquetes descargables (problemas/*.json): mismos requisitos, y sin repetir identificadores entre paquetes ni con el banco
const dirPaquetes = path.join(__dirname, "..", "problemas");
const indice = JSON.parse(fs.readFileSync(path.join(dirPaquetes, "indice.json"), "utf8"));
const idsVistos = new Set(problemas.map(p => p.id));
let totalPaquetes = 0, malosPaquetes = 0, repetidos = 0, indiceMal = 0;
for (const k of indice) {
  const pk = JSON.parse(fs.readFileSync(path.join(dirPaquetes, k.id + ".json"), "utf8"));
  if (pk.id !== k.id || pk.puzzles.length !== k.count) indiceMal++;
  for (const p of pk.puzzles) {
    totalPaquetes++;
    if (idsVistos.has(p.id)) repetidos++;
    idsVistos.add(p.id);
    try {
      let s = Chess.parseFen(p.fen), ok = p.moves.length >= 2 && p.moves.length % 2 === 0 && Array.isArray(p.themes) && p.themes.length && p.rating >= k.min && p.rating < k.max;
      for (const u of p.moves) { const m = Chess.moveFromUci(s, u); if (!m) { ok = false; break; } s = Chess.apply(s, m); }
      if (!ok) malosPaquetes++;
    } catch { malosPaquetes++; }
  }
}
comprobar(indice.length >= 3 && totalPaquetes >= 3000 && !malosPaquetes && !repetidos && !indiceMal, `los ${totalPaquetes} problemas de los ${indice.length} paquetes descargables son legales, de su nivel y sin repetir`);

if (fallos.length) { console.log(`\n${fallos.length} prueba(s) fallida(s)`); process.exit(1); }
console.log("\nTodas las pruebas del núcleo superadas.");
