/* Carga el código real de la aplicación (src/app/*.js, con core.js, pgn.js y eco.js) en Node, sin navegador.
   El DOM se sustituye por un «comodín» que acepta cualquier operación sin hacer nada, de modo que el código
   que pinta la interfaz al arrancar no falla y quedan disponibles las funciones de lógica pura para probarlas.
   localStorage es un almacén en memoria y la fecha se puede fijar (reloj.fijar) para que las pruebas no dependan del día. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const leer = p => fs.readFileSync(path.join(ROOT, p), "utf8");

/* Un objeto que admite cualquier cosa: propiedades, llamadas, «new», iteración y conversión a número o texto.
   Lo que se le asigna sólo se recuerda si se pide (guardar), para los elementos con id. */
function comodin(guardar = false, inicial = {}) {
  const fn = Object.assign(function () {}, inicial);
  let px;
  const handler = {
    get(t, k) {
      if (k === Symbol.toPrimitive) return hint => (hint === "number" ? 0 : "");
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.asyncIterator) return async function* () {};
      if (k === "then") return undefined;          // no es una promesa
      if (k === "length") return 0;
      if (k in t && k !== "prototype" && k !== "name") return t[k];
      return px;
    },
    set(t, k, v) { if (guardar) t[k] = v; return true; },
    apply() { return px; },
    construct() { return px; },
    has() { return true; }
  };
  px = new Proxy(fn, handler);
  return px;
}

function crearEntorno(opciones = {}) {
  const almacen = new Map(Object.entries(opciones.localStorage || {}));
  const localStorage = {
    getItem: k => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => { almacen.set(k, String(v)); },
    removeItem: k => { almacen.delete(k); },
    clear: () => almacen.clear(),
    key: i => [...almacen.keys()][i] ?? null,
    get length() { return almacen.size; }
  };

  // Reloj que se puede fijar: Date.now() y new Date() sin argumentos devuelven ese instante
  let fijado = null;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(fijado == null ? RealDate.now() : fijado); }
    static now() { return fijado == null ? RealDate.now() : fijado; }
  }
  const reloj = {
    fijar(d) { fijado = d == null ? null : new RealDate(d).getTime(); },
    avanzar(ms) { fijado = (fijado == null ? RealDate.now() : fijado) + ms; }
  };

  const dom = comodin();
  // Cada $("id") es siempre el mismo elemento simulado, que recuerda lo que se le pone (value, hidden…)
  const elementos = new Map();
  const elemento = id => {
    if (!elementos.has(id)) elementos.set(id, comodin(true, { id, value: "", textContent: "", innerHTML: "", checked: false, open: false, hidden: false, disabled: false, options: [], dataset: {} }));
    return elementos.get(id);
  };
  const documento = comodin(false, { getElementById: elemento, querySelector: () => dom, querySelectorAll: () => [] });
  const sandbox = {
    console, Math, JSON, Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect, Intl, Array, Object, String, Number, Boolean, RegExp, Error, TypeError, RangeError,
    Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array, ArrayBuffer, DataView, TextEncoder, TextDecoder,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape, atob, btoa, structuredClone,
    Date: FakeDate,
    // Los temporizadores no se ejecutan: las pruebas sólo llaman a funciones síncronas
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, queueMicrotask() {},
    localStorage, sessionStorage: localStorage,
    document: documento, navigator: dom, location: { hash: "", href: "file:///index.html", protocol: "file:", search: "", origin: "null", pathname: "/index.html" },
    history: dom, screen: dom, performance: { now: () => 0 }, matchMedia: () => dom, getComputedStyle: () => dom,
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, alert() {}, confirm: () => false, prompt: () => null, open: () => null,
    innerWidth: 1280, innerHeight: 900, devicePixelRatio: 1,
    fetch: () => new Promise(() => {}), indexedDB: undefined, BroadcastChannel: undefined, Worker: undefined, AudioContext: undefined, webkitAudioContext: undefined,
    Image: function () { return dom; }, Blob: function () { return dom; }, URL: Object.assign(function () { return dom; }, { createObjectURL: () => "", revokeObjectURL() {} }),
    URLSearchParams, AbortController, CustomEvent: function () { return dom; }, Event: function () { return dom; }, HTMLElement: function () {}, Node: function () {},
    ResizeObserver: function () { return dom; }, IntersectionObserver: function () { return dom; }, MutationObserver: function () { return dom; },
    speechSynthesis: undefined, SpeechSynthesisUtterance: undefined, caches: undefined
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  // El mismo montaje que build.py: núcleo + aplicación con los datos incrustados
  const piezas = 'const glyphUnicode = { K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘", P:"♙", k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟" };\n' + leer("src/pieces.js");
  const cursos = {};
  for (const f of fs.readdirSync(path.join(ROOT, "cursos"))) if (f.endsWith(".pgn")) cursos[f.slice(0, -4)] = leer("cursos/" + f);
  let app = fs.readdirSync(path.join(ROOT, "src", "app")).filter(f => f.endsWith(".js")).sort().map(f => leer("src/app/" + f)).join("");
  app = app.replace("/*__PIECES__*/", () => piezas)
    .replace("/*__COURSES__*/{}", () => JSON.stringify(cursos))
    .replace("/*__PUZZLES__*/[]", () => leer("cursos/problemas.json"))
    .replace("/*__PACKS__*/[]", () => leer("problemas/indice.json"));
  for (const f of ["src/core.js", "src/pgn.js", "src/eco.js"]) vm.runInContext(leer(f), ctx, { filename: f });
  vm.runInContext(app, ctx, { filename: "src/app (unido)" });

  return {
    ctx, reloj, localStorage,
    /* Evalúa una expresión dentro de la aplicación (para leer sus const/let, que no son propiedades de window) */
    ev: code => vm.runInContext(code, ctx)
  };
}

module.exports = { crearEntorno };
