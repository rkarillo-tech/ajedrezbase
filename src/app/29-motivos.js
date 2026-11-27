/* ---------- 18b. Motivos tácticos: por qué una jugada gana o pierde ----------
   Con las reglas del ajedrez y la línea del motor, nada más. motifGood dice qué consigue una jugada buena (mate,
   horquilla, ataque a la descubierta, clavada, captura de una pieza sin defensa, material que gana); motifBad, por
   qué falla una jugada (la pieza queda donde la capturan, deja otra sin defensa, permite una horquilla, una clavada o
   un ataque a la descubierta, o el material que se pierde). Cada frase se comprueba en el tablero: si no hay un
   motivo claro, no se dice nada (y queda la valoración del motor). */
const MOT_V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const MOT_RAYS = { b: [15, 17, -15, -17], r: [1, -1, 16, -16] };
const motType = (st, sq) => st.b[sq].toLowerCase();
const motName = (st, sq) => `${PIECE_ART[motType(st, sq)]} de ${Chess.sqName(sq)}`;
const motFem = (st, sq) => ["r", "q"].includes(motType(st, sq));
const motJoin = a => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1]);
const motDefended = (st, sq) => Chess.attackers(st.b, sq, Chess.color(st.b[sq])).length > 0;
/* Las piezas del rival que ataca la pieza de sq */
function motTargets(st, sq) {
  const c = Chess.color(st.b[sq]), out = [];
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const x = st.b[i];
    if (x !== "." && Chess.color(x) === -c && Chess.attackers(st.b, i, c).includes(sq)) out.push(i);
  }
  return out;
}
/* Horquilla: la pieza de sq ataca a la vez dos o más piezas que valen más que ella, están sin defensa o son el rey */
function motFork(st, sq) {
  const v = MOT_V[motType(st, sq)];
  const t = motTargets(st, sq).filter(i => { const k = motType(st, i); return k === "k" || MOT_V[k] > v || (MOT_V[k] >= 3 && !motDefended(st, i)); });
  return t.length >= 2 ? t.sort((a, b) => MOT_V[motType(st, b)] - MOT_V[motType(st, a)]) : null;
}
function motForkText(st, sq, targets) {
  const others = targets.filter(i => motType(st, i) !== "k").map(i => motName(st, i));
  return targets.some(i => motType(st, i) === "k") ? `da jaque al rey y ataca ${motJoin(others)}` : `ataca a la vez ${motJoin(others)}`;
}
/* Clavadas que hace la pieza de sq: detrás de la pieza atacada está el rey u otra que vale más */
function motPins(st, sq) {
  const k = motType(st, sq), c = Chess.color(st.b[sq]);
  const dirs = k === "q" ? [...MOT_RAYS.b, ...MOT_RAYS.r] : MOT_RAYS[k];
  if (!dirs) return [];
  const out = [];
  for (const d of dirs) {
    let x = sq + d, first = -1;
    while (!(x & 0x88)) {
      const p = st.b[x];
      if (p !== ".") {
        if (Chess.color(p) === c) break;
        if (first < 0) first = x;
        else {
          const a = motType(st, first), b = motType(st, x);
          if (a !== "k" && (b === "k" || MOT_V[b] > MOT_V[a]) && (a !== "p" || b === "k")) out.push({ pinned: first, behind: x });
          break;
        }
      }
      x += d;
    }
  }
  return out;
}
/* Ataque a la descubierta: al moverse una pieza, otra del mismo bando ataca de pronto al rey, la dama o una torre */
function motDiscovered(before, after, m) {
  const c = before.t, out = [];
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const x = after.b[i];
    if (x === "." || Chess.color(x) !== -c || !"kqr".includes(x.toLowerCase())) continue;
    for (const by of Chess.attackers(after.b, i, c)) if (by !== m.to && !Chess.attackers(before.b, i, c).includes(by)) out.push({ by, target: i });
  }
  return out.sort((a, b) => MOT_V[motType(after, b.target)] - MOT_V[motType(after, a.target)]);
}
/* Material que gana quien mueve en s al seguir la línea (en puntos: peón 1, pieza menor 3, torre 5, dama 9) */
function motGain(s, ucis, plies = 8) { return Math.round((materialBalance(playUcis(s, ucis, plies)) - materialBalance(s)) * s.t); }

