"use strict";
/* =========================================================================
   NÚCLEO DE AJEDREZ (reglas 0x88 + SAN multi-idioma + evaluación + búsqueda)
   Este mismo código se ejecuta en la página y dentro del Web Worker del
   motor interno, para que reglas y motor tengan una única fuente de verdad.
   ========================================================================= */
var Chess = (function () {
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const FILES = "abcdefgh";
  const N_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
  const K_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];
  const B_OFF = [-17, -15, 15, 17];
  const R_OFF = [-16, -1, 1, 16];
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

  const on = i => (i & 0x88) === 0;
  const color = p => (p === "." ? 0 : p < "a" ? 1 : -1);
  const sqName = i => FILES[i & 7] + (8 - (i >> 4));
  const sqIdx = s => (8 - +s[1]) * 16 + FILES.indexOf(s[0]);

  /* ---------------- FEN ---------------- */
  function parseFen(fen) {
    const f = String(fen || "").trim().split(/\s+/);
    if (f.length < 2) throw Error("FEN incompleta: faltan campos.");
    const rows = f[0].split("/");
    if (rows.length !== 8) throw Error("FEN inválida: debe tener 8 filas.");
    const b = Array(128).fill(".");
    rows.forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/[1-8]/.test(ch)) c += +ch;
        else if (/[prnbqkPRNBQK]/.test(ch)) { if (c > 7) throw Error("FEN inválida: fila " + (8 - r) + " demasiado larga."); b[r * 16 + c++] = ch; }
        else throw Error("FEN inválida: carácter «" + ch + "».");
      }
      if (c !== 8) throw Error("FEN inválida: la fila " + (8 - r) + " no suma 8 casillas.");
    });
    if (f[1] !== "w" && f[1] !== "b") throw Error("FEN inválida: el turno debe ser w o b.");
    const cs = f[2] || "-";
    let c = (cs.includes("K") ? 1 : 0) | (cs.includes("Q") ? 2 : 0) | (cs.includes("k") ? 4 : 0) | (cs.includes("q") ? 8 : 0);
    // Saneamos derechos de enroque imposibles
    if (b[116] !== "K") c &= ~3;
    if (b[4] !== "k") c &= ~12;
    if (b[119] !== "R") c &= ~1;
    if (b[112] !== "R") c &= ~2;
    if (b[7] !== "r") c &= ~4;
    if (b[0] !== "r") c &= ~8;
    let ep = -1;
    if (f[3] && f[3] !== "-" && /^[a-h][36]$/.test(f[3])) ep = sqIdx(f[3]);
    return { b, t: f[1] === "w" ? 1 : -1, c, ep, half: +(f[4] || 0) || 0, full: Math.max(1, +(f[5] || 1) || 1) };
  }

  function boardFen(s) {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let row = "", e = 0;
      for (let c = 0; c < 8; c++) {
        const p = s.b[r * 16 + c];
        if (p === ".") e++;
        else { if (e) row += e; e = 0; row += p; }
      }
      if (e) row += e;
      rows.push(row);
    }
    return rows.join("/");
  }
  function castleStr(c) { return [c & 1 ? "K" : "", c & 2 ? "Q" : "", c & 4 ? "k" : "", c & 8 ? "q" : ""].join("") || "-"; }
  function toFen(s) {
    return `${boardFen(s)} ${s.t === 1 ? "w" : "b"} ${castleStr(s.c)} ${s.ep < 0 ? "-" : sqName(s.ep)} ${s.half} ${s.full}`;
  }
  /* Clave de posición (sin contadores ni al paso): repeticiones, aperturas, comentarios */
  function posKey(s) { return `${boardFen(s)} ${s.t === 1 ? "w" : "b"} ${castleStr(s.c)}`; }
  function clone(s) { return { b: s.b.slice(), t: s.t, c: s.c, ep: s.ep, half: s.half, full: s.full }; }

  /* ---------------- Ataques y jaques ---------------- */
  function attacked(b, t, by) {
    if (by === 1) {
      if (on(t + 15) && b[t + 15] === "P") return true;
      if (on(t + 17) && b[t + 17] === "P") return true;
    } else {
      if (on(t - 15) && b[t - 15] === "p") return true;
      if (on(t - 17) && b[t - 17] === "p") return true;
    }
    const N = by === 1 ? "N" : "n", K = by === 1 ? "K" : "k", B = by === 1 ? "B" : "b", R = by === 1 ? "R" : "r", Q = by === 1 ? "Q" : "q";
    for (const d of N_OFF) { const x = t + d; if (on(x) && b[x] === N) return true; }
    for (const d of K_OFF) { const x = t + d; if (on(x) && b[x] === K) return true; }
    for (const d of B_OFF) {
      for (let x = t + d; on(x); x += d) { const p = b[x]; if (p !== ".") { if (p === B || p === Q) return true; break; } }
    }
    for (const d of R_OFF) {
      for (let x = t + d; on(x); x += d) { const p = b[x]; if (p !== ".") { if (p === R || p === Q) return true; break; } }
    }
    return false;
  }
  /* Lista de casillas desde las que "by" ataca t (para comentarios y piezas colgadas) */
  function attackers(b, t, by) {
    const out = [];
    const pawn = by === 1 ? "P" : "p";
    for (const d of (by === 1 ? [15, 17] : [-15, -17])) { const x = t + d; if (on(x) && b[x] === pawn) out.push(x); }
    for (const d of N_OFF) { const x = t + d; if (on(x) && b[x] === (by === 1 ? "N" : "n")) out.push(x); }
    for (const d of K_OFF) { const x = t + d; if (on(x) && b[x] === (by === 1 ? "K" : "k")) out.push(x); }
    for (const [offs, set] of [[B_OFF, "bq"], [R_OFF, "rq"]]) {
      for (const d of offs) {
        for (let x = t + d; on(x); x += d) {
          const p = b[x];
          if (p !== ".") { if (color(p) === by && set.includes(p.toLowerCase())) out.push(x); break; }
        }
      }
    }
    return out;
  }
  function kingSq(b, c) { return b.indexOf(c === 1 ? "K" : "k"); }
  function inCheck(s, c = s.t) { const k = kingSq(s.b, c); return k >= 0 && attacked(s.b, k, -c); }

  /* ---------------- Generación de jugadas ---------------- */
  function pseudo(s, capturesOnly) {
    const out = [], b = s.b, t = s.t;
    const add = (f, to, flag) => {
      const piece = b[f], captured = flag === "ep" ? (t === 1 ? "p" : "P") : b[to];
      if (captured === "k" || captured === "K") return;
      if ((piece === "P" || piece === "p") && (to >> 4 === 0 || to >> 4 === 7)) {
        for (const q of ["q", "r", "b", "n"]) out.push({ from: f, to, promotion: q, flag: flag || "", piece, captured });
      } else out.push({ from: f, to, promotion: "", flag: flag || "", piece, captured });
    };
    for (let f = 0; f < 128; f++) {
      if (f & 0x88) { f += 7; continue; }
      const p = b[f];
      if (p === "." || color(p) !== t) continue;
      const pl = p.toLowerCase();
      if (pl === "p") {
        const fwd = f - 16 * t;
        if (on(fwd) && b[fwd] === ".") {
          const promo = fwd >> 4 === 0 || fwd >> 4 === 7;
          if (!capturesOnly || promo) add(f, fwd);
          const dbl = fwd - 16 * t;
          if (!capturesOnly && (f >> 4) === (t === 1 ? 6 : 1) && b[dbl] === ".") add(f, dbl, "double");
        }
        for (const d of [-1, 1]) {
          const x = fwd + d;
          if (!on(x)) continue;
          if (b[x] !== "." && color(b[x]) === -t) add(f, x);
          else if (x === s.ep && b[x] === "." && b[x + 16 * t] === (t === 1 ? "p" : "P")) add(f, x, "ep");
        }
      } else if (pl === "n" || pl === "k") {
        for (const d of (pl === "n" ? N_OFF : K_OFF)) {
          const x = f + d;
          if (!on(x)) continue;
          const c = color(b[x]);
          if (c === t) continue;
          if (capturesOnly && c === 0) continue;
          add(f, x);
        }
        if (pl === "k" && !capturesOnly) {
          const home = t === 1 ? 116 : 4, rook = t === 1 ? "R" : "r", bits = t === 1 ? [1, 2] : [4, 8];
          if (f === home && !attacked(b, f, -t)) {
            if ((s.c & bits[0]) && b[f + 3] === rook && b[f + 1] === "." && b[f + 2] === "." && !attacked(b, f + 1, -t) && !attacked(b, f + 2, -t)) add(f, f + 2, "castle");
            if ((s.c & bits[1]) && b[f - 4] === rook && b[f - 1] === "." && b[f - 2] === "." && b[f - 3] === "." && !attacked(b, f - 1, -t) && !attacked(b, f - 2, -t)) add(f, f - 2, "castle");
          }
        }
      } else {
        const offs = pl === "b" ? B_OFF : pl === "r" ? R_OFF : K_OFF;
        for (const d of offs) {
          for (let x = f + d; on(x); x += d) {
            const c = color(b[x]);
            if (c === t) break;
            if (c === 0) { if (!capturesOnly) add(f, x); continue; }
            add(f, x);
            break;
          }
        }
      }
    }
    return out;
  }

  function apply(s, m) {
    const b = s.b.slice(), piece = b[m.from], capt = b[m.to];
    b[m.from] = ".";
    b[m.to] = m.promotion ? (s.t === 1 ? m.promotion.toUpperCase() : m.promotion) : piece;
    if (m.flag === "ep") b[m.to + 16 * s.t] = ".";
    if (m.flag === "castle") {
      const rf = m.to > m.from ? m.from + 3 : m.from - 4;
      const rt = m.to > m.from ? m.from + 1 : m.from - 1;
      b[rt] = b[rf];
      b[rf] = ".";
    }
    let c = s.c;
    if (piece === "K") c &= ~3;
    if (piece === "k") c &= ~12;
    const rb = { 119: 1, 112: 2, 7: 4, 0: 8 };
    c &= ~(rb[m.from] || 0);
    c &= ~(rb[m.to] || 0);
    const isPawn = piece === "P" || piece === "p";
    return {
      b, t: -s.t, c,
      ep: isPawn && Math.abs(m.to - m.from) === 32 ? (m.to + m.from) / 2 : -1,
      half: isPawn || capt !== "." ? 0 : s.half + 1,
      full: s.full + (s.t === -1 ? 1 : 0)
    };
  }

  function legal(s) { return pseudo(s).filter(m => !inCheck(apply(s, m), s.t)); }

  /* ---------------- SAN ---------------- */
  function sanBase(s, m, L) {
    if (m.flag === "castle") return m.to > m.from ? "O-O" : "O-O-O";
    const piece = s.b[m.from], P = piece.toUpperCase();
    const capture = s.b[m.to] !== "." || m.flag === "ep";
    let text = "";
    if (P !== "P") {
      text = P;
      const others = (L || legal(s)).filter(x => x.from !== m.from && x.to === m.to && s.b[x.from] === piece);
      if (others.length) {
        if (!others.some(x => (x.from & 7) === (m.from & 7))) text += sqName(m.from)[0];
        else if (!others.some(x => (x.from >> 4) === (m.from >> 4))) text += sqName(m.from)[1];
        else text += sqName(m.from);
      }
    } else if (capture) text = sqName(m.from)[0];
    return text + (capture ? "x" : "") + sqName(m.to) + (m.promotion ? "=" + m.promotion.toUpperCase() : "");
  }
  function san(s, m, L) {
    const n = apply(s, m);
    return sanBase(s, m, L) + (inCheck(n) ? (legal(n).length ? "+" : "#") : "");
  }
  const uci = m => sqName(m.from) + sqName(m.to) + (m.promotion || "");
  function moveFromUci(s, u, L) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) return null;
    const from = sqIdx(u.slice(0, 2)), to = sqIdx(u.slice(2, 4)), pr = u[4] || "";
    return (L || legal(s)).find(m => m.from === from && m.to === to && (m.promotion || "") === (m.promotion ? (pr || "q") : "")) || null;
  }

  /* ---------------- Parser de jugadas (ES / EN / figurines / UCI / larga) ---------------- */
  const FIG = { "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♙": "", "♚": "K", "♛": "Q", "♜": "R", "♝": "B", "♞": "N", "♟": "" };
  const ES2EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  const PROMO2EN = { D: "Q", T: "R", A: "B", C: "N", Q: "Q", R: "R", B: "B", N: "N" };

  function cleanToken(token) {
    let t = String(token).trim();
    let nag = "";
    const nm = t.match(/(!!|\?\?|!\?|\?!|!|\?)$/);
    if (nm) { nag = nm[1]; t = t.slice(0, -nag.length); }
    t = t.replace(/[+#‡†]+$/, "").replace(/e\.?p\.?$/i, "").replace(/[–—]/g, "-").replace(/:/g, "x");
    if (/^[0Oo]-?[0Oo]-?[0Oo]$/.test(t)) t = "O-O-O";
    else if (/^[0Oo]-?[0Oo]$/.test(t)) t = "O-O";
    t = [...t].map(ch => (ch in FIG ? FIG[ch] : ch)).join("");
    return { t, nag };
  }

  function toEnglish(t, lang) {
    const pm = t.match(/^([a-h](?:x?[a-h])?[18])=?([QRBNDTACqrbndtac])$/);
    if (pm) return pm[1] + "=" + PROMO2EN[pm[2].toUpperCase()];
    if (lang === "es" && /^[RDTAC]/.test(t)) return ES2EN[t[0]] + t.slice(1);
    return t;
  }

  function matchSan(s, e, L, sans) {
    let hits = L.filter((m, i) => sans[i] === e);
    if (hits.length === 1) return hits[0];
    const loose = x => x.replace(/[x\-=]/g, "");
    const le = loose(e);
    hits = L.filter((m, i) => loose(sans[i]) === le);
    if (hits.length === 1) return hits[0];
    // Notación larga: Cg1-f3, e2-e4, Ng1f3
    const lm = e.match(/^([KQRBN]?)([a-h][1-8])[-x]?([a-h][1-8])(?:=?([QRBN]))?$/);
    if (lm) {
      const from = sqIdx(lm[2]), to = sqIdx(lm[3]), pr = (lm[4] || "").toLowerCase();
      const c = L.filter(m => m.from === from && m.to === to && (!m.promotion || m.promotion === (pr || "q")));
      if (c.length === 1 && (!lm[1] || s.b[from].toUpperCase() === lm[1])) return c[0];
    }
    // Coronación sin pieza indicada → dama
    if (!hits.length) {
      const pq = L.filter((m, i) => m.promotion === "q" && loose(sans[i]).replace(/Q$/, "") === le);
      if (pq.length === 1) return pq[0];
    }
    if (hits.length > 1) throw Error("Jugada ambigua: " + e);
    return null;
  }

  /* lang: "es" | "en" | "auto" (auto usa preferencia "es" para la R ambigua) */
  function parseMove(s, token, lang = "auto", L) {
    const { t: raw, nag } = cleanToken(token);
    let t = raw.replace(/^P(?=[a-h])/, "");
    L = L || legal(s);
    const u = t.replace(/-/g, "");
    if (/^[a-h][1-8][a-h][1-8][qrbndtacQRBNDTAC]?$/.test(u)) {
      const pr = u[4] ? PROMO2EN[u[4].toUpperCase()].toLowerCase() : "";
      const m = moveFromUci(s, u.slice(0, 4) + pr, L);
      if (m) return { move: m, nag };
    }
    const sans = L.map(m => sanBase(s, m, L));
    let langs;
    const first = t[0] || "";
    if (/[CADT]/.test(first)) langs = ["es"];
    else if (/[NBQK]/.test(first)) langs = ["en"];
    else if (first === "R") langs = lang === "en" ? ["en", "es"] : ["es", "en"];
    else langs = ["en"];
    for (const lg of langs) {
      const m = matchSan(s, toEnglish(t, lg), L, sans);
      if (m) return { move: m, nag };
    }
    throw Error("Jugada ilegal o no reconocida: " + token);
  }

  /* ---------------- Estado de la partida ---------------- */
  function insufficient(s) {
    const pcs = { w: [], b: [] };
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) { i += 7; continue; }
      const p = s.b[i];
      if (p === "." || p === "K" || p === "k") continue;
      if ("PRQprq".includes(p)) return false;
      pcs[color(p) === 1 ? "w" : "b"].push({ p: p.toLowerCase(), sqc: ((i >> 4) + (i & 7)) % 2 });
    }
    const all = pcs.w.concat(pcs.b);
    if (all.length === 0) return true;
    if (all.length === 1) return true;
    if (all.every(x => x.p === "b") && all.every(x => x.sqc === all[0].sqc)) return true;
    return false;
  }

  function material(s) {
    const cnt = {};
    for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (p !== ".") cnt[p] = (cnt[p] || 0) + 1; }
    return cnt;
  }

  /* ---------------- Zobrist ---------------- */
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const PIECES = "PNBRQKpnbrqk";
  const Z1 = [], Z2 = [];
  for (let i = 0; i < 12 * 64 + 1 + 16 + 8; i++) { Z1.push(rnd()); Z2.push(rnd()); }
  function hash(s) {
    let h1 = 0, h2 = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = s.b[r * 16 + c];
      if (p !== ".") { const k = PIECES.indexOf(p) * 64 + r * 8 + c; h1 ^= Z1[k]; h2 ^= Z2[k]; }
    }
    if (s.t === -1) { h1 ^= Z1[768]; h2 ^= Z2[768]; }
    h1 ^= Z1[769 + s.c]; h2 ^= Z2[769 + s.c];
    if (s.ep >= 0) { h1 ^= Z1[785 + (s.ep & 7)]; h2 ^= Z2[785 + (s.ep & 7)]; }
    return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
  }

  /* ---------------- Evaluación (tablas de Michniewski, interpoladas por fase) ---------------- */
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    kmg: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    keg: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]
  };
  const PHASE = { n: 1, b: 1, r: 2, q: 4 };
  const PASSED = [0, 0, 10, 15, 25, 45, 75, 120];

  /* Devuelve centipeones desde el punto de vista de las BLANCAS */
  function evaluate(s) {
    const b = s.b;
    let mg = 0, eg = 0, phase = 0, wb = 0, bb = 0;
    const wP = [], bP = [];
    for (let c = 0; c < 8; c++) { wP.push([]); bP.push([]); }
    const mat = { 1: 0, "-1": 0 }, pawnsCnt = { 1: 0, "-1": 0 };
    let wK = -1, bK = -1;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r * 16 + c];
      if (p === ".") continue;
      const w = p < "a", pl = p.toLowerCase(), sgn = w ? 1 : -1;
      const i64 = w ? r * 8 + c : (7 - r) * 8 + c;
      if (pl === "k") {
        mg += sgn * PST.kmg[i64]; eg += sgn * PST.keg[i64];
        if (w) wK = r * 16 + c; else bK = r * 16 + c;
        continue;
      }
      const v = VAL[pl] + PST[pl][i64];
      mg += sgn * v; eg += sgn * v;
      phase += PHASE[pl] || 0;
      if (pl === "p") { (w ? wP : bP)[c].push(r); pawnsCnt[sgn]++; }
      else mat[sgn] += VAL[pl];
      if (pl === "b") { if (w) wb++; else bb++; }
      if (pl === "r") {
        // Torre en columna abierta / semiabierta (se completa tras recoger peones)
      }
    }
    // Estructura de peones
    for (let c = 0; c < 8; c++) {
      for (const [mine, theirs, sgn] of [[wP, bP, 1], [bP, wP, -1]]) {
        const n = mine[c].length;
        if (!n) continue;
        if (n > 1) { mg -= sgn * 12 * (n - 1); eg -= sgn * 18 * (n - 1); }
        const iso = (c === 0 || !mine[c - 1].length) && (c === 7 || !mine[c + 1].length);
        if (iso) { mg -= sgn * 10 * n; eg -= sgn * 14 * n; }
        for (const r of mine[c]) {
          let passed = true;
          for (let cc = Math.max(0, c - 1); cc <= Math.min(7, c + 1) && passed; cc++) {
            for (const rr of theirs[cc]) { if (sgn === 1 ? rr < r : rr > r) { passed = false; break; } }
          }
          if (passed) {
            const rank = sgn === 1 ? 8 - (r + 1) + 1 : r + 1; // 2..7 desde la perspectiva propia
            mg += sgn * (PASSED[rank] >> 1); eg += sgn * PASSED[rank];
          }
        }
      }
    }
    // Torres en columnas abiertas
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r * 16 + c];
      if (p !== "R" && p !== "r") continue;
      const sgn = p === "R" ? 1 : -1, mine = sgn === 1 ? wP : bP, theirs = sgn === 1 ? bP : wP;
      if (!mine[c].length) { const bonus = theirs[c].length ? 10 : 20; mg += sgn * bonus; eg += sgn * (bonus >> 1); }
    }
    if (wb >= 2) { mg += 30; eg += 45; }
    if (bb >= 2) { mg -= 30; eg -= 45; }
    phase = Math.min(24, phase);
    let score = (mg * phase + eg * (24 - phase)) / 24;
    // Mop-up: ayuda a convertir finales ganados sin peones del rival
    const diff = mat[1] - mat[-1];
    if (wK >= 0 && bK >= 0 && Math.abs(diff) >= 300) {
      const winner = diff > 0 ? 1 : -1;
      if (pawnsCnt[-winner] === 0 && mat[-winner] <= 330) {
        const lk = winner === 1 ? bK : wK, wk = winner === 1 ? wK : bK;
        const lr = lk >> 4, lc = lk & 7;
        const centerDist = Math.max(3 - lr, lr - 4) + Math.max(3 - lc, lc - 4);
        const kd = Math.abs((wk >> 4) - lr) + Math.abs((wk & 7) - lc);
        score += winner * (10 * centerDist + 4 * (14 - kd));
      }
    }
    score += s.t * 10; // tempo
    return Math.round(score);
  }

  /* ---------------- Búsqueda: PVS + quiescencia + TT + killers ---------------- */
  const MATE = 100000, INF = 1e9;
  const TT = new Map();
  let nodes = 0, deadline = 0, stopFlag = false, checkTime = false, noiseAmp = 0;
  let killers = [], historyTbl = {}, repStack = [];

  function evalSide(s, h) {
    let e = evaluate(s) * s.t;
    if (noiseAmp) e += ((((h % 9973) * 7919) % 2001) / 1000 - 1) * noiseAmp;
    return e;
  }
  function orderMoves(moves, ttMove, ply) {
    const k = killers[ply] || [];
    for (const m of moves) {
      let sc = 0;
      if (ttMove && m.from === ttMove.from && m.to === ttMove.to && m.promotion === ttMove.promotion) sc = 2e6;
      else if (m.captured !== ".") sc = 1e6 + 10 * VAL[m.captured.toLowerCase()] - VAL[m.piece.toLowerCase()] / 10;
      else if (m.promotion) sc = 9e5 + VAL[m.promotion];
      else if (k[0] && k[0].from === m.from && k[0].to === m.to) sc = 8e5;
      else if (k[1] && k[1].from === m.from && k[1].to === m.to) sc = 7e5;
      else sc = historyTbl[m.from * 128 + m.to] || 0;
      m._o = sc;
    }
    moves.sort((a, b) => b._o - a._o);
  }
  function tick() {
    if ((++nodes & 1023) === 0 && checkTime && Date.now() > deadline) stopFlag = true;
  }
  function quiesce(s, alpha, beta, ply, h) {
    tick();
    if (stopFlag) return 0;
    const stand = evalSide(s, h);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 60) return stand;
    const moves = pseudo(s, true);
    orderMoves(moves, null, ply);
    for (const m of moves) {
      if (!m.promotion && stand + VAL[m.captured.toLowerCase()] + 200 < alpha) continue;
      const n = apply(s, m);
      if (inCheck(n, s.t)) continue;
      const sc = -quiesce(n, -beta, -alpha, ply + 1, hash(n));
      if (stopFlag) return 0;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  function negamax(s, depth, alpha, beta, ply, h) {
    tick();
    if (stopFlag) return 0;
    if (ply > 0) {
      if (s.half >= 100) return 0;
      for (let i = repStack.length - 2; i >= 0; i -= 2) if (repStack[i] === h) return 0;
      if (insufficient(s)) return 0;
    }
    const check = inCheck(s);
    if (check && ply < 40) depth++;
    if (depth <= 0) return quiesce(s, alpha, beta, ply, h);
    const tt = TT.get(h);
    let ttMove = null;
    if (tt) {
      ttMove = tt.move;
      if (ply > 0 && tt.depth >= depth && Math.abs(tt.score) < MATE - 1000) {
        if (tt.flag === 0) return tt.score;
        if (tt.flag === 1 && tt.score >= beta) return tt.score;
        if (tt.flag === 2 && tt.score <= alpha) return tt.score;
      }
    }
    // Poda de movimiento nulo (fuera de jaque y con material)
    if (ply > 0 && !check && depth >= 3 && beta < MATE - 1000) {
      let big = 0;
      for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = s.b[i]; if (color(p) === s.t && "nbrqNBRQ".includes(p)) { big++; if (big > 1) break; } }
      if (big > 1 && evalSide(s, h) >= beta) {
        const ns = { b: s.b, t: -s.t, c: s.c, ep: -1, half: s.half + 1, full: s.full };
        repStack.push(-1);
        const sc = -negamax(ns, depth - 3, -beta, -beta + 1, ply + 1, hash(ns));
        repStack.pop();
        if (stopFlag) return 0;
        if (sc >= beta) return sc;
      }
    }
    const moves = pseudo(s);
    orderMoves(moves, ttMove, ply);
    let best = -INF, bestMove = null, legalCount = 0;
    const a0 = alpha;
    repStack.push(h);
    for (const m of moves) {
      const n = apply(s, m);
      if (inCheck(n, s.t)) continue;
      legalCount++;
      const nh = hash(n);
      let sc;
      const quiet = m.captured === "." && !m.promotion;
      let red = 0;
      if (legalCount > 4 && depth >= 3 && quiet && !check) red = 1;
      if (legalCount === 1) sc = -negamax(n, depth - 1, -beta, -alpha, ply + 1, nh);
      else {
        sc = -negamax(n, depth - 1 - red, -alpha - 1, -alpha, ply + 1, nh);
        if (!stopFlag && sc > alpha && (red || sc < beta)) sc = -negamax(n, depth - 1, -beta, -alpha, ply + 1, nh);
      }
      if (stopFlag) break;
      if (sc > best) {
        best = sc; bestMove = m;
        if (sc > alpha) {
          alpha = sc;
          if (alpha >= beta) {
            if (quiet) {
              const k = killers[ply] || (killers[ply] = []);
              if (!k[0] || k[0].from !== m.from || k[0].to !== m.to) { k[1] = k[0]; k[0] = m; }
              historyTbl[m.from * 128 + m.to] = (historyTbl[m.from * 128 + m.to] || 0) + depth * depth;
            }
            break;
          }
        }
      }
    }
    repStack.pop();
    if (stopFlag) return 0;
    if (!legalCount) return check ? -MATE + ply : 0;
    if (TT.size > 600000) TT.clear();
    TT.set(h, { depth, score: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0, move: bestMove });
    return best;
  }
  function extractPV(s, first, maxLen) {
    const pv = [first];
    let cur = apply(s, first);
    const seen = new Set([hash(s)]);
    for (let i = 1; i < maxLen; i++) {
      const h = hash(cur);
      if (seen.has(h)) break;
      seen.add(h);
      const e = TT.get(h);
      if (!e || !e.move) break;
      const L = legal(cur);
      const m = L.find(x => x.from === e.move.from && x.to === e.move.to && x.promotion === e.move.promotion);
      if (!m) break;
      pv.push(m);
      cur = apply(cur, m);
    }
    return pv;
  }
  /* opts: { movetime, depth, history:[hashes], skill (0..20), onInfo } */
  function search(s, opts = {}) {
    const t0 = Date.now();
    const movetime = opts.movetime || 1000;
    let maxDepth = opts.depth || 64;
    const skill = opts.skill == null ? 20 : opts.skill;
    if (skill < 20) maxDepth = Math.min(maxDepth, 1 + Math.floor(skill / 3));
    noiseAmp = skill < 20 ? (20 - skill) * 14 : 0;
    deadline = t0 + movetime;
    nodes = 0; stopFlag = false; checkTime = false;
    killers = []; historyTbl = {};
    repStack = (opts.history || []).slice();
    const L = legal(s);
    if (!L.length) return { bestMove: null, score: inCheck(s) ? -MATE : 0, pv: [], depth: 0 };
    let result = { bestMove: L[0], score: 0, pv: [L[0]], depth: 0 };
    const h0 = hash(s);
    for (let d = 1; d <= maxDepth; d++) {
      const sc = negamax(s, d, -INF, INF, 0, h0);
      if (stopFlag) break;
      const e = TT.get(h0);
      const bm = e && e.move ? L.find(x => x.from === e.move.from && x.to === e.move.to && x.promotion === e.move.promotion) : null;
      if (bm) result = { bestMove: bm, score: sc, pv: extractPV(s, bm, d + 6), depth: d };
      if (opts.onInfo) opts.onInfo({ depth: d, score: sc, nodes, time: Date.now() - t0, pv: result.pv });
      checkTime = true;
      if (Math.abs(sc) > MATE - 500 && d > 2) break;
      if (Date.now() - t0 > movetime * 0.5) break;
      if (L.length === 1 && d >= 4) break;
    }
    noiseAmp = 0;
    return result;
  }
  function clearTT() { TT.clear(); }

  /* ---------------- Worker UCI del motor interno ---------------- */
  function scoreToUci(sc) {
    if (Math.abs(sc) > MATE - 1000) {
      const plies = MATE - Math.abs(sc);
      return "mate " + (sc > 0 ? Math.ceil(plies / 2) : -Math.ceil(plies / 2));
    }
    return "cp " + Math.round(sc);
  }
  function workerMain(scope) {
    let pos = parseFen(START_FEN), hist = [], skill = 20;
    const post = x => scope.postMessage(x);
    scope.onmessage = e => {
      const line = String(e.data || "").trim();
      if (line === "uci") { post("id name AjedrezBase Interno 2.0"); post("uciok"); return; }
      if (line === "isready") { post("readyok"); return; }
      if (line === "ucinewgame") { clearTT(); return; }
      let m = line.match(/^setoption name Skill Level value (\d+)/i);
      if (m) { skill = Math.max(0, Math.min(20, +m[1])); return; }
      if (line.startsWith("position")) {
        m = line.match(/^position\s+(?:startpos|fen\s+(.+?))(?:\s+moves\s+(.*))?$/);
        try {
          pos = parseFen(m && m[1] ? m[1] : START_FEN);
          hist = [hash(pos)];
          if (m && m[2]) for (const u of m[2].trim().split(/\s+/)) {
            const mv = moveFromUci(pos, u);
            if (!mv) break;
            pos = apply(pos, mv);
            hist.push(hash(pos));
          }
        } catch (err) { post("info string error " + err.message); }
        return;
      }
      if (line.startsWith("go")) {
        const mt = line.match(/movetime\s+(\d+)/), dp = line.match(/depth\s+(\d+)/);
        const movetime = mt ? +mt[1] : line.includes("infinite") ? 2500 : 1500;
        const res = search(pos, {
          movetime, depth: dp ? +dp[1] : 64, skill, history: hist.slice(0, -1),
          onInfo: i => post(`info depth ${i.depth} multipv 1 score ${scoreToUci(i.score)} nodes ${i.nodes} time ${i.time} pv ${i.pv.map(uci).join(" ")}`)
        });
        post("bestmove " + (res.bestMove ? uci(res.bestMove) : "(none)"));
      }
    };
  }

  return {
    START_FEN, FILES, VAL, on, color, sqName, sqIdx, parseFen, toFen, boardFen, posKey, clone,
    attacked, attackers, kingSq, inCheck, pseudo, legal, apply, san, sanBase, uci, moveFromUci,
    parseMove, cleanToken, insufficient, material, hash, evaluate, search, clearTT, workerMain, MATE
  };
})();
