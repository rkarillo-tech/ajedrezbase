#!/usr/bin/env node
/* Pruebas de la lógica de la aplicación sin navegador: repetición espaciada, nivel de problemas, temas flojos,
   actividad y racha, «Tu semana», filtros avanzados, estadísticas, informe de la partida y sincronización.
   Carga el código real de src/app/ con un DOM simulado (tests/entorno_app.js), así que tarda unos segundos
   en lugar de los minutos de tests/test_app.py. Uso: node tests/test_logica.js */
"use strict";
const { crearEntorno } = require("./entorno_app.js");

const fallos = [];
function comprobar(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) { fallos.push(msg); if (process.env.GITHUB_ACTIONS) console.log(`::error title=Prueba fallida::${msg}`); }
}
/* Los objetos de la aplicación viven en otro «realm»: se comparan por su JSON */
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function seccion(nombre, fn) {
  console.log(nombre);
  try { fn(); } catch (e) { comprobar(false, `${nombre}: error inesperado: ${e && e.stack || e}`); }
}

const t0 = Date.now();
const E = crearEntorno();
const A = new Proxy({}, { get: (_, k) => E.ev(k) });   // A.srsStep, A.PUZZLES… (funciones y constantes de la aplicación)
const DIA = 864e5;
const HOY = new Date(2026, 10, 11, 12, 0, 0).getTime();   // 11 de noviembre de 2026 a mediodía, hora local
const diaAntes = n => { const d = new Date(HOY); d.setDate(d.getDate() - n); return A.dayKey(d); };
const ponerLS = (k, v) => E.localStorage.setItem(k, JSON.stringify(v));
const leerLS = k => JSON.parse(E.localStorage.getItem(k));
E.reloj.fijar(HOY);

seccion("Repetición espaciada", () => {
  const s = A.srsStep({}, true, HOY);
  comprobar(s.box === 1 && s.reps === 1 && s.due === HOY + DIA, "una tarjeta nueva acertada pasa a la caja 1 y vuelve mañana");
  const cajas = [];
  for (let i = 0; i < 8; i++) { A.srsStep(s, true, HOY); cajas.push(s.box); }
  comprobar(igual(cajas, [2, 3, 4, 5, 6, 6, 6, 6]) && s.due === HOY + 75 * DIA && s.reps === 9, "cada acierto sube de caja (3, 7, 16, 35 y 75 días) hasta la última");
  A.srsStep(s, false, HOY);
  comprobar(s.box === 1 && s.due === HOY + DIA && s.reps === 10, "un fallo la devuelve a la caja 1 (mañana) sin perder la cuenta de repasos");
  const viejo = A.srsStep({ box: 2, due: 0, reps: 4, ok: true, tries: 7 }, true, HOY);
  comprobar(viejo.box === 3 && viejo.due === HOY + 7 * DIA && viejo.ok === true && viejo.tries === 7, "conserva los demás datos guardados");
  comprobar(A.srsText(null) === "nueva" && A.srsText({ due: HOY - 1 }) === "pendiente hoy" && A.srsText({ due: HOY + DIA }) === "mañana" && A.srsText({ due: HOY + 5 * DIA }) === "en 5 días",
    "el texto del próximo repaso: nueva, pendiente hoy, mañana, en N días");
});

seccion("Nivel de problemas (al estilo Elo)", () => {
  let R = { r: 1200, n: 0 };
  comprobar(A.puzzleRatingStep(R, 1200, true) === 24 && R.r === 1224 && R.n === 1, "acertar uno de tu nivel suma la mitad de K (48 en los 20 primeros)");
  R = { r: 1200, n: 0 };
  comprobar(A.puzzleRatingStep(R, 1200, false) === -24 && R.r === 1176, "fallarlo resta lo mismo");
  R = { r: 1500, n: 20 };
  comprobar(A.puzzleRatingStep(R, 1500, true) === 12, "a partir del problema 20 los cambios son la mitad (K = 24)");
  const dificil = A.puzzleRatingStep({ r: 1200, n: 5 }, 1600, true), facil = A.puzzleRatingStep({ r: 1200, n: 5 }, 800, true);
  comprobar(dificil > 40 && facil < 5 && facil >= 0, "un problema difícil acertado da más puntos que uno fácil");
  R = { r: 400, n: 50 };
  A.puzzleRatingStep(R, 400, false);
  comprobar(R.r === 400, "el nivel no baja de 400");
});

