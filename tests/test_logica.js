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

seccion("«Lee el tablero»: la lectura previa al cálculo", () => {
  // La posición de un problema de ejemplo: juegan blancas, con la calidad de menos
  const S = A.boardScan(A.Chess.parseFen("2r1r1k1/bb3p1p/p3p2p/P1q3N1/1pN2P2/1P1B1P2/2P4P/Q5RK w - - 0 1")), N = A.Chess.sqName;
  const lines = L => L.map(x => `${x.kind} ${N(x.from)} ${N(x.a)}${x.z != null ? " " + N(x.z) : ""}${x.target != null ? " " + N(x.target) : ""}`).sort();
  comprobar(S.me === 1 && S.material.diff === -2 && S.material.pair[-1] && !S.material.pair[1], "material: las blancas van 2 puntos por detrás y las negras tienen la pareja de alfiles");
  comprobar(igual(lines(S.rival.lines), ["battery a7 c5 g1", "battery c8 c5 c4", "pin b7 f3 h1"]), "el rival: clavada del peón de f3 contra el rey y dos baterías (contra c4 y contra g1)");
  comprobar(S.rival.danger.some(x => N(x.sq) === "g5" && x.att.map(N).includes("h6")), "el rival: el caballo de g5 está atacado por el peón de h6");
  comprobar(igual(lines(S.you.lines), ["discovery g1 g5 g8"]), "tú: sólo el caballo de g5 separa la torre del rey: jaque a la descubierta");
  comprobar(S.you.danger.some(x => N(x.sq) === "h7" && x.att.length === 2 && x.def.length === 1), "tú: el peón de h7 está atacado dos veces y defendido una");
  comprobar(S.forcing.checks.some(x => x.san === "Qh8+") && S.forcing.checks.length === 8, "las jugadas forzadas incluyen 1.Dh8+, la solución");
  comprobar(S.kings[-1].esc.length === 1 && S.kings[-1].hit.length >= 3, "el rey negro tiene una sola casilla de escape y varias casillas vecinas atacadas");
  const S2 = A.boardScan(A.Chess.parseFen("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1"));
  comprobar(S2.forcing.checks.some(x => x.san === "Rd8#" && x.mate) && S2.kings[-1].shield === 3, "detecta el mate del pasillo entre los jaques (rey con sus tres peones delante, sin salida)");
  const S3 = A.boardScan(A.Chess.parseFen("4k3/8/8/8/4r3/8/8/4K2R w - - 0 1"));
  comprobar(S3.rival.lines.length === 0 || S3.rival.lines.every(x => x.kind !== "pin"), "sin clavadas inventadas (una torre que da jaque no es una clavada)");
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

seccion("📖 Aperturas explicadas", () => {
  const r = JSON.parse(E.ev(`JSON.stringify((() => {
    const sin = ECO_BOOK.filter(e => !openingArticleOf(e)).map(e => e.name);
    const usados = new Set(ECO_BOOK.map(e => openingArticleOf(e) && openingArticleOf(e).art.id));
    const vacios = OPENING_ARTICLES.filter(a => !usados.has(a.id)).map(a => a.id);
    const campos = OPENING_ARTICLES.filter(a => !["que", "blancas", "negras", "errores", "origen"].every(k => String(a[k] || "").length > 40) || !(a.ideas && a.ideas.length >= 3)).map(a => a.id);
    const notas = [];
    for (const a of OPENING_ARTICLES) for (const [re] of (a.v || [])) if (!ECO_BOOK.some(e => openingArticleOf(e).art === a && re.test(e.name))) notas.push(a.id + " " + re);
    const jugadas = OPENING_ARTICLES.filter(a => Pgn.parseGame(a.moves, { lang: "en" }).error || !Pgn.mainlineFrom(Pgn.parseGame(a.moves, { lang: "en" }).game.root).length).map(a => a.id);
    const najdorf = openingArticleOf(ECO_BOOK.find(e => e.name === "Siciliana · Variante Najdorf"));
    return { sin, vacios, campos, notas, jugadas, najdorf: najdorf.art.id + "|" + najdorf.note };
  })())`));
  comprobar(!r.sin.length, "todas las aperturas de la enciclopedia tienen su artículo" + (r.sin.length ? ": faltan " + r.sin.join(", ") : ""));
  comprobar(!r.vacios.length && !r.notas.length, "cada artículo y cada nota de variante corresponde a alguna apertura" + (r.vacios.length || r.notas.length ? ": " + r.vacios.concat(r.notas).join(", ") : ""));
  comprobar(!r.campos.length, "todos tienen qué es, ideas, cómo jugarla con cada color, errores y origen" + (r.campos.length ? ": incompletos " + r.campos.join(", ") : ""));
  comprobar(!r.jugadas.length, "las jugadas de cada artículo son legales" + (r.jugadas.length ? ": " + r.jugadas.join(", ") : ""));
  comprobar(r.najdorf.startsWith("siciliana|") && r.najdorf.includes("Najdorf"), "una variante va al artículo de su familia con su nota propia (Najdorf → Siciliana)");
});

seccion("Código: sin funciones con el mismo nombre", () => {
  // Todos los ficheros de src/app/ forman un único script: dos funciones con el mismo nombre se pisan sin avisar
  const fs = require("fs"), path = require("path"), dir = path.join(__dirname, "..", "src", "app"), vistas = {};
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js"))) {
    for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)) (vistas[m[1]] = vistas[m[1]] || []).push(f);
  }
  const rep = Object.entries(vistas).filter(([, v]) => v.length > 1).map(([k, v]) => `${k} (${v.join(", ")})`);
  comprobar(!rep.length, "cada función de primer nivel tiene un nombre único" + (rep.length ? ": " + rep.join("; ") : ""));
});

