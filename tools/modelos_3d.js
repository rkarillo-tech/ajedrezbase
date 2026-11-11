#!/usr/bin/env node
/* Genera assets/3d/piezas.bin (las piezas «realistas» del tablero 3D) a partir del modelo
   «A Beautiful Game» (Khronos glTF Sample Assets, CC BY 4.0: MaterialX Project / ASWF, conversión de Ed Mackey).

   Uso (sólo hace falta para regenerar el fichero; no forma parte de la construcción):
     curl -LO https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ABeautifulGame/glTF-Binary/ABeautifulGame.glb
     npm i --no-save meshoptimizer@0.22.0 sharp@0.33.5
     node tools/modelos_3d.js ABeautifulGame.glb

   Qué hace: toma una pieza de cada tipo, la centra en su casilla (base en y = 0, mirando hacia las negras,
   una casilla = 1 unidad), simplifica la malla, cuantiza vértices, normales y coordenadas de textura, y reduce
   las texturas. El resultado es un único fichero: [4 bytes: longitud de la cabecera][cabecera JSON][datos]. */
"use strict";
const fs = require("fs");
const path = require("path");
const { MeshoptSimplifier } = require("meshoptimizer");
const sharp = require("sharp");

const SRC = process.argv[2] || "ABeautifulGame.glb";
const OUT = path.join(__dirname, "..", "assets", "3d", "piezas.bin");
const SQUARE = 0.0625;   // tamaño de una casilla en el modelo original (metros)
const PIECES = { k: "King_W", q: "Queen_W", r: "Castle_W1", n: "Knight_W1", b: "Bishop_W1", p: "Pawn_Body_W1" };
const BLACK = { k: "King_B", q: "Queen_B", r: "Castle_B1", n: "Knight_B1", b: "Bishop_B1", p: "Pawn_Body_B1" };
const TRIS = { k: 7000, q: 7000, r: 5000, n: 6000, b: 7000, p: 3500, top: 600 };

// ---------- lectura del GLB
const glb = fs.readFileSync(SRC);
const jsonLen = glb.readUInt32LE(12);
const G = JSON.parse(glb.slice(20, 20 + jsonLen).toString("utf8"));
const binStart = 20 + jsonLen + 8;
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = G.accessors[i], bv = G.bufferViews[a.bufferView], [T, size] = COMP[a.componentType], n = NUM[a.type];
  const stride = bv.byteStride || size * n, base = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const off = base + k * stride + c * size;
    out[k * n + c] = T === Float32Array ? glb.readFloatLE(off) : T === Uint16Array ? glb.readUInt16LE(off) : T === Uint32Array ? glb.readUInt32LE(off) : T === Uint8Array ? glb.readUInt8(off) : T === Int16Array ? glb.readInt16LE(off) : glb.readInt8(off);
  }
  return out;
}
function image(texIndex) {
  const img = G.images[G.textures[texIndex].source], bv = G.bufferViews[img.bufferView];
  return glb.slice(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength);
}