seccion("Problemas: dificultad, temas y filtros", () => {
  comprobar(A.puzzleLevelOf(800) === 0 && A.puzzleLevelOf(1100) === 1 && A.puzzleLevelOf(1899) === 2 && A.puzzleLevelOf(2400) === 3, "los cuatro niveles de dificultad");
  comprobar(igual(A.puzzleThemeKeys({ themes: ["mateIn2", "short", "fork", "mateIn3"] }), ["mate", "fork"]) && igual(A.puzzleThemeKeys({ themes: ["short"] }), ["other"]),
    "los mates cuentan como un tema y «una sola jugada» no es tema");
  const P = A.PUZZLES, tema = $ => (E.ev("$")("puzzleTheme").value = $), nivel = $ => (E.ev("$")("puzzleLevel").value = $);
  tema(""); nivel("");
  comprobar(A.puzzlePool().length === P.length, "sin filtros salen todos los problemas");
  tema("fork");
  const fork = A.puzzlePool();
  comprobar(fork.length > 0 && fork.length === P.filter(p => p.themes.includes("fork")).length && fork.every(p => p.themes.includes("fork")), `filtro por tema: ${fork.length} horquillas`);
  tema("mate"); nivel("1");
  const mates = A.puzzlePool();
  comprobar(mates.length > 0 && mates.every(p => p.themes.some(x => x.startsWith("mateIn")) && p.rating >= 1100 && p.rating < 1500), "«todos los mates» de dificultad media");
  // Temas flojos: un problema fallado 3 de 4 veces y otro (formato antiguo, sin «tries») fallado una vez de dos
  const a = P.find(p => p.themes.includes("fork") && !p.themes.some(x => x.startsWith("mateIn"))), b = P.find(p => p.themes.some(x => x.startsWith("mateIn")) && !p.themes.includes("fork"));
  ponerLS("ajedrezProblemas", { [a.id]: { tries: 4, fails: 3, box: 1, reps: 4, due: HOY }, [b.id]: { reps: 2, ok: false, box: 1, due: HOY } });
  const st = A.themeStats(), fk = st.find(x => x.k === "fork"), mt = st.find(x => x.k === "mate");
  comprobar(fk && fk.tries === 4 && fk.fails === 3 && fk.pct === 25 && fk.name === "Horquilla", "aciertos por tema a partir de los intentos guardados");
  comprobar(mt && mt.tries === 2 && mt.fails === 1 && mt.pct === 50, "también con el formato antiguo (sin contar intentos y fallos)");
  const weak = A.weakThemes();
  comprobar(weak.length >= 1 && weak.length <= 3 && weak[0].pct === 25 && weak.some(x => x.k === "fork") && weak.every(x => x.tries >= 3 && x.pct < 80), "los temas flojos: al menos 3 intentos y menos del 80 %, del peor al mejor");
  tema("weak"); nivel("");
  const flojos = A.puzzlePool(), claves = weak.map(x => x.k);
  comprobar(flojos.length > 0 && flojos.every(p => A.puzzleThemeKeys(p).some(k => claves.includes(k))), "«Mis temas flojos» sólo propone problemas de esos temas");
  tema(""); E.localStorage.removeItem("ajedrezProblemas");
});

