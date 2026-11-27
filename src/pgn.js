/* =========================================================================
   ÁRBOL DE PARTIDA (variantes) + PGN completo (lectura/escritura)
   Sin dependencias del DOM: se puede probar en Node.
   ========================================================================= */
var Pgn = (function (C) {
  const MOVE_NAGS = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };
  const POS_NAGS = { 10: "=", 13: "∞", 14: "⩲", 15: "⩱", 16: "±", 17: "∓", 18: "+−", 19: "−+", 22: "⨀", 23: "⨀", 32: "⟳", 33: "⟳", 36: "→", 37: "→", 40: "↑", 41: "↑", 132: "⇆", 133: "⇆", 140: "∆", 146: "N" };
  const MOVE_NAG_CODE = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 };
  const POS_NAG_CODE = { "=": 10, "∞": 13, "⩲": 14, "⩱": 15, "±": 16, "∓": 17, "+−": 18, "−+": 19 };
  /* Símbolos para enseñar en pantalla otros códigos habituales. Los códigos se guardan tal cual (node.posNagCode y
     node.nags) y se exportan con su número: $36 (iniciativa de las blancas) y $37 (de las negras) se ven igual, «→»,
     pero no se confunden al guardar. */
  const NAG_SYMBOLS = Object.assign({ 7: "□", 8: "□", 20: "+−", 21: "−+", 44: "=∞", 45: "=∞", 138: "⊕", 139: "⊕", 142: "⌓", 145: "RR" }, POS_NAGS);
  const nagSymbol = code => NAG_SYMBOLS[code] || "$" + code;
  const TEXT_POS_NAGS = { "+-": "+−", "-+": "−+", "+/-": "±", "-/+": "∓", "+=": "⩲", "=+": "⩱", "=": "=", "±": "±", "∓": "∓", "⩲": "⩲", "⩱": "⩱", "∞": "∞", "+−": "+−", "−+": "−+" };
  const SEVEN = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];

  let nextId = 1;
  function makeNode(parent, move, state, sanStr) {
    return {
      id: nextId++, parent, children: [], move, san: sanStr || "", uci: move ? C.uci(move) : "",
      state, key: C.posKey(state), nag: "", posNag: "", posNagCode: 0, nags: [], comment: "", shapes: [], eval: null
    };
  }
  function newGame(fen) {
    const base = C.parseFen(fen || C.START_FEN);
    const root = makeNode(null, null, base, "");
    const headers = { Event: "Estudio", Site: "", Date: "????.??.??", Round: "-", White: "Blancas", Black: "Negras", Result: "*" };
    if (fen && fen.trim() !== C.START_FEN) { headers.SetUp = "1"; headers.FEN = C.toFen(base); }
    return { headers, root, current: root };
  }
  function sameMove(a, b) { return a.from === b.from && a.to === b.to && (a.promotion || "") === (b.promotion || ""); }
  function cleanMove(m) { return { from: m.from, to: m.to, promotion: m.promotion || "", flag: m.flag || "", piece: m.piece, captured: m.captured }; }

  /* Añade (o reutiliza) un hijo. mode: "variation" (por defecto) | "overwrite" */
  function addMove(node, move, mode) {
    const existing = node.children.find(ch => sameMove(ch.move, move));
    if (existing) return existing;
    if (mode === "overwrite") node.children = [];
    const L = C.legal(node.state);
    const child = makeNode(node, cleanMove(move), C.apply(node.state, move), C.san(node.state, move, L));
    node.children.push(child);
    return child;
  }
  function mainlineFrom(node) { const out = []; let n = node; while (n.children.length) { n = n.children[0]; out.push(n); } return out; }
  function pathTo(node) { const out = []; for (let n = node; n; n = n.parent) out.unshift(n); return out; }
  function isMainline(node) { for (let n = node; n.parent; n = n.parent) if (n.parent.children[0] !== n) return false; return true; }
  function findById(root, id) {
    const st = [root];
    while (st.length) { const n = st.pop(); if (n.id === id) return n; for (const c of n.children) st.push(c); }
    return null;
  }
  function walk(root, fn) { const st = [root]; while (st.length) { const n = st.pop(); fn(n); for (let i = n.children.length - 1; i >= 0; i--) st.push(n.children[i]); } }
  function countMoves(root) { let n = -1; walk(root, () => n++); return n; }
  function moveNumberLabel(node, force) {
    const ps = node.parent.state;
    if (ps.t === 1) return ps.full + ". ";
    return force ? ps.full + "... " : "";
  }

  /* ---------- Comentarios: [%cal], [%csl], [%eval] ---------- */
  function parseCommentText(txt) {
    const shapes = [];
    let ev = null;
    let rest = txt.replace(/\[%(cal|csl)\s+([^\]]*)\]/g, (_, kind, list) => {
      for (const it of list.split(",")) {
        const v = it.trim();
        const m = kind === "cal" ? v.match(/^([RGBY])([a-h][1-8])([a-h][1-8])$/) : v.match(/^([RGBY])([a-h][1-8])$/);
        if (m) shapes.push({ color: { R: "red", G: "green", B: "blue", Y: "yellow" }[m[1]], from: m[2], to: kind === "cal" ? m[3] : m[2] });
      }
      return "";
    });
    rest = rest.replace(/\[%eval\s+([^\]\s]+)[^\]]*\]/g, (_, v) => {
      if (/^#-?\d+$/.test(v)) ev = { mate: +v.slice(1) };
      else if (!isNaN(parseFloat(v))) ev = { cp: Math.round(parseFloat(v) * 100) };
      return "";
    });
    // Tiempo que le quedaba en el reloj tras la jugada ([%clk 0:04:58] o [%clk 0:04:58.3]): se guarda en segundos
    let clk = null;
    rest = rest.replace(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\s*\]/g, (_, h, m, sec) => { clk = +h * 3600 + +m * 60 + parseFloat(sec); return ""; });
    rest = rest.replace(/\[%(clk|emt|tqu)[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
    return { text: rest, shapes, ev, clk };
  }
  function shapesToComment(shapes) {
    if (!shapes || !shapes.length) return "";
    const code = c => ({ red: "R", green: "G", blue: "B", yellow: "Y" }[c] || "G");
    const circles = shapes.filter(s => s.from === s.to).map(s => code(s.color) + s.from);
    const arrows = shapes.filter(s => s.from !== s.to).map(s => code(s.color) + s.from + s.to);
    return (circles.length ? `[%csl ${circles.join(",")}]` : "") + (arrows.length ? `[%cal ${arrows.join(",")}]` : "");
  }

  /* ---------- Separar un fichero en partidas ---------- */
  function splitGames(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").replace(/^﻿/, "").split("\n");
    const games = [];
    let cur = null, inMoves = false, braces = 0;
    const flush = () => { if (cur && (cur.movetext.trim() || Object.keys(cur.headers).length)) games.push(cur); };
    for (const line of lines) {
      const hm = braces === 0 ? line.match(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/) : null;
      if (hm) {
        if (!cur || inMoves) { flush(); cur = { headers: {}, movetext: "" }; inMoves = false; }
        cur.headers[hm[1]] = hm[2].replace(/\\(.)/g, "$1");
        continue;
      }
      if (!cur) cur = { headers: {}, movetext: "" };
      if (line.trim()) {
        if (!line.trim().startsWith("%")) { cur.movetext += line + "\n"; inMoves = true; }
        for (const ch of line) { if (ch === "{") braces++; else if (ch === "}") braces = Math.max(0, braces - 1); }
      }
    }
    flush();
    return games;
  }

  function detectLang(movetext) {
    const t = movetext.replace(/\{[^}]*\}/g, " ");
    // Descriptiva (P4R, C3AR, PxP): ninguna jugada algebraica cumple su forma, porque todas llevan la columna en minúscula
    const words = descPrepare(t).replace(/\([^()]*\)/g, " ").split(/\s+/).map(w => w.replace(/^\d+\s*[.…]+/, "")).filter(w => /^[PRDTACNBQKa-h]/.test(w));
    const nDesc = words.filter(looksDesc).length;
    if (nDesc >= 2 && nDesc >= words.length * 0.6) return "desc";
    const es = (t.match(/(^|[\s.(])[CADT][a-h1-8x]/g) || []).length;
    const en = (t.match(/(^|[\s.(])[NBQ][a-h1-8x]/g) || []).length;
    return es > en ? "es" : en > es ? "en" : "auto";
  }

  /* ---------- Leer una partida ---------- */
  function tokenize(text) {
    const re = /\{([^}]*)\}|;([^\n]*)|(\()|(\))|\$(\d+)|([^\s{}();]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      if (m[1] !== undefined) out.push({ type: "comment", v: m[1] });
      else if (m[2] !== undefined) out.push({ type: "comment", v: m[2] });
      else if (m[3]) out.push({ type: "open" });
      else if (m[4]) out.push({ type: "close" });
      else if (m[5]) out.push({ type: "nag", v: +m[5] });
      else {
        let w = m[6];
        if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(w)) { out.push({ type: "result", v: w === "½-½" ? "1/2-1/2" : w }); continue; }
        w = w.replace(/^\d+\s*[.…]+/, "");
        if (!w || /^[.…]+$/.test(w) || /^e\.?p\.?$/i.test(w)) continue;   // puntos sueltos y «e.p.» (al paso) de los libros antiguos
        if (/^(--|Z0|0000|@@@@|null|pass)$/i.test(w)) { out.push({ type: "nullmove", v: w }); continue; }
        if (w in TEXT_POS_NAGS) { out.push({ type: "posnag", v: TEXT_POS_NAGS[w] }); continue; }
        if (/^(!!|\?\?|!\?|\?!|!|\?)$/.test(w)) { out.push({ type: "movenag", v: w }); continue; }
        out.push({ type: "move", v: w });
      }
    }
    return out;
  }

  /* opts: { lang: "auto"|"es"|"en"|"figurines"|"uci", fen } → { game, error, count } */
  function parseGame(src, opts = {}) {
    const parts = typeof src === "string" ? (splitGames(src)[0] || { headers: {}, movetext: "" }) : src;
    const headers = Object.assign({}, parts.headers);
    let fen = opts.fen || (headers.FEN && headers.FEN.trim()) || C.START_FEN;
    const game = newGame(fen);
    game.headers = Object.assign(game.headers, headers);
    if (!headers.Event) game.headers.Event = opts.defaultEvent || game.headers.Event;
    let lang = opts.lang && opts.lang !== "auto" && opts.lang !== "figurines" && opts.lang !== "uci" ? opts.lang : detectLang(parts.movetext);
    const tokens = tokenize(lang === "desc" ? descPrepare(parts.movetext) : parts.movetext);
    let cur = game.root, count = 0, error = null, pending = "";
    const stack = [];
    let nullSkipped = 0;
    let skip = 0; // profundidad de variante que se está saltando por error
    let justOpened = false;
    for (const tk of tokens) {
      if (skip) {
        if (tk.type === "open") skip++;
        else if (tk.type === "close") { skip--; if (!skip) cur = stack.pop(); }
        continue;
      }
      if (tk.type === "comment") {
        const pc = parseCommentText(tk.v);
        if (justOpened) {
          pending += (pending ? " " : "") + pc.text;
        } else if (cur === game.root) {
          cur.comment = (cur.comment ? cur.comment + " " : "") + pc.text;
          cur.shapes.push(...pc.shapes);
        } else if (!pending) {
          cur.comment = (cur.comment ? cur.comment + " " : "") + pc.text;
          cur.shapes.push(...pc.shapes);
          if (pc.ev) cur.eval = Object.assign({ depth: 0, source: "pgn" }, pc.ev);
          if (pc.clk != null) cur.clk = pc.clk;
        } else pending += (pending ? " " : "") + pc.text;
      } else if (tk.type === "open") {
        stack.push(cur);
        if (cur === game.root) { skip = 1; continue; }
        cur = cur.parent;
        pending = "";
        justOpened = true;
      } else if (tk.type === "close") {
        if (stack.length) cur = stack.pop();
        pending = "";
        justOpened = false;
      } else if (tk.type === "nag") {
        if (cur === game.root) continue;
        // El primero de cada clase se ve como símbolo; los demás (o los que no tienen símbolo) se guardan aparte
        if (MOVE_NAGS[tk.v] && !cur.nag) cur.nag = MOVE_NAGS[tk.v];
        else if (POS_NAGS[tk.v] && !cur.posNag) { cur.posNag = POS_NAGS[tk.v]; cur.posNagCode = tk.v; }
        else if (MOVE_NAG_CODE[cur.nag] !== tk.v && cur.posNagCode !== tk.v && !cur.nags.includes(tk.v)) cur.nags.push(tk.v);
      } else if (tk.type === "movenag") {
        if (cur !== game.root) cur.nag = tk.v;
      } else if (tk.type === "posnag") {
        if (cur !== game.root) { cur.posNag = tk.v; cur.posNagCode = POS_NAG_CODE[tk.v] || 0; }
      } else if (tk.type === "result") {
        if (!stack.length) { if (!headers.Result || headers.Result === "*") game.headers.Result = tk.v; break; }
      } else if (tk.type === "nullmove") {
        // «Jugada nula» (ChessBase la usa en variantes para enseñar una amenaza): no se puede representar,
        // así que se deja lo que sigue de esa variante y se sigue leyendo la partida
        if (stack.length) { skip = 1; nullSkipped++; continue; }
        const ps = cur.state;
        error = { token: tk.v, label: ps.full + (ps.t === 1 ? ". " : "... ") + tk.v, message: "Las jugadas nulas («" + tk.v + "») no se admiten en la línea principal." };
        break;
      } else if (tk.type === "move") {
        let parsed;
        try {
          const lg = opts.lang === "uci" ? "en" : lang;
          parsed = lg === "desc" ? descParseMove(cur.state, tk.v, opts.descChoices) : C.parseMove(cur.state, tk.v, lg);
        } catch (e) {
          const ps = cur.state;
          const label = ps.full + (ps.t === 1 ? ". " : "... ") + tk.v;
          // Descriptiva ambigua (PxP con dos capturas): se dice cuáles encajan, para elegir y volver a leer (reparse)
          const amb = e.choices ? { choices: e.choices, key: descKey(ps, tk.v) } : {};
          if (stack.length) { if (!error) error = Object.assign({ token: tk.v, label, message: e.message, inVariation: true }, amb); skip = 1; continue; }
          error = Object.assign({ token: tk.v, label, message: e.message }, amb);
          break;
        }
        const child = addMove(cur, parsed.move);
        if (parsed.nag) child.nag = parsed.nag;
        if (pending) { child.comment = pending + (child.comment ? " " + child.comment : ""); pending = ""; }
        justOpened = false;
        cur = child;
        count++;
      }
    }
    game.current = game.root;
    const reparse = choices => parseGame(src, Object.assign({}, opts, { lang, descChoices: Object.assign({}, opts.descChoices, choices) }));
    return { game, error, count, nullSkipped, lang, reparse };
  }

  /* ---------- Notación descriptiva española (libros antiguos: P4R, C3AR, AxC, PxP) ----------
     Las columnas se nombran por la pieza que empieza en ellas (TD CD AD D R AR CR TR = a…h) y las filas se cuentan
     desde el lado de quien mueve: P4R es e4 para las blancas y e5 para las negras. Una jugada se lee comparándola
     con las jugadas legales de la posición (descMoves); si encaja con varias (PxP con dos capturas posibles), se
     devuelven todas para que se elija. descFor escribe una jugada en la forma más corta que no sea ambigua. */
  const D_FILES = ["TD", "CD", "AD", "D", "R", "AR", "CR", "TR"];
  const D_PIECE = { R: "K", D: "Q", T: "R", A: "B", C: "N", P: "P" };
  const D_LETTER = { K: "R", Q: "D", R: "T", B: "A", N: "C", P: "P" };
  const D_SHORT = { T: [0, 7], C: [1, 6], A: [2, 5] };
  const D_FN = /^(TD|CD|AD|TR|CR|AR|D|R|T|C|A)$/;
  const dFiles = fn => (D_SHORT[fn] ? D_SHORT[fn] : D_FILES.indexOf(fn) >= 0 ? [D_FILES.indexOf(fn)] : null);
  const dShort = f => (f === 3 || f === 4 ? D_FILES[f] : D_FILES[f].slice(0, 1));
  const dSide = f => (f < 4 ? "D" : "R");
  const fileOf = sq => sq & 7, rankOf = sq => 8 - (sq >> 4);   // 0x88: fila 0 = la octava
  const relRank = (sq, t) => (t === 1 ? rankOf(sq) : 9 - rankOf(sq));
  /* Lo que se puede escribir de una casilla: «4R» o «R4» */
  function dSquare(str) {
    let m = /^([1-8])([A-Z]{1,2})$/.exec(str) || /^([A-Z]{1,2})([1-8])$/.exec(str);
    if (!m) return null;
    const [r, fn] = /^\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
    const files = D_FN.test(fn) ? dFiles(fn) : null;
    return files ? { rank: r, files } : null;
  }
  /* Calificativo de origen: para un peón, su columna (PA, PAR); para una pieza, su flanco (CR, TD) o su casilla (C5D) */
  function dOrigin(str, piece) {
    if (!str) return {};
    let s = str;
    const paren = /^\((.*)\)$/.exec(s);
    if (paren) s = paren[1];
    if (/^[1-8]$/.test(s)) return { rank: +s };
    const sq = dSquare(s);
    if (sq && /\d/.test(s)) return { rank: sq.rank, files: sq.files };
    if (!D_FN.test(s)) return null;
    if (piece === "P") return { files: dFiles(s) };
    return s === "R" || s === "D" ? { side: s } : null;
  }
  /* Lo capturado: una pieza (con su columna si es un peón, su flanco si es una pieza, y quizá su fila) o una casilla */
  function dTargets(str) {
    const out = [];
    const sq = dSquare(str);
    if (sq) out.push({ square: sq });
    const m = /^([RDTACP])([A-Z]{0,2})\(?([1-8])?\)?$/.exec(str);
    if (m) {
      const t = { piece: m[1] };
      if (m[3]) t.rank = +m[3];
      if (m[2]) {
        if (!D_FN.test(m[2])) return out;
        if (m[1] === "P") t.files = dFiles(m[2]);
        else if (m[2] === "R" || m[2] === "D") t.side = m[2];
        else return out;
      }
      out.push(t);
    }
    return out;
  }
  function dNormalize(raw) {
    return String(raw).toUpperCase().replace(/[\s\-–—]/g, "").replace(/[×:]/g, "X")
      .replace(/(\+\+|\+|#|!!|\?\?|!\?|\?!|!|\?)+$/, "").replace(/(JAQUE|MATE)$/, "").replace(/(A\.?P\.?|E\.?P\.?)$/, "");
  }
  /* Todas las lecturas posibles de una jugada escrita (puede haber varias: «TR1R» o «PAR4») */
  function dParse(raw) {
    const t = dNormalize(raw), out = [];
    if (/^[0O]{3}$/.test(t)) return [{ castle: "Q" }];
    if (/^[0O]{2}$/.test(t)) return [{ castle: "K" }];
    const P = t[0];
    if (!P || !D_PIECE[P]) return out;
    for (let i = 1; i <= Math.min(6, t.length); i++) {
      const origin = dOrigin(t.slice(1, i), P);
      if (origin === null) continue;
      const rest = t.slice(i);
      const splits = [[rest, null]];
      if (P === "P") { const pm = /^(.+?)(?:=|\()?([DTAC])\)?$/.exec(rest); if (pm) splits.push([pm[1], pm[2]]); }
      for (const [body, promo] of splits) {
        if (body[0] === "X") for (const cap of dTargets(body.slice(1))) out.push({ piece: P, origin, cap, promo });
        else { const d = dSquare(body); if (d) out.push({ piece: P, origin, dest: d, promo }); }
      }
    }
    return out;
  }
  function dMatches(s, m, c) {
    const t = s.t;
    if (c.castle) return m.flag === "castle" && (c.castle === "K" ? fileOf(m.to) === 6 : fileOf(m.to) === 2);
    if (m.flag === "castle" && c.piece !== "R") return false;
    if (D_PIECE[c.piece] !== m.piece.toUpperCase()) return false;
    if (m.promotion) { if ((c.promo ? D_PIECE[c.promo] : "Q") !== m.promotion.toUpperCase()) return false; }
    else if (c.promo) return false;
    const o = c.origin || {};
    if (o.files && !o.files.includes(fileOf(m.from))) return false;
    if (o.side && dSide(fileOf(m.from)) !== o.side) return false;
    if (o.rank && relRank(m.from, t) !== o.rank) return false;
    const isCap = m.captured !== "." || m.flag === "ep";
    if (c.dest) return !isCap && c.dest.files.includes(fileOf(m.to)) && relRank(m.to, t) === c.dest.rank;
    if (!isCap) return false;
    const cap = c.cap;
    if (cap.square) return cap.square.files.includes(fileOf(m.to)) && relRank(m.to, t) === cap.square.rank;
    const capSq = m.flag === "ep" ? m.to + 16 * t : m.to;
    const capType = m.flag === "ep" ? "P" : m.captured.toUpperCase();
    if (D_PIECE[cap.piece] !== capType) return false;
    if (cap.files && !cap.files.includes(fileOf(capSq))) return false;
    if (cap.side && dSide(fileOf(capSq)) !== cap.side) return false;
    if (cap.rank && relRank(capSq, t) !== cap.rank) return false;
    return true;
  }
  /* Las jugadas legales que encajan con lo escrito */
  function descMoves(s, raw, L) {
    const legal = L || C.legal(s), out = [];
    for (const c of dParse(raw)) for (const m of legal) if (!out.includes(m) && dMatches(s, m, c)) out.push(m);
    return out;
  }
  /* La jugada escrita en descriptiva, en la forma más corta que sólo encaja con ella */
  function descFor(s, m, L) {
    const legal = L || C.legal(s);
    const after = C.apply(s, m), check = C.inCheck(after) ? (C.legal(after).length ? "+" : "++") : "";
    if (m.flag === "castle") return (fileOf(m.to) === 6 ? "0-0" : "0-0-0") + check;
    const P = D_LETTER[m.piece.toUpperCase()], ff = fileOf(m.from), tf = fileOf(m.to), t = s.t;
    const promo = m.promotion ? "=" + D_LETTER[m.promotion.toUpperCase()] : "";
    const origins = P === "P" ? ["", dShort(ff), D_FILES[ff]] : ["", dSide(ff), relRank(m.from, t) + D_FILES[ff]];
    const ends = [];
    if (m.captured !== "." || m.flag === "ep") {
      const capSq = m.flag === "ep" ? m.to + 16 * t : m.to, cf = fileOf(capSq);
      const cl = m.flag === "ep" ? "P" : D_LETTER[m.captured.toUpperCase()];
      const quals = cl === "P" ? ["", dShort(cf), D_FILES[cf]] : ["", dSide(cf)];
      for (const q of quals) ends.push("X" + cl + q);
      ends.push("X" + relRank(m.to, t) + D_FILES[tf]);
    } else ends.push(relRank(m.to, t) + dShort(tf), relRank(m.to, t) + D_FILES[tf]);
    let best = null;
    for (const o of origins) {
      for (const e of ends) {
        const txt = P + o + e + promo;
        const found = descMoves(s, txt, legal);
        if (found.length === 1 && sameMove(found[0], m)) { best = txt; break; }
      }
      if (best) break;
    }
    return (best || P + relRank(m.from, t) + D_FILES[ff] + "-" + relRank(m.to, t) + D_FILES[tf] + promo).replace(/X/g, "x") + check;
  }
  /* ¿Parece una jugada descriptiva? (sin minúsculas: las de la notación algebraica siempre llevan la columna en minúscula) */
  const looksDesc = tok => {
    const t = String(tok).replace(/[-–—]/g, "");
    return /^[PRDTAC][A-Z0-9=()x×:]{1,9}[+#!?]*$/.test(t) && /[1-8x×:X]/.test(t.slice(1));
  };
  /* Antes de leer una partida en descriptiva: «P x P» y «P-4R» sin espacios ni guiones, «a.p.» fuera, y los paréntesis
     de «T(D)1R» o «P8D(D)» (que en PGN abren una variante) convertidos en «TD1R» y «P8D=D» */
  function descPrepare(text) {
    return String(text)
      .replace(/(^|\s)[ae]\.\s?p\.(?=\s|$)/gi, "$1")
      .replace(/([A-Za-z0-9])\s*[x×:]\s*(?=[PRDTACprdtac1-8])/g, "$1x")
      .replace(/([A-Za-z)])\s*-\s*(?=[0-9A-Za-z(])/g, "$1")
      .replace(/(\d)-(?=[A-Za-z])/g, "$1")
      .replace(/([0-9A-Za-z])\(([DTACdtac])\)/g, "$1=$2")
      .replace(/([RDTACrdtac])\(([0-9A-Za-z]{1,3})\)(?=[0-9xX])/g, "$1$2");
  }

  const descKey = (s, raw) => C.posKey(s) + "|" + dNormalize(raw);
  function descParseMove(s, raw, choices) {
    const found = descMoves(s, raw);
    let mv = found.length === 1 ? found[0] : null;
    if (found.length > 1 && choices) { const u = choices[descKey(s, raw)]; mv = found.find(m => C.uci(m) === u) || null; }
    if (!mv) {
      const e = Error(found.length ? `«${raw}» admite ${found.length} jugadas (${found.map(m => C.san(s, m)).join(", ")}): elige cuál` : `Jugada descriptiva no reconocida o ilegal: ${raw}`);
      if (found.length) e.choices = found.map(m => C.uci(m));
      throw e;
    }
    const nm = /(!!|\?\?|!\?|\?!|!|\?)$/.exec(raw);
    return { move: mv, nag: nm ? nm[1] : "" };
  }
  /* ---------- Escribir PGN ---------- */
  function escapeHeader(v) { return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
  function commentOf(n, opts) {
    let txt = "";
    if (opts.shapes !== false) txt += shapesToComment(n.shapes);
    if (opts.evals && n.eval && (n.eval.cp != null || n.eval.mate != null)) txt += n.eval.mate != null ? `[%eval #${n.eval.mate}]` : `[%eval ${(n.eval.cp / 100).toFixed(2)}]`;
    if (opts.clocks !== false && n.clk != null) { const t = Math.max(0, n.clk), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sc = t % 60; txt += (txt ? " " : "") + `[%clk ${h}:${String(m).padStart(2, "0")}:${(sc % 1 ? sc.toFixed(1) : String(Math.round(sc))).padStart(sc % 1 ? 4 : 2, "0")}]`; }
    if (opts.comments !== false && n.comment) txt += (txt ? " " : "") + n.comment.replace(/[{}]/g, "");
    return txt ? `{ ${txt} }` : "";
  }
  function moveText(n, force) {
    let s = moveNumberLabel(n, force) + n.san + (n.nag || "");
    if (n.posNag) {
      const code = n.posNagCode && POS_NAGS[n.posNagCode] === n.posNag ? n.posNagCode : POS_NAG_CODE[n.posNag];
      if (code) s += " $" + code;
    }
    for (const c of n.nags || []) s += " $" + c;
    return s;
  }
  function exportMovetext(game, opts = {}) {
    const out = [];
    const rc = commentOf(game.root, opts);
    if (rc) out.push(rc);
    const line = (node, force) => {
      let cur = node;
      while (cur.children.length) {
        const main = cur.children[0];
        out.push(moveText(main, force));
        force = false;
        const c = commentOf(main, opts);
        if (c) { out.push(c); force = true; }
        if (opts.variations !== false) {
          for (const alt of cur.children.slice(1)) {
            out.push("(" + moveText(alt, true));
            const ac = commentOf(alt, opts);
            if (ac) out.push(ac);
            const before = out.length;
            line(alt, Boolean(ac));
            out[out.length - 1] += ")";
            if (out.length === before) { /* variante de una jugada: ya cerrada */ }
            force = true;
          }
        }
        cur = main;
      }
    };
    line(game.root, true);
    out.push(game.headers.Result || "*");
    // Ajuste de líneas a 80 columnas
    const words = out.join(" ").replace(/\s+\)/g, ")").split(" ");
    const lines = [];
    let l = "";
    for (const w of words) { if ((l + " " + w).trim().length > 80) { lines.push(l.trim()); l = w; } else l += " " + w; }
    if (l.trim()) lines.push(l.trim());
    return lines.join("\n");
  }
  function exportPgn(game, opts = {}) {
    const h = Object.assign({}, game.headers);
    const keys = SEVEN.concat(Object.keys(h).filter(k => !SEVEN.includes(k)));
    const head = keys.filter(k => h[k] !== undefined && (SEVEN.includes(k) || h[k] !== "")).map(k => `[${k} "${escapeHeader(h[k] == null ? "" : h[k])}"]`).join("\n");
    return head + "\n\n" + exportMovetext(game, opts) + "\n";
  }

  /* Elimina un nodo (y su subárbol); devuelve el padre */
  function deleteNode(node) {
    const p = node.parent;
    if (!p) return node;
    p.children = p.children.filter(c => c !== node);
    return p;
  }
  function promote(node) {
    const p = node.parent;
    if (!p) return;
    const i = p.children.indexOf(node);
    if (i > 0) { p.children.splice(i, 1); p.children.splice(i - 1, 0, node); }
  }
  function makeMain(node) {
    for (let n = node; n.parent; n = n.parent) {
      const p = n.parent, i = p.children.indexOf(n);
      if (i > 0) { p.children.splice(i, 1); p.children.unshift(n); }
    }
  }

  return {
    MOVE_NAGS, POS_NAGS, nagSymbol, newGame, addMove, mainlineFrom, pathTo, isMainline, findById, walk, countMoves,
    moveNumberLabel, parseCommentText, splitGames, detectLang, parseGame, exportPgn, exportMovetext,
    deleteNode, promote, makeMain, sameMove, descMoves, descFor, descKey, looksDesc, descPrepare
  };
})(Chess);
