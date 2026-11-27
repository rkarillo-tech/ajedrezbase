/* ---------- 13c. Estructuras de peones: reconocerlas, su plan típico y partidas modelo (1.54) ----------
   pawnStruct() mira sólo los peones y devuelve un código (0 = ninguna estructura típica): 2·i + 1 si la estructura i
   es de las blancas y 2·i + 2 si es de las negras. Es una función autónoma (no usa nada de fuera) porque también la
   ejecuta el índice de posiciones en su Web Worker: así se pueden buscar partidas con la misma estructura al instante.
   Los textos (STRUCTS) se escriben como si la estructura fuera de las blancas; las casillas entre llaves ({d4}) se
   giran solas cuando es de las negras. */
function pawnStruct(b) {
  // own(f, r) / opp(f, r): ¿hay peón propio / del rival en la columna f (0 = a) y la fila r vista desde el bando S?
  // Orden de comprobación: el erizo antes que el Maróczy (el erizo también tiene c4 y e4 enfrente)
  for (const i of [0, 1, 2, 7, 3, 4, 5, 6, 8, 9, 10, 11, 12]) for (let side = 0; side < 2; side++) {
    const mine = side ? "p" : "P", theirs = side ? "P" : "p";
    const at = (f, r) => b[(8 - (side ? 9 - r : r)) * 16 + f];
    const own = (f, r) => at(f, r) === mine, opp = (f, r) => at(f, r) === theirs;
    const col = (f, who) => { let n = 0; for (let r = 2; r <= 7; r++) if (at(f, r) === who) n++; return n; };
    const ownF = f => col(f, mine), oppF = f => col(f, theirs);
    let ok = false;
    switch (i) {
      case 0: ok = ownF(3) === 1 && (own(3, 4) || own(3, 5)) && !ownF(2) && !ownF(4) && !oppF(3); break;                                     // peón aislado de dama
      case 1: ok = own(2, 4) && own(3, 4) && ownF(2) === 1 && ownF(3) === 1 && !ownF(1) && !ownF(4) && !oppF(2) && !oppF(3); break;         // peones colgantes
      case 2: ok = own(3, 4) && !ownF(2) && (own(4, 2) || own(4, 3)) && opp(3, 5) && (opp(2, 6) || opp(2, 7)) && !oppF(4); break;          // Carlsbad
      case 3: ok = own(2, 4) && own(4, 4) && !ownF(3) && (opp(3, 6) || opp(3, 7)) && !oppF(2); break;                                       // Maróczy
      case 4: ok = own(3, 4) && own(4, 5) && opp(3, 5) && opp(4, 6); break;                                                                 // cadena francesa
      case 5: ok = own(3, 5) && own(4, 4) && opp(3, 6) && opp(4, 5); break;                                                                 // cadena India de Rey
      case 6: ok = own(3, 5) && !ownF(2) && opp(2, 5) && opp(3, 6) && !oppF(4); break;                                                      // Benoni moderna
      case 7: ok = own(0, 3) && own(1, 3) && own(3, 3) && own(4, 3) && !ownF(2) && opp(2, 5) && opp(4, 5) && !oppF(3); break;               // erizo
      case 8: ok = own(3, 3) && own(4, 4) && !ownF(2) && opp(4, 5) && !oppF(3); break;                                                      // Boleslavsky
      case 9: ok = own(3, 3) && own(4, 3) && !ownF(2) && opp(4, 5) && !oppF(3); break;                                                      // Scheveningen
      case 10: ok = own(3, 4) && own(4, 3) && own(5, 4); break;                                                                             // Stonewall
      case 11: ok = own(2, 3) && own(2, 4); break;                                                                                          // peones doblados en c
      case 12: {                                                                                                                            // mayoría en el flanco de dama
        let mq = 0, tq = 0, mt = 0, tt = 0;
        for (let f = 0; f < 8; f++) { const a = ownF(f), c = oppF(f); mt += a; tt += c; if (f < 3) { mq += a; tq += c; } }
        ok = mt === tt && mt > 0 && mq > tq && !ownF(3) && !oppF(3);
        break;
      }
    }
    if (ok) return 2 * i + 1 + side;
  }
  return 0;
}