seccion("Actividad, racha y «Tu semana»", () => {
  E.localStorage.removeItem("ajedrezActividad");
  A.logActivity("puzzle", 3); A.logActivity("lesson");
  comprobar(igual(A.actDays()[diaAntes(0)], { puzzle: 3, lesson: 1 }), "se anota lo hecho cada día");
  comprobar(A.dayTotal({ puzzle: 2, card: 1, pzOk: 5, pzTh: {}, nivel: 1300 }) === 3, "sólo cuenta como actividad lo que lo es (no el acierto ni el nivel)");
  const act = {};
  [1, 2, 3].forEach(n => { act[diaAntes(n)] = { puzzle: 1 }; });
  [10, 11, 12, 13, 14].forEach(n => { act[diaAntes(n)] = { card: 2 }; });
  act[diaAntes(5)] = { nivel: 1200 };   // un día sin actividad (sólo el nivel anotado)
  ponerLS("ajedrezActividad", act);
  comprobar(igual(A.streakInfo(), { cur: 3, best: 5, days: 8 }), "racha: si hoy aún no has entrenado sigue viva desde ayer; la mejor y los días totales");
  A.logActivity("puzzle");
  comprobar(A.streakInfo().cur === 4, "al entrenar hoy la racha suma un día");
  delete act[diaAntes(1)]; ponerLS("ajedrezActividad", act);
  comprobar(A.streakInfo().cur === 0, "si ayer no entrenaste la racha se corta");
  // La misma semana que simula tests/test_app.py, ahora sin navegador
  const w = {};
  w[diaAntes(1)] = { puzzle: 6, lesson: 1, pzOk: 3, pzFail: 3, pzTh: { fork: [4, 3], mate: [2, 0] }, nivel: 1260 };
  w[diaAntes(2)] = { puzzle: 4, pzOk: 4, pzFail: 0, pzTh: { pin: [4, 0] }, nivel: 1290 };
  w[diaAntes(8)] = { puzzle: 2, nivel: 1210 };
  w[diaAntes(9)] = { puzzle: 1, nivel: 1200 };
  ponerLS("ajedrezActividad", w);
  const W = A.weekStats(0), P = A.weekStats(1);
  comprobar(W.days === 2 && W.total === 11 && igual(W.kinds, { puzzle: 10, lesson: 1 }) && W.ok === 7 && W.fail === 3, "los últimos 7 días: días entrenados, actividades y aciertos");
  comprobar(W.th.fork.tries === 4 && W.th.fork.fails === 3 && W.th.pin.tries === 4 && P.days === 2 && P.total === 3, "acierto por tema en la semana y la semana anterior");
  const peor = A.weakestTheme(W);
  comprobar(peor && peor.k === "fork", "el tema que más se ha resistido: la horquilla (1 de 4)");
  comprobar(A.weakestTheme({ th: { pin: { k: "pin", tries: 5, fails: 0 }, fork: { k: "fork", tries: 2, fails: 2 } } }) === null, "sin un tema con al menos 3 intentos y menos del 80 %, no hay tema flojo");
  comprobar(A.levelBeforeWeek() === 1210, "el nivel con el que se llegó a la semana");
  // El detalle por temas de hace más de 60 días se borra al anotar un problema
  const viejo = {}; viejo[diaAntes(70)] = { puzzle: 1, pzTh: { fork: [1, 0] } }; viejo[diaAntes(30)] = { puzzle: 1, pzTh: { pin: [1, 1] } };
  ponerLS("ajedrezActividad", viejo);
  ponerLS("ajedrezNivelProblemas", { r: 1333, n: 9 });
  const fork = A.PUZZLES.find(p => p.themes.includes("fork"));
  A.logPuzzleResult(fork, false);
  const ahora = leerLS("ajedrezActividad");
  comprobar(!ahora[diaAntes(70)].pzTh && ahora[diaAntes(70)].puzzle === 1 && ahora[diaAntes(30)].pzTh.pin, "el detalle por temas sólo se guarda 60 días (la actividad, siempre)");
  comprobar(ahora[diaAntes(0)].pzFail === 1 && ahora[diaAntes(0)].pzTh.fork[1] === 1 && ahora[diaAntes(0)].nivel === 1333, "cada problema anota acierto, temas y nivel del día");
  E.localStorage.removeItem("ajedrezActividad"); E.localStorage.removeItem("ajedrezNivelProblemas");
});

