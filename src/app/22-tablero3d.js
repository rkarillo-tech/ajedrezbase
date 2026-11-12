/* ---------- 9b. Tablero 3D (opcional: ⚙ Ajustes › «Tablero en 3D») ----------
   Three.js (MIT) no va incluido: se descarga de jsDelivr (o de unpkg) la primera vez que se activa, como Stockfish,
   y la versión instalada lo guarda para usarlo sin conexión. Las piezas se generan aquí (perfiles de revolución y la
   silueta del caballo), sin modelos externos. Casillas, coordenadas, marcas y flechas se dibujan en la textura del tablero.
   El tablero plano sigue debajo, oculto: si el 3D no se puede usar (editor de posición, visualización, sin WebGL o sin
   conexión la primera vez) se vuelve a ver él, y todo lo demás funciona igual. Se mueve pulsando origen y destino. */
const THREE_URLS = ["{{THREE_JS}}", "{{THREE_JS_B}}"];
const B3 = {
  T: null, loading: null, failed: false, active: false, ready: false,
  renderer: null, scene: null, camera: null, wrap: null, canvas: null, tex: null, ctx: null, plane: null,
  geo: {}, mat: {}, meshes: new Map(), frame: 0, anims: [],
  view: { theta: 0, phi: 0.74, zoom: 1 }, ptrs: new Map(), pinch: 0, moved: false, down: null
};
const B3_TEX = 1024, B3_SIZE = 9.2, B3_BORDER = (B3_SIZE - 8) / 2;
/* Piezas Staunton con proporciones de torneo: «Chess board & pieces» (OpenGameArt, CC0), preparadas con tools/modelos_3d.js.
   Si no se pueden descargar, se usan las piezas generadas aquí (más sencillas) */
const B3_MODEL = "assets/3d/piezas.bin", B3_MODEL_WEB = "https://rkarillo-tech.github.io/ajedrezbase/";
const b3Real = () => !!B3.model;
/* Aspecto del 3D (⚙ Ajustes): colores de las piezas (pw, pb), de las casillas (sl, sd; null = los del tablero plano), del marco y de las coordenadas.
   Lo importante para distinguir las piezas es que su color no se parezca al de las casillas: las piezas de madera sobre un
   tablero casi blanco y negro (como muchos juegos de torneo) se leen sin tener que girar la vista */
const B3_LOOKS = {
  wood: { pw: "#ecd3a6", pb: "#7b4a28", sl: "#efece4", sd: "#33302d", frame: "#c9a273", coord: "#3b2a1a", grain: true },
  classic: { pw: "#f8f2e6", pb: "#181514", sl: null, sd: null, frame: "#5a3c29", coord: "#e9dcc6", grain: false },
  contrast: { pw: "#ffffff", pb: "#141414", sl: "#8f9b83", sd: "#5a7055", frame: "#3a3f45", coord: "#e8ecef", grain: false }
};
function b3Look() {
  const L = B3_LOOKS[settings.board3dLook] || (settings.board3dLook === "custom" ? null : B3_LOOKS.wood);
  if (L) return L;
  const c = Object.assign({ pw: "#ecd3a6", pb: "#7b4a28", sl: "#efece4", sd: "#33302d" }, settings.board3dColors || {});
  return { pw: c.pw, pb: c.pb, sl: c.sl, sd: c.sd, frame: "#b08a5e", coord: "#2a1d12", grain: true };
}
/* Aplica el aspecto a los materiales y a la textura del tablero */
function board3dApplyLook() {
  if (!B3.ready) return;
  const T = B3.T, L = b3Look();
  const set = (m, col, grain) => { if (!m) return; m.color = new T.Color(col); m.map = grain ? B3.grayGrain : null; m.needsUpdate = true; };
  set(B3.mat.frame, L.frame, true);
  set(B3.mat.w, L.pw, true); set(B3.mat.b, L.pb, true);
  if (B3.model) { set(B3.model.matW, L.pw, L.grain); set(B3.model.matB, L.pb, L.grain); }
  board3dDraw();
}
/* ¿Debe verse el 3D ahora? En el editor y en la visualización hace falta el tablero plano */
const board3dWanted = () => !!settings.board3d && !B3.failed && !editor.active && !Vis.active && !ui.visBoard;

async function board3dLoad() {
  if (B3.T || B3.loading) return B3.loading;
  B3.loading = (async () => {
    for (const url of THREE_URLS) {
      try { const T = await import(url); if (T && T.WebGLRenderer) { B3.T = T; return T; } } catch (e) { console.warn("Tablero 3D: no se pudo cargar " + url, e); }
    }
    return null;
  })();
  const T = await B3.loading;
  B3.loading = null;
  if (!T) { B3.failed = true; toast("No se pudo descargar el tablero 3D (¿sin conexión?). Sigue el tablero plano; vuelve a activarlo en ⚙ Ajustes cuando tengas conexión.", 6000); }
  return T;
}

