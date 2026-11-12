/* ---------- 19d. «🔎 Lee el tablero»: el método previo al cálculo ----------
   Antes de calcular, los entrenadores recomiendan recorrer siempre el mismo orden:
   1) el material (qué necesitas), 2) la seguridad de los dos reyes, 3) lo que amenaza el RIVAL (sus ataques, rayos X,
   baterías y clavadas, y tus piezas sueltas), 4) lo mismo con TUS piezas, y 5) las jugadas forzadas (jaques, capturas y
   amenazas), que son las candidatas a calcular primero.
   boardScan() hace esa lectura sin motor (sólo con las reglas); el recuadro la enseña paso a paso con flechas. */
const SCAN_PTS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const SCAN_DIRS = { b: [-17, -15, 15, 17], r: [-16, -1, 1, 16], q: [-17, -16, -15, -1, 1, 15, 16, 17] };
const scanOn = i => (i & 0x88) === 0;
const scanSide = c => (c === 1 ? "blancas" : "negras");
const scanPiece = (b, i) => `${PIECE_ART[b[i].toLowerCase()]} de ${Chess.sqName(i)}`;
function scanSquares(fn) { for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } fn(i); } }

/* Una pieza está «en peligro» si la ataca otra de menos valor, o si tiene más atacantes que defensores; «suelta» si nadie la defiende */
function scanPieceSafety(b, i) {
  const p = b[i], c = Chess.color(p), v = SCAN_PTS[p.toLowerCase()];
  const att = Chess.attackers(b, i, -c), def = Chess.attackers(b, i, c);
  const cheapest = att.length ? Math.min(...att.map(x => SCAN_PTS[b[x].toLowerCase()] || 0.5)) : Infinity;
  const danger = att.length > 0 && (cheapest < v || def.length === 0 || att.length > def.length);
  return { sq: i, att, def, danger, loose: def.length === 0, v };
}

/* Mira cada pieza de largo alcance de «c» hasta el borde del tablero (rayos X): clavadas, enfiladas, baterías y descubiertas */
function scanLines(b, c) {
  const out = [], seen = new Set();
  const val = p => (p.toLowerCase() === "k" ? 100 : SCAN_PTS[p.toLowerCase()]);
  const firstFrom = (x, d) => { for (let y = x + d; scanOn(y); y += d) if (b[y] !== ".") return y; return null; };
  scanSquares(i => {
    const p = b[i];
    if (p === "." || Chess.color(p) !== c || !SCAN_DIRS[p.toLowerCase()]) return;
    const t = p.toLowerCase();
    for (const d of SCAN_DIRS[t]) {
      const a = firstFrom(i, d);
      if (a == null) continue;
      const z = firstFrom(a, d), pa = b[a], pz = z != null ? b[z] : ".", diag = Math.abs(d) === 15 || Math.abs(d) === 17;
      if (Chess.color(pa) === -c && pz !== "." && Chess.color(pz) === -c) {
        // Dos piezas del rival en la línea: clavada (la de detrás vale más) o enfilada (la de delante vale más)
        // (sólo cuenta si lo de detrás es importante: una torre, la dama o el rey; en la enfilada, lo de delante también)
        if (pa.toLowerCase() !== "k" && val(pz) > val(pa) && val(pz) >= 5) out.push({ kind: "pin", from: i, a, z, abs: pz.toLowerCase() === "k" });
        else if (val(pa) > val(pz) && val(pa) >= 5 && val(pz) >= 3) out.push({ kind: "skewer", from: i, a, z });
      } else if (Chess.color(pa) === c && pz !== "." && Chess.color(pz) === -c && (pz.toLowerCase() === "k" || val(pz) > val(p))
        && !(pa.toLowerCase() === "q" || pa.toLowerCase() === (diag ? "b" : "r"))) {   // si la de en medio también va por esa línea, es una batería
        // Una pieza propia en medio: si se aparta, ataque (o jaque) a la descubierta
        out.push({ kind: "discovery", from: i, a, z, check: pz.toLowerCase() === "k" });
      }
      // Batería: otra pieza propia que se mueve por la misma línea (dama con torre o alfil, o dos torres)
      const ta = pa.toLowerCase();
      if (Chess.color(pa) === c && (ta === "q" || ta === (diag ? "b" : "r")) && (t === "q" || t === (diag ? "b" : "r"))) {
        const key = [Math.min(i, a), Math.max(i, a)].join("-");
        if (seen.has(key)) continue;
        seen.add(key);
        const ahead = firstFrom(a, d), behind = firstFrom(i, -d);
        const target = ahead != null && Chess.color(b[ahead]) === -c ? ahead : behind != null && Chess.color(b[behind]) === -c ? behind : null;
        if (target != null) out.push({ kind: "battery", from: i, a, target });
      }
    }
  });
  return out;
}