seccion("Filtros avanzados de partidas", () => {
  comprobar(A.speedOf("60") === "bullet" && A.speedOf("180+2") === "blitz" && A.speedOf("600") === "rapid" && A.speedOf("5400+30") === "classical", "el ritmo sale del control de tiempo (base + 40 × incremento)");
  comprobar(A.speedOf("-", "Correspondence game") === "corr" && A.speedOf("", "Rated Blitz game") === "blitz" && A.speedOf("", "Torneo") === "", "o del nombre del evento");
  const meta = A.advMeta({ headers: { White: "Rafa", Black: "Otro", WhiteElo: "1900", BlackElo: "2100", Date: "2024.05.01", Result: "0-1", ECO: "C65", TimeControl: "300+0", Event: "Rated Blitz game", Opening: "Ruy Lopez: Berlin Defense" } });
  comprobar(meta.we === 1900 && meta.year === 2024 && meta.eco === "C65" && meta.opening.startsWith("Ruy"), "datos de una partida desde las cabeceras del PGN");
  const desdeRegistro = A.advMeta({ white: "Rafa", black: "Otro", whiteElo: "1900", date: "2024.05.01", result: "0-1", eco: "c65", title: "Mi española" });
  comprobar(desdeRegistro.we === 1900 && desdeRegistro.eco === "C65" && desdeRegistro.opening === "Mi española", "y desde un registro de la biblioteca");
  const F = o => Object.assign({ eloMin: 0, eloMax: 0, yearMin: 0, yearMax: 0, speed: "", result: "", color: "", eco: "" }, o);
  const ok = (o, names = []) => A.advMatch(meta, F(o), names);
  comprobar(ok({ eloMin: 2000 }) && !ok({ eloMin: 2050 }) && ok({ eloMax: 2000 }) && !ok({ eloMax: 1950 }), "Elo medio mínimo y máximo");
  comprobar(ok({ yearMin: 2024, yearMax: 2024 }) && !ok({ yearMin: 2025 }) && !ok({ yearMax: 2023 }), "año desde y hasta");
  comprobar(ok({ speed: "blitz" }) && !ok({ speed: "rapid" }), "ritmo");
  comprobar(ok({ result: "0-1" }) && !ok({ result: "1-0" }), "resultado");
  comprobar(ok({ color: "1", result: "loss" }, ["rafa"]) && !ok({ color: "-1" }, ["rafa"]) && !ok({ result: "win" }, ["rafa"]) && !ok({ result: "loss" }), "con qué color juego yo y si gano o pierdo (hace falta mi nombre)");
  comprobar(ok({ eco: "c60-c99" }) && !ok({ eco: "b20-b99" }) && ok({ eco: "c6" }) && !ok({ eco: "c5" }) && ok({ eco: "berlin" }) && !ok({ eco: "siciliana" }), "apertura por intervalo ECO, por prefijo o por nombre");
  comprobar(ok({}), "sin filtros pasa todo");
  const $ = E.ev("$");
  $("libEloMin").value = "2000"; $("libEco").value = " Berlín ";
  const st = A.advState("lib");
  comprobar(st.count === 2 && st.eloMin === 2000 && st.eco === "berlin", "lee los filtros de la pantalla y cuenta los activos");
  $("libEloMin").value = ""; $("libEco").value = "";
  const html = A.advStatsHtml([meta, A.advMeta({ headers: { White: "X", Black: "Rafa", Result: "0-1", WhiteElo: "2000" } })], ["rafa"]);
  comprobar(html.startsWith("2 partidas") && html.includes("negras 100 %") && html.includes("Elo medio 2000") && html.includes("tu puntuación: <b>50 %</b>"), "resumen del conjunto filtrado");
});

seccion("Biblioteca: etiquetas, títulos y partidas repetidas", () => {
  comprobar(igual(A.parseTags(" Táctica, táctica ,final,, "), ["táctica", "final"]) && A.parseTags(Array.from({ length: 20 }, (_, i) => "t" + i).join(",")).length === 12, "etiquetas sin repetir, en minúsculas y como mucho 12");
  comprobar(A.norm("Ñandú ÁLVAREZ") === "nandu alvarez", "las búsquedas no distinguen mayúsculas ni acentos");
  comprobar(A.defaultTitle({ White: "Carlsen", Black: "Caruana", Event: "Norway Chess" }) === "Carlsen – Caruana (Norway Chess)" && A.defaultTitle({ White: "?", Event: "Clase 3" }) === "Clase 3", "título por defecto");
  const g = pgn => A.Pgn.parseGame(pgn, { lang: "en" }).game;
  const s1 = A.gameSig(g('[White "Ana"]\n[Black "Beto"]\n\n1. e4 {buena} e5 2. Nf3 *')), s2 = A.gameSig(g('[White "ANA"]\n[Black "Beto"]\n\n1. e4 e5 2. Nf3 (2. f4) *')), s3 = A.gameSig(g('[White "Ana"]\n[Black "Beto"]\n\n1. e4 e5 2. Nc3 *'));
  comprobar(s1 === s2 && s1 !== s3, "la firma de una partida (para no duplicarla) ignora comentarios y variantes, pero no las jugadas");
  const rec = A.recordFromGame(g('[White "Ana"]\n[Black "Beto"]\n[Result "1-0"]\n[ECO "C20"]\n[TimeControl "600+5"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'), { tags: ["mate"] });
  comprobar(rec.title === "Ana – Beto" && rec.result === "1-0" && rec.plies === 7 && rec.eco === "C20" && rec.timeControl === "600+5" && igual(rec.tags, ["mate"]) && rec.srs === null && rec.created === HOY,
    "registro de la biblioteca a partir de una partida");
});