/* Activa o desactiva el 3D según los ajustes y el modo actual (se llama al dibujar el tablero) */
function board3dSync() {
  const want = board3dWanted();
  if (want && !B3.ready) {
    if (!B3.T) { board3dLoading(true); board3dLoad().then(T => { board3dLoading(false); if (T && board3dWanted()) { board3dInit(); renderBoard(); } else board3dShow(false); }); return; }
    board3dInit();
  }
  board3dShow(want && B3.ready);
  if (B3.active && B3.model === undefined && !B3.modelLoading) board3dLoadModel().then(() => { if (B3.active) { board3dRebuild(); renderBoard(); } });
  if (B3.active) board3dUpdate();
}
/* Las piezas Staunton: un fichero con las mallas cuantizadas (ver tools/modelos_3d.js) */
function board3dLoadModel() {
  if (B3.modelLoading) return B3.modelLoading;
  B3.modelLoading = (async () => {
    try {
      const res = await fetch((/^https?:$/.test(location.protocol) ? "" : B3_MODEL_WEB) + B3_MODEL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      B3.model = await board3dParseModel(await res.arrayBuffer());
    } catch (e) {
      console.warn("Tablero 3D: no se pudieron cargar las piezas Staunton", e);
      B3.model = null;
      toast("No se pudieron descargar las piezas Staunton del tablero 3D: se usan unas más sencillas.", 4500);
    }
    B3.modelLoading = null;
    return B3.model;
  })();
  return B3.modelLoading;
}
async function board3dParseModel(buf) {
  const T = B3.T, hl = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), data = 4 + hl;
  if (head.v !== 2) throw new Error("formato de piezas desconocido");
  const out = {};
  for (const [t2, g] of Object.entries(head.pieces)) {
    const qp = new Uint16Array(buf, data + g.pos, g.n * 3), qn = new Int8Array(buf, data + g.nrm, g.n * 3);
    const pos = new Float32Array(g.n * 3), nrm = new Float32Array(g.n * 3);
    for (let k = 0; k < g.n * 3; k++) { const c = k % 3; pos[k] = g.min[c] + qp[k] / 65535 * g.ext[c]; nrm[k] = qn[k] / 127; }
    const geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.BufferAttribute(pos, 3));
    geom.setAttribute("normal", new T.BufferAttribute(nrm, 3));
    // Coordenadas de textura «de torno» (alrededor y a lo alto), para la veta de la madera
    const uv = new Float32Array(g.n * 2);
    for (let k = 0; k < g.n; k++) { uv[k * 2] = (Math.atan2(pos[k * 3 + 2], pos[k * 3]) / (2 * Math.PI) + 0.5) * 2; uv[k * 2 + 1] = pos[k * 3 + 1] * 1.2; }
    geom.setAttribute("uv", new T.BufferAttribute(uv, 2));
    geom.setIndex(new T.BufferAttribute(new Uint16Array(buf.slice(data + g.idx, data + g.idx + g.i * 2)), 1));
    geom.computeBoundingSphere();
    out[t2] = { geo: geom };
  }
  // Madera barnizada; el color (y si lleva veta) lo pone el aspecto elegido
  const L = b3Look();
  out.matW = new T.MeshPhysicalMaterial({ color: L.pw, map: L.grain ? B3.grayGrain : null, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18, sheen: 0.2, sheenColor: new T.Color(0xffffff) });
  out.matB = new T.MeshPhysicalMaterial({ color: L.pb, map: L.grain ? B3.grayGrain : null, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  return out;
}
/* Vuelve a crear todas las piezas (cuando llegan las Staunton) */
function board3dRebuild() {
  if (!B3.ready) return;
  for (const m of B3.meshes.values()) B3.scene.remove(m);
  B3.meshes = new Map();
}
function board3dLoading(on) {
  let el = $("board3dLoading");
  if (on && !el) { $("boardWrap").insertAdjacentHTML("beforeend", `<div id="board3dLoading" class="board3d-loading">🧊 Cargando el tablero 3D…</div>`); el = $("board3dLoading"); }
  if (el) el.hidden = !on;
}
function board3dShow(on) {
  B3.active = on;
  $("boardWrap").classList.toggle("is-3d", on);
  if (B3.wrap) B3.wrap.hidden = !on;
}

function board3dInit() {
  if (B3.ready) return;
  const T = B3.T;
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (e) { console.warn("Tablero 3D: sin WebGL", e); B3.failed = true; toast("Este navegador no puede dibujar en 3D (WebGL). Sigue el tablero plano."); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  B3.renderer = renderer;
  B3.canvas = renderer.domElement;
  B3.canvas.setAttribute("aria-label", "Tablero de ajedrez en 3D: pulsa la pieza y después la casilla de destino. Arrastra para girar la vista.");
  B3.canvas.setAttribute("role", "img");
  B3.wrap = document.createElement("div");
  B3.wrap.id = "board3d";
  B3.wrap.className = "board3d";
  B3.wrap.append(B3.canvas);
  B3.wrap.insertAdjacentHTML("beforeend", `<div class="board3d-tools"><button type="button" class="sm-btn" data-b3="in" title="Acercar" aria-label="Acercar">＋</button><button type="button" class="sm-btn" data-b3="out" title="Alejar" aria-label="Alejar">－</button><button type="button" class="sm-btn" data-b3="top" title="Vista desde arriba" aria-label="Vista desde arriba">⬒</button><button type="button" class="sm-btn" data-b3="reset" title="Vista inicial" aria-label="Vista inicial">⟲</button></div>`);
  $("boardWrap").append(B3.wrap);

  const scene = B3.scene = new T.Scene();
  B3.camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
  scene.environment = board3dEnvironment(renderer);   // reflejos suaves, como en una habitación con ventanas
  scene.environmentIntensity = 0.75;
  scene.add(new T.HemisphereLight(0xfff4e2, 0x2e3340, 0.55));
  const sun = new T.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(-4, 11, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  B3.rim = new T.DirectionalLight(0xdfe8ff, 1.5);   // casi a ras del tablero: da de lado a las piezas y apenas toca las casillas
  scene.add(B3.rim, B3.rim.target);

  // Tablero: un marco con grosor y, encima, la textura con casillas, coordenadas, marcas y flechas
  const cv = document.createElement("canvas");
  cv.width = cv.height = B3_TEX;
  B3.ctx = cv.getContext("2d");
  B3.tex = new T.CanvasTexture(cv);
  B3.tex.colorSpace = T.SRGBColorSpace;
  B3.tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  B3.grayGrain = board3dGrain("#ffffff", "#b9b2a8", "#ffffff", 512, 7);
  B3.grayGrain.colorSpace = T.SRGBColorSpace;
  B3.grayGrain.wrapS = B3.grayGrain.wrapT = T.RepeatWrapping;
  const frameMat = B3.mat.frame = new T.MeshPhysicalMaterial({ color: b3Look().frame, map: B3.grayGrain, roughness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const half = B3_SIZE / 2 + 0.12, rr = 0.22, rect = new T.Shape();
  rect.moveTo(-half + rr, -half); rect.lineTo(half - rr, -half); rect.quadraticCurveTo(half, -half, half, -half + rr);
  rect.lineTo(half, half - rr); rect.quadraticCurveTo(half, half, half - rr, half); rect.lineTo(-half + rr, half);
  rect.quadraticCurveTo(-half, half, -half, half - rr); rect.lineTo(-half, -half + rr); rect.quadraticCurveTo(-half, -half, -half + rr, -half);
  const frameGeo = new T.ExtrudeGeometry(rect, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.06, bevelSegments: 4, curveSegments: 6 });
  frameGeo.rotateX(-Math.PI / 2);
  frameGeo.translate(0, -0.352, 0);
  const base = new T.Mesh(frameGeo, frameMat);
  base.receiveShadow = true;
  scene.add(base);
  B3.plane = new T.Mesh(new T.PlaneGeometry(B3_SIZE, B3_SIZE), new T.MeshPhysicalMaterial({ map: B3.tex, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.35 }));
  B3.plane.rotation.x = -Math.PI / 2;
  B3.plane.position.y = 0.002;
  B3.plane.receiveShadow = true;
  scene.add(B3.plane);

  B3.mat.w = new T.MeshPhysicalMaterial({ color: b3Look().pw, map: B3.grayGrain, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.22, sheen: 0.2, sheenColor: new T.Color(0xfff3dd) });
  B3.mat.b = new T.MeshPhysicalMaterial({ color: b3Look().pb, map: B3.grayGrain, roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.18 });
  B3.mat.felt = new T.MeshStandardMaterial({ color: 0x1f4a2c, roughness: 1 });
  B3.mat.slitW = new T.MeshStandardMaterial({ color: 0x6b5a40, roughness: 0.8 });
  B3.mat.slitB = new T.MeshStandardMaterial({ color: 0x060404, roughness: 0.8 });
  board3dGeometries();
  board3dEvents();
  new ResizeObserver(() => board3dResize()).observe($("boardWrap"));
  B3.ready = true;
  board3dResize();
}

/* --- Madera: una textura con veta (líneas onduladas a lo largo, como en una pieza torneada) --- */
function board3dGrain(base, dark, light, size, seed) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d");
  let x = seed * 9973;
  const rnd = () => { x = (x * 16807) % 2147483647; return (x & 0xffff) / 0xffff; };
  c.fillStyle = base; c.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 0.6; i++) {
    const x0 = rnd() * size, w = 0.6 + rnd() * 2.2, amp = 2 + rnd() * 6, freq = 1 + Math.floor(rnd() * 3), ph = rnd() * 6.28;
    c.strokeStyle = rnd() < 0.7 ? dark : light;
    c.globalAlpha = 0.05 + rnd() * 0.16;
    c.lineWidth = w;
    c.beginPath();
    for (let y = 0; y <= size; y += 8) { const xx = x0 + Math.sin(y / size * 6.283 * freq + ph) * amp; y ? c.lineTo(xx, y) : c.moveTo(xx, y); }
    c.stroke();
  }
  c.globalAlpha = 1;
  return new B3.T.CanvasTexture(cv);
}
/* Un «estudio» sencillo para los reflejos: paredes oscuras y unas ventanas luminosas (como RoomEnvironment de Three.js) */
function board3dEnvironment(renderer) {
  const T = B3.T, env = new T.Scene(), pmrem = new T.PMREMGenerator(renderer);
  const room = new T.Mesh(new T.BoxGeometry(24, 14, 24), new T.MeshBasicMaterial({ color: 0x4a4b52, side: T.BackSide }));
  room.position.y = 5;
  env.add(room);
  const panel = (w, h, pos, rot, s) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(s, s * 0.97, s * 0.9), side: T.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); env.add(m); };
  panel(10, 6, [0, 11.8, 0], [Math.PI / 2, 0, 0], 3.2);        // techo
  panel(7, 5, [-11.8, 6, 3], [0, Math.PI / 2, 0], 4.5);        // ventana a la izquierda
  panel(5, 3, [11.8, 5, -4], [0, -Math.PI / 2, 0], 1.6);       // otra, más tenue, a la derecha
  panel(14, 3, [0, 3, -11.8], [0, 0, 0], 0.9);                  // al fondo
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return tex;
}
/* --- Piezas: perfiles de revolución suavizados (radio, altura) y detalles añadidos --- */
function board3dGeometries() {
  const T = B3.T, V = (x, y) => new T.Vector2(x, y);
  const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return V(Math.max(0, cx + r * Math.cos(a)), cy + r * Math.sin(a)); });
  const smooth = (pts, n = 14) => new T.SplineCurve(pts.map(([a, b]) => V(a, b))).getPoints(n);   // tramo curvo que pasa por esos puntos
  const lathe = pts => { const g = new T.LatheGeometry(pts, 56); g.computeVertexNormals(); return g; };
  // Peana común: canto redondeado, garganta y un toro (como las piezas Staunton)
  const base = [V(0, 0), V(0.375, 0), ...arc(0.355, 0.035, 0.03, -Math.PI / 2, Math.PI / 2, 5).slice(1), V(0.35, 0.075), V(0.315, 0.09),
    ...arc(0.315, 0.115, 0.03, -Math.PI / 2, Math.PI / 2, 7), V(0.29, 0.15), V(0.265, 0.17)];
  B3.geo.p = lathe([...base, ...smooth([[0.25, 0.19], [0.19, 0.25], [0.14, 0.34], [0.115, 0.41]]), V(0.19, 0.43), ...arc(0.19, 0.445, 0.017, -Math.PI / 2, Math.PI / 2, 4).slice(1),
    V(0.12, 0.47), V(0.1, 0.49), ...arc(0, 0.6, 0.155, -Math.PI / 2 + 0.72, Math.PI / 2, 16)]);
  B3.geo.r = lathe([...base, ...smooth([[0.26, 0.19], [0.235, 0.32], [0.215, 0.48], [0.225, 0.56]]), V(0.28, 0.585), ...arc(0.28, 0.6, 0.016, -Math.PI / 2, Math.PI / 2, 4).slice(1),
    V(0.265, 0.625), V(0.265, 0.84), V(0.19, 0.84), V(0.19, 0.78), V(0, 0.78)]);
  // Almenas: seis sectores de corona, extruidos hacia arriba
  const merlon = new T.Shape(), a = Math.PI / 6 * 0.62;
  merlon.absarc(0, 0, 0.265, -a, a, false); merlon.absarc(0, 0, 0.19, a, -a, true);
  const mg = new T.ExtrudeGeometry(merlon, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 8 });
  mg.rotateX(-Math.PI / 2);
  mg.translate(0, 0.84, 0);
  B3.geo.merlon = mg;
  B3.geo.b = lathe([...base, ...smooth([[0.25, 0.19], [0.19, 0.3], [0.135, 0.45], [0.12, 0.55]]), V(0.205, 0.575), ...arc(0.205, 0.59, 0.016, -Math.PI / 2, Math.PI / 2, 4).slice(1),
    V(0.12, 0.62), ...smooth([[0.13, 0.65], [0.185, 0.74], [0.19, 0.82], [0.15, 0.92], [0.07, 1.0], [0.035, 1.025]], 18), ...arc(0, 1.07, 0.048, -Math.PI / 2, Math.PI / 2, 8)]);
  B3.geo.slit = new T.BoxGeometry(0.02, 0.2, 0.42);
  B3.geo.q = lathe([...base, ...smooth([[0.26, 0.19], [0.2, 0.36], [0.14, 0.58], [0.13, 0.72]]), V(0.225, 0.75), ...arc(0.225, 0.765, 0.016, -Math.PI / 2, Math.PI / 2, 4).slice(1),
    V(0.15, 0.8), ...smooth([[0.155, 0.84], [0.19, 0.93], [0.25, 1.04]]), V(0.255, 1.07), V(0.2, 1.075), ...smooth([[0.19, 1.08], [0.15, 1.12], [0.08, 1.16], [0, 1.175]], 10)]);
  B3.geo.ball = new T.SphereGeometry(0.042, 16, 12);
  B3.geo.topBall = new T.SphereGeometry(0.06, 20, 14);
  B3.geo.k = lathe([...base, ...smooth([[0.27, 0.19], [0.21, 0.38], [0.15, 0.62], [0.14, 0.8]]), V(0.245, 0.83), ...arc(0.245, 0.845, 0.016, -Math.PI / 2, Math.PI / 2, 4).slice(1),
    V(0.16, 0.88), ...smooth([[0.165, 0.92], [0.2, 1.0], [0.26, 1.11]]), V(0.262, 1.14), V(0.2, 1.15), ...smooth([[0.19, 1.155], [0.14, 1.2], [0.06, 1.235], [0, 1.24]], 10)]);
  // Cruz del rey, con bisel
  const cr = new T.Shape(), w = 0.035, l = 0.1;
  [[-w, 0], [w, 0], [w, 0.13], [l, 0.13], [l, 0.2], [w, 0.2], [w, 0.27], [-w, 0.27], [-w, 0.2], [-l, 0.2], [-l, 0.13], [-w, 0.13]].forEach(([x, y], i) => (i ? cr.lineTo(x, y) : cr.moveTo(x, y)));
  const cg = new T.ExtrudeGeometry(cr, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 3 });
  cg.translate(0, 1.225, -0.02);
  B3.geo.cross = cg;
  B3.geo.nBase = lathe([...base, ...smooth([[0.26, 0.19], [0.25, 0.23], [0.24, 0.26]]), V(0.2, 0.275), V(0, 0.275)]);
  // Caballo: cabeza de perfil (mirando hacia +x) con hocico, oreja y crin, extruida con un bisel amplio para que quede redondeada
  const s = new T.Shape();
  s.moveTo(-0.2, 0);
  s.lineTo(0.19, 0);
  s.quadraticCurveTo(0.22, 0.12, 0.13, 0.22);       // pecho
  s.quadraticCurveTo(0.11, 0.3, 0.17, 0.35);        // garganta
  s.quadraticCurveTo(0.27, 0.4, 0.33, 0.45);        // mandíbula
  s.quadraticCurveTo(0.385, 0.5, 0.35, 0.56);       // hocico
  s.quadraticCurveTo(0.27, 0.62, 0.18, 0.66);       // frente
  s.quadraticCurveTo(0.12, 0.7, 0.1, 0.78);         // hacia la oreja
  s.lineTo(0.06, 0.9);                              // punta de la oreja
  s.quadraticCurveTo(0.0, 0.84, -0.04, 0.78);
  s.quadraticCurveTo(-0.17, 0.72, -0.22, 0.56);     // crin
  s.quadraticCurveTo(-0.26, 0.42, -0.24, 0.26);
  s.quadraticCurveTo(-0.27, 0.12, -0.2, 0);
  const g = new T.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.055, bevelSize: 0.04, bevelSegments: 5, curveSegments: 14 });
  g.translate(0, 0.25, -0.04);
  g.computeVertexNormals();
  B3.geo.nHead = g;
  B3.geo.eye = new T.SphereGeometry(0.022, 10, 8);
  B3.geo.felt = new T.CylinderGeometry(0.345, 0.345, 0.012, 40);
}
/* Sombra de contacto: un disco difuminado bajo la pieza, que la «asienta» y la separa de la casilla */
function board3dBlob() {
  const T = B3.T;
  if (!B3.blobMat) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 18, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(0.5, "rgba(0,0,0,.2)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    B3.blobMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false });
    B3.blobGeo = new T.PlaneGeometry(0.86, 0.86).rotateX(-Math.PI / 2);
  }
  const m = new T.Mesh(B3.blobGeo, B3.blobMat);
  m.position.y = 0.006;
  m.renderOrder = 1;
  return m;
}
function board3dPiece(p) {
  const T = B3.T, white = p === p.toUpperCase(), mat = white ? B3.mat.w : B3.mat.b, type = p.toLowerCase();
  const g = new T.Group();
  if (b3Real()) {
    const md = B3.model[type], m = new T.Mesh(md.geo, white ? B3.model.matW : B3.model.matB);
    m.castShadow = m.receiveShadow = true;
    // El caballo mira hacia el rival, algo girado para que desde tu lado se vea su perfil (el resto son de revolución)
    if (type === "n") m.rotation.y = (white ? 0 : Math.PI) - 0.55;
    g.add(board3dBlob(), m);
    g.userData.p = p;
    return g;
  }
  const add = (geo, x = 0, y = 0, z = 0, m2 = mat) => { const m = new T.Mesh(geo, m2); m.position.set(x, y, z); m.castShadow = m2 === mat; m.receiveShadow = true; g.add(m); return m; };
  add(B3.geo.felt, 0, -0.004, 0, B3.mat.felt);
  if (type === "n") {
    add(B3.geo.nBase);
    const head = new T.Group();
    head.add(Object.assign(new T.Mesh(B3.geo.nHead, mat), { castShadow: true, receiveShadow: true }));
    for (const z of [-0.093, 0.093]) { const e = new T.Mesh(B3.geo.eye, white ? B3.mat.slitW : B3.mat.slitB); e.position.set(0.2, 0.83, z); head.add(e); }
    head.rotation.y = white ? Math.PI / 2 - 1.15 : -Math.PI / 2 - 1.15;   // hacia el rival, pero girado para que desde tu lado se vea su perfil
    g.add(head);
  } else add(B3.geo[type]);
  if (type === "r") for (let i = 0; i < 6; i++) { const m = add(B3.geo.merlon); m.rotation.y = i * Math.PI / 3; }
  if (type === "b") { const m = add(B3.geo.slit, 0, 0.86, 0, white ? B3.mat.slitW : B3.mat.slitB); m.rotation.set(0, white ? 0.5 : -0.5 + Math.PI, 0.55); m.position.x = 0.08 * (white ? 1 : -1); }
  if (type === "q") { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; add(B3.geo.ball, Math.cos(a) * 0.235, 1.085, Math.sin(a) * 0.235); } add(B3.geo.topBall, 0, 1.215); }
  if (type === "k") { const c = add(B3.geo.cross); c.rotation.y = white ? 0 : Math.PI; }
  g.userData.p = p;
  return g;
}
/* Mezcla dos colores CSS (#rrggbb): a + (b − a) × k */
function b3Mix(a, b, k) {
  const h = s => { const m = /^#?([0-9a-f]{6})$/i.exec(s); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const x = h(a), y = h(b);
  return x && y ? "#" + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("") : a;
}
const b3Pos = sq => [(sq & 7) - 3.5, (sq >> 4) - 3.5];   // columna a→h = x creciente; fila 8 al fondo (z negativa)

/* --- Lo que se ve: piezas en su casilla y la textura del tablero --- */
function board3dUpdate() {
  const s = viewState(), hide = !!ui.blind && !ui.peek;
  const keep = new Map();
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = s.b[i], m = B3.meshes.get(i);
    if (p === ".") { if (m) B3.scene.remove(m); continue; }
    let mesh = m && m.userData.p === p ? m : null;
    if (!mesh) { if (m) B3.scene.remove(m); mesh = board3dPiece(p); B3.scene.add(mesh); }
    const [x, z] = b3Pos(i);
    mesh.position.set(x, 0, z);
    mesh.visible = !hide;
    keep.set(i, mesh);
  }
  B3.meshes = keep;
  B3.anims = [];
}
/* Desliza la pieza que acaba de mover (y la torre, si es un enroque); el caballo da un pequeño salto */
function board3dAnimate(mv, dir) {
  if (!B3.active) return;
  const slide = (from, to) => {
    const m = B3.meshes.get(to);
    if (!m) return;
    const [x0, z0] = b3Pos(from), [x1, z1] = b3Pos(to);
    B3.anims.push({ m, x0, z0, x1, z1, t0: performance.now(), hop: m.userData.p.toLowerCase() === "n" ? 0.5 : 0.08 });
    m.position.set(x0, 0, z0);
  };
  const f = dir > 0 ? mv.from : mv.to, t = dir > 0 ? mv.to : mv.from;
  slide(f, t);
  if (mv.flag === "castle") {
    const rf = mv.to > mv.from ? mv.from + 3 : mv.from - 4, rt = mv.to > mv.from ? mv.from + 1 : mv.from - 1;
    slide(dir > 0 ? rf : rt, dir > 0 ? rt : rf);
  }
  board3dRender();
}
/* Casillas, coordenadas, última jugada, pieza elegida y sus destinos, jaque, pistas y flechas */
function board3dDraw() {
  if (!B3.active) return;
  const c = B3.ctx, W = B3_TEX, sq = W / B3_SIZE, off = B3_BORDER * sq, s = viewState(), node = cur();
  const css = getComputedStyle(document.body), LK = b3Look();
  const dark = LK.sd || css.getPropertyValue("--dark").trim() || "#b58863";
  const light = LK.sl || b3Mix(css.getPropertyValue("--light").trim() || "#f0d9b5", dark, 0.14);   // con los colores del tablero plano, algo más apagadas
  const at = i => [off + (i & 7) * sq, off + (i >> 4) * sq];
  if (!B3.grain) { const g = board3dGrain("#808080", "#3a3a3a", "#c8c8c8", 256, 11).image, h = document.createElement("canvas"); h.width = h.height = 256; const hc = h.getContext("2d"); hc.translate(256, 0); hc.rotate(Math.PI / 2); hc.drawImage(g, 0, 0); B3.grain = [g, h]; }
  c.fillStyle = b3Mix(LK.frame, "#000000", 0.18); c.fillRect(0, 0, W, W);
  c.globalCompositeOperation = "overlay"; c.globalAlpha = 0.5; c.drawImage(B3.grain[1], 0, 0, W, W); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const x = off + f * sq, y = off + r * sq;
    c.fillStyle = (r + f) % 2 ? dark : light; c.fillRect(x, y, sq + 0.5, sq + 0.5);
    // veta: cada casilla con un trozo distinto y la dirección alternada, como un tablero de marquetería
    c.globalCompositeOperation = "multiply"; c.globalAlpha = 0.28;
    c.drawImage(B3.grain[(r + f) % 2], ((r * 37 + f * 61) % 5) * 40, ((r * 53 + f * 29) % 5) * 40, 56, 56, x, y, sq + 0.5, sq + 0.5);
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  }
  c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 3; c.strokeRect(off - 1.5, off - 1.5, 8 * sq + 3, 8 * sq + 3);
  const fill = (i, col) => { const [x, y] = at(i); c.fillStyle = col; c.fillRect(x, y, sq, sq); };
  const last = !ui.visBoard && node.move ? node.move : null;
  if (last) { fill(last.from, "rgba(255,213,79,.42)"); fill(last.to, "rgba(255,213,79,.55)"); }
  if (ui.selected != null) fill(ui.selected, "rgba(46,125,50,.55)");
  if ((trainer.active && trainer.hintSq >= 0) || (Retry.active && Retry.hintSq >= 0) || (Guess.active && Guess.hintSq >= 0)) fill(trainer.active ? trainer.hintSq : Retry.active ? Retry.hintSq : Guess.hintSq, "rgba(41,182,246,.5)");
  if (Chess.inCheck(s)) {
    const [x, y] = at(Chess.kingSq(s.b, s.t)), g = c.createRadialGradient(x + sq / 2, y + sq / 2, sq * 0.05, x + sq / 2, y + sq / 2, sq * 0.62);
    g.addColorStop(0, "rgba(255,40,40,.95)"); g.addColorStop(1, "rgba(255,40,40,0)");
    c.fillStyle = g; c.fillRect(x, y, sq, sq);
  }
  if (ui.selected != null && settings.showLegal) for (const m of Chess.legal(s)) {
    if (m.from !== ui.selected) continue;
    const [x, y] = at(m.to);
    c.beginPath();
    if (m.captured !== ".") { c.lineWidth = sq * 0.09; c.strokeStyle = "rgba(20,60,20,.5)"; c.arc(x + sq / 2, y + sq / 2, sq * 0.43, 0, 2 * Math.PI); c.stroke(); }
    else { c.fillStyle = "rgba(20,60,20,.45)"; c.arc(x + sq / 2, y + sq / 2, sq * 0.15, 0, 2 * Math.PI); c.fill(); }
  }
  // Flechas y círculos (las mismas que en el tablero plano)
  for (const sh of shapeList()) {
    const [x1, y1] = at(sh.from).map(v => v + sq / 2), [x2, y2] = at(sh.to).map(v => v + sq / 2);
    c.strokeStyle = c.fillStyle = SHAPE_COLORS[sh.color] || SHAPE_COLORS.green;
    c.globalAlpha = sh.preview ? 0.55 : 1;
    if (sh.from === sh.to) { c.lineWidth = sq * 0.08; c.beginPath(); c.arc(x1, y1, sq * 0.44, 0, 2 * Math.PI); c.stroke(); c.globalAlpha = 1; continue; }
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, head = sq * 0.42, wid = sq * (sh.color === "engine" ? 0.13 : 0.16);
    c.lineWidth = wid; c.lineCap = "round";
    c.setLineDash(sh.color === "threat" ? [sq * 0.2, sq * 0.15] : []);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - ux * head * 0.9, y2 - uy * head * 0.9); c.stroke();
    c.setLineDash([]);
    c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - ux * head - uy * head * 0.55, y2 - uy * head + ux * head * 0.55); c.lineTo(x2 - ux * head + uy * head * 0.55, y2 - uy * head - ux * head * 0.55); c.closePath(); c.fill();
    c.globalAlpha = 1;
  }
  if (settings.coords) {
    c.fillStyle = LK.coord; c.font = `600 ${Math.round(sq * 0.3)}px system-ui, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    const text = (t, x, y) => { c.save(); c.translate(x, y); if (ui.flipped) c.rotate(Math.PI); c.fillText(t, 0, 0); c.restore(); };
    for (let k = 0; k < 8; k++) {
      const yb = ui.flipped ? off / 2 : W - off / 2, xl = ui.flipped ? W - off / 2 : off / 2;
      text("abcdefgh"[k], off + k * sq + sq / 2, yb);
      text(String(8 - k), xl, off + k * sq + sq / 2);
    }
  }
  B3.tex.needsUpdate = true;
  board3dRender();
}

/* --- Cámara y dibujo bajo demanda (sólo cuando algo cambia: no gasta batería en reposo) --- */
function board3dPlace(dist) {
  const v = B3.view, th = v.theta + (ui.flipped ? Math.PI : 0);
  // Se mira un poco por delante del centro: el borde cercano se ve más grande y así el tablero llena mejor el recuadro
  const k = 0.9 * Math.sin(v.phi), tx = k * Math.sin(th), tz = k * Math.cos(th);
  B3.camera.position.set(tx + dist * Math.sin(v.phi) * Math.sin(th), dist * Math.cos(v.phi), tz + dist * Math.sin(v.phi) * Math.cos(th));
  B3.camera.up.set(0, 1, 0);
  if (v.phi < 0.02) B3.camera.up.set(-Math.sin(th), 0, -Math.cos(th));   // desde arriba: las blancas (o las negras, girado) abajo
  B3.camera.lookAt(tx, -0.1, tz);
  if (B3.rim) { B3.rim.position.set(-Math.sin(th) * 8, 1.1, -Math.cos(th) * 8); B3.rim.target.position.set(0, 0, 0); }
  B3.camera.updateMatrixWorld();
}
/* La distancia a la que cabe todo el tablero (con las piezas más altas) en el recuadro, para el ángulo actual */
function board3dFit() {
  // Las casillas y lo alto de las piezas de las esquinas; el marco de madera puede quedar algo recortado
  const T = B3.T, pts = [];
  const e = B3.view.phi < 0.3 ? B3_SIZE / 2 : 4.05;   // desde arriba, con el marco y las coordenadas
  for (const x of [-1, 1]) for (const z of [-1, 1]) { pts.push(new T.Vector3(x * e, 0, z * e)); pts.push(new T.Vector3(x * 3.5, b3Real() ? 1.75 : 1.3, z * 3.5)); }
  let lo = 4, hi = 60;
  for (let n = 0; n < 22; n++) {
    const mid = (lo + hi) / 2;
    board3dPlace(mid);
    const ok = pts.every(q => { const v = q.clone().project(B3.camera); return Math.abs(v.x) <= 0.98 && Math.abs(v.y) <= 0.98 && v.z < 1; });
    if (ok) hi = mid; else lo = mid;
  }
  return hi;
}
function board3dCamera() { board3dPlace(board3dFit() * B3.view.zoom); }
function board3dRender() {
  if (!B3.ready || B3.frame) return;
  B3.frame = requestAnimationFrame(now => {
    B3.frame = 0;
    if (!B3.active) return;
    if (B3.anims.length) {
      B3.anims = B3.anims.filter(a => {
        const t = Math.min(1, (now - a.t0) / 220), e = 1 - Math.pow(1 - t, 3);
        a.m.position.set(a.x0 + (a.x1 - a.x0) * e, Math.sin(Math.PI * t) * a.hop, a.z0 + (a.z1 - a.z0) * e);
        return t < 1;
      });
      if (B3.anims.length) board3dRender();
    }
    board3dCamera();
    B3.renderer.render(B3.scene, B3.camera);
  });
}
function board3dResize() {
  if (!B3.ready) return;
  const r = $("boardWrap").getBoundingClientRect();
  if (!r.width || !r.height) return;
  B3.renderer.setSize(r.width, r.height, false);
  B3.camera.aspect = r.width / r.height;
  B3.camera.updateProjectionMatrix();
  board3dRender();
}
function board3dZoom(f) { B3.view.zoom = Math.max(0.55, Math.min(1.8, B3.view.zoom * f)); board3dRender(); }

/* --- Ratón y dedos: pulsar = elegir o mover; arrastrar = girar la vista; pellizcar o Ctrl + rueda = acercar --- */
function board3dSquareAt(x, y) {
  const T = B3.T, r = B3.canvas.getBoundingClientRect();
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), B3.camera);
  // Primero las piezas (se pulsa la pieza aunque tape otra casilla); si no, el punto del tablero
  const hit = ray.intersectObjects([...B3.meshes.values()].filter(m => m.visible), true)[0];
  if (hit) { for (const [i, m] of B3.meshes) { let o = hit.object; while (o && o !== m) o = o.parent; if (o === m) return i; } }
  const p = new T.Vector3();
  if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p)) return null;
  const f = Math.floor(p.x + 4), rw = Math.floor(p.z + 4);
  return f >= 0 && f < 8 && rw >= 0 && rw < 8 ? rw * 16 + f : null;
}
function board3dEvents() {
  const cv = B3.canvas;
  cv.style.touchAction = "none";
  cv.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("pointerdown", e => {
    cv.setPointerCapture(e.pointerId);
    B3.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (B3.ptrs.size === 1) { B3.down = { x: e.clientX, y: e.clientY }; B3.moved = false; }
    if (B3.ptrs.size === 2) { const [a, b] = [...B3.ptrs.values()]; B3.pinch = Math.hypot(a.x - b.x, a.y - b.y); B3.moved = true; }
    e.preventDefault();
  });
  cv.addEventListener("pointermove", e => {
    const prev = B3.ptrs.get(e.pointerId);
    if (!prev) return;
    const cur2 = { x: e.clientX, y: e.clientY };
    B3.ptrs.set(e.pointerId, cur2);
    if (B3.ptrs.size === 2) {
      const [a, b] = [...B3.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (B3.pinch) board3dZoom(B3.pinch / d);
      B3.pinch = d;
      return;
    }
    if (!B3.moved && Math.hypot(e.clientX - B3.down.x, e.clientY - B3.down.y) < 6) return;
    B3.moved = true;
    B3.view.theta -= (cur2.x - prev.x) * 0.008;
    B3.view.phi = Math.max(0.01, Math.min(1.3, B3.view.phi - (cur2.y - prev.y) * 0.006));
    board3dRender();
  });
  const up = e => {
    if (!B3.ptrs.has(e.pointerId)) return;
    B3.ptrs.delete(e.pointerId);
    if (B3.ptrs.size) return;
    B3.pinch = 0;
    if (B3.moved || e.type === "pointercancel") return;
    const i = board3dSquareAt(e.clientX, e.clientY);
    if (i == null) return;
    if (ui.selected === i) { ui.selected = null; renderBoard(); return; }
    pressSquare(i);
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { if (!e.ctrlKey && !e.metaKey && settings.wheel) return; e.preventDefault(); e.stopPropagation(); board3dZoom(e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
  cv.addEventListener("dblclick", () => { B3.view = { theta: 0, phi: 0.74, zoom: 1 }; board3dRender(); });
  B3.wrap.querySelector(".board3d-tools").addEventListener("click", e => {
    const b = e.target.closest("[data-b3]");
    if (!b) return;
    const a = b.dataset.b3;
    if (a === "in") board3dZoom(1 / 1.15);
    else if (a === "out") board3dZoom(1.15);
    else if (a === "top") { B3.view.phi = B3.view.phi < 0.05 ? 0.74 : 0.01; B3.view.theta = 0; board3dRender(); }
    else { B3.view = { theta: 0, phi: 0.74, zoom: 1 }; board3dRender(); }
  });
}