const STRUCTS = [
  { id: "pad", name: "Peón aislado de dama", short: "peón aislado en {d4}",
    about: "{own} tienen un peón aislado en {d4}: no les quedan peones en las columnas c ni e para defenderlo.",
    own: ["Jugar con iniciativa: el peón da espacio y dos casillas fuertes, {e5} y {c5}, para los caballos.",
      "Atacar el enroque: alfil en la diagonal {b1}–{h7}, dama a {d3} o {c2}, torre a la columna e o por la tercera fila.",
      "Cuando las piezas estén listas, la ruptura {d4}–{d5} abre el juego y libera el peón.",
      "Evitar los cambios: cada pieza que desaparece acerca un final en el que el peón es sólo una debilidad."],
    opp: ["Bloquear la casilla de delante del peón, {d5}, mejor con un caballo, que allí no se puede echar con peones.",
      "Cambiar piezas, sobre todo las menores: en el final, el peón aislado suele perderse.",
      "Presionar el peón con las torres en la columna d y defender bien el enroque mientras dure el ataque."],
    breaks: "{d4}–{d5}", squares: ["{e5}", "{c5}", "{d5}"] },
  { id: "colgantes", name: "Peones colgantes", short: "peones colgantes en {c4} y {d4}",
    about: "{own} tienen dos peones unidos en {c4} y {d4}, sin peones en las columnas b ni e: «colgantes».",
    own: ["Mantenerlos uno al lado del otro: juntos controlan el centro y dan espacio.",
      "Usar las columnas b y e, semiabiertas, para las torres y jugar con actividad.",
      "En el momento oportuno, avanzar uno ({d4}–{d5} o {c4}–{c5}) para abrir líneas o lanzar un ataque."],
    opp: ["Presionarlos con las piezas (torres en las columnas c y d, alfiles apuntándolos) para obligar a uno a avanzar.",
      "Si uno avanza, bloquear delante del otro, que queda retrasado, y atacarlo.",
      "Cambiar piezas: en el final los colgantes son un blanco fácil."],
    breaks: "{d4}–{d5}, {c4}–{c5}", squares: ["{c5}", "{d5}"] },
  { id: "carlsbad", name: "Estructura Carlsbad", short: "Carlsbad",
    about: "{own} tienen {d4} y un peón en la columna e, sin peón de c; {opp} tienen {d5} y un peón en la columna c, sin peón de e. Es la estructura típica del Gambito de Dama con el cambio en d5.",
    own: ["El ataque de minorías: avanzar {b2}–{b4}–{b5} contra la mayoría del rival para dejarle un peón débil en la columna c.",
      "Torres en la columna c, semiabierta, y caballo hacia {c5} o {e5}.",
      "Otro plan, si los reyes lo permiten: f3 y la ruptura central {e3}–{e4}."],
    opp: ["Jugar en el flanco de rey: un caballo en {e4}, piezas apuntando al enroque y, a veces, el avance de peones {f7}–{f5}.",
      "Usar la columna e, semiabierta, para las torres.",
      "Preparar la defensa del flanco de dama para que el avance {b5} no deje un peón débil."],
    breaks: "{b4}–{b5} (minorías), {e3}–{e4}; el rival, {f7}–{f5}", squares: ["{e4}", "{e5}", "{c5}"] },
  { id: "maroczy", name: "Bind de Maróczy", short: "bind de Maróczy",
    about: "{own} tienen peones en {c4} y {e4}, sin peón de d; {opp} tienen el peón de d y ningún peón en la columna c. Típica de la Siciliana con …g6.",
    own: ["Controlar la casilla {d5} y el espacio: el rival está apretado.",
      "Impedir las rupturas del rival ({b7}–{b5} y {d6}–{d5}), que son su contrajuego.",
      "Evitar cambios innecesarios: con más espacio, cuantas más piezas, más le cuesta al rival moverse."],
    opp: ["Paciencia y cambios: cada pieza cambiada alivia la falta de espacio.",
      "Buscar casillas para los caballos ({c5}, {e5}) y preparar las rupturas {b7}–{b5}, {f7}–{f5} o {d6}–{d5}."],
    breaks: "el rival, {b7}–{b5}, {f7}–{f5}, {d6}–{d5}", squares: ["{d5}", "{c5}"] },
  { id: "francesa", name: "Cadena de la Francesa", short: "cadena {d4}–{e5}",
    about: "{own} tienen la cadena {d4}–{e5} frente a {d5}–{e6}: el centro está cerrado y cada bando juega donde apunta su cadena.",
    own: ["Jugar en el flanco de rey, donde apunta la cadena: espacio, piezas hacia el enroque y, a veces, {f2}–{f4}–{f5}.",
      "Mantener la base de la cadena, {d4}: si cae, la cadena se viene abajo.",
      "Sostener el peón de {e5}, que quita al rival la casilla f6 para su caballo."],
    opp: ["Atacar la base de la cadena con {c7}–{c5} contra {d4}, con dama a {b6} y caballo a {c6} presionando.",
      "Socavar la punta con {f7}–{f6} contra {e5}.",
      "Su alfil de casillas claras está encerrado detrás de sus peones: intentar cambiarlo (…b6 y …A{a6})."],
    breaks: "el rival, {c7}–{c5} y {f7}–{f6}; {own2}, {f2}–{f4}–{f5}", squares: ["{e5}", "{d4}"] },
  { id: "indiarey", name: "Cadena de la India de Rey", short: "centro cerrado {d5}–{e4}",
    about: "{own} tienen la cadena {d5}–{e4} frente a {d6}–{e5}: centro bloqueado; cada bando ataca donde apunta su cadena.",
    own: ["Jugar en el flanco de dama: {c4}–{c5}, b4, un caballo hacia {c4} y abrir la columna c.",
      "No reaccionar a destiempo en el flanco de rey: el ataque rival tarda; el tuyo debe llegar antes."],
    opp: ["Atacar en el flanco de rey con peones: {f7}–{f5}, y después …f4 y …g5, contra el enroque.",
      "Cerrar el flanco de dama todo lo posible para ganar tiempo."],
    breaks: "{c4}–{c5}; el rival, {f7}–{f5}", squares: ["{c4}", "{f5}"] },
  { id: "benoni", name: "Benoni moderna", short: "Benoni",
    about: "{own} tienen un peón en {d5} sin peón de c; {opp} tienen {c5} y {d6}, sin peón de e: mayoría central contra mayoría en el flanco de dama.",
    own: ["Mayoría central: preparar la ruptura {e4}–{e5} (a veces con {f2}–{f4}).",
      "Frenar el contrajuego del rival en el flanco de dama (a4 contra …b5) y presionar {d6} con un caballo en {c4}."],
    opp: ["Mayoría en el flanco de dama: …a6, {b7}–{b5} y, si se puede, …c4.",
      "Presionar {e4} por la columna e y aprovechar el alfil en la diagonal larga."],
    breaks: "{e4}–{e5}; el rival, {b7}–{b5}", squares: ["{c4}", "{e4}"] },
  { id: "erizo", name: "Erizo", short: "erizo",
    about: "{own} tienen peones en {a3}, {b3}, {d3} y {e3}, sin peón de c, frente a {c5} y {e5} del rival: pocos metros pero ninguna debilidad fácil.",
    own: ["Defensa elástica: piezas bien colocadas detrás de los peones y paciencia.",
      "Esperar el momento de las rupturas {b3}–{b4} y {d3}–{d4}: si el rival se precipita, el erizo «pincha»."],
    opp: ["Ganar espacio sin prisa e impedir las rupturas controlando {b4} y {d4}.",
      "Presionar el peón de {d3}, el punto débil de la estructura."],
    breaks: "{b3}–{b4}, {d3}–{d4}", squares: ["{d3}", "{b4}", "{d4}"] },
  { id: "boleslavsky", name: "Agujero de Boleslavsky", short: "{d3}–{e4} (Boleslavsky)",
    about: "{own} tienen {d3} y {e4}, sin peón de c, frente a un peón rival en {e5} sin peón de d: la casilla {d4} no se puede defender con peones. Típica de la Najdorf y la Sveshnikov.",
    own: ["Controlar la casilla {d4} con piezas y conservar los defensores (el caballo de f, el alfil de e).",
      "Preparar la ruptura {d3}–{d4}, que libera el juego y deja sin sentido la casilla débil.",
      "Contrajuego en el flanco de dama: la columna c y el avance …b5."],
    opp: ["Ocupar {d4} con un caballo: desde ahí no se le puede echar con peones.",
      "Cambiar los defensores de esa casilla (por ejemplo, el alfil por el caballo que la cubre).",
      "Presionar el peón retrasado de {d3}."],
    breaks: "{d3}–{d4}", squares: ["{d4}", "{d3}"] },
  { id: "scheveningen", name: "Pequeño centro (Scheveningen)", short: "pequeño centro {d3}–{e3}",
    about: "{own} tienen {d3} y {e3}, sin peón de c, frente a un peón rival en {e5} sin peón de d: una estructura sólida y flexible.",
    own: ["Contrajuego en el flanco de dama: la columna c semiabierta y …b5.",
      "Las rupturas centrales {d3}–{d4} y {e3}–{e4}, cuando las piezas las apoyan, liberan el juego."],
    opp: ["Atacar en el flanco de rey con los peones (g4–g5 o f4–f5) y llevar las piezas hacia el enroque.",
      "Vigilar las rupturas centrales: son la mejor defensa del rival contra el ataque."],
    breaks: "{d3}–{d4}, {e3}–{e4}", squares: ["{d4}", "{e4}"] },
  { id: "stonewall", name: "Muro de piedra (Stonewall)", short: "Stonewall",
    about: "{own} tienen peones en {d4}, {e3} y {f4}: un muro que controla {e5} pero deja débil la casilla {e4}.",
    own: ["Un caballo en {e5} es la pieza clave de la estructura.",
      "Ataque en el flanco de rey: torre por la tercera fila, el avance g4 y la dama hacia el enroque rival.",
      "El alfil de casillas oscuras queda malo detrás de los peones: intentar cambiarlo."],
    opp: ["Ocupar la casilla débil {e4} con un caballo.",
      "Cambiar el alfil bueno del rival (el de casillas claras) y jugar en el centro y el flanco de dama, con {c7}–{c5}."],
    breaks: "{e3}–{e4}; el rival, {c7}–{c5}", squares: ["{e5}", "{e4}"] },
  { id: "doblados", name: "Peones doblados en c", short: "peones doblados en {c3}–{c4}",
    about: "{own} tienen los peones doblados en {c3} y {c4} (como en la Nimzoindia tras el cambio en c3): peor estructura, a cambio de la pareja de alfiles y el centro.",
    own: ["Abrir el juego (f3 y e4) para que los dos alfiles tengan diagonales.",
      "Buscar la iniciativa en el centro o en el flanco de rey antes de que pesen los peones."],
    opp: ["Mantener la posición cerrada, donde los caballos valen tanto como los alfiles.",
      "Atacar el peón débil de {c4}: …b6, …A{a6}, un caballo hacia {a5} y una torre en la columna c."],
    breaks: "{e3}–{e4} (abrir para los alfiles)", squares: ["{c4}", "{e4}"] },
  { id: "mayoria", name: "Mayoría en el flanco de dama", short: "mayoría en el flanco de dama",
    about: "Con los mismos peones, {own2} tienen más en el flanco de dama (columnas a–c) que el rival.",
    own: ["Crear un peón pasado avanzando la mayoría, empezando por el peón que no tiene enfrente a ninguno rival.",
      "Pensar en el final: un pasado lejos del otro rey suele decidir la partida."],
    opp: ["Usar la mayoría propia (en el centro o el flanco de rey) para atacar antes de que llegue el final.",
      "Frenar la mayoría rival bloqueándola con piezas."],
    breaks: "avanzar la mayoría (b4–b5 o c4–c5)", squares: [] }
];