seccion("Estadísticas personales", () => {
  comprobar(A.scoreOf("1-0", 1) === 1 && A.scoreOf("1-0", -1) === 0 && A.scoreOf("1/2-1/2", -1) === 0.5 && A.scoreOf("*", 1) === null, "puntos de una partida según mi color");
  comprobar(A.colorOfMe({ white: "Rafa", black: "x" }, ["rafa"]) === 1 && A.colorOfMe({ white: "x", black: "Rafá" }, ["rafa"]) === -1 && A.colorOfMe({ white: "x", black: "y" }, ["rafa"]) === 0, "con qué color jugué");
  comprobar(A.timeCat({ timeControl: "180+2" }) === "blitz" && A.timeCat({ timeControl: "900+10" }) === "rapid" && A.timeCat({ pgn: '[TimeControl "-"]' }) === "corr" && A.timeCat({ event: "Partida clásica" }) === "classical", "categoría de ritmo para las estadísticas");
  comprobar(A.gameTime({ date: "2024.03.??" }) === new Date(2024, 2, 1).getTime() && A.gameTime({ date: "????.??.??", created: 5 }) === 5, "fecha de la partida (o de cuando se guardó)");
  const settings = A.settings;
  settings.myNames = "Rafa; Rafael Pérez";
  comprobar(igual(A.myNameList(), ["rafa", "rafael perez"]), "mis nombres, separados por «;»");
  const an = (acc, extra = {}) => ({ p: { 1: Object.assign({ acc, ph: { apertura: acc, medio: acc, final: null }, c: { "?!": 1, "?": 0, "??": 0 }, th: {} }, extra), "-1": Object.assign({ acc, ph: { apertura: acc, medio: acc, final: null }, c: { "?!": 0, "?": 1, "??": 1 }, th: { material: 1 } }, extra) } });
  const recs = [
    { id: 1, white: "Rafa", black: "A", result: "1-0", eco: "C65", date: "2026.10.01", timeControl: "180+2", analysis: an(90) },
    { id: 2, white: "Rafa", black: "B", result: "1/2-1/2", eco: "C65", date: "2026.10.15", timeControl: "180+2", analysis: an(80) },
    { id: 3, white: "C", black: "Rafael Pérez", result: "1-0", eco: "B90", date: "2026.11.01", timeControl: "600" },
    { id: 4, white: "D", black: "Rafa", result: "0-1", eco: "B90", date: "2026.11.05", timeControl: "600", analysis: an(70) },
    { id: 5, white: "E", black: "F", result: "1-0", eco: "A00", date: "2026.11.06" }
  ];
  const Lib = A.Lib;
  Lib.games.clear(); recs.forEach(r => Lib.games.set(r.id, r));
  const S = A.computeStats({});
  comprobar(S.games === 4 && S.w === 2 && S.d === 1 && S.l === 1 && S.pts === 2.5, "suma sólo mis partidas: 4, con +2 =1 −1");
  comprobar(S.byColor[1].games === 2 && S.byColor[1].pts === 1.5 && S.byColor[-1].games === 2 && S.byColor[-1].pts === 1, "por color");
  comprobar(S.analysed === 3 && S.pending.length === 1 && S.pending[0].id === 3 && igual(S.accs, [90, 80, 70]), "precisión de las analizadas y cuáles faltan por analizar");
  comprobar(S.counts["?!"] === 2 && S.counts["?"] === 1 && S.counts["??"] === 1 && S.th.material === 1 && S.thGames.material === 1, "errores e imprecisiones por tipo y tema");
  comprobar(S.openings.get("C65|1").pts === 1.5 && S.openings.get("B90|-1").games === 2 && S.months.size === 2, "por apertura y color, y por meses");
  const blitz = A.computeStats({ tc: "blitz" }), negras = A.computeStats({ color: -1 }), ultimos = A.computeStats({ period: 14 });
  comprobar(blitz.games === 2 && negras.games === 2 && ultimos.games === 2, "filtros por ritmo, color y periodo");
  const conc = A.statsConclusions(S);
  comprobar(Array.isArray(conc) && conc.some(c => c.includes("material")), "conclusiones: el error más habitual");
  // Una clara diferencia entre colores sale en las conclusiones
  const muchas = [];
  for (let i = 0; i < 4; i++) muchas.push({ id: 100 + i, white: "Rafa", black: "x", result: "1-0", date: "2026.09.0" + (i + 1) }, { id: 200 + i, white: "x", black: "Rafa", result: "1-0", date: "2026.09.1" + i });
  Lib.games.clear(); muchas.forEach(r => Lib.games.set(r.id, r));
  comprobar(A.statsConclusions(A.computeStats({})).some(c => c.includes("Con negras puntúas bastante menos")), "conclusiones: puntúas mucho menos con un color");
  Lib.games.clear(); settings.myNames = "";
});

