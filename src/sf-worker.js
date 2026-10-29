/* AjedrezBase · lanzador de Stockfish.
   Carga, según el parámetro ?e= de la dirección del Worker:
     sf19 → Stockfish.js 19 Lite (WebAssembly, NNUE) de nmrugg/stockfish.js, GPL v3, desde jsDelivr
     sf10 → stockfish.js 10.0.2 (asm.js) de niklasf/stockfish.js, GPL v3, desde cdnjs
   El fichero .wasm de Stockfish 19 se indica tras «#» en la misma dirección.
   Al lanzarse desde el mismo sitio que la aplicación, el service worker (sw.js) puede guardarlo y
   servirlo sin conexión. Stockfish no forma parte de este repositorio. */
var ENGINES = { sf19: "{{SF19_JS}}", sf10: "{{SF10_JS}}" };
var id = new URLSearchParams(self.location.search).get("e");
importScripts(ENGINES[id] || ENGINES.sf19);