/* Lo que se enseña de una estructura, ya con los colores y las casillas del bando que la tiene */
function structInfo(code) {
  if (!code) return null;
  const s = STRUCTS[(code - 1) >> 1], black = !!((code - 1) & 1);
  const own = black ? "Las negras" : "Las blancas", opp = black ? "las blancas" : "las negras";
  const flip = t => t.replace(/\{own\}/g, own).replace(/\{own2\}/g, own.toLowerCase()).replace(/\{opp\}/g, opp)
    .replace(/\{([a-h])([1-8])\}/g, (_, f, r) => f + (black ? 9 - +r : +r));
  return {
    code, id: s.id, black, name: s.name, short: flip(s.short), about: flip(s.about),
    owner: black ? "negras" : "blancas", other: black ? "blancas" : "negras",
    own: s.own.map(flip), opp: s.opp.map(flip), breaks: flip(s.breaks), squares: s.squares.map(flip)
  };
}
const structOfNode = n => structInfo(pawnStruct(n.state.b));

/* ---------- El recuadro «Estructura de peones» de Estudio ---------- */
const Struct = { code: -1, models: null, busy: false, shown: null };
function renderStructure() {
  const box = $("structBox");
  if (!box) return;
  const code = quiz() || editor.active ? 0 : pawnStruct(cur().state.b);
  box.hidden = !code;
  if (Struct.shown && Struct.shown.node !== cur()) { Struct.shown = null; if ($("structShowBtn")) $("structShowBtn").textContent = "👁 Ver las casillas clave"; }
  if (code === Struct.code) return;
  Struct.code = code;
  Struct.models = null;
  if (!code) return;
  const st = structInfo(code);
  const dup = st.name.toLowerCase().includes(st.short.toLowerCase());
  $("structName").textContent = dup ? st.name : `${st.name} · ${st.short}`;
  const li = a => a.map(t => `<li>${esc(t)}</li>`).join("");
  $("structBody").innerHTML = `<p class="small">${esc(st.about)}</p>
    <div class="struct-plans">
      <div><b>Plan de las ${st.owner}</b><ul>${li(st.own)}</ul></div>
      <div><b>Plan de las ${st.other}</b><ul>${li(st.opp)}</ul></div>
    </div>
    <p class="small"><b>Rupturas típicas:</b> ${esc(st.breaks)}${st.squares.length ? ` · <b>casillas clave:</b> ${st.squares.map(esc).join(", ")}` : ""}</p>
    <div class="controls">
      ${st.squares.length ? `<button class="sm-btn" id="structShowBtn" type="button" title="Marca en el tablero las casillas clave de esta estructura">👁 Ver las casillas clave</button>` : ""}
      <button class="sm-btn info-btn" id="structModelsBtn" type="button" title="Partidas de los cursos, de tu biblioteca y del .pgn abierto con esta misma estructura">♟ Partidas modelo con esta estructura</button>
    </div>
    <div id="structModels" class="struct-models" aria-live="polite"></div>`;
  if ($("structShowBtn")) $("structShowBtn").onclick = () => structShowSquares(st);
  $("structModelsBtn").onclick = () => structShowModels(code);
}
function structShowSquares(st) {
  const n = cur();
  // Marcas de paso (no se guardan en la partida): un círculo amarillo en cada casilla clave; otro clic las quita
  Struct.shown = Struct.shown && Struct.shown.node === n ? null : { node: n, squares: st.squares.map(sq => Chess.sqIdx(sq)) };
  $("structShowBtn").textContent = Struct.shown ? "🙈 Ocultar las casillas clave" : "👁 Ver las casillas clave";
  renderShapes();
}
/* Partidas con la misma estructura: tus partidas y el .pgn abierto (con el índice) y las de los cursos.
   Se prefieren las que la mantienen más tiempo; se abre cada una en el momento en que aparece */