// ---------- matrices (columna a columna, como glTF)
const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function local(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const parentOf = {};
G.nodes.forEach((n, i) => (n.children || []).forEach(c => { parentOf[c] = i; }));
function world(i) { let m = local(G.nodes[i]); for (let p = parentOf[i]; p != null; p = parentOf[p]) m = mul(local(G.nodes[p]), m); return m; }
const nodeByName = name => G.nodes.findIndex(n => n.name === name);

// ---------- una malla en coordenadas del mundo
function meshWorld(nodeIndex) {
  const node = G.nodes[nodeIndex], prim = G.meshes[node.mesh].primitives[0], M = world(nodeIndex);
  const P = accessor(prim.attributes.POSITION), N = accessor(prim.attributes.NORMAL), UV = accessor(prim.attributes.TEXCOORD_0), I = accessor(prim.indices);
  const n = P.length / 3, pos = new Float64Array(n * 3), nrm = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    const [x, y, z] = [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], [a, b, c] = [N[k * 3], N[k * 3 + 1], N[k * 3 + 2]];
    pos[k * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; pos[k * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; pos[k * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    const nx = M[0] * a + M[4] * b + M[8] * c, ny = M[1] * a + M[5] * b + M[9] * c, nz = M[2] * a + M[6] * b + M[10] * c, l = Math.hypot(nx, ny, nz) || 1;
    nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
  }
  return { pos, nrm, uv: UV, idx: Uint32Array.from(I), material: prim.material };
}
/* Lleva la pieza a su sitio: centrada (con el centro de la casilla de su nodo), base en y = 0, girada 180° (en el modelo las
   blancas están en z negativa; aquí, en z positiva) y una casilla = 1 unidad */
function normalise(m, cx, cz, y0) {
  for (let k = 0; k < m.pos.length; k += 3) {
    m.pos[k] = -(m.pos[k] - cx) / SQUARE; m.pos[k + 1] = (m.pos[k + 1] - y0) / SQUARE; m.pos[k + 2] = -(m.pos[k + 2] - cz) / SQUARE;
    m.nrm[k] = -m.nrm[k]; m.nrm[k + 2] = -m.nrm[k + 2];
  }
}
async function simplify(m, tris) {
  await MeshoptSimplifier.ready;
  let idx = m.idx;
  if (idx.length / 3 > tris) {
    const [out] = MeshoptSimplifier.simplify(idx, Float32Array.from(m.pos), 3, tris * 3, 0.004, []);
    idx = out;
  }
  // quitar los vértices que ya no se usan
  const remap = new Int32Array(m.pos.length / 3).fill(-1), keep = [];
  const nIdx = new Uint32Array(idx.length);
  for (let k = 0; k < idx.length; k++) { const v = idx[k]; if (remap[v] < 0) { remap[v] = keep.length; keep.push(v); } nIdx[k] = remap[v]; }
  const pick = (src, n) => { const o = new Float64Array(keep.length * n); keep.forEach((v, j) => { for (let c = 0; c < n; c++) o[j * n + c] = src[v * n + c]; }); return o; };
  return { pos: pick(m.pos, 3), nrm: pick(m.nrm, 3), uv: pick(m.uv, 2), idx: nIdx, material: m.material };
}

// ---------- empaquetado
const chunks = [];
let offset = 0;
function put(buf) { const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; } const at = offset; chunks.push(buf); offset += buf.length; return [at, buf.length]; }
function packGeo(m) {
  const n = m.pos.length / 3, min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9], umin = [1e9, 1e9], umax = [-1e9, -1e9];
  for (let k = 0; k < n; k++) { for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], m.pos[k * 3 + c]); max[c] = Math.max(max[c], m.pos[k * 3 + c]); } for (let c = 0; c < 2; c++) { umin[c] = Math.min(umin[c], m.uv[k * 2 + c]); umax[c] = Math.max(umax[c], m.uv[k * 2 + c]); } }
  const ext = max.map((v, c) => v - min[c] || 1), uext = umax.map((v, c) => v - umin[c] || 1);
  const pos = Buffer.alloc(n * 6), nrm = Buffer.alloc(n * 3), uv = Buffer.alloc(n * 4);
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < 3; c++) pos.writeUInt16LE(Math.round((m.pos[k * 3 + c] - min[c]) / ext[c] * 65535), (k * 3 + c) * 2);
    for (let c = 0; c < 3; c++) nrm.writeInt8(Math.round(m.nrm[k * 3 + c] * 127), k * 3 + c);
    for (let c = 0; c < 2; c++) uv.writeUInt16LE(Math.round((m.uv[k * 2 + c] - umin[c]) / uext[c] * 65535), (k * 2 + c) * 2);
  }
  const idx = Buffer.alloc(m.idx.length * 2);
  m.idx.forEach((v, k) => idx.writeUInt16LE(v, k * 2));
  return { n, i: m.idx.length, pos: put(pos)[0], nrm: put(nrm)[0], uv: put(uv)[0], idx: put(idx)[0], min, ext, umin, uext };
}
async function packTex(texIndex, size, quality) {
  const jpg = await sharp(image(texIndex)).resize(size, size, { fit: "fill" }).jpeg({ quality, mozjpeg: true }).toBuffer();
  return put(jpg);
}
async function packMaterial(mi, size) {
  const mt = G.materials[mi], pb = mt.pbrMetallicRoughness || {}, out = {};
  if (pb.baseColorTexture) out.map = await packTex(pb.baseColorTexture.index, size, 80);
  if (pb.metallicRoughnessTexture) out.orm = await packTex(pb.metallicRoughnessTexture.index, Math.min(256, size), 82);
  out.ao = !!mt.occlusionTexture;
  if (pb.baseColorFactor) out.color = pb.baseColorFactor.slice(0, 3);
  out.rough = pb.roughnessFactor != null ? pb.roughnessFactor : 1;
  out.metal = pb.metallicFactor != null ? pb.metallicFactor : 1;
  if (mt.extensions && mt.extensions.KHR_materials_transmission) out.glass = true;
  return out;
}