/* Qué consigue la jugada pv[0] en s (frase corta, sin punto final) */
function motifGood(s, pv, ev) {
  const m = pv && pv[0] ? Chess.moveFromUci(s, pv[0]) : null;
  if (!m) return "";
  const a = Chess.apply(s, m), me = s.t;
  if (ev && ev.mate != null && ev.mate !== 0 && ev.mate * me > 0) return ev.mate * me === 1 ? "es jaque mate" : `lleva al mate en ${Math.abs(ev.mate)}`;
  const parts = [];
  const fork = motFork(a, m.to);
  if (fork) parts.push(`horquilla: ${motForkText(a, m.to, fork)}`);
  const disc = motDiscovered(s, a, m)[0];
  if (!fork && disc) parts.push(motType(a, disc.target) === "k" ? `jaque a la descubierta con ${motName(a, disc.by)}` : `ataque a la descubierta: ${motName(a, disc.by)} ataca ${motName(a, disc.target)}`);
  const pin = motPins(a, m.to)[0];
  if (!fork && !disc && pin) parts.push(`clava ${motName(a, pin.pinned)} contra ${motType(a, pin.behind) === "k" ? "el rey" : motName(a, pin.behind)}`);
  if (m.captured !== "." && m.flag !== "ep" && m.captured.toLowerCase() !== "p" && !Chess.attackers(s.b, m.to, -me).length) parts.push(`captura ${motName(s, m.to)}, que estaba sin defensa`);
  const g = motGain(s, pv);
  if (g >= 2) parts.push(`gana unos ${g} puntos de material`);
  return parts.join("; ");
}
/* Por qué falla la jugada m en s, si el motor responde con pv (frase completa, o "" si no hay un motivo claro) */
function motifBad(s, m, pv, ev) {
  const me = s.t;
  if (ev && ev.mate != null && ev.mate !== 0 && ev.mate * me < 0) return "";   // el mate ya lo dice el comentario
  const a = Chess.apply(s, m), r = pv && pv[0] ? Chess.moveFromUci(a, pv[0]) : null;
  if (!r) return "";
  const ra = Chess.apply(a, r), reply = lineText(a, [pv[0]], 1);
  const lost = -motGain(s, [Chess.uci(m), ...pv], 9);
  if (lost < 2) return "";
  const pts = `pierdes unos ${lost} puntos de material`;
  if (r.captured !== "." && r.to === m.to) return `${cap(motName(a, m.to))} queda donde ${motFem(a, m.to) ? "la" : "lo"} captura ${motName(a, r.from)} (${reply}), sin compensación suficiente: ${pts}.`;
  if (r.captured !== "." && !motDefended(a, r.to)) {
    const wasDef = Chess.attackers(s.b, r.to, me).length > 0;
    return wasDef ? `Al mover, dejas sin defensa ${motName(a, r.to)}, que se pierde con ${reply}: ${pts}.` : `${cap(motName(a, r.to))} estaba sin defensa y se pierde con ${reply}: ${pts}.`;
  }
  const fork = motFork(ra, r.to);
  if (fork) return `Permite una horquilla: con ${reply}, ${motName(ra, r.to)} ${motForkText(ra, r.to, fork)}. Al final ${pts}.`;
  const disc = motDiscovered(a, ra, r)[0];
  if (disc) return `Permite un ataque a la descubierta: con ${reply}, ${motName(ra, disc.by)} ataca ${motName(ra, disc.target)}. Al final ${pts}.`;
  const pin = motPins(ra, r.to)[0];
  if (pin) return `Permite una clavada: ${reply} clava ${motName(ra, pin.pinned)} contra ${motType(ra, pin.behind) === "k" ? "el rey" : motName(ra, pin.behind)}. Al final ${pts}.`;
  return `El rival gana material con ${lineText(a, pv, 4)}: ${pts}.`;
}
/* Una pista que no revela la jugada: el tipo de motivo que hay en la posición */
function motifHint(s, pv, ev) {
  const g = motifGood(s, pv, ev);
  if (!g) return "";
  if (/jaque mate|al mate/.test(g)) return "Hay un mate: busca las jugadas que dan jaque.";
  if (/^horquilla/.test(g)) return /jaque/.test(g) ? "Busca una horquilla: una jugada que dé jaque y ataque otra pieza a la vez." : "Busca una horquilla: una pieza que ataque dos a la vez.";
  if (/descubierta/.test(g)) return "Busca un ataque a la descubierta: al mover una pieza, otra queda atacando.";
  if (/^clava/.test(g)) return "Busca una clavada: una pieza del rival no se puede mover sin dejar otra más valiosa (o al rey) atacada.";
  if (/sin defensa/.test(g)) return "Hay una pieza del rival sin defensa.";
  if (/gana unos/.test(g)) return "Hay una jugada que gana material: mira primero los jaques, las capturas y las amenazas.";
  return "";
}