seccion("🏗 Estructuras de peones", () => {
  const casos = [
    ["", 0, "posición inicial"],
    ["1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 c6 6. e3", "carlsbad", "Gambito de Dama con cambio: Carlsbad de las blancas"],
    ["1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5 exd5 5. Nf3 Nc6 6. g3 Nf6 7. Bg2 Be7 8. O-O O-O 9. dxc5 Bxc5", "pad", "Tarrasch: peón aislado de las negras"],
    ["1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6 5. c4", "maroczy", "Siciliana acelerada: bind de Maróczy"],
    ["1. e4 e6 2. d4 d5 3. e5", "francesa", "Francesa, variante del avance"],
    ["1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5", "indiarey", "India de Rey con d5"],
    ["1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6", "benoni", "Benoni moderna"],
    ["1. c4 c5 2. Nf3 Nf6 3. Nc3 e6 4. g3 b6 5. Bg2 Bb7 6. O-O Be7 7. d4 cxd4 8. Qxd4 d6 9. e4 a6", "erizo", "erizo de las negras (antes que el Maróczy)"],
    ["1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5", "boleslavsky", "Najdorf con …e5: Boleslavsky"],
    ["1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 d6", "scheveningen", "Scheveningen"],
    ["1. d4 f5 2. c4 Nf6 3. g3 e6 4. Bg2 d5 5. Nf3 c6", "stonewall", "Holandesa Stonewall de las negras"],
    ["1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. a3 Bxc3+ 5. bxc3", "doblados", "Nimzoindia Sämisch: peones doblados en c"]
  ];
  const r = E.ev(`(${JSON.stringify(casos)}).map(([pgn, , ]) => { const g = Pgn.parseGame(pgn, { lang: "en" }).game; let n = g.root; while (n.children.length) n = n.children[0];
      const c = pawnStruct(n.state.b), i = structInfo(c); return i ? { id: i.id, black: i.black, short: i.short, about: i.about } : null; })`);
  casos.forEach(([, id, msg], k) => comprobar(id ? r[k] && r[k].id === id : r[k] === null, `${msg}${r[k] ? ` (${r[k].id}, ${r[k].black ? "negras" : "blancas"})` : ""}`));
  comprobar(r[2].black && r[2].short === "peón aislado en d5" && r[10].black && r[1].about.startsWith("Las blancas"),
    "las casillas y los colores se giran cuando la estructura es de las negras");
});

