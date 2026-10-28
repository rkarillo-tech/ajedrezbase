/* =========================================================================
   ÁRBOL DE PARTIDA (variantes) + PGN completo (lectura/escritura)
   Sin dependencias del DOM: se puede probar en Node.
   ========================================================================= */
var Pgn = (function (C) {
  const MOVE_NAGS = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };
  const POS_NAGS = { 10: "=", 13: "∞", 14: "⩲", 15: "⩱", 16: "±", 17: "∓", 18: "+−", 19: "−+", 22: "⨀", 23: "⨀", 32: "⟳", 33: "⟳", 36: "→", 37: "→", 40: "↑", 41: "↑", 132: "⇆", 133: "⇆", 140: "∆", 146: "N" };
  const MOVE_NAG_CODE = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 };
  const POS_NAG_CODE = { "=": 10, "∞": 13, "⩲": 14, "⩱": 15, "±": 16, "∓": 17, "+−": 18, "−+": 19 };
  const TEXT_POS_NAGS = { "+-": "+−", "-+": "−+", "+/-": "±", "-/+": "∓", "+=": "⩲", "=+": "⩱", "=": "=", "±": "±", "∓": "∓", "⩲": "⩲", "⩱": "⩱", "∞": "∞", "+−": "+−", "−+": "−+" };
  const SEVEN = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];

  let nextId = 1;
  function makeNode(parent, move, state, sanStr) {
    return {
      id: nextId++, parent, children: [], move, san: sanStr || "", uci: move ? C.uci(move) : "",
      state, key: C.posKey(state), nag: "", posNag: "", comment: "", shapes: [], eval: null
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
    rest = rest.replace(/\[%(clk|emt|tqu)[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
    return { text: rest, shapes, ev };
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
        w = w.replace(/^\d+\s*\.+/, "");
        if (!w || /^\.+$/.test(w)) continue;
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
    const tokens = tokenize(parts.movetext);
    let cur = game.root, count = 0, error = null, pending = "";
    const stack = [];
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
        if (MOVE_NAGS[tk.v]) cur.nag = MOVE_NAGS[tk.v];
        else if (POS_NAGS[tk.v]) cur.posNag = POS_NAGS[tk.v];
      } else if (tk.type === "movenag") {
        if (cur !== game.root) cur.nag = tk.v;
      } else if (tk.type === "posnag") {
        if (cur !== game.root) cur.posNag = tk.v;
      } else if (tk.type === "result") {
        if (!stack.length) { if (!headers.Result || headers.Result === "*") game.headers.Result = tk.v; break; }
      } else if (tk.type === "move") {
        let parsed;
        try {
          const lg = opts.lang === "uci" ? "en" : lang;
          parsed = C.parseMove(cur.state, tk.v, lg);
        } catch (e) {
          const ps = cur.state;
          const label = ps.full + (ps.t === 1 ? ". " : "... ") + tk.v;
          if (stack.length) { if (!error) error = { token: tk.v, label, message: e.message, inVariation: true }; skip = 1; continue; }
          error = { token: tk.v, label, message: e.message };
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
    return { game, error, count };
  }

  /* ---------- Escribir PGN ---------- */
  function escapeHeader(v) { return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
  function commentOf(n, opts) {
    let txt = "";
    if (opts.shapes !== false) txt += shapesToComment(n.shapes);
    if (opts.evals && n.eval && (n.eval.cp != null || n.eval.mate != null)) txt += n.eval.mate != null ? `[%eval #${n.eval.mate}]` : `[%eval ${(n.eval.cp / 100).toFixed(2)}]`;
    if (opts.comments !== false && n.comment) txt += (txt ? " " : "") + n.comment.replace(/[{}]/g, "");
    return txt ? `{ ${txt} }` : "";
  }
  function moveText(n, force) {
    let s = moveNumberLabel(n, force) + n.san + (n.nag || "");
    if (n.posNag && POS_NAG_CODE[n.posNag]) s += " $" + POS_NAG_CODE[n.posNag];
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
    MOVE_NAGS, POS_NAGS, newGame, addMove, mainlineFrom, pathTo, isMainline, findById, walk, countMoves,
    moveNumberLabel, parseCommentText, splitGames, detectLang, parseGame, exportPgn, exportMovetext,
    deleteNode, promote, makeMain, sameMove
  };
})(Chess);