seccion("Informe de la partida (a partir de las evaluaciones del PGN)", () => {
  const informe = pgn => E.ev(`(pgn => { const r = Pgn.parseGame(pgn, { lang: "en" }); const nodes = [r.game.root, ...Pgn.mainlineFrom(r.game.root)];
    for (const n of nodes) if (!n.eval) { const t = terminalEval(n); if (t) n.eval = t; } nodes[0].eval = nodes[0].eval || { cp: 20 }; return buildGameReport(nodes, r.game.headers); })`)(pgn);
  const pastor = '[White "Ana"]\n[Black "Beto"]\n[Result "1-0"]\n\n1. e4 { [%eval 0.2] } e5 { [%eval 0.3] } 2. Bc4 { [%eval 0.2] } Nc6 { [%eval 0.3] } 3. Qh5 { [%eval 0.0] } Nf6 { [%eval #1] } 4. Qxf7# 1-0';
  const R = informe(pastor);
  comprobar(R.key.length === 1 && R.key[0].ply === 6 && R.key[0].info.cls === "??" && R.key[0].theme.key === "mateAllowed", "momento clave: 3...Cf6?? permite el mate");
  comprobar(R.summary.includes("Apertura: C23") && R.summary.includes("Tras 3...Cf6 pasó a estar ganada para las blancas") && R.summary.includes("jaque mate"), "el resumen cuenta la partida");
  const [w, b] = R.players;
  comprobar(w.counts["??"] === 0 && w.acc >= 90 && b.counts["??"] === 1 && b.acc < 60, "precisión y errores de cada jugador");
  comprobar(b.practice.some(p => p.includes("patrones de mate")) && b.practice.some(p => p.includes("La apertura")) && !w.practice.length, "qué practicar, según los errores");
  const sinMate = '[White "Ana"]\n[Black "Beto"]\n[Result "*"]\n\n1. e4 { [%eval 0.2] } e5 { [%eval 0.3] } 2. Bc4 { [%eval 0.2] } Nc6 { [%eval 0.3] } 3. Qh5 { [%eval 0.0] } Nf6 { [%eval #1] } 4. d3 { [%eval 0.5] } Be7 { [%eval 0.4] } *';
  const R2 = informe(sinMate);
  comprobar(R2.key.some(k => k.ply === 7 && k.theme.key === "mateMissed") && R2.players[0].practice.some(p => p.includes("mate en 2 y 3")), "dejar escapar un mate se señala y se propone practicarlo");
  const S = A.summaryFromPgn({ pgn: pastor });
  comprobar(S && S.src === "pgn" && S.eco === "C23" && S.plies === 7 && S.p[-1].c["??"] === 1 && S.p[-1].th.mateAllowed === 1 && S.err.length === 1 && S.err[0].uci === "g8f6" && S.err[0].ph === "apertura",
    "el resumen que se guarda con la partida (para estadísticas y ejercicios)");
  comprobar(A.summaryFromPgn({ pgn: "1. e4 e5 2. Nf3 Nc6 *" }) === null, "sin evaluaciones no hay resumen");
  const g = pgn => A.Pgn.parseGame(pgn, { lang: "en" }).game.root;
  comprobar(A.lineHash(g("1. e4 e5 {x} 2. Nf3 (2. f4) *")) === A.lineHash(g("1. e4 e5 2. Nf3 *")) && A.lineHash(g("1. e4 e5 2. Nf3 *")) !== A.lineHash(g("1. e4 e5 2. Nc3 *")),
    "el análisis guardado se reconoce por la línea principal");
});

