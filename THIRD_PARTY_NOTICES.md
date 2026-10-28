# Componentes y servicios de terceros

El código de AjedrezBase (reglas, motor interno, lector PGN, enciclopedia ECO en español, interfaz y biblioteca) es
propio y se distribuye con licencia [MIT](LICENSE). Además, la aplicación usa:

| Componente | Uso | Licencia | ¿Incluido en el repositorio? |
| --- | --- | --- | --- |
| [stockfish.js](https://github.com/niklasf/stockfish.js) 10.0.2 — Stockfish de T. Romstad, M. Costalba, J. Kiiski, G. Linscott y colaboradores, compilado a JavaScript por Niklas Fiekas | Motor de análisis | [GPL v3](https://www.gnu.org/licenses/gpl-3.0.html) · [código fuente de Stockfish](https://github.com/official-stockfish/Stockfish) | **No.** El navegador lo descarga de [cdnjs](https://cdnjs.com/libraries/stockfish.js) al usarlo; si se instala la aplicación, lo guarda en su caché para usarlo sin conexión |
| Piezas «Clásicas» de [Colin M. L. Burnett](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces) (Wikimedia Commons) | Dibujo de las piezas y del icono | Licencia múltiple GPL / BSD / GFDL | Sí, en `src/pieces.js` y `assets/icon.svg` |

## Servicios en línea

Sólo se consultan cuando el usuario los usa, directamente desde su navegador:

| Servicio | Para qué | Notas |
| --- | --- | --- |
| [Lichess](https://lichess.org) — explorador de aperturas (`explorer.lichess.ovh`) | Estadísticas de maestros y de partidas online | Requiere un token personal gratuito del usuario, que se guarda sólo en su navegador |
| Lichess — evaluación en la nube (`lichess.org/api/cloud-eval`) | Análisis profundo ya calculado | Sólo al pulsar «☁ Nube» |
| Lichess — tablas Syzygy (`tablebase.lichess.ovh`) | Resultado exacto de finales de hasta 7 piezas | Sólo en la pestaña Finales |

Las partidas de la antología y de los finales clásicos son partidas y posiciones históricas.
