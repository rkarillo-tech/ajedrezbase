#!/usr/bin/env node
/* Genera cursos/repertorios.pgn: repertorios de aperturas listos para entrenar.
   Cada repertorio es un árbol de variantes construido a partir de líneas (la primera de cada rama es la principal)
   y de comentarios asociados a la secuencia de jugadas que lleva a ellos.
   node tools/repertorios.js */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const src = ["core.js", "pgn.js"].map(f => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");
const { Chess, Pgn } = new Function(src + ";return { Chess, Pgn };")();

const REPS = [
  {
    title: "Repertorio con blancas: 1.e4 sencillo y sólido", side: "white", level: "Principiante",
    intro: "Un repertorio con 1.e4 para jugadores de club: posiciones naturales, con planes claros y poca teoría. Contra 1...e5, la Italiana tranquila (c3 y d3); contra la Siciliana, la Alapin (2.c3); contra la Francesa y la Caro-Kann, la variante del avance (3.e5), y respuestas sencillas al resto. Entrénalo con 🎯: tú juegas con blancas y el rival elige al azar entre sus respuestas. Repite hasta que lo hagas sin fallos; los repasos se espacian solos.",
    lines: [
      "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 a4 Ba7 Nbd2",
      "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3 Na5 Bb5",
      "e4 e5 Nf3 Nc6 Bc4 Be7 d4 exd4 Nxd4",
      "e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7 Be2 O-O O-O",
      "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3",
      "e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6 Be2",
      "e4 c5 c3 d5 exd5 Qxd5 d4 Nc6 Nf3 Bg4 Be2 cxd4 cxd4",
      "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4",
      "e4 c5 c3 e6 d4 d5 e5",
      "e4 c5 c3 d6 d4 Nf6 Bd3",
      "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Be2 cxd4 cxd4 Nh6 Nc3",
      "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Bd7 Be2 Nge7 O-O",
      "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3",
      "e4 c6 d4 d5 e5 c5 dxc5 e6 Be3",
      "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5 Bc4 e6 Bd2",
      "e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 Be2 Bg7 O-O",
      "e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3",
      "e4 g6 d4 Bg7 Nc3 d6 Be3 a6 Qd2",
      "e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O"
    ],
    notes: {
      "e4": "Ocupa el centro y abre la diagonal del alfil de f1 y de la dama.",
      "e4 e5 Nf3 Nc6 Bc4": "La Italiana: el alfil apunta a f7. Plan: c3, d3, O-O, Te1 y Cbd2-f1-g3, como en la lección del curso de aperturas.",
      "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3": "La versión tranquila (Giuoco Pianissimo): centro sólido, sin teoría forzada.",
      "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 a4": "Gana espacio en el flanco de dama y evita …b5. Después, Cbd2-f1-g3 y ataque en el flanco de rey.",
      "e4 e5 Nf3 Nc6 Bc4 Nf6 d3": "Contra los Dos Caballos, 4.d3 evita las complicaciones del 4.Cg5 y mantiene el mismo plan.",
      "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3 Na5": "Las negras buscan el alfil.",
      "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3 Na5 Bb5": "El alfil se aparta a b5, donde sigue activo; si …c6, Aa4 y Ac2: el alfil se conserva.",
      "e4 e5 Nf3 Nc6 Bc4 Be7": "Una jugada pasiva: aprovecha para ocupar el centro con d4.",
      "e4 e5 Nf3 d6": "La Philidor: sólida pero pasiva. Abre el centro con d4: tendrás más espacio.",
      "e4 e5 Nf3 Nf6": "La Petrov: las negras contraatacan e4. Primero 3.Cxe5 y, ojo, nunca 4.Cxf7?: se recupera el peón con calma.",
      "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3": "¡No 4.Cxf7? Rxf7 y las negras ganan una pieza por un peón! El caballo vuelve y luego se recupera e4.",
      "e4 c5 c3": "La Alapin: prepara d4 para formar un centro de peones. Evita la teoría de la Siciliana abierta.",
      "e4 c5 c3 d5": "La respuesta más directa: las negras atacan e4 enseguida.",
      "e4 c5 c3 d5 exd5 Qxd5 d4": "La dama negra en d5 no puede ser atacada por Cc3 (lo impide el peón de c3), pero las blancas tienen el centro.",
      "e4 c5 c3 Nf6": "Ataca e4: el peón avanza ganando tiempo.",
      "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4": "El alfil echa al caballo de d5. Las blancas tienen más espacio y un desarrollo cómodo.",
      "e4 c5 c3 e6 d4 d5 e5": "Transpone a una Francesa del avance, que conoces de este mismo repertorio.",
      "e4 e6 d4 d5 e5": "La variante del avance: ganas espacio y encierras el alfil de c8. Tu base es d4: defiéndela con c3, Cf3 y Ae2.",
      "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6": "Las negras presionan d4 y b2.",
      "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Be2 cxd4 cxd4 Nh6 Nc3": "¡No 9.Axh6? que abre la columna g! El caballo de c3 defiende d5 y, si …Cf5, Ca4 echa a la dama.",
      "e4 c6 d4 d5 e5": "Contra la Caro-Kann, también el avance: el alfil negro sale a f5, pero las blancas tienen más espacio.",
      "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3": "La «variante de los jugadores cortos»: desarrollo sencillo y presión sobre c5.",
      "e4 d5": "La Escandinava: las negras atacan e4 en la primera jugada.",
      "e4 d5 exd5 Qxd5 Nc3": "Desarrollo con tiempo: la dama negra tiene que moverse otra vez.",
      "e4 d6": "La Pirc: las negras dejan el centro a las blancas y lo atacarán después.",
      "e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2": "El «ataque 150»: Ah6 para cambiar el alfil de g7 y, si enroca corto, ataque con h4-h5.",
      "e4 g6": "La Moderna: el mismo plan que contra la Pirc.",
      "e4 Nf6": "La Alekhine: provoca el avance de los peones para atacarlos después.",
      "e4 Nf6 e5 Nd5 d4 d6 Nf3": "La variante moderna: sin avanzar más peones, desarrollo sencillo y ventaja de espacio."
    }
  },
  {
    title: "Repertorio con negras contra 1.e4: la Caro-Kann", side: "black", level: "Intermedio",
    intro: "La Caro-Kann es una defensa sólida que se aprende con ideas claras: …c6 y …d5 para discutir el centro, el alfil de c8 sale ANTES de jugar …e6, y estructuras sin debilidades que llevan a finales cómodos. Este repertorio cubre la clásica (3.Cc3), el avance (3.e5), la del cambio y el ataque Panov, y las respuestas menos habituales. Entrénalo con 🎯 jugando con negras.",
    lines: [
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6 Bd2 Ngf6 O-O-O Be7",
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 Nf3 Nd7 h4 h6 h5 Bh7 Bd3 Bxd3 Qxd3 e6",
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Nc5 e5",
      "e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5 Ng3 Bg6",
      "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 cxd4 Nxd4 Ne7",
      "e4 c6 d4 d5 e5 Bf5 Nc3 e6 g4 Bg6 Nge2 c5",
      "e4 c6 d4 d5 e5 Bf5 c4 e6 Nc3 Ne7",
      "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3 Qd7",
      "e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5",
      "e4 c6 d4 d5 f3 e6 Nc3 Qb6",
      "e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6",
      "e4 c6 c4 d5 exd5 cxd5 cxd5 Nf6",
      "e4 c6 d3 d5 Nd2 e5 Ngf3 Bd6"
    ],
    notes: {
      "e4 c6": "Prepara …d5 con el apoyo del peón de c6. A diferencia de la Francesa, el alfil de c8 no queda encerrado.",
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5": "¡El alfil sale antes de jugar …e6! Ataca el caballo.",
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6": "Hay que dejar una casilla al alfil: si 6...h5?!, las negras debilitan g5.",
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7": "Controla e5 para que no se instale el caballo blanco.",
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6": "Ahora sí …e6: el alfil ya se ha cambiado. Estructura muy sólida; las negras enrocarán (a menudo largo) y buscarán …c5.",
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Nc5 e5": "Contra 5.Cc5, que ataca b7, el contragolpe …e5 iguala.",
      "e4 c6 d4 d5 e5": "El avance: las blancas ganan espacio. El alfil sale a f5 antes de …e6 y luego se ataca la cadena con …c5.",
      "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5": "El golpe a la base de la cadena (d4): la misma idea que en la Francesa.",
      "e4 c6 d4 d5 e5 Bf5 Nc3 e6 g4": "La variante agresiva: las blancas persiguen al alfil. Retíralo a g6 y contraataca con …c5.",
      "e4 c6 d4 d5 exd5 cxd5": "La variante del cambio: estructura simétrica, pero las negras están cómodas.",
      "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4": "El alfil sale activo antes de …e6, como siempre en la Caro-Kann.",
      "e4 c6 d4 d5 exd5 cxd5 c4": "El ataque Panov: lleva a posiciones de peón aislado (repasa la lección de estrategia). Las negras bloquean en d5.",
      "e4 c6 d4 d5 f3": "La variante de la fantasía: …e6 y …Db6 presionan d4 y b2.",
      "e4 c6 Nc3 d5 Nf3 Bg4": "Contra los Dos Caballos, el alfil clava el caballo y se cambia: estructura sólida.",
      "e4 c6 c4 d5": "Contra 2.c4, …d5 igual: tras los cambios, el peón de d5 se recupera.",
      "e4 c6 d3 d5 Nd2 e5": "Contra la India de rey invertida, las negras ocupan el centro con comodidad."
    }
  },
  {
    title: "Repertorio con negras contra 1.d4: Gambito de Dama Declinado", side: "black", level: "Intermedio",
    intro: "Contra 1.d4, la defensa clásica: …d5 y …e6 mantienen el peón central y llevan a posiciones sólidas, como jugaban Capablanca o Carlsen. El gran problema es el alfil de c8: el plan es liberarlo con …c5 o …e5, o con …b6 y …Ab7. El repertorio cubre el Gambito de Dama (con la variante Tartakower), la del cambio, el Catalán, el sistema Londres y el Colle. Entrénalo con 🎯 jugando con negras.",
    lines: [
      "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5",
      "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bxf6 Bxf6 Qc2 c5",
      "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3 Nbd7 Qc2 O-O Nf3 Re8 O-O Nf8",
      "d4 d5 c4 e6 Nc3 Nf6 Nf3 Be7 Bf4 O-O e3 c5 dxc5 Bxc5",
      "d4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O dxc4 Qc2 a6",
      "d4 d5 c4 e6 Nf3 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6",
      "d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O",
      "d4 d5 Nf3 Nf6 e3 e6 Bd3 c5 b3 Nc6 O-O Bd6 Bb2 O-O",
      "d4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4"
    ],
    notes: {
      "d4 d5": "Ocupa el centro igual que las blancas.",
      "d4 d5 c4 e6": "Defiende d5 con un peón. El alfil de c8 queda tapado: todo el plan de las negras consistirá en liberarlo.",
      "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7": "Deshace la clavada: el alfil de e7 defiende el caballo.",
      "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6": "La variante Tartakower: el alfil de c8 saldrá por b7. Es la forma más moderna de resolver su problema.",
      "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5": "Cambiar piezas alivia la falta de espacio.",
      "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bxf6 Bxf6 Qc2 c5": "Si las blancas entregan el alfil, las negras se quedan con la pareja de alfiles y rompen con …c5.",
      "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5": "La variante del cambio: estructura Carlsbad (repasa el ataque de minorías en el curso de estrategia). Las negras buscan juego en el flanco de rey con …Cf8-g6 o …Ce4.",
      "d4 d5 c4 e6 Nc3 Nf6 Nf3 Be7 Bf4 O-O e3 c5": "Contra el alfil en f4, la ruptura …c5 es la respuesta más activa.",
      "d4 d5 c4 e6 Nf3 Nf6 g3": "El Catalán: el alfil de g2 presiona el flanco de dama.",
      "d4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O dxc4": "Las negras toman el peón de c4 y lo defenderán un rato con …a6 y …b5 o lo devolverán a cambio de desarrollo.",
      "d4 d5 Bf4": "El sistema Londres (lo tienes en el curso de aperturas desde el lado blanco).",
      "d4 d5 Bf4 Nf6 e3 c5": "Contra el Londres, el ataque inmediato a d4 con …c5 es lo más incómodo para las blancas.",
      "d4 d5 Nf3 Nf6 e3 e6 Bd3 c5": "El Colle-Zukertort: las blancas quieren atacar el enroque con Ce5 y f4. Las negras desarrollan con naturalidad y presionan el centro.",
      "d4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 c3 Qb6": "Ataca b2: si las blancas lo defienden con la dama, …c4 gana espacio en el flanco de dama."
    }
  }
];

let out = "", round = 0;
for (const rep of REPS) {
  const g = Pgn.newGame();
  for (const line of rep.lines) {
    let n = g.root;
    for (const san of line.split(/\s+/)) {
      let mv;
      try { mv = Chess.parseMove(n.state, san, "en").move; }
      catch (e) { throw Error(`${rep.title}: «${san}» ilegal en la línea «${line}»`); }
      n = Pgn.addMove(n, mv);
    }
  }
  const used = new Set();
  const walk = (n, seq) => {
    for (const c of n.children) {
      const s = seq ? seq + " " + c.san.replace(/[+#]/g, "") : c.san.replace(/[+#]/g, "");
      if (rep.notes[s]) { c.comment = rep.notes[s]; used.add(s); }
      walk(c, s);
    }
  };
  walk(g.root, "");
  const missing = Object.keys(rep.notes).filter(k => !used.has(k));
  if (missing.length) throw Error(`${rep.title}: comentarios sin jugada: ${missing.join(" | ")}`);
  round++;
  g.root.comment = rep.intro;
  g.headers = { Event: "Repertorios de aperturas", Site: "AjedrezBase", Date: "????.??.??", Round: String(round), White: rep.side === "white" ? "Tu repertorio" : "Rival", Black: rep.side === "white" ? "Rival" : "Tu repertorio", Result: "*", Title: rep.title, Level: rep.level, Annotator: "AjedrezBase", Type: "repertorio" };
  if (rep.side === "black") g.headers.Orientation = "black";
  out += Pgn.exportPgn(g, {}).trim() + "\n\n";
}
fs.writeFileSync(path.join(ROOT, "cursos", "repertorios.pgn"), out);
console.log(`cursos/repertorios.pgn: ${round} repertorios`);