seccion("Sincronización entre dispositivos", () => {
  const base = (games = [], marks = [], ls = {}, tomb = {}) => ({ games, marks, ls, tomb });
  const gm = (uid, sig, _m, extra = {}) => Object.assign({ uid, sig, _m, pgn: "1. e4 *", title: uid }, extra);
  let r = A.syncMerge(base([gm("a", "s1", 1)]), base([gm("b", "s2", 1)]));
  comprobar(r.games.put.length === 1 && r.games.put[0].rec.uid === "b" && !r.games.del.length && r.write, "lo que sólo está en el otro lado llega, y lo de aquí hay que escribirlo en el archivo");
  r = A.syncMerge(base([gm("a", "s1", 1)]), base([gm("a", "s1", 1)]));
  comprobar(!r.games.put.length && !r.games.del.length && !r.write, "si los dos tienen lo mismo, no hay nada que hacer ni que escribir");
  r = A.syncMerge(base([gm("a", "s1", 1, { fav: false })]), base([gm("a", "s1", 5, { fav: true })]));
  comprobar(r.games.put.length === 1 && r.games.put[0].rec.fav === true && !r.write, "gana el cambio más reciente");
  r = A.syncMerge(base([gm("a", "s1", 9)]), base([gm("a", "s1", 5)]));
  comprobar(!r.games.put.length && r.write, "si el más reciente es el de aquí, se escribe en el archivo");
  r = A.syncMerge(base([gm("a", "igual", 1)]), base([gm("b", "igual", 2)]));
  comprobar(r.games.put.length === 1 && r.games.put[0].same && r.games.put[0].from === "a" && r.games.alias.get("a") === "b", "la misma partida guardada por separado en los dos queda una sola vez");
  r = A.syncMerge(base([gm("a", "s1", 1)]), base([], [], {}, { a: 10 }));
  comprobar(igual(r.games.del, ["a"]) && r.tombChanged, "lo que se borró en el otro dispositivo se borra aquí");
  r = A.syncMerge(base([], [], {}, { x: 10 }), base([gm("x", "s1", 5)]));
  comprobar(!r.games.put.length && r.write, "lo que se borró aquí no vuelve…");
  r = A.syncMerge(base([], [], {}, { x: 10 }), base([gm("x", "s1", 20)]));
  comprobar(r.games.put.length === 1, "…salvo que se cambiara en el otro después de borrarlo");
  r = A.syncMerge(base([], [], {}, { x: 10 }), base([gm("x", "s1", 5)]), { restore: true });
  comprobar(r.games.put.length === 1 && r.games.put[0].rec._m === HOY && !r.tomb.x, "restaurar una copia recupera también lo borrado");
  const mk = (uid, g, _m = 1) => ({ uid, g, _m, path: ["e2e4"], cat: "fav" });
  r = A.syncMerge(base([gm("a", "s1", 1)], [mk("m1", "a")]), base([], [], {}, { a: 10 }));
  comprobar(igual(r.marks.del, ["m1"]), "los marcadores se van con su partida");
  // Progreso y ajustes (los mismos casos que tests/test_app.py, sin navegador)
  r = A.syncMerge(
    base([], [], { ajedrezProblemas: { p1: { reps: 1, due: 5, box: 1 } }, ajedrezActividad: { "2026-11-01": { puzzle: 2, card: 1 } }, ajedrezCursos: { tactica: [3, 1] }, ajedrezNivelProblemas: { r: 1300, n: 4 }, ajedrezSettings: { theme: "wood", _m: 5 } }),
    base([], [], { ajedrezProblemas: { p1: { reps: 3, due: 9, box: 2 }, p2: { reps: 1, due: 4, box: 1 } }, ajedrezActividad: { "2026-11-01": { puzzle: 4 } }, ajedrezCursos: { tactica: [2, 3], finales: [1] }, ajedrezNivelProblemas: { r: 1250, n: 9 }, ajedrezSettings: { theme: "coral", _m: 9 } }));
  comprobar(igual(r.ls.ajedrezProblemas, { p1: { reps: 3, due: 9, box: 2 }, p2: { reps: 1, due: 4, box: 1 } }), "problemas: de cada uno, el que lleva más repasos");
  comprobar(igual(r.ls.ajedrezActividad, { "2026-11-01": { puzzle: 4, card: 1 } }), "actividad: el máximo de cada día y tipo, sin perder nada");
  comprobar(igual(r.ls.ajedrezCursos, { tactica: [1, 2, 3], finales: [1] }) && igual(r.ls.ajedrezNivelProblemas, { r: 1250, n: 9 }) && r.ls.ajedrezSettings.theme === "coral", "lecciones hechas, nivel y ajustes");
  const ex = Array.from({ length: 25 }, (_, i) => ({ t: i * 2 })), ex2 = Array.from({ length: 25 }, (_, i) => ({ t: i * 2 + 1 }));
  r = A.syncMerge(base([], [], { ajedrezExamenes: ex }), base([], [], { ajedrezExamenes: ex2.concat([{ t: 0 }]) }));
  comprobar(r.ls.ajedrezExamenes.length === 30 && r.ls.ajedrezExamenes[29].t === 49 && r.ls.ajedrezExamenes.every((x, i, a) => !i || a[i - 1].t < x.t), "exámenes: sin repetir, en orden y sólo los 30 últimos");
  r = A.syncMerge(base([], [], { ajedrezProblemas: { p: { reps: 1 } } }), base([], [], { ajedrezProblemas: "estropeado" }));
  comprobar(!r.ls.ajedrezProblemas && r.write, "un dato estropeado en el archivo no borra el de aquí");
  const s = A.sharedSettings({ theme: "coral", token: "lip_x", engine: "sf", boardSize: 90, welcomed: true, lang: "es" });
  comprobar(igual(s, { theme: "coral", lang: "es" }), "el token y los ajustes propios del dispositivo no viajan");
  comprobar(A.canon({ b: 1, a: [1, { d: 2, c: 3 }] }) === A.canon({ a: [1, { c: 3, d: 2 }], b: 1 }) && A.strHash("abc") === A.strHash("abc") && A.strHash("abc") !== A.strHash("abd"), "comparación sin importar el orden de las claves y huella de texto");
});