seccion("🧑‍🏫 Memoria del entrenador entre clases (1.56)", () => {
  E.localStorage.removeItem("ajedrezEntrenador");
  const r = E.ev(`(() => {
    const P = PUZZLES.find(p => puzzleThemeKeys(p).includes("fork")) || PUZZLES[0];
    const Q = PUZZLES.find(p => p !== P && puzzleThemeKeys(p).includes("fork")) || PUZZLES[1];
    const ex = p => ({ kind: "puzzle", pid: p.id, p, theme: puzzleThemeKeys(p)[0] });
    const out = {};
    coachMemRecord(ex(P), false);
    out.focusP = coachFocusOf(ex(P));
    out.dueHoy = coachMemSummary().due.length;
    out.dueLuego = coachMemSummary(Date.now() + 3 * 864e5 + 1000).due.length;
    // Una clase con 5 posiciones de táctica de material: sólo 1 a la primera
    Coach.focus = { key: "material" };
    Coach.results = [true, false, false, false, false].map(ok => ({ ex: ex(P), ok, solved: true }));
    coachMemSession();
    const M = coachMemSummary();
    out.sesiones = M.sessions;
    out.debil = M.weak[0] && M.weak[0].k;
    out.pct = M.weak[0] && M.weak[0].pct;
    const f = coachChooseFocus({ byTheme: { mateMissed: 9 }, weak: [], mem: M });
    out.elige = f.key; out.porque = f.why;
    // A los 3 días, la clase empieza por lo que toca repetir
    const M2 = coachMemSummary(Date.now() + 4 * 864e5);
    const q = coachBuildQueue({ drills: [], mem: M2 }, { key: "material" }, 4);
    out.cola = q.map(x => (x.again ? "R:" : "") + x.kind + (x.pid ? ":" + x.pid : ""));
    out.pid = P.id;
    coachMemRecord(ex(P), true);   // acertada a la primera: sale de la lista
    out.trasAcertar = coachMemSummary(Date.now() + 4 * 864e5).retry.length;
    out.marcada = !!coachMem().retry["p:" + P.id].done;
    // Sincronización: se juntan las clases y gana lo más reciente de cada posición
    const a = { sessions: [{ t: 1, n: 4 }, { t: 2, n: 4 }], retry: { "p:x": { due: 5, t: 10, done: true } } };
    const b = { sessions: [{ t: 2, n: 4 }, { t: 3, n: 6 }], retry: { "p:x": { due: 9, t: 5 }, "p:y": { due: 7, t: 6 } } };
    const m = SYNC_LS.ajedrezEntrenador.merge(a, b);
    out.sync = { ses: m.sessions.map(x => x.t), x: !!m.retry["p:x"].done, y: !!m.retry["p:y"] };
    return out;
  })()`);
  comprobar(r.focusP === "material" && r.dueHoy === 0 && r.dueLuego === 1, "una posición fallada vuelve a la clase al cabo de 3 días (y se cuenta en su tema)");
  comprobar(r.sesiones === 1 && r.debil === "material" && r.pct === 20, "cada clase deja su resumen y recuerda el tema que cuesta (20 % a la primera)");
  comprobar(r.elige === "material" && /últimas clases/.test(r.porque), "el entrenador elige el tema que más cuesta en las clases, antes que el error de las partidas");
  comprobar(r.cola[0] === "R:puzzle:" + r.pid && r.cola.length === 4, "la clase empieza por las posiciones que toca repetir");
  comprobar(r.trasAcertar === 0 && r.marcada, "al acertarla a la primera sale de la lista (marcada, para que la sincronización no la resucite)");
  comprobar(igual(r.sync, { ses: [1, 2, 3], x: true, y: true }), "al sincronizar se juntan las clases sin repetir y gana lo más reciente de cada posición");
  E.localStorage.removeItem("ajedrezEntrenador");
});

