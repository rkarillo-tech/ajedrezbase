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
  if (B3.active) board3dUpdate();
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
  scene.add(new T.HemisphereLight(0xfff7ea, 0x3a3f4a, 1.7));
  const sun = new T.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-4, 11, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // Tablero: un marco con grosor y, encima, la textura con casillas, coordenadas, marcas y flechas
  const cv = document.createElement("canvas");
  cv.width = cv.height = B3_TEX;
  B3.ctx = cv.getContext("2d");
  B3.tex = new T.CanvasTexture(cv);
  B3.tex.colorSpace = T.SRGBColorSpace;
  B3.tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const frameMat = B3.mat.frame = new T.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.7 });
  const base = new T.Mesh(new T.BoxGeometry(B3_SIZE, 0.36, B3_SIZE), frameMat);
  base.position.y = -0.18;
  base.receiveShadow = true;
  scene.add(base);
  B3.plane = new T.Mesh(new T.PlaneGeometry(B3_SIZE, B3_SIZE), new T.MeshStandardMaterial({ map: B3.tex, roughness: 0.62 }));
  B3.plane.rotation.x = -Math.PI / 2;
  B3.plane.position.y = 0.002;
  B3.plane.receiveShadow = true;
  scene.add(B3.plane);

  B3.mat.w = new T.MeshStandardMaterial({ color: 0xf1e7d3, roughness: 0.42, metalness: 0.04 });
  B3.mat.b = new T.MeshStandardMaterial({ color: 0x2c2b30, roughness: 0.32, metalness: 0.08 });
  board3dGeometries();
  board3dEvents();
  new ResizeObserver(() => board3dResize()).observe($("boardWrap"));
  B3.ready = true;
  board3dResize();
}

/* --- Piezas: perfiles de revolución (radio, altura) y detalles añadidos --- */
function board3dGeometries() {
  const T = B3.T, V = (x, y) => new T.Vector2(x, y);
  const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return V(Math.max(0, cx + r * Math.cos(a)), cy + r * Math.sin(a)); });
  const base = [V(0, 0), V(0.37, 0), V(0.37, 0.06), V(0.33, 0.09), V(0.34, 0.12), V(0.27, 0.17)];
  const lathe = pts => new T.LatheGeometry(pts, 40);
  B3.geo.p = lathe([...base, V(0.2, 0.21), V(0.13, 0.4), V(0.19, 0.45), V(0.19, 0.48), V(0.11, 0.5), ...arc(0, 0.62, 0.15, -Math.PI / 2 + 0.6, Math.PI / 2)]);
  B3.geo.r = lathe([...base, V(0.25, 0.22), V(0.21, 0.58), V(0.28, 0.63), V(0.28, 0.82), V(0.2, 0.82), V(0.2, 0.74), V(0, 0.74)]);
  B3.geo.merlon = new T.BoxGeometry(0.1, 0.1, 0.13);
  B3.geo.b = lathe([...base, V(0.22, 0.22), V(0.13, 0.52), V(0.21, 0.56), V(0.21, 0.59), V(0.12, 0.62), ...arc(0, 0.82, 0.17, -Math.PI / 2 + 0.3, Math.PI / 2 - 0.25, 12), ...arc(0, 1.03, 0.055, -Math.PI / 2, Math.PI / 2, 6)]);
  B3.geo.q = lathe([...base, V(0.25, 0.22), V(0.14, 0.72), V(0.24, 0.77), V(0.24, 0.8), V(0.15, 0.83), V(0.25, 1.06), V(0.18, 1.08), ...arc(0, 1.09, 0.1, -0.2, Math.PI / 2, 6)]);
  B3.geo.ball = new T.SphereGeometry(0.045, 12, 8);
  B3.geo.k = lathe([...base, V(0.26, 0.22), V(0.15, 0.8), V(0.25, 0.85), V(0.25, 0.88), V(0.16, 0.91), V(0.24, 1.1), V(0.19, 1.13), V(0.1, 1.15), V(0, 1.15)]);
  B3.geo.crossV = new T.BoxGeometry(0.07, 0.26, 0.07);
  B3.geo.crossH = new T.BoxGeometry(0.2, 0.07, 0.07);
  B3.geo.nBase = lathe([...base, V(0.25, 0.22), V(0.25, 0.27), V(0, 0.27)]);
  // Caballo: silueta de perfil (mirando hacia +x) extruida, sobre una base redonda
  const s = new T.Shape();
  [[-0.2, 0], [0.22, 0], [0.18, 0.18], [0.1, 0.32], [0.24, 0.42], [0.34, 0.5], [0.33, 0.6], [0.2, 0.62], [0.12, 0.72], [0.02, 0.8], [-0.02, 0.9],
    [-0.08, 0.8], [-0.18, 0.72], [-0.24, 0.52], [-0.24, 0.3]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new T.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 3 });
  g.translate(0, 0.25, -0.11);
  B3.geo.nHead = g;
}
function board3dPiece(p) {
  const T = B3.T, white = p === p.toUpperCase(), mat = white ? B3.mat.w : B3.mat.b, type = p.toLowerCase();
  const g = new T.Group();
  const add = (geo, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  if (type === "n") {
    add(B3.geo.nBase);
    const h = add(B3.geo.nHead);
    h.rotation.y = white ? Math.PI / 2 - 0.75 : -Math.PI / 2 - 0.75;   // hacia el rival, algo girado para que se vea su perfil
  } else add(B3.geo[type]);
  if (type === "r") for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, m = add(B3.geo.merlon, Math.cos(a) * 0.22, 0.87, Math.sin(a) * 0.22); m.rotation.y = -a; }
  if (type === "q") for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; add(B3.geo.ball, Math.cos(a) * 0.22, 1.09, Math.sin(a) * 0.22); }
  if (type === "k") { add(B3.geo.crossV, 0, 1.27); add(B3.geo.crossH, 0, 1.3); }
  g.userData.p = p;
  return g;
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
  const css = getComputedStyle(document.body), light = css.getPropertyValue("--light").trim() || "#f0d9b5", dark = css.getPropertyValue("--dark").trim() || "#b58863";
  const at = i => [off + (i & 7) * sq, off + (i >> 4) * sq];
  c.fillStyle = "#3d2b20"; c.fillRect(0, 0, W, W);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { c.fillStyle = (r + f) % 2 ? dark : light; c.fillRect(off + f * sq, off + r * sq, sq + 0.5, sq + 0.5); }
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
    c.fillStyle = "#e9dcc6"; c.font = `600 ${Math.round(sq * 0.3)}px system-ui, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
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
  B3.camera.updateMatrixWorld();
}
/* La distancia a la que cabe todo el tablero (con las piezas más altas) en el recuadro, para el ángulo actual */
function board3dFit() {
  // Las casillas y lo alto de las piezas de las esquinas; el marco de madera puede quedar algo recortado
  const T = B3.T, pts = [];
  const e = B3.view.phi < 0.3 ? B3_SIZE / 2 : 4.05;   // desde arriba, con el marco y las coordenadas
  for (const x of [-1, 1]) for (const z of [-1, 1]) { pts.push(new T.Vector3(x * e, 0, z * e)); pts.push(new T.Vector3(x * 3.5, 1.3, z * 3.5)); }
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