seccion("Notación, valoraciones y material", () => {
  comprobar(A.formatSan("Nf3", "es") === "Cf3" && A.formatSan("exd8=Q+", "es") === "exd8=D+" && A.formatSan("O-O", "es") === "O-O" && A.formatSan("Kxe2", "en") === "Kxe2", "notación española");
  comprobar(A.formatSan("Qh5", "fig", 1) === "♕h5" && A.formatSan("Bb4", "fig", -1) === "♝b4", "figurines de cada color");
  comprobar(A.fmtEval({ cp: 35 }) === "+0.35" && A.fmtEval({ cp: -120 }) === "−1.20" && A.fmtEval({ mate: 3 }) === "#3" && A.fmtEval({ mate: -2 }) === "−#2" && A.fmtEval({ mate: 0, winner: -1 }) === "0-1" && A.fmtEval(null) === "–", "valoraciones");
  comprobar(A.winPct({ cp: 0 }) === 50 && Math.abs(A.winPct({ cp: 300 }) + A.winPct({ cp: -300 }) - 100) < 1e-9 && A.winPct({ cp: 300 }) > 75 && A.winPct({ mate: 2 }) === 100 && A.winPct({ mate: -1 }) === 0, "probabilidad de ganar a partir de la valoración");
  const ini = A.Chess.parseFen(A.Chess.START_FEN);
  A.settings.lang = "es";
  comprobar(A.lineText(ini, ["e2e4", "e7e5", "g1f3", "b8c6"]) === "1.e4 e5 2.Cf3 Cc6" && A.lineText(ini, ["e2e4", "e7e5", "g1f3"], 2) === "1.e4 e5", "una línea del motor en texto, con números");
  comprobar(A.materialKey(ini) === "Q1R2B2N2P8q1r2b2n2p8" && A.materialText(A.Chess.parseFen("4k3/8/8/8/8/8/4P3/3QK3 w - - 0 1")) === "♔♕♙ contra ♔", "material de la posición (con los mismos símbolos para los dos bandos)");
  comprobar(A.pawnKey(A.Chess.parseFen("4k3/pp6/8/8/8/8/6PP/4K3 w - - 0 1")) === A.pawnKey(A.Chess.parseFen("r3k3/pp6/8/8/8/8/6PP/R3K3 w - - 0 1")), "la estructura de peones no depende de las piezas");
  const arbol = A.Pgn.parseGame("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 (2. f4) *", { lang: "en" }).game.root;
  comprobar(A.repLeaves(arbol).map(n => n.san).sort().join() === "Nf3,Nf3,f4", "las líneas de un repertorio (sus hojas)");
});

if (fallos.length) { console.log(`\n${fallos.length} prueba(s) fallida(s)`); process.exit(1); }
console.log(`\nTodas las pruebas de lógica superadas (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
process.exit(0);
