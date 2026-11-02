#!/usr/bin/env node
/* Genera cursos/partidas.pgn: las partidas de la antología (src/eco.js) con comentarios didácticos.
   Las jugadas salen tal cual de la antología; aquí sólo se añaden comentarios, símbolos, flechas y variantes.
   node tools/partidas_comentadas.js */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const src = ["core.js", "pgn.js", "eco.js"].map(f => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");
const { Chess, Pgn, SAMPLE_MULTI_PGN } = new Function(src + ";return { Chess, Pgn, SAMPLE_MULTI_PGN };")();

/* Para cada partida: título, nivel, comentario inicial y notas por jugada («16.Qb8+» o «15...Nxd7»).
   Cada nota: nag, c (comentario), sh (flechas/casillas: "Gd1d8,Rd8"), v (variante en SAN inglés) y vc (comentario al final de la variante). */
const GAMES = [
  {
    event: "Partida de la Ópera", title: "Morphy: desarrollo, iniciativa y sacrificio (la Partida de la Ópera)", level: "Principiante",
    intro: "París, 1858. Paul Morphy juega en el palco de la Ópera contra dos aficionados aliados, el duque de Brunswick y el conde Isouard. Es la partida perfecta para entender por qué en la apertura importa el desarrollo: Morphy saca todas sus piezas mientras las negras pierden tiempo, y cuando abre el juego, sus piezas activas deciden en pocas jugadas.",
    notes: {
      "3...Bg4": { nag: "?!", c: "Clava el caballo, pero pronto tendrá que cambiar el alfil por él: las blancas se quedan con la pareja de alfiles y ventaja de desarrollo." },
      "4...Bxf3": { c: "Forzado: si 4...dxe5, 5.Dxd8+ Rxd8 6.Cxe5 gana un peón." },
      "6.Bc4": { c: "Amenaza 7.Dxf7#. Fíjate: las blancas sólo han movido dos piezas, pero las dos atacan.", sh: "Gc4f7,Gf3f7" },
      "6...Nf6": { nag: "?!", c: "Tapa la diagonal de la dama, pero deja b7 y f7 a merced de la dama blanca. Era mejor 6...Df6." },
      "7.Qb3": { nag: "!", c: "Ataque doble: f7 y b7.", sh: "Gb3f7,Gb3b7" },
      "8.Nc3": { c: "Morphy no se come el peón de b7 (8.Dxb7 Db4+ cambiaría las damas): prefiere desarrollar otra pieza. Con ventaja de desarrollo, ¡no cambies las damas!" },
      "9...b5": { nag: "?", c: "Las negras quieren expulsar al alfil, pero abren el juego mientras su rey sigue en el centro.", sh: "Rb5" },
      "10.Nxb5": { nag: "!", c: "Morphy entrega el caballo por dos peones para abrir líneas hacia el rey negro." },
      "11.Bxb5+": { c: "Ahora el caballo de d7 quedará clavado." },
      "12.O-O-O": { nag: "!", c: "El enroque largo pone la torre en la columna d, donde ataca la pieza clavada. Desarrollo y ataque en una sola jugada.", sh: "Gd1d7" },
      "13.Rxd7": { nag: "!", c: "¡Otra entrega! Elimina un defensor." },
      "14.Rd1": { c: "La última pieza entra en juego. Todas las piezas blancas atacan; la torre de h8 y el alfil de f8 negros todavía no se han movido.", sh: "Gd1d8,Rh8,Rf8" },
      "14...Qe6": { nag: "?", c: "Desclava el caballo de f6, pero permite el final.", v: ["a5"], vc: "aguantaba algo más, aunque las blancas ganan igual." },
      "16.Qb8+": { nag: "!!", c: "¡Sacrificio de dama! El caballo está obligado a capturar y abandona la defensa de d8.", sh: "Gb3b8" },
      "17.Rd8#": { c: "Mate con las dos últimas piezas que quedaban: alfil y torre. Lección: desarrollo rápido, abrir líneas cuando el rey rival está en el centro y no perder tiempo con la dama.", sh: "Gd1d8,Gb5e8" }
    }
  },
  {
    event: "La Siempreviva", title: "Anderssen: la Siempreviva y el gambito Evans", level: "Intermedio",
    intro: "Berlín, 1852. Adolf Anderssen, el mejor jugador de su época, juega el gambito Evans: entrega un peón para ganar tiempo y montar un centro. La partida es famosa por su combinación final, una de las más bellas de la historia. Los análisis con motor muestran que no todo fue perfecto, y eso también es una lección: en el ajedrez práctico, la iniciativa vale mucho.",
    notes: {
      "4.b4": { nag: "!?", c: "El gambito Evans: se entrega un peón para ganar tiempo con c3 y d4 contra el alfil de c5.", sh: "Gb4c5" },
      "6.d4": { c: "Las blancas forman un centro y abren líneas para sus piezas." },
      "7.O-O": { c: "Las blancas ya han dado dos peones a cambio de un gran desarrollo." },
      "11.Ba3": { c: "El alfil apunta a e7 y f8: clava el caballo y dificulta el enroque corto negro.", sh: "Ga3f8" },
      "11...b5": { nag: "?!", c: "Era mejor enrocar largo o …O-O cuanto antes. Las negras devuelven un peón para abrir la columna b." },
      "14...Bb7": { nag: "?!", c: "Otra jugada de desarrollo, pero el rey sigue en el centro." },
      "15...Qf5": { nag: "?", c: "La dama se aleja de la defensa. Era mejor 15...d2." },
      "16.Bxd3": { c: "Ataca la dama y despeja la columna d." },
      "17.Nf6+": { nag: "!?", c: "Un sacrificio espectacular para abrir la columna g y el rey negro. El motor prefiere 17.Tad1, pero ante el tablero la amenaza es tremenda.", sh: "Gf6e8" },
      "19.Rad1": { nag: "!!", c: "Una jugada tranquila en medio del ataque: amenaza Txd7+ y entrega la torre de e1. Todas las piezas blancas apuntan al rey negro.", sh: "Gd1d7" },
      "19...Qxf3": { nag: "?", c: "Las negras aceptan el regalo y amenazan mate en g2… pero las blancas mueven antes. Con 19...Txg2+! las negras habrían salvado la partida.", v: ["Rxg2+"], vc: "Las negras dan jaques y el ataque blanco se queda en nada." },
      "20.Rxe7+": { nag: "!", c: "Jaque y elimina un defensor." },
      "20...Nxe7": { nag: "??", c: "Pierde en el acto. 20...Rd8 todavía resistía." },
      "21.Qxd7+": { nag: "!!", c: "¡Sacrificio de dama para abrir la última línea!", sh: "Ga4d7" },
      "22.Bf5+": { nag: "!", c: "Jaque doble: dan jaque el alfil de f5 y la torre de d1. El rey sólo puede moverse.", sh: "Gf5d7,Gd1d7" },
      "24.Bxe7#": { c: "Mate con los dos alfiles. Lección: con el rey rival en el centro, cada pieza que se suma al ataque cuenta más que el material." }
    }
  },
  {
    event: "La Inmortal", title: "Anderssen: la Inmortal y el gambito de rey", level: "Intermedio",
    intro: "Londres, 1851. Una partida amistosa entre Adolf Anderssen y Lionel Kieseritzky que se ganó el nombre de «la Inmortal»: las blancas entregan un alfil, las dos torres y la dama, y dan mate con sus tres piezas menores. Es una ventana al ajedrez romántico del siglo XIX, en el que se buscaba el ataque por encima de todo. Los comentarios señalan también lo que el motor ve hoy.",
    notes: {
      "2.f4": { nag: "!?", c: "El gambito de rey: entrega un peón para abrir la columna f y dominar el centro con d4." },
      "3...Qh4+": { c: "El rey blanco pierde el enroque." },
      "4...b5": { nag: "!?", c: "Contragambito: devuelve el peón para desviar el alfil." },
      "8.Nh4": { nag: "?!", c: "Amenaza Cf5, pero aleja el caballo del centro." },
      "10.g4": { nag: "?!", c: "Agresivo. Las blancas no defienden el alfil de b5: lo entregan para ganar tiempo contra la dama negra." },
      "11...cxb5": { nag: "?", c: "Las negras ganan el alfil, pero sus piezas siguen sin desarrollar y la dama quedará acosada. 11...h5 era mejor." },
      "15.Bxf4": { c: "Las blancas recuperan el peón y ganan otra pieza activa." },
      "17.Nd5": { nag: "!?", c: "Entrega la torre de a1 (y la de g1): la dama negra se irá muy lejos del rey.", sh: "Gd5c7,Gd5f6" },
      "18.Bd6": { nag: "!?", c: "La jugada más famosa de la partida: entrega las dos torres para cerrar el paso al alfil de f8 y a la dama. El motor muestra que con la mejor defensa la posición estaba igualada (18.Te1 era más fuerte), pero ante el tablero era imposible de calcular.", sh: "Rf8" },
      "18...Bxg1": { nag: "?", c: "Las negras capturan la torre… y el ataque blanco llega antes. Mejor era 18...Dxa1+." },
      "20...Na6": { nag: "??", c: "Pierde. Con 20...Aa6 las negras se defendían." },
      "21.Nxg7+": { c: "Jaque, y el rey sólo puede ir a d8." },
      "22.Qf6+": { nag: "!!", c: "¡Y ahora la dama! El caballo está obligado a capturar.", sh: "Gf3f6" },
      "23.Be7#": { c: "Mate con alfil y dos caballos, habiendo entregado dos torres, un alfil y la dama. Lección: la actividad de las piezas puede valer más que el material, sobre todo contra un rey en el centro." }
    }
  },
  {
    event: "Partida del Siglo", title: "Fischer con 13 años: la Partida del Siglo", level: "Club",
    intro: "Nueva York, 1956. Bobby Fischer, con trece años, gana con negras a Donald Byrne, uno de los mejores jugadores de Estados Unidos. Es un modelo de juego hipermoderno (la Grünfeld) y contiene uno de los sacrificios de dama más famosos de la historia. La lección central: aprovechar un rey sin enrocar con todas las piezas.",
    notes: {
      "2...g6": { c: "Fischer prepara el fianchetto: el alfil de g7 controlará el centro desde lejos." },
      "5...d5": { c: "Una defensa Grünfeld: las negras discuten el centro con piezas y peones." },
      "8...Nbd7": { c: "Las blancas tienen el centro, pero su rey sigue en e1. Fischer prepara …Cb6 para atacar la dama." },
      "11.Bg5": { nag: "?", c: "Las blancas siguen sin enrocar. Era imprescindible 11.Ae2 y O-O.", v: ["Be2"], vc: "y las blancas enrocan." },
      "11...Na4": { nag: "!!", c: "Si 12.Cxa4, Cxe4 y la dama blanca y el rey en e1 sufren. El caballo no se puede tomar sin pagar caro.", sh: "Ga4c3" },
      "13...Nxe4": { c: "El centro blanco se derrumba." },
      "14.Bxe7": { c: "El alfil ataca la dama y la torre de f8. Parece que las blancas ganan material, pero…" },
      "14...Qb6": { nag: "!", c: "¡Fischer deja la torre de f8! Su dama ataca f2 y su caballo saltará con fuerza." },
      "15...Nxc3": { nag: "!", c: "Ataca la torre de d1 y la dama." },
      "16...Rfe8+": { c: "El rey blanco, sin enrocar, se convierte en el blanco de todas las piezas negras." },
      "17...Be6": { nag: "!!", c: "¡La jugada del siglo! Fischer entrega la dama. Si 18.Axe6, Db5+ con un ataque ganador; y si 18.Axb6, comienza el «molinillo».", sh: "Ge6c4" },
      "18.Bxb6": { nag: "?", c: "Byrne acepta el sacrificio. 18.Dxc3 resistía más, aunque las negras están mejor." },
      "19...Ne2+": { c: "Empieza el molinillo: el caballo da jaques a la descubierta…" },
      "20...Nxd4+": { c: "…y va recogiendo material a cada jaque." },
      "22...Nc3+": { c: "Torre, alfil y peón por la dama: las negras tienen ya más material y un ataque decisivo." },
      "23...axb6": { c: "Fischer recupera el alfil. Ahora tiene torre, dos alfiles y caballo contra dama: una superioridad aplastante." },
      "41...Rc2#": { c: "Mate con las piezas menores coordinadas. Lección: el rey que no enroca a tiempo puede quedar expuesto a todas las piezas rivales." }
    }
  },
  {
    event: "Campeonato del Mundo", title: "Kaspárov: el pulpo de d3 (Karpov–Kaspárov, 1985)", level: "Club",
    intro: "Moscú, 1985, partida 16 del Campeonato del Mundo. Kaspárov, con negras, ofrece un peón en la Siciliana y consigue a cambio un caballo instalado en d3, en pleno campo blanco: «el pulpo». Es la lección perfecta sobre los puestos avanzados y sobre lo mal que juegan las piezas mal colocadas (los caballos blancos en a3 y b1).",
    notes: {
      "5.Nb5": { c: "Las blancas atacan d6 y preparan c4 para controlar d5." },
      "8...d5": { nag: "!?", c: "¡El gambito Kaspárov! Entrega un peón para activar sus piezas de inmediato, sobre todo el caballo de c6, que irá a b4 y d3." },
      "10...Nb4": { c: "El caballo se dirige a d3.", sh: "Gb4d3" },
      "15.Qd2": { nag: "?!", c: "Permite …b5 y …Cd3. 15.Cc4 era mejor." },
      "16...Nd3": { nag: "!", c: "¡El pulpo! Un caballo protegido, en la tercera fila del rival, que ninguna pieza menor blanca puede cambiar fácilmente. Ataca b2, f2, c1 y e1.", sh: "Gd3b2,Gd3f2,Gd3c1,Gd3e1" },
      "17.Nab1": { nag: "?!", c: "El caballo de a3 vuelve a casa sin papel en la partida. Los caballos blancos de a3 y b1 contrastan con el pulpo de d3." },
      "18...b4": { c: "Echa al otro caballo blanco de c3: el caballo negro de d3 es el rey del tablero." },
      "21...g5": { c: "Las negras ganan espacio en el flanco de rey: las piezas blancas no pueden ayudar porque están mal colocadas." },
      "24.Bg2": { nag: "?!", c: "Las blancas siguen sin poder liberarse." },
      "28.d6": { c: "Las blancas intentan aprovechar su peón pasado, pero el pulpo sigue firme." },
      "30.f3": { nag: "?", c: "Debilita el enroque. 30.h3 era mejor." },
      "34...Nf2+": { nag: "!", c: "El otro caballo también entra en el campo blanco." },
      "37...Rc1": { c: "Con las piezas blancas desordenadas, las negras invaden la primera fila." },
      "38.Nb2": { nag: "?", c: "Error en una posición ya perdida." },
      "40...Re1+": { c: "Las blancas se rinden. Lección: un caballo en un puesto avanzado protegido, en el campo rival, puede paralizar a todo el ejército contrario." }
    }
  },
  {
    event: "Hoogovens", title: "Kaspárov: la Inmortal moderna (Kaspárov–Topalov, 1999)", level: "Club",
    intro: "Wijk aan Zee, 1999. Kaspárov, entonces campeón del mundo, juega contra Topalov la que muchos consideran la mejor partida de ataque de la era moderna. Con enroques en el mismo flanco (el largo), Kaspárov sacrifica una torre en d4 y persigue al rey negro por todo el tablero hasta la casilla d1. La lección: cuando el rey rival sale de su refugio, un ataque con pocas piezas pero muy coordinadas puede ser decisivo.",
    notes: {
      "8.Bh6": { c: "Las blancas cambian el alfil de g7, el mejor defensor del rey negro." },
      "13...O-O-O": { c: "Los dos reyes en el flanco de dama. El rey negro parece seguro…" },
      "22.Nd5": { c: "Entrega el caballo para abrir la columna e." },
      "23...Qd6": { c: "Parece que las negras lo tienen todo controlado. Pero…" },
      "24.Rxd4": { nag: "!!", c: "¡Sacrificio de torre! Abre la gran diagonal y la columna c hacia el rey negro.", sh: "Gd1d4" },
      "24...cxd4": { nag: "?!", c: "Aceptar el sacrificio era lo natural, pero el motor indica que 24...Rb6 era más prudente." },
      "25.Re7+": { nag: "!!", c: "¡Otra pieza! Si 25...Dxe7, 26.Dxd4+ y el ataque blanco es demoledor.", sh: "Ge7a7" },
      "26.Qxd4+": { c: "El rey negro sale de su escondite…" },
      "27.b4+": { c: "…y es perseguido por todo el tablero." },
      "29.Ra7": { nag: "!", c: "La torre ataca el alfil y amenaza Txa6." },
      "31...Kxa3": { nag: "?", c: "Las negras toman otro peón, pero el rey llega todavía más lejos. 31...Td1+ era mejor." },
      "33.c3+": { nag: "!", c: "Y otro peón sacrificado para atraer al rey." },
      "35.Qb2+": { c: "El rey negro ya está en la segunda fila blanca." },
      "36.Bf1": { nag: "!!", c: "Una jugada tranquila con efecto decisivo: amenaza la dama negra y prepara Txd7." },
      "37.Rd7": { nag: "!!", c: "Desvía la torre negra de la defensa." },
      "39.Qxh8": { c: "Las blancas recuperan todo el material y tienen un ataque ganador." },
      "44.Qa7": { c: "Las negras abandonan. Lección: el rey que sale de su refugio, aunque esté protegido por material de más, puede caer ante pocas piezas muy activas." }
    }
  }
];

function shapesFrom(sh) {
  return (sh || "").split(",").filter(Boolean).map(x => {
    const color = { G: "green", R: "red", B: "blue", Y: "yellow" }[x[0]];
    return { color, from: x.slice(1, 3), to: x.length > 3 ? x.slice(3, 5) : x.slice(1, 3) };
  });
}
const games = Pgn.splitGames(SAMPLE_MULTI_PGN);
let out = "", round = 0;
for (const spec of GAMES) {
  const g = games.find(x => x.headers.Event === spec.event);
  if (!g) throw Error("No está en la antología: " + spec.event);
  const r = Pgn.parseGame(g, { lang: "auto" });
  const game = r.game;
  const used = new Set();
  for (const n of Pgn.mainlineFrom(game.root)) {
    const p = n.parent.state, key = (p.t === 1 ? p.full + "." : p.full + "...") + n.san;
    const note = spec.notes[key];
    if (!note) continue;
    used.add(key);
    if (note.nag) n.nag = note.nag;
    if (note.c) n.comment = note.c;
    if (note.sh) n.shapes = shapesFrom(note.sh);
    if (note.v) {
      let v = n.parent;
      note.v.forEach((san, i) => {
        const mv = Chess.parseMove(v.state, san, "en").move;
        v = i === 0 ? Pgn.addMove(v, mv, "variation") : Pgn.addMove(v, mv);
      });
      if (note.vc) v.comment = note.vc;
    }
  }
  const missing = Object.keys(spec.notes).filter(k => !used.has(k));
  if (missing.length) throw Error(`${spec.event}: jugadas que no están en la partida: ${missing.join(", ")}`);
  round++;
  game.root.comment = spec.intro;
  const h = game.headers;
  const keep = { Event: "Curso de partidas magistrales", Site: h.Site || "", Date: h.Date, Round: String(round), White: h.White, Black: h.Black, Result: h.Result, Title: spec.title, Level: spec.level, Annotator: "AjedrezBase" };
  if (h.WhiteElo) keep.WhiteElo = h.WhiteElo;
  if (h.BlackElo) keep.BlackElo = h.BlackElo;
  if (h.ECO) keep.ECO = h.ECO;
  if (/0-1/.test(h.Result)) keep.Orientation = "black";
  game.headers = keep;
  out += Pgn.exportPgn(game, {}).trim() + "\n\n";
}
fs.writeFileSync(path.join(ROOT, "cursos", "partidas.pgn"), out);
console.log(`cursos/partidas.pgn: ${round} partidas comentadas`);
