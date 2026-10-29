/* AjedrezBase · lanzador de Stockfish.
   Carga, según el parámetro ?e= de la dirección del Worker:
     sf19 → Stockfish.js 19 Lite (WebAssembly, NNUE) de nmrugg/stockfish.js, GPL v3, desde jsDelivr
     sf10 → stockfish.js 10.0.2 (asm.js) de niklasf/stockfish.js, GPL v3, desde cdnjs
   El fichero .wasm de Stockfish 19 se indica tras «#» en la misma dirección.
   Al lanzarse desde el mismo sitio que la aplicación, el service worker (sw.js) puede guardarlo y
   servirlo sin conexión. Stockfish no forma parte de este repositorio. */
var ENGINES = { sf19: "https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/stockfish-19-lite-single.js", sf10: "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js" };
var id = new URLSearchParams(self.location.search).get("e");
importScripts(ENGINES[id] || ENGINES.sf19);