async function structModelGames(code, max = 8) {
  const out = [];
  if (Lib.games.size || Coll.games.length) {
    for (const { src, e } of await gameIndex()) {
      if (!e.st || (src.lib != null && src.lib === ui.libId)) continue;
      let at = -1, len = 0;
      for (let i = 8; i < e.st.length; i++) if (e.st[i] === code) { if (at < 0) at = i; len++; }
      if (at < 0 || len < 4) continue;
      const h = gidxHeaders(src);
      out.push(Object.assign({ title: `${h.White || "?"} – ${h.Black || "?"}`, h, where: src.lib != null ? "tu biblioteca" : "el .pgn abierto", label: gidxLabel(e, at), len, path: gidxUcis(e).slice(0, at) }, src));
    }
  }
  for (const id of MODEL_COURSES) {
    const ls = courseLessons(id);
    for (let i = 0; i < ls.length; i++) {
      let g;
      try { g = Pgn.parseGame(ls[i].g, { lang: "en" }).game; } catch { continue; }
      let at = null, len = 0, ply = 0;
      for (let n = g.root; n; n = n.children[0], ply++) { if (ply >= 8 && pawnStruct(n.state.b) === code) { if (!at) at = n; len++; } if (!n.children.length) break; }
      if (!at || len < 4) continue;
      const c = COURSES.find(x => x.id === id) || {};
      out.push({ course: id, i, h: g.headers, title: `${c.name || "Curso"} · ${g.headers.Title || "Lección"}`, where: "los cursos", label: at.parent ? `${numPrefix(at.parent.state)}${sanOf(at.parent.state, at.uci)}` : "el inicio", len, path: Pgn.pathTo(at).slice(1).map(x => x.uci) });
    }
  }
  return out.sort((a, b) => (b.course ? 4 : 0) + Math.min(b.len, 40) - ((a.course ? 4 : 0) + Math.min(a.len, 40))).slice(0, max);
}
async function structShowModels(code) {
  if (Struct.busy) return;
  const box = $("structModels");
  Struct.busy = true;
  box.innerHTML = `<span class="small">Buscando…</span>`;
  try {
    const list = Struct.models && Struct.models.code === code ? Struct.models.list : await structModelGames(code);
    Struct.models = { code, list };
    if (Struct.code !== code) return;
    if (!list.length) { box.innerHTML = `<span class="small">No hay partidas con esta estructura en los cursos ni en tu biblioteca. Guarda partidas o abre un .pgn en 📚 Biblioteca › 🗂 Abrir .pgn para tener más ejemplos.</span>`; return; }
    box.innerHTML = list.map((g, k) => `<div class="struct-model"><span>${esc(g.title)}<span class="small"> · ${esc(g.where)}, desde ${esc(g.label)}${g.h && g.h.Result && g.h.Result !== "*" ? " · " + esc(g.h.Result) : ""}</span></span><button class="sm-btn" type="button" data-sm="${k}">Abrir</button></div>`).join("");
    box.querySelectorAll("[data-sm]").forEach(b => b.onclick = () => openModelGame(list[+b.dataset.sm]));
  } finally { Struct.busy = false; }
}