/* Seguridad del rey: casillas de escape, casillas vecinas atacadas, escudo de peones y columnas abiertas a su lado */
function scanKing(st, c) {
  const b = st.b, k = Chess.kingSq(b, c);
  if (k < 0) return null;
  const esc = [], hit = [];
  for (const d of [-17, -16, -15, -1, 1, 15, 16, 17]) {
    const x = k + d;
    if (!scanOn(x)) continue;
    const own = b[x] !== "." && Chess.color(b[x]) === c;
    if (Chess.attacked(b, x, -c)) hit.push(x); else if (!own) esc.push(x);
  }
  const f = k & 7, fwd = c === 1 ? -16 : 16, P = c === 1 ? "P" : "p";
  let shield = 0;
  for (const df of [-1, 0, 1]) { if (f + df < 0 || f + df > 7) continue; for (const s of [1, 2]) { const x = k + df + fwd * s; if (scanOn(x) && b[x] === P) { shield++; break; } } }
  const open = [];
  for (const df of [-1, 0, 1]) {
    const ff = f + df;
    if (ff < 0 || ff > 7) continue;
    let mine = false;
    for (let r = 0; r < 8; r++) if (b[r * 16 + ff] === P) mine = true;
    if (!mine) open.push("abcdefgh"[ff]);
  }
  return { sq: k, esc, hit, shield, open, check: Chess.inCheck(st, c) };
}

/* Jugadas forzadas del bando que mueve: jaques, capturas (con lo que se gana a primera vista) y amenazas */
function scanForcing(st) {
  const c = st.t, L = Chess.legal(st), checks = [], captures = [], threats = [];
  for (const m of L) {
    const s2 = Chess.apply(st, m), san = Chess.san(st, m, L), check = Chess.inCheck(s2);
    if (check) checks.push({ m, san, mate: !Chess.legal(s2).length });
    if (m.captured !== ".") {
      const gain = SCAN_PTS[m.captured.toLowerCase()] - (Chess.attackers(s2.b, m.to, -c).length ? SCAN_PTS[m.piece.toLowerCase()] : 0);
      captures.push({ m, san, gain, check });
      continue;
    }
    if (check) continue;
    // Amenaza: tras la jugada, la pieza movida ataca algo suelto o que vale más, sin quedar ella colgada; o amenaza mate
    const moved = scanPieceSafety(s2.b, m.to);
    if (moved.danger && !moved.def.length) continue;
    const targets = [];
    scanSquares(i => {
      const p = s2.b[i];
      if (p === "." || Chess.color(p) !== -c || p.toLowerCase() === "k") return;
      if (!Chess.attackers(s2.b, i, c).includes(m.to)) return;
      const sf = scanPieceSafety(s2.b, i);
      if (sf.loose || SCAN_PTS[p.toLowerCase()] > SCAN_PTS[m.piece.toLowerCase()]) targets.push(i);
    });
    // Amenaza de mate: si pudiera volver a mover, ¿daría mate?
    const again = Object.assign(Chess.clone(s2), { t: c, ep: -1 });
    let mateNext = false;
    if (!Chess.inCheck(again, -c)) {
      const L2 = Chess.legal(again);
      for (const m2 of L2) { const s3 = Chess.apply(again, m2); if (Chess.inCheck(s3) && !Chess.legal(s3).length) { mateNext = true; break; } }
    }
    if (targets.length || mateNext) threats.push({ m, san, targets, mateNext, score: (mateNext ? 20 : 0) + targets.reduce((a, i) => a + SCAN_PTS[s2.b[i].toLowerCase()], 0) });
  }
  captures.sort((x, y) => y.gain - x.gain);
  threats.sort((x, y) => y.score - x.score);
  return { checks, captures, threats };
}

