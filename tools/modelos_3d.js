#!/usr/bin/env node
/* Genera assets/3d/piezas.bin (las piezas Staunton del tablero 3D) a partir del juego «Chess board & pieces»
   de OpenGameArt (https://opengameart.org/content/chess-board-pieces, CC0: dominio público), que tiene las
   proporciones reglamentarias (el rey mide unas 1,67 casillas).

   Uso (sólo hace falta para regenerar el fichero; no forma parte de la construcción):
     1. Descarga wood_chess_board_0.zip de esa página y descomprímelo.
     2. Exporta las piezas blancas a GLB con Blender 5 (o el paquete «bpy» de Python, 5.1 o posterior):
          python3 tools/modelos_3d_exportar.py "wood chess board.blend" carpeta_salida
     3. npm i --no-save meshoptimizer@0.22.0
        node tools/modelos_3d.js carpeta_salida

   Qué hace: centra cada pieza en su casilla (base en y = 0, una casilla = 1 unidad, el caballo mirando hacia las
   negras), simplifica la malla y cuantiza vértices y normales. Sin texturas: el material lo pone la aplicación.
   El resultado es un único fichero: [4 bytes: longitud de la cabecera][cabecera JSON][datos]. */
"use strict";
const fs = require("fs");
const path = require("path");
const { MeshoptSimplifier } = require("meshoptimizer");

const DIR = process.argv[2] || ".";
const OUT = path.join(__dirname, "..", "assets", "3d", "piezas.bin");
const SQUARE = 4.56 / 8;   // casilla del tablero original (unidades de Blender)
const FILES = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const TRIS = { k: 6000, q: 6000, r: 4000, b: 5000, n: 7000, p: 3500 };

function readGlb(file) {
  const glb = fs.readFileSync(file), jsonLen = glb.readUInt32LE(12);
  const G = JSON.parse(glb.slice(20, 20 + jsonLen).toString("utf8")), bin = 20 + jsonLen + 8;
  const read = i => {
    const a = G.accessors[i], bv = G.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType], stride = bv.byteStride || size * n, base = bin + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const off = base + k * stride + c * size;
      out[k * n + c] = a.componentType === 5126 ? glb.readFloatLE(off) : a.componentType === 5125 ? glb.readUInt32LE(off) : a.componentType === 5123 ? glb.readUInt16LE(off) : glb.readUInt8(off);
    }
    return out;
  };
  // Todas las primitivas de todas las mallas, juntas (las piezas exportadas no llevan transformaciones)
  const pos = [], nrm = [], idx = [];
  for (const node of G.nodes) {
    if (node.mesh == null) continue;
    for (const pr of G.meshes[node.mesh].primitives) {
      const base = pos.length / 3, P = read(pr.attributes.POSITION), N = read(pr.attributes.NORMAL), I = read(pr.indices);
      const [sx, sy, sz] = node.scale || [1, 1, 1], [tx, ty, tz] = node.translation || [0, 0, 0];
      for (let k = 0; k < P.length; k += 3) { pos.push(P[k] * sx + tx, P[k + 1] * sy + ty, P[k + 2] * sz + tz); nrm.push(N[k], N[k + 1], N[k + 2]); }
      for (const v of I) idx.push(v + base);
    }
  }
  return { pos: Float64Array.from(pos), nrm: Float64Array.from(nrm), idx: Uint32Array.from(idx) };
}
function normalise(m, turn) {
  let y0 = Infinity, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let k = 0; k < m.pos.length; k += 3) y0 = Math.min(y0, m.pos[k + 1]);
  for (let k = 0; k < m.pos.length; k += 3) if (m.pos[k + 1] < y0 + 0.02) { minx = Math.min(minx, m.pos[k]); maxx = Math.max(maxx, m.pos[k]); minz = Math.min(minz, m.pos[k + 2]); maxz = Math.max(maxz, m.pos[k + 2]); }
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2, c = Math.cos(turn), s = Math.sin(turn);
  for (let k = 0; k < m.pos.length; k += 3) {
    const x = (m.pos[k] - cx) / SQUARE, z = (m.pos[k + 2] - cz) / SQUARE;
    m.pos[k] = c * x + s * z; m.pos[k + 1] = (m.pos[k + 1] - y0) / SQUARE; m.pos[k + 2] = -s * x + c * z;
    const nx = m.nrm[k], nz = m.nrm[k + 2];
    m.nrm[k] = c * nx + s * nz; m.nrm[k + 2] = -s * nx + c * nz;
  }
}
async function simplify(m, tris) {
  await MeshoptSimplifier.ready;
  let idx = m.idx;
  if (idx.length / 3 > tris) idx = MeshoptSimplifier.simplify(idx, Float32Array.from(m.pos), 3, tris * 3, 0.002, [])[0];
  const remap = new Int32Array(m.pos.length / 3).fill(-1), keep = [], nIdx = new Uint32Array(idx.length);
  for (let k = 0; k < idx.length; k++) { const v = idx[k]; if (remap[v] < 0) { remap[v] = keep.length; keep.push(v); } nIdx[k] = remap[v]; }
  const pick = src => { const o = new Float64Array(keep.length * 3); keep.forEach((v, j) => { for (let c = 0; c < 3; c++) o[j * 3 + c] = src[v * 3 + c]; }); return o; };
  return { pos: pick(m.pos), nrm: pick(m.nrm), idx: nIdx };
}

const chunks = [];
let offset = 0;
function put(buf) { const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; } const at = offset; chunks.push(buf); offset += buf.length; return at; }
function pack(m) {
  const n = m.pos.length / 3, min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], m.pos[k * 3 + c]); max[c] = Math.max(max[c], m.pos[k * 3 + c]); }
  const ext = max.map((v, c) => v - min[c] || 1), pos = Buffer.alloc(n * 6), nrm = Buffer.alloc(n * 3), idx = Buffer.alloc(m.idx.length * 2);
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) {
    pos.writeUInt16LE(Math.round((m.pos[k * 3 + c] - min[c]) / ext[c] * 65535), (k * 3 + c) * 2);
    nrm.writeInt8(Math.max(-127, Math.min(127, Math.round(m.nrm[k * 3 + c] * 127))), k * 3 + c);
  }
  m.idx.forEach((v, k) => idx.writeUInt16LE(v, k * 2));
  return { n, i: m.idx.length, pos: put(pos), nrm: put(nrm), idx: put(idx), min, ext };
}

(async () => {
  const head = { v: 2, credit: "«Chess board & pieces» (OpenGameArt), CC0", pieces: {} };
  for (const [t, f] of Object.entries(FILES)) {
    let m = readGlb(path.join(DIR, `staunton_${f}.glb`));
    // El caballo del original mira hacia z positiva: se gira para que mire hacia las negras (z negativa)
    normalise(m, t === "n" ? Math.PI : 0);
    m = await simplify(m, TRIS[t]);
    const g = pack(m);
    head.pieces[t] = g;
    console.log(`${t}: ${g.i / 3} triángulos, ${g.n} vértices, alto ${(g.min[1] + g.ext[1]).toFixed(2)} casillas, base ${g.ext[0].toFixed(2)}`);
  }
  const json = Buffer.from(JSON.stringify(head), "utf8"), len = Buffer.alloc(4), pad = (4 - ((4 + json.length) % 4)) % 4;
  len.writeUInt32LE(json.length + pad);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.concat([len, json, Buffer.alloc(pad, 0x20), ...chunks]));
  console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
})();