seccion("Correcciones de la auditoría (1.59.1)", () => {
  const r = JSON.parse(E.ev(`JSON.stringify((() => {
    const parse = mt => Pgn.parseGame(mt, { lang: "en" }).game;
    const last = g => { const l = Pgn.mainlineFrom(g.root); return l[l.length - 1]; };
    // Triple repetición: la primera posición tenía captura al paso legal
    const rep6 = gameStatus(last(parse("1. e4 Nf6 2. e5 d5 3. Nf3 Nfd7 4. Ng1 Nf6 5. Nf3 Nfd7 6. Ng1 Nf6 *")));
    const rep8 = gameStatus(last(parse("1. e4 Nf6 2. e5 d5 3. Nf3 Nfd7 4. Ng1 Nf6 5. Nf3 Nfd7 6. Ng1 Nf6 7. Nf3 Nfd7 8. Ng1 Nf6 *")));
    const repSin = gameStatus(last(parse("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *")));
    // Precisión en apertura: el Gambito Letón está en el catálogo, pero empeora a las negras
    const g = parse("1. e4 e5 2. Nf3 f5 *"), [e4, e5, nf3, f5] = Pgn.mainlineFrom(g.root);
    nf3.eval = { cp: 30, best: "b8c6", depth: 18 }; f5.eval = { cp: 120, depth: 18 };
    const letón = classifyMove(f5);
    const g2 = parse("1. e4 e5 2. Nf3 Nc6 *"), nc6 = Pgn.mainlineFrom(g2.root)[3];
    nc6.parent.eval = { cp: 30, best: "b8c6", depth: 18 }; nc6.eval = { cp: 32, depth: 18 };
    const normal = classifyMove(nc6);
    const comment = buildComment(f5, letón);
    // Guardar una colección: completas, con errores, ilegibles y repetidas
    Coll.games = Pgn.splitGames([
      '[White "A"]\\n[Black "B"]\\n\\n1. e4 e5 2. Nf3 Nc6 *',
      '[White "C"]\\n[Black "D"]\\n\\n1. d4 d5 2. c4 e6 3. Ke3 Nf6 *',
      '[White "E"]\\n[Black "F"]\\n\\n1. Ke2 e5 *',
      '[White "A"]\\n[Black "B"]\\n\\n1. e4 e5 2. Nf3 Nc6 *',
      '[White "G"]\\n[Black "H"]\\n\\n1. c4 e5 *'
    ].join("\\n\\n"));
    const lib = [Object.assign(recordFromGame(parse('[White "G"]\\n[Black "H"]\\n\\n1. c4 e5 *')), { id: 7 })];
    const plan = collSavePlan([0, 1, 2, 3, 4], lib);
    const fallo = collSaveSummary({ written: 250, failed: "no queda espacio", pending: 50, incompleteSaved: 0, incompleteSkipped: 1, bad: 1, dup: 0, dupFile: 0 });
    const bien = collSaveSummary({ written: 1, failed: "", pending: 0, incompleteSaved: 0, incompleteSkipped: 1, bad: 1, dup: 1, dupFile: 1 });
    // Cortar: qué se elimina
    const gc = parse("1. e4 e5 2. Nf3 (2. f4 {Gambito} exf4 (2... d5) 3. Nf3) Nc6 *");
    game = gc;
    const f4 = gc.root.children[0].children[0].children[1], nf3c = gc.root.children[0].children[0].children[0];
    return { rep6: rep6.over, rep8: rep8.text, repSin: repSin.text, letón, normal, comment,
      plan: { ok: plan.ok.map(x => x.i), inc: plan.incomplete.map(x => [x.i, x.why]), bad: plan.bad.map(x => x.i), dup: plan.dup.map(x => x.i), dupFile: plan.dupFile.map(x => [x.i, x.of]) },
      fallo, bien, cutVar: cutDescription(f4), cutMain: cutDescription(nf3c) };
  })())`));
  comprobar(r.rep6 === false && r.rep8 === "Tablas por triple repetición", "triple repetición: no declara tablas si en la primera posición se podía capturar al paso, sí en la tercera repetición real");
  comprobar(r.repSin === "Tablas por triple repetición", "triple repetición normal, sin al paso");
  comprobar(r.letón.book && r.letón.loss > 5 && r.letón.acc < 80 && r.letón.cpl === 90 && ["?!", "?", "??"].includes(r.letón.cls), "una jugada del catálogo ECO que empeora la posición (Gambito Letón) pierde precisión y se marca");
  comprobar(r.normal.book && r.normal.loss === 0 && r.normal.acc > 99 && r.normal.cls === "", "una jugada de teoría que mantiene la valoración sigue con precisión completa");
  comprobar(r.comment.includes("Teoría: C40") && /Imprecisión|Error/.test(r.comment), "el comentario da por separado el nombre de la apertura y la valoración de la jugada");
  comprobar(igual(r.plan.ok, [0]) && r.plan.inc.length === 1 && r.plan.inc[0][0] === 1 && r.plan.inc[0][1].includes("3. Ke3") && r.plan.inc[0][1].includes("4 jugadas"), "guardar una colección: una partida que se detiene en una jugada ilegal no cuenta como completa");
  comprobar(igual(r.plan.bad, [2]) && igual(r.plan.dup, [4]) && igual(r.plan.dupFile, [[3, 0]]), "…las ilegibles, las que ya están en la biblioteca y las repetidas dentro del fichero (con su gemela), por separado");
  comprobar(!r.fallo.ok && r.fallo.text.startsWith("❌ No se ha podido terminar de guardar: no queda espacio") && r.fallo.text.includes("250 partidas guardadas") && r.fallo.text.includes("50 quedan pendientes"), "si falla la escritura, el resumen lo dice y cuenta las guardadas y las pendientes");
  comprobar(r.bien.ok && r.bien.text.startsWith("💾 1 partida guardada completa ·") && r.bien.text.includes("1 con errores no se ha guardado") && r.bien.text.includes("1 ilegible") && r.bien.text.includes("1 ya estaba") && r.bien.text.includes("1 copia idéntica dentro del fichero"), "resumen sin fallos: guardadas, con errores, ilegibles y repetidas");
  comprobar(r.cutVar.text === "la variante 2.f4 · 4 jugadas, 1 variante, 1 con comentarios o dibujos" && r.cutMain.text === "2.Cf3 y lo que sigue · 2 jugadas", "✂ Cortar dice qué se elimina: la variante o la continuación, cuántas jugadas y si hay comentarios");
});