/* La lectura completa, desde el punto de vista del bando al que le toca mover */
function boardScan(st) {
  const me = st.t, op = -me, b = st.b;
  const count = { 1: { p: 0, n: 0, b: 0, r: 0, q: 0 }, "-1": { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  scanSquares(i => { const p = b[i]; if (p !== "." && p.toLowerCase() !== "k") count[Chess.color(p)][p.toLowerCase()]++; });
  const pts = c => Object.entries(count[c]).reduce((a, [t, n]) => a + SCAN_PTS[t] * n, 0);
  const pieces = c => { const out = []; scanSquares(i => { if (b[i] !== "." && Chess.color(b[i]) === c && b[i].toLowerCase() !== "k") out.push(scanPieceSafety(b, i)); }); return out; };
  const mine = pieces(me), theirs = pieces(op);
  return {
    me, material: { count, pts: { [me]: pts(me), [op]: pts(op) }, diff: pts(me) - pts(op), pair: { [me]: count[me].b >= 2, [op]: count[op].b >= 2 } },
    kings: { [me]: scanKing(st, me), [op]: scanKing(st, op) },
    // Lo del rival: mis piezas en peligro o sueltas, y sus motivos de líneas
    rival: { danger: mine.filter(x => x.danger), loose: mine.filter(x => x.loose && !x.danger), lines: scanLines(b, op) },
    you: { danger: theirs.filter(x => x.danger), loose: theirs.filter(x => x.loose && !x.danger), lines: scanLines(b, me) },
    forcing: scanForcing(st)
  };
}

/* ---------- El recuadro: cinco pasos, cada uno con su explicación y sus flechas ---------- */
const Scan = { node: null, step: 0, data: null, shapes: [] };
const SCAN_STEPS = ["⚖ Material", "👑 Reyes", "⚠ El rival", "🎯 Tú", "⚡ Forzadas"];
function scanMaterialText(S) {
  const M = S.material, me = S.me, op = -me, d = M.diff, cm = M.count[me], co = M.count[op];
  const minors = c => M.count[c].n + M.count[c].b;
  const parts = [];
  const exchange = cm.r - co.r, minorDiff = minors(me) - minors(op);
  if (exchange === 1 && minorDiff === -1) parts.push("tienes la calidad de más (una torre por una pieza menor)");
  else if (exchange === -1 && minorDiff === 1) parts.push("el rival tiene la calidad de más (una torre por una pieza menor)");
  else if (minorDiff && !exchange) parts.push(minorDiff > 0 ? `tienes ${minorDiff === 1 ? "una pieza" : minorDiff + " piezas"} de más` : `te falta${minorDiff === -1 ? " una pieza" : "n " + -minorDiff + " piezas"}`);
  if (cm.q !== co.q) parts.push(cm.q > co.q ? "tienes la dama de más" : "el rival tiene la dama de más");
  if (cm.p !== co.p) parts.push(cm.p > co.p ? `${cm.p - co.p} peón${cm.p - co.p > 1 ? "es" : ""} de más` : `${co.p - cm.p} peón${co.p - cm.p > 1 ? "es" : ""} de menos`);
  const pair = M.pair[me] && !M.pair[op] ? " Tienes la pareja de alfiles (algo más de medio peón en posiciones abiertas)." : M.pair[op] && !M.pair[me] ? " El rival tiene la pareja de alfiles." : "";
  const summary = `Juegan las <b>${scanSide(me)}</b>. Material: ${M.pts[me]} contra ${M.pts[op]} (peón 1, caballo y alfil 3, torre 5, dama 9)${parts.length ? ": " + parts.join(", ") : ": igualado"}.${pair}`;
  const advice = d <= -2 ? `Vas <b>${-d} puntos por detrás</b>: sólo te sirve algo grande (ganar al menos ${-d >= 5 ? "una torre" : -d >= 3 ? "una pieza" : "la calidad"}, o dar mate). Eso ya te dice qué buscar.`
    : d >= 2 ? `Vas <b>${d} puntos por delante</b>: busca jugadas seguras, vigila las amenazas del rival y, si puedes, cambia piezas.`
    : "Con el material igualado, lo que decidirá es la seguridad de los reyes y la actividad de las piezas.";
  return `${summary}<br>${advice}`;
}
function scanKingText(K, who) {
  if (!K) return "";
  const n = Chess.sqName, notes = [];
  if (K.check) notes.push("<b>está en jaque</b>");
  notes.push(K.esc.length ? `${K.esc.length} casilla${K.esc.length > 1 ? "s" : ""} libre${K.esc.length > 1 ? "s" : ""} para escapar` : "<b>ninguna casilla para escapar</b> (cuidado con los mates)");
  if (K.hit.length) notes.push(`casillas vecinas atacadas: ${K.hit.map(n).join(", ")}`);
  notes.push(K.shield >= 2 ? `buen escudo de peones (${K.shield})` : K.shield === 1 ? "sólo un peón delante" : "sin peones delante");
  if (K.open.length) notes.push(`columna${K.open.length > 1 ? "s" : ""} sin peones propios a su lado: ${K.open.join(", ")}`);
  return `<b>${who}</b> (${n(K.sq)}): ${notes.join("; ")}.`;
}
function scanLineText(b, L) {
  const p = i => scanPiece(b, i), list = [];
  for (const x of L) {
    if (x.kind === "pin") list.push(`🔗 ${cap(p(x.from))} <b>clava</b> ${p(x.a)}${x.abs ? " contra su rey (no se puede mover)" : ` contra ${p(x.z)}`}.`);
    else if (x.kind === "skewer") list.push(`🍢 ${cap(p(x.from))} <b>enfila</b> ${p(x.a)} y, detrás, ${p(x.z)}.`);
    else if (x.kind === "discovery") list.push(`💥 Sólo ${p(x.a)} separa ${p(x.from)} de${x.check ? "l rey" : ""} ${x.check ? "contrario" : p(x.z)}: si se aparta, ${x.check ? "<b>jaque a la descubierta</b>" : "<b>ataque a la descubierta</b>"}.`);
    else if (x.kind === "battery") list.push(`🔋 <b>Batería</b>: ${p(x.from)} y ${p(x.a)} en la misma línea${x.target != null ? `, apuntando a ${p(x.target)}` : ""}.`);
  }
  return list;
}
function scanSafetyText(b, arr, loose, owner) {
  const list = [];
  for (const x of arr) list.push(`⚠ ${cap(scanPiece(b, x.sq))}: atacad${"rqp".includes(b[x.sq].toLowerCase()) && b[x.sq].toLowerCase() !== "p" ? "a" : "o"} ${x.att.length} ${x.att.length > 1 ? "veces" : "vez"} y defendid${"rq".includes(b[x.sq].toLowerCase()) ? "a" : "o"} ${x.def.length} (por ${x.att.map(i => PIECE_ES[b[i].toLowerCase()]).join(", ")}).`);
  if (loose.length) list.push(`🫥 Sin defensa (piezas sueltas${owner ? " " + owner : ""}): ${loose.map(x => scanPiece(b, x.sq)).join(", ")}. Hoy no están atacadas, pero son las primeras candidatas a un ataque doble.`);
  return list;
}
function scanBody(S, st) {
  const b = st.b, me = S.me, op = -me, step = Scan.step, shapes = [], N = Chess.sqName;
  const arrow = (color, from, to) => shapes.push({ color, from: N(from), to: N(to) });
  let html = "";
  if (step === 0) html = scanMaterialText(S);
  else if (step === 1) {
    for (const [c, K] of [[me, S.kings[me]], [op, S.kings[op]]]) if (K) { K.esc.forEach(x => arrow("green", x, x)); K.hit.forEach(x => arrow("red", x, x)); }
    html = `${scanKingText(S.kings[op], "Rey rival")}<br>${scanKingText(S.kings[me], "Tu rey")}<br><span class="small">Círculos verdes: casillas de escape; rojos: casillas junto al rey que controla el contrario.</span>`;
  } else if (step === 2 || step === 3) {
    const R = step === 2 ? S.rival : S.you, owner = step === 2 ? "tuyas" : "del rival";
    const lines = scanLineText(b, R.lines), safety = scanSafetyText(b, R.danger, R.loose, owner);
    R.danger.forEach(x => { x.att.forEach(a => arrow("red", a, x.sq)); });
    R.loose.forEach(x => arrow("yellow", x.sq, x.sq));
    for (const x of R.lines) {
      if (x.kind === "pin" || x.kind === "skewer") arrow("threat", x.from, x.z);
      else if (x.kind === "discovery") arrow("threat", x.from, x.z);
      else if (x.kind === "battery") arrow("blue", x.from, x.target != null ? x.target : x.a);
    }
    const intro = step === 2 ? "<b>Primero, lo que puede hacer el rival</b> (como si le tocara a él): qué ataca, qué ve con rayos X hasta el borde del tablero y qué piezas tuyas están desprotegidas."
      : "<b>Ahora, lo mismo con tus piezas</b>: qué atacan, qué ven con rayos X y qué piezas del rival están desprotegidas o mal defendidas.";
    const items = safety.concat(lines);
    html = `${intro}${items.length ? `<ul class="scan-list">${items.map(x => `<li>${x}</li>`).join("")}</ul>` : `<br>${step === 2 ? "✔ No hay nada tuyo en peligro ni motivos de líneas a su favor." : "No hay piezas del rival desprotegidas ni motivos de líneas a tu favor: aquí manda el plan, no la táctica."}`}`;
  } else {
    const F = S.forcing, fmt = x => esc(formatSan(x.san, settings.lang, me));
    F.checks.slice(0, 6).forEach(x => arrow("blue", x.m.from, x.m.to));
    F.captures.slice(0, 4).forEach(x => arrow(x.gain > 0 ? "green" : "yellow", x.m.from, x.m.to));
    F.threats.slice(0, 3).forEach(x => arrow("yellow", x.m.from, x.m.to));
    const row = (t, arr, f) => `<li><b>${t}</b>: ${arr.length ? arr.map(f).join(", ") : "ninguna"}</li>`;
    html = `Las candidatas a calcular primero son las jugadas que <b>fuerzan</b> la respuesta del rival: así se reducen sus opciones y se puede ver más lejos.<ul class="scan-list">
      ${row(`Jaques (${F.checks.length})`, F.checks.slice(0, 8), x => fmt(x) + (x.mate ? " <b>¡mate!</b>" : ""))}
      ${row(`Capturas (${F.captures.length})`, F.captures.slice(0, 8), x => `${fmt(x)} <span class="small">(${x.gain > 0 ? `gana ${x.gain}` : x.gain === 0 ? "cambia" : `pierde ${-x.gain} si recupera`})</span>`)}
      ${row(`Amenazas (${F.threats.length})`, F.threats.slice(0, 6), x => `${fmt(x)} <span class="small">(${x.mateNext ? "amenaza mate" : "ataca " + x.targets.map(i => PIECE_ES[st.b[i].toLowerCase()]).join(" y ")})</span>`)}
    </ul><span class="small">Calcula primero los jaques, después las capturas y después las amenazas. Al final de cada línea, valora la posición y saca una conclusión: aunque una línea no funcione, te enseña algo (qué defiende cada pieza, qué casilla se debilita…).</span>`;
  }
  return { html, shapes };
}
function renderScan() {
  const box = $("scanBox");
  if (!Scan.data || Scan.node !== cur()) { box.hidden = true; return; }
  const { html, shapes } = scanBody(Scan.data, cur().state);
  Scan.shapes = shapes;
  box.hidden = false;
  box.innerHTML = `<div class="retry-head">🔎 Lee el tablero <span class="small">· paso ${Scan.step + 1} de 5</span></div>
    <div class="scan-steps">${SCAN_STEPS.map((s, i) => `<button type="button" class="sm-btn${i === Scan.step ? " primary" : ""}" data-scan="${i}">${i + 1}. ${s}</button>`).join("")}</div>
    <div class="scan-body">${html}</div>
    <div class="controls">${Scan.step < 4 ? `<button type="button" class="sm-btn primary" data-scan="next">Siguiente paso ▶</button>` : `<button type="button" class="sm-btn primary" data-scan="think" title="El motor explica cuál de las candidatas funciona y por qué">🧠 Comprobar con «Piensa conmigo»</button>`}<button type="button" class="sm-btn" data-scan="close">Cerrar</button></div>`;
  box.querySelectorAll("[data-scan]").forEach(btn => btn.onclick = () => {
    const a = btn.dataset.scan;
    if (a === "close") closeScan();
    else if (a === "next") { Scan.step = Math.min(4, Scan.step + 1); renderScan(); }
    else if (a === "think") thinkWithMe();
    else { Scan.step = +a; renderScan(); }
  });
  renderShapes();
}
function closeScan() { Scan.node = null; Scan.data = null; Scan.shapes = []; $("scanBox").hidden = true; renderShapes(); }
/* «🔎 Lee el tablero» (tecla L). En los problemas cuenta como pista; en la partida contra la CPU, como ayuda */
function readBoard() {
  const node = cur();
  if (Scan.node === node && !$("scanBox").hidden) { closeScan(); return; }
  const inPuzzle = trainer.active && trainer.puzzle && !Puz.exam && trainerUserTurn();
  if (!inPuzzle) { const blocked = helpBlocked(); if (blocked) { toast(blocked); return; } }
  if (Puz.exam && trainer.active) { toast("En el examen no hay ayudas."); return; }
  if (gameStatus(node).over) { toast("La partida ha terminado en esta posición."); return; }
  if (inPuzzle) trainer.hints++;
  else noteCpuHelp();
  Object.assign(Scan, { node, step: 0, data: boardScan(node.state) });
  renderScan();
}