(async () => {
  const head = { v: 1, credit: "«A Beautiful Game» (Khronos glTF Sample Assets), CC BY 4.0: MaterialX Project / ASWF; conversión a glTF de Ed Mackey", pieces: {} };
  for (const [t, name] of Object.entries(PIECES)) {
    const ni = nodeByName(name), M = world(ni);
    let m = meshWorld(ni);
    let y0 = Infinity; for (let k = 1; k < m.pos.length; k += 3) y0 = Math.min(y0, m.pos[k]);
    const [cx, cz] = [M[12], M[14]];
    // El centro de la casilla: el centro de la caja de la peana (las 2 % más bajas de la pieza)
    let sx = 0, sz = 0, cnt = 0, minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let k = 0; k < m.pos.length; k += 3) if (m.pos[k + 1] < y0 + 0.002) { minx = Math.min(minx, m.pos[k]); maxx = Math.max(maxx, m.pos[k]); minz = Math.min(minz, m.pos[k + 2]); maxz = Math.max(maxz, m.pos[k + 2]); cnt++; }
    const ccx = cnt ? (minx + maxx) / 2 : cx, ccz = cnt ? (minz + maxz) / 2 : cz;
    normalise(m, ccx, ccz, y0);
    m = await simplify(m, TRIS[t]);
    const entry = { geo: packGeo(m), w: await packMaterial(m.material, 512), b: await packMaterial(meshWorld(nodeByName(BLACK[t])).material, 512) };
    if (t === "p") {
      const topW = G.nodes[ni].children[0], topB = G.nodes[nodeByName(BLACK[t])].children[0];
      let top = meshWorld(topW);
      normalise(top, ccx, ccz, y0);
      top = await simplify(top, TRIS.top);
      entry.top = packGeo(top);
      entry.topW = await packMaterial(top.material, 64);
      entry.topB = await packMaterial(meshWorld(topB).material, 64);
    }
    head.pieces[t] = entry;
    const h = entry.geo.min[1] + entry.geo.ext[1];
    console.log(`${t}: ${entry.geo.i / 3} triángulos, ${entry.geo.n} vértices, alto ${h.toFixed(2)} casillas, ancho ${entry.geo.ext[0].toFixed(2)}`);
  }
  const json = Buffer.from(JSON.stringify(head), "utf8"), len = Buffer.alloc(4);
  let start = 4 + json.length; const pad = (4 - (start % 4)) % 4;
  len.writeUInt32LE(json.length + pad);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.concat([len, json, Buffer.alloc(pad, 0x20), ...chunks]));
  console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
})();