seccion("📑 Versiones de una misma partida (1.60)", () => {
  const r = JSON.parse(E.ev(`JSON.stringify((() => {
    const parse = mt => Pgn.parseGame(mt, { lang: "en" }).game;
    const H = '[White "Ana"]\\n[Black "Beto"]\\n[Date "1950.01.01"]\\n';
    const base = H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *';
    const cs = mt => contentSig(parse(mt));
    const sig = {
      igual: cs(base) === cs(H + '\\n1. e4    e5\\n2. Nf3 Nc6 3. Bb5 a6 *'),
      evals: cs(base) === cs(H + '\\n1. e4 { [%eval 0.3] } e5 2. Nf3 Nc6 3. Bb5 a6 *'),
      cabecera: cs(base) === cs('[White "Ana"]\\n[Black "Beto"]\\n[Date "1950.01.01"]\\n[Annotator "Kasparov"]\\n\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'),
      comentario: cs(base) !== cs(H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 {La española} a6 *'),
      variante: cs(base) !== cs(H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4) a6 *'),
      simbolo: cs(base) !== cs(H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 $36 a6 *'),
      continuacion: cs(base) !== cs(H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *'),
      misma: gameSig(parse(base)) === gameSig(parse(H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 {La española} (3. Bc4) a6 *'))
    };
    const viejo = Object.assign(recordFromGame(parse(base)), { id: 1, title: "Ana – Beto" });
    delete viejo.csig;   // como los guardados antes de la 1.60
    const recalculada = recContentSig(viejo) === cs(base);
    const diff = versionDiff(parse(H + '\\n1. e4 e5 2. Nf3 {Desarrollo} Nc6 3. Bb5 {La española} (3. Bc4 Bc5) a6 *'), parse(base));
    const diffLinea = versionDiff(parse(H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bc4 *'), parse(base));
    const titulos = [versionTitle("Ana – Beto", { Annotator: "Kasparov" }, [viejo]), versionTitle("Ana – Beto", {}, [viejo]), versionTitle("Ana – Beto", {}, [viejo, { title: "Ana – Beto (versión 2)" }]), versionTitle("Otra", {}, [viejo])];
    // Un fichero con: la misma partida comentada por Kasparov, una copia idéntica a la que ya tenías, esa misma comentada
    // otra vez (copia idéntica dentro del fichero) y otra continuación
    Coll.games = Pgn.splitGames([
      '[White "Ana"]\\n[Black "Beto"]\\n[Date "1950.01.01"]\\n[Annotator "Kasparov"]\\n\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 {La española} a6 *',
      base,
      '[White "Ana"]\\n[Black "Beto"]\\n[Date "1950.01.01"]\\n[Annotator "Kasparov"]\\n\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 {La española} a6 *',
      H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *'
    ].join("\\n\\n"));
    const plan = collSavePlan([0, 1, 2, 3], [viejo]);
    const ida = "1. Nf3 Nf6 2. Ng1 Ng8 ".repeat(16);   // 64 jugadas
    const largo1 = Object.assign(recordFromGame(parse(H + '\\n' + ida + '65. e4 *')), { id: 2, title: "Larga" });
    Coll.games = Pgn.splitGames(H + '\\n' + ida + '65. d4 *');
    const pl = collSavePlan([0], [largo1]);
    const largo = pl.ok.length === 1 && pl.ok[0].version && pl.ok[0].rec.sig === largo1.sig;
    const resumen = collSaveSummary({ written: 2, failed: "", pending: 0, versions: 2, incompleteSaved: 0, incompleteSkipped: 0, bad: 0, dup: 1, dupFile: 1 }).text;
    // Sincronización: dos versiones de la misma partida en dos dispositivos se conservan las dos
    const gm = (uid, pgn, _m) => ({ uid, sig: "s", pgn, _m, title: uid });
    const sync2 = syncMerge({ games: [gm("a", base, 1)], marks: [], ls: {}, tomb: {} }, { games: [gm("b", H + '\\n1. e4 e5 2. Nf3 Nc6 3. Bb5 {Nota} a6 *', 2)], marks: [], ls: {}, tomb: {} });
    const sync1 = syncMerge({ games: [gm("a", base, 1)], marks: [], ls: {}, tomb: {} }, { games: [gm("b", base, 2)], marks: [], ls: {}, tomb: {} });
    return { largo, sig, recalculada, diff, diffLinea, titulos,
      plan: { ok: plan.ok.map(x => [x.i, x.version, x.rec.title]), dup: plan.dup.map(x => x.i), dupFile: plan.dupFile.map(x => [x.i, x.of]) }, resumen,
      sync2: { put: sync2.games.put.length, same: sync2.games.put.some(p => p.same), alias: sync2.games.alias.size },
      sync1: { same: sync1.games.put.length === 1 && sync1.games.put[0].same } };
  })())`));
  const s = r.sig;
  comprobar(s.igual && s.evals && s.cabecera, "copia idéntica: da igual el espacio, las evaluaciones del motor y las cabeceras");
  comprobar(s.comentario && s.variante && s.simbolo && s.continuacion && s.misma, "otra versión: la misma partida con otro comentario, otra variante, otro símbolo u otra continuación");
  comprobar(r.recalculada, "las partidas guardadas antes de la 1.60 se comparan igual (la firma del contenido se calcula a partir de su PGN)");
  comprobar(r.diff.join(" | ") === "2 comentarios frente a 0 | 1 variante frente a 0", "dice en qué se diferencia la nueva versión: comentarios y variantes");
  comprobar(r.diffLinea[0] === "otra continuación desde 3.Ac4", "…u otra continuación, desde qué jugada");
  comprobar(r.titulos.join(" | ") === "Ana – Beto · notas de Kasparov | Ana – Beto (versión 2) | Ana – Beto (versión 3) | Otra", "título de una nueva versión: quién la anota, o «versión N»");
  comprobar(JSON.stringify(r.plan.ok) === JSON.stringify([[0, true, "Ana – Beto · notas de Kasparov"], [3, false, "Ana – Beto"]]) && JSON.stringify(r.plan.dup) === "[1]" && JSON.stringify(r.plan.dupFile) === "[[2,0]]" && r.largo,
    "al guardar un fichero, se omiten sólo las copias idénticas; las otras versiones se guardan con su propio título (y otra continuación, también pasada la jugada 60)");
  comprobar(r.resumen.includes("📑 2 son otras versiones (con otros comentarios, variantes o continuación) de partidas que ya tenías") && r.resumen.includes("1 ya estaba en tu biblioteca, idéntica") && r.resumen.includes("1 copia idéntica dentro del fichero"), "el resumen cuenta las versiones nuevas y las copias idénticas omitidas");
  comprobar(r.sync2.put === 1 && !r.sync2.same && r.sync2.alias === 0, "sincronización: dos versiones de la misma partida, una en cada dispositivo, se conservan las dos");
  comprobar(r.sync1.same, "…y dos copias idénticas se quedan en una");
});

seccion("🔍 Cómo se obtuvo la evaluación (1.61)", () => {
  const r = JSON.parse(E.ev(`JSON.stringify((() => {
    const g = Pgn.parseGame("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0", { lang: "en" }).game;
    const nodes = [g.root, ...Pgn.mainlineFrom(g.root)];
    const sf19 = d => ({ cp: 20, depth: d, source: "stockfish", engine: "Stockfish 19", ms: 1000 });
    nodes[0].eval = sf19(18); nodes[1].eval = sf19(20); nodes[2].eval = sf19(19);
    nodes[3].eval = { cp: 10, depth: 12, source: "stockfish", engine: "Stockfish 10", ms: 300 };
    nodes[4].eval = { cp: 10, depth: 40, source: "nube", engine: "Stockfish (nube de Lichess)", ms: 0 };
    nodes[5].eval = { cp: 30, depth: 0, source: "pgn" };
    nodes[6].eval = { cp: 900, depth: 9, source: "internal" };   // guardada antes de la 1.61: sin motor ni tiempo
    nodes[7].eval = terminalEval(nodes[7]);
    const fresh = new Set([nodes[0], nodes[1], nodes[2]]);
    const P = analysisProvenance(nodes, fresh, "El motor cambió durante el análisis: de Stockfish 19 a Motor interno.");
    const uno = analysisProvenance(nodes.slice(0, 3), new Set(nodes.slice(0, 3)));
    const todoViejo = analysisProvenance(nodes.slice(0, 3), new Set());
    return { P, uno, todoViejo, ms: [fmtMs(500), fmtMs(1000), fmtMs(2500), fmtMs(15000)], deep: DEEP_MS(), cls: [clsName("??"), clsName("")] };
  })())`));
  comprobar(r.P.text === "3 posiciones con Stockfish 19 a 1 s por posición (profundidad 18–20) · 1 posición con Stockfish 10 a 300 ms por posición (profundidad 12), de un análisis anterior · 1 posición con la nube de Lichess (profundidad 40), de un análisis anterior · 1 posición con las evaluaciones que traía el PGN (por ejemplo, el análisis de Lichess), de un análisis anterior · 1 posición con Motor interno (profundidad 9), de un análisis anterior",
    "dice cuántas posiciones se calcularon con cada motor y tiempo, cuáles venían de antes, de la nube de Lichess o del PGN (el mate final no cuenta)");
  comprobar(r.P.mixed && r.P.change.startsWith("El motor cambió") && !r.uno.mixed && r.uno.text === "3 posiciones con Stockfish 19 a 1 s por posición (profundidad 18–20)", "avisa si se mezclan motores o tiempos, o si el motor cambió a mitad");
  comprobar(r.todoViejo.text.endsWith(", todas de un análisis anterior"), "si todo se reutiliza, lo dice");
  comprobar(r.ms.join(" | ") === "500 ms | 1 s | 2,5 s | 15 s" && r.deep === 5000 && r.cls.join(" | ") === "un error grave | una jugada correcta", "tiempos legibles; «Más a fondo» usa al menos 5 s por posición");
});

seccion("🎯 Motivos tácticos sin IA (1.66)", () => {
  const r = JSON.parse(E.ev(`JSON.stringify((() => {
    const P = fen => Chess.parseFen(fen), U = (s, u) => Chess.moveFromUci(s, u);
    const fen = "rnbqkb1r/pp2pppp/5n2/1N1p4/5B2/3pP3/PPP2PPP/R2QKBNR w KQkq - 0 6";
    const s = P(fen);
    const out = {
      horquilla: motifGood(s, ["b5c7", "e8d7", "c7a8"], null),
      malo: motifBad(s, U(s, "b5d6"), ["e7d6", "f1d3"], null),
      pista: motifHint(s, ["b5c7", "e8d7", "c7a8"], null),
      clavada: motifGood(P("r1bqkbnr/ppp2ppp/2np4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4"), ["f1b5"], null),
      descubierta: motifGood(P("4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1"), ["e4c5"], null),
      libre: motifGood(P("rnbqkbnr/pppp1ppp/8/4n3/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 1"), ["d4e5"], null),
      dejaSinDefensa: (() => { const t = P("rnb1kbnr/ppqppppp/8/8/5B2/4P3/PPPP1PPP/RN1QKBNR w KQkq - 0 1"); return motifBad(t, U(t, "e3e4"), ["c7f4"], null); })(),
      nada: motifGood(P(Chess.START_FEN), ["e2e4"], null),
      mate: motifGood(P("6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1"), ["d1d8"], { mate: 1 }),
      pistaMate: motifHint(P("6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1"), ["d1d8"], { mate: 1 })
    };
    // El comentario del análisis, con las evaluaciones del motor
    const g = Pgn.parseGame('[FEN "' + fen + '"]\\n\\n6. Nd6+ exd6 *', { lang: "en" }).game;
    const n = g.root.children[0];
    g.root.eval = { cp: 380, best: "b5c7", pv: ["b5c7", "e8d7", "c7a8"], depth: 20 };
    n.eval = { cp: -600, best: "e7d6", pv: ["e7d6", "f1d3"], depth: 20 };
    out.comentario = buildComment(n, classifyMove(n));
    return out;
  })())`));
  comprobar(r.horquilla.startsWith("horquilla: da jaque al rey y ataca la torre de a8") && r.horquilla.includes("gana unos 5 puntos"), "la buena (Cc7+) se explica como horquilla: jaque al rey y ataque a la torre de a8");
  comprobar(r.malo.startsWith("El caballo de d6 queda donde lo captura el peón de e7 (6...exd6)"), "la mala (Cd6+): el caballo queda donde lo captura el peón de e7");
  comprobar(r.pista.startsWith("Busca una horquilla") && !/c7/i.test(r.pista), "la pista dice el tipo de motivo sin revelar la jugada");
  comprobar(r.clavada === "clava el caballo de c6 contra el rey", "clavada (Ab5 contra el caballo de c6)");
  comprobar(r.descubierta === "jaque a la descubierta con la torre de e1", "jaque a la descubierta");
  comprobar(r.libre.startsWith("captura el caballo de e5, que estaba sin defensa"), "captura de una pieza sin defensa");
  comprobar(r.dejaSinDefensa.startsWith("Al mover, dejas sin defensa el alfil de f4, que se pierde con 1...Dxf4"), "una jugada que deja sin defensa otra pieza");
  comprobar(r.nada === "" && r.mate === "es jaque mate" && r.pistaMate.startsWith("Hay un mate"), "sin motivo claro no se dice nada; el mate se dice como tal");
  comprobar(r.comentario.includes("Era mejor 6.Cc7+") && r.comentario.includes("(horquilla: da jaque al rey y ataca la torre de a8") && r.comentario.includes("El caballo de d6 queda donde lo captura el peón de e7"),
    "el comentario del análisis da el motivo de la buena y el de la mala");
});

seccion("🎲 Probabilidades de victoria, tablas y derrota (1.67)", () => {
  const r = JSON.parse(E.ev(`JSON.stringify((() => {
    // Lo que manda Stockfish con UCI_ShowWDL: milésimas desde el bando que mueve (aquí, las negras)
    const prev = Engine.running, job = { stm: -1, lines: [] };
    Engine.running = job;
    Engine.onLine("info depth 18 seldepth 25 multipv 1 score cp 40 wdl 520 400 80 nodes 1000 nps 100000 time 10 pv e7e5 g1f3");
    Engine.running = prev;
    const l = job.lines[0];
    const fen = "rnbqkb1r/pp2pppp/5n2/1N1p4/5B2/3pP3/PPP2PPP/R2QKBNR w KQkq - 0 6";
    const g = Pgn.parseGame('[FEN "' + fen + '"]\\n\\n6. Nd6+ exd6 *', { lang: "en" }).game, n = g.root.children[0];
    g.root.eval = { cp: 380, best: "b5c7", pv: ["b5c7", "e8d7", "c7a8"], depth: 20, wdl: [905, 90, 5] };
    n.eval = { cp: -600, best: "e7d6", pv: ["e7d6", "f1d3"], depth: 20, wdl: [2, 40, 958] };
    const sinWdl = Pgn.parseGame('[FEN "' + fen + '"]\\n\\n6. Nd6+ exd6 *', { lang: "en" }).game, n2 = sinWdl.root.children[0];
    sinWdl.root.eval = { cp: 380, best: "b5c7", pv: ["b5c7"], depth: 20 }; n2.eval = { cp: -600, best: "e7d6", pv: ["e7d6"], depth: 20 };
    return { cp: l.cp, wdl: l.wdl, exacta: fmtChances({ cp: 40, wdl: [620, 300, 80] }), estimada: fmtChances({ cp: 0 }), mate: fmtChances({ mate: -2 }),
      comentario: buildComment(n, classifyMove(n)), comentario2: buildComment(n2, classifyMove(n2)), poco: chancesDrop({ cp: 0, wdl: [300, 400, 300] }, { cp: -5, wdl: [280, 420, 300] }, 1, "de las blancas") };
  })())`));
  comprobar(r.cp === -40 && JSON.stringify(r.wdl) === "[80,400,520]", "lee las probabilidades de Stockfish (wdl) y las pasa a la perspectiva de las blancas");
  comprobar(r.exacta === "Blancas ganan 62 % · tablas 30 % · negras ganan 8 %" && r.mate === "Blancas ganan 0 % · tablas 0 % · negras ganan 100 %", "las muestra en porcentajes");
  comprobar(r.estimada.startsWith("≈ 50 % de los puntos para las blancas (estimado)"), "sin probabilidades del motor, una estimación que dice que lo es");
  comprobar(r.comentario.includes("Las opciones de ganar de las blancas bajan del 91 % al 0 %."), "el comentario de un error dice cuánto bajan las opciones de ganar");
  comprobar(!r.comentario2.includes("opciones de ganar") && r.poco === "", "sin probabilidades del motor (o si apenas cambian) no se dice nada");
});

if (fallos.length) { console.log(`\n${fallos.length} prueba(s) fallida(s)`); process.exit(1); }
console.log(`\nTodas las pruebas de lógica superadas (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
process.exit(0);
