# Guía de uso de AjedrezBase

Esta guía es la misma que aparece en la aplicación con el botón **❓ Ayuda** (o la tecla `?`).
Se genera automáticamente a partir de `src/help.html` con `python3 build.py`.

[▶️ Abrir AjedrezBase](https://rkarillo-tech.github.io/ajedrezbase/) · [Volver al README](README.md)

## 🧭 1. De un vistazo: cómo está organizada la pantalla
- **Columna izquierda**: el tablero con la **barra de evaluación** (a su izquierda), los nombres de los jugadores con el material capturado, el **panel del motor**, el **gráfico de la partida**, los botones de navegación y la **lista de jugadas** con sus variantes.
- **Columna derecha**, arriba: la **barra de la partida actual** (título, ⭐ favorita, etiquetas, 💾 guardar y 📌 marcar). Debajo, cinco pestañas:
**📖 Estudio** (importar, comentar, analizar), **🌍 Aperturas**, **📚 Biblioteca** (tus partidas, marcadores, búsquedas, ficheros .pgn, 📊 estadísticas y 🔍 búsqueda de posiciones), **👑 Finales** y **🎯 Entrenar**.
- **Barra superior**: estilo de piezas, notación en pantalla, colores del tablero, jugar contra la CPU, sonido 🔊, ajustes ⚙, esta ayuda ❓ y «Nueva» partida.
- **En el móvil**, en vertical: debajo del tablero tienes los botones para avanzar y retroceder y la lista de jugadas, y más abajo el motor, el gráfico y las pestañas (deslízalas a los lados). Las piezas, la notación, los colores y el sonido están en el botón **☰** de arriba. En horizontal, el tablero ocupa la izquierda y las jugadas y el motor la derecha.

> **Ejemplo rápido (2 minutos):** pega una partida en «📖 Estudio» → pulsa **Importar** → recórrela con las flechas `←` `→` → pulsa **🤖 Analizar y comentar** → si te gusta, **💾 Guardar en biblioteca**.

## ♟ 2. Mover piezas y recorrer la partida
- **Mover**: arrastra la pieza, o haz clic en la pieza y luego en la casilla de destino. Los puntos verdes indican las jugadas legales (se pueden ocultar en ⚙ Ajustes).
- **Coronar**: al llevar un peón a la última fila aparece un cuadro para elegir dama, torre, alfil o caballo.
- **Escribir la jugada**: en el recuadro «⌨ Escribe una jugada» bajo el tablero, teclea `e4`, `Cf3`, `Axc6`, `O-O` (o en inglés, `Nf3`) y pulsa `Intro`. Sirve para jugar sin ratón.
- **Navegar**: botones **|◀ ◀ ▶ ▶|** bajo el gráfico, el teclado (`←` `→` `Inicio` `Fin`) o la **rueda del ratón** con el puntero sobre el tablero. También puedes pulsar cualquier jugada de la lista o cualquier punto del gráfico.
- **Vista previa**: al pasar el ratón por una jugada de la lista o de las líneas del motor aparece un minitablero con esa posición, sin moverte de donde estás.
- Las piezas se deslizan al avanzar y retroceder; si lo prefieres, desactiva «Animar las piezas» o «Rueda del ratón» en ⚙ Ajustes.
- **▶ Auto** (o `Espacio`) reproduce la partida sola, una jugada por segundo.
- **⇅ Girar** (o `F`) da la vuelta al tablero.
- La aplicación detecta jaque mate, ahogado, triple repetición, regla de 50 jugadas y material insuficiente; lo verás en la línea de estado bajo los botones.

## 📥 3. Importar partidas, PGN y posiciones FEN
En **📖 Estudio**, el recuadro «Jugadas, PGN completo o FEN» acepta casi cualquier cosa. Pega y pulsa **Importar**.

- **Notación española**: `1. e4 e5 2. Cf3 Cc6 3. Ab5` (C caballo, A alfil, T torre, D dama, R rey).
- **Notación inglesa**: `1. e4 e5 2. Nf3 Nc6 3. Bb5`.
- **Figurines**: `1. e4 e5 2. ♘f3 ♞c6` · **Coordenadas**: `e2e4 e7e5 g1f3` · **Notación larga**: `1. e2-e4 e7-e5 2. Cg1-f3`.
- **PGN completo** con cabeceras `[White "…"]`, variantes entre paréntesis, comentarios entre llaves `{…}` y símbolos (`!?`, `$14`…). Es el formato que exportan Lichess, Chess.com y ChessBase.
- **FEN**: una posición suelta, por ejemplo `8/8/1KP5/3r4/8/8/8/k7 w - - 0 1`. Se detecta sola al importar, o usa **Cargar FEN**.

**«Notación de entrada»** indica cómo está escrito lo que pegas; con «Automática» la aplicación lo deduce. Es distinto de **«Notación» de la barra superior**, que sólo decide cómo se *muestran* las jugadas. Por eso puedes pegar en inglés y verlo en español (Nf3 → Cf3). El PGN que copias o descargas siempre sale en inglés, que es el estándar.

- **Añadir desde aquí**: añade las jugadas del recuadro a partir de la posición actual del tablero (útil para meter una variante escrita a mano).
- **📋 Copiar PGN** / **⬇ Descargar .pgn** / **📋 Copiar FEN**: para llevarte la partida o la posición a otro programa.
- Si el texto tiene varias partidas, se muestra la primera y todas quedan en **📚 Biblioteca › 🗂 Abrir .pgn** (sin guardar).
- Si hay una jugada ilegal o mal escrita, la importación se detiene ahí y te dice cuál es (por ejemplo «Detenido en 23. Axf7»).

> **Ejemplo:** en Lichess, en una partida tuya, «Compartir y exportar» → «Descargar PGN» o copiar el texto PGN → pégalo aquí → Importar. Los comentarios y evaluaciones `[%eval]` de Lichess también se leen.

## 🌿 4. Variantes, comentarios, símbolos y flechas
- **Crear una variante**: vuelve a una jugada anterior y mueve otra cosa. Se crea una línea alternativa sangrada en la lista; la partida original no se toca. (Si prefieres que la nueva jugada *sustituya* lo que seguía, cambia «Al mover en mitad de la partida» a «Sobrescribir línea».)
- **Moverte entre alternativas**: `↑` `↓` saltan entre las jugadas posibles del mismo punto.
- **⬆ Promover variante** la sube un puesto; **★ Hacer principal** la convierte en la línea principal; **✂ Cortar** borra la jugada actual y todo lo que sigue.
- **Comentar**: en «Comentario de la posición» escribe lo que quieras sobre la jugada que lleva a la posición actual. Aparece en cursiva en la lista de jugadas y se exporta en el PGN.
- **Símbolos**: `! !! !? ?! ? ??` valoran la jugada; `+− ± = ∞ ∓ −+` valoran la posición. «Limpiar» los quita. El símbolo de la última jugada aparece también en un círculo de color sobre su casilla del tablero.
- **📋 Ver como planilla**: muestra la partida en dos columnas (número · blancas · negras), como en una planilla de torneo; los comentarios y variantes aparecen entre filas. **📜 Ver como lista** vuelve a la vista continua.
- **✍ Redactar comentario con el motor**: analiza la jugada actual y escribe un comentario en español: si era un error, cuál era la mejor y cuál es la refutación, y además las ideas estratégicas de la jugada, por ejemplo «Crea un peón pasado en d6», «Deja aislado el peón rival de d5», «Instala el caballo en e5, una casilla fuerte…», «Cede la pareja de alfiles», «La torre llega a la séptima fila» o «Se cambian las damas».
- **Flechas y círculos**: clic derecho y arrastrar dibuja una flecha; clic derecho en una casilla la rodea. Verde por defecto, `⇧` roja, `Alt` azul, `⇧`+`Alt` amarilla. Repite el gesto para borrarla, o usa **🧽 Borrar flechas**. Se guardan en el PGN y Lichess/ChessBase las entienden.

> **Ejemplo:** en la jugada 12 crees que había algo mejor → pulsa la jugada 11 de las negras en la lista → juega tu idea en el tablero → escribe en el comentario «Más activa: amenaza Cxe5» → dibuja una flecha roja con `⇧` + clic derecho mostrando la amenaza.

## ⚙ 5. El motor: análisis en vivo, nube y etiquetas
- **Analizar** (o tecla `E`) activa el análisis continuo de cada posición que visitas. Verás hasta 3 líneas: evaluación + jugadas sugeridas. Pulsa una línea para jugar su primera jugada.
- **Flecha** muestra en morado la mejor jugada del motor. **⚡ Jugar** la ejecuta.
- **👁 Amenaza** (o tecla `X`): enseña qué jugaría el rival *si le tocara mover*, con una flecha roja discontinua y su valoración. Responde al momento a «¿qué está tramando?» y a por qué una jugada pasiva es mala. Pulsa otra vez o cambia de jugada para quitarla.
- **Evaluación**: `+0.80` = ventaja blanca de unos 8 décimas de peón; `−1.50` = ventaja negra de 1,5 peones; `#3` = mate en 3 para las blancas; `−#2` = mate en 2 para las negras.
- **Qué motor está trabajando** (etiqueta verde del panel):
  - **⚙ Stockfish 19**: el motor fuerte (versión «Lite» con red neuronal NNUE), funcionando en tu navegador. Descarga 1,9 MB la primera vez.
  - **⚙ Stockfish 10**: el de antes, más débil; se usa sólo si el navegador no admite WebAssembly o no se puede descargar el 19.
  - **⚙ Motor interno**: el de respaldo, mucho más débil, funciona siempre sin conexión. Si aparece **⚠**, pasa el ratón por encima para ver por qué no se pudo usar Stockfish (normalmente, porque el archivo se abrió en una vista previa en vez de en el navegador).
  - **☁ Stockfish (nube Lichess)**: sólo al pulsar **☁ Nube**. Es un análisis muy profundo ya calculado en Lichess; sólo existe para posiciones conocidas (aperturas, partidas famosas).
- En **⚙ Ajustes** puedes elegir el motor (automático, Stockfish 10 o sólo el interno), el tiempo por jugada y el número de líneas.

## 🤖 6. Analizar una partida completa y leer el gráfico
- **🤖 Analizar y comentar** (pestaña Estudio) evalúa todas las jugadas de la línea principal y:
  - marca las jugadas: ?? error grave, ? error, ?! imprecisión, ! jugada única;
  - escribe comentarios en las jugadas críticas (cuál era mejor, cuál es la refutación, si se deja material o un mate);
  - muestra un informe con la **precisión** de cada jugador y la pérdida media en centipeones;
  - añade breves comentarios estratégicos en las jugadas tranquilas con una idea clara (peones pasados o aislados, casillas fuertes, cambio de damas…).
- Debajo aparece el **informe de la partida**:
  - **📝 Resumen**: la apertura y cómo fue cambiando la valoración («empezó equilibrada; tras 21…g5 pasó a ventaja negra…») hasta el resultado.
  - **📍 Momentos clave**: las 5 jugadas que más cambiaron la partida, ordenadas por impacto, con qué pasó (pérdida de material, mate permitido o escapado, ventaja desperdiciada…). Pulsa una para ir a ella.
  - **⏱ Precisión por fases**: apertura, medio juego y final para cada jugador.
  - **🎯 Qué practicar**: recomendaciones según los errores de cada jugador (táctica, mates, finales, la apertura…).
- El informe también sale en la versión para imprimir.
- La clasificación se basa en cuánto baja la probabilidad de ganar, igual que en Lichess. Tus propios comentarios y símbolos no se sobrescriben.
- **📈 Completar gráfico** hace una pasada rápida sólo para dibujar el gráfico, sin comentar nada.
- **Cómo leer el gráfico**: de izquierda a derecha, la partida (sólo la línea principal). Cuanto más **sube la zona blanca**, mejor van las blancas; si baja, las negras. La línea discontinua es la igualdad. +1 peón ≈ 59 %, +3 ≈ 75 %, +5 ≈ 86 %, mate = 100 %. Los puntos de color son los errores; la raya naranja es la jugada en la que estás. Haz clic en el gráfico para saltar a esa jugada.
- Puedes **⏹ Detener** el análisis cuando quieras; lo calculado se conserva.
- **🌿 Analizar esta variante**: si estás dentro de una variante, analiza esa línea (desde el inicio hasta su final) en vez de la principal.
- **🎯 Aprende de tus errores**: al terminar el análisis, elige un bando (o «Todos»). La aplicación te lleva a cada jugada marcada con ? o ??, oculta el motor y te pide que encuentres algo mejor:
  - si aciertas la del motor, o una casi igual de buena, se da por resuelta (flecha verde; la del motor en azul);
  - si no, te dice cómo quedaría la posición y puedes volver a intentarlo; tras 3 fallos, o con **👁 Ver solución**, se muestra;
  - **💡 Pista** marca la pieza que hay que mover y, la segunda vez, la jugada; **⏭ Saltar** pasa al siguiente;
  - **📌 Guardar como tarjeta** lo convierte en una tarjeta de «error típico» para repasarlo más adelante en 🎯 Entrenar.

> **Ejemplo:** tras importar tu partida del torneo, pulsa «Analizar y comentar» → mira en el gráfico dónde cae la curva → pulsa ese punto → lee el comentario de la jugada marcada con ?? → prueba en el tablero la alternativa que propone.

## 🤖 7. Jugar contra la CPU: nivel, estilo y reloj
- Pulsa **🤖 Jugar vs CPU** en la barra superior y elige:
  - **Juegas con**: el bando de abajo del tablero, blancas, negras o al azar.
  - **Nivel** del 1 al 8.
  - **Estilo**: **⚖ Equilibrado** (la jugada del motor), **⚔ Agresivo** (prefiere jaques, capturas, sacrificios y acercarse a tu rey), **🏰 Posicional** (desarrollo, centro, enroque; evita sacar la dama pronto), **🛡 Defensivo** (cambia piezas, enroca y no adelanta los peones de su rey) o **🎲 Humano** (a veces no ve la mejor jugada).
El estilo sólo elige entre jugadas casi igual de buenas según el motor, así que nunca regala piezas a propósito; cuanto más bajo es el nivel, más se aparta de la mejor. Necesita Stockfish: con el motor interno la CPU juega siempre «equilibrado».
  - **Reloj**: sin reloj o de 1+0 a 30+0 (minutos + segundos de incremento por jugada). El reloj empieza con la primera jugada; si se te acaba el tiempo pierdes, salvo que el rival no tenga material para dar mate (entonces son tablas). La CPU reparte su tiempo según lo que le queda.
  - **Empezar desde** una partida nueva o desde la posición del tablero (también desde el editor: «🤖 Jugar desde aquí vs CPU»).
  - **🙈 A ciegas**: las piezas se ocultan durante la partida (ver «A ciegas y visualización»).
- Mientras juegas, el motor, la evaluación y el gráfico se ocultan y no se puede navegar por la partida. Debajo del tablero tienes **↶ Deshacer** (sólo sin reloj), **½ Ofrecer tablas** (la CPU las acepta a partir de la jugada 10 si no cree ir mejor), **🏳 Rendirse** y **⏹ Terminar** (deja la partida sin resultado).
- Al terminar se apunta el resultado y puedes **🤖 Analizar la partida**, **💾 Guardarla** o pedir la **🔁 Revancha** con los colores cambiados.

> **Ejemplo:** 🤖 Jugar vs CPU → negras, nivel 5, ⚔ Agresivo, 5+3 → ▶ Empezar a jugar. Al acabar, «🤖 Analizar la partida» y después «🎯 Aprende de tus errores».

## ✏ 8. Montar una posición (editor)
- Pulsa **✏ Colocar piezas** (bajo el tablero). El tablero se enmarca en naranja y aparece el editor.
- **Arrastra** cualquier pieza a otra casilla, sin reglas. Suéltala **fuera del tablero** para quitarla (o clic derecho sobre ella).
- **Añade piezas** arrastrándolas desde la paleta, o elige una en la paleta y pulsa casillas (pulsar otra vez la quita). Con ✋ puedes mover con dos clics; 🗑 borra.
- Indica **quién juega** y los **enroques** posibles. También puedes pegar una FEN.
- Atajos: posición inicial, la de la partida, sólo reyes, vaciar.
- **✔ Empezar desde esta posición** la convierte en el inicio de la partida (para analizar, comentar, guardar o entrenar). **🤖 Jugar desde aquí vs CPU** la juega contra el motor.
- El editor comprueba que la posición sea legal: un rey de cada color, sin peones en 1ª/8ª fila y sin el rey del bando que no mueve en jaque.

> **Ejemplo:** quieres practicar el mate de alfil y caballo → «Sólo reyes» → arrastra desde la paleta un alfil y un caballo blancos → «Jugar desde aquí vs CPU» con nivel 8.

## 📚 9. Biblioteca: guardar, favoritas, etiquetas y borrar
- **Nada se guarda solo.** Importar o abrir partidas no ocupa espacio. Cuando una te interese, pulsa **💾 Guardar en biblioteca** en la barra de la partida actual.
- Debajo de esa barra ves siempre el estado: «No está en la biblioteca», «● Tiene cambios y NO está guardada» o «✔ Está en tu biblioteca». Si la partida ya está guardada, **tus cambios se guardan solos**.
- Si vas a abrir otra partida y la actual tiene cambios sin guardar, se te avisa antes.
- **Título**: edítalo en el recuadro de la barra. **⭐** la marca como favorita (si no estaba guardada, la guarda). **Etiquetas**: escríbelas separadas por comas, por ejemplo `repertorio, siciliana, torneo 2026`.
- En **📚 Biblioteca › Mis partidas**:
  - busca por título, jugador, evento, ECO o año;
  - filtra por ⭐ favoritas, 📌 con marcadores, 📅 repaso pendiente o por etiqueta;
  - pulsa una fila para abrirla, ☆ para marcarla como favorita, 🎯 para entrenarla, 🗑 para borrarla;
  - marca varias casillas y usa **🗑 Borrar seleccionadas** o **⬇ Exportar .pgn** (si no seleccionas nada, exporta las que estés viendo).
- **⬇ Copia de seguridad** descarga un archivo con todas tus partidas y marcadores; **⬆ Restaurar copia** lo vuelve a cargar (sin duplicar lo que ya tengas).

> **Ejemplo:** tienes 30 partidas de Siciliana guardadas → escribe «siciliana» en el buscador → marca «Todas» → «⬇ Exportar .pgn» para llevarlas a ChessBase.

⚠ La biblioteca vive en **este navegador y en esta dirección**. No es la misma si abres la página desde GitHub Pages que desde el archivo de tu ordenador, ni en Chrome que en Firefox. Para pasarla de un sitio a otro, usa la copia de seguridad.

## 📌 10. Marcadores (ideas, tácticas, errores típicos…)
- Sitúate en la jugada que quieres recordar y pulsa **📌 Marcar posición** (o la tecla `M`). Si la partida no está guardada, te propone guardarla, porque el marcador apunta a ella.
- Elige la **categoría**: 💡 Idea, ⚔ Táctica, ⚠ Error típico, 🧭 Plan, ♟ Final, 📖 Apertura o ⭐ Favorita. Escribe una **nota** (si la jugada ya tenía comentario, se propone como nota).
- **Entrenar como tarjeta**: «encontrar la jugada marcada» (para tácticas e ideas) o «la marcada es un error, encontrar la mejor» (para errores típicos: el motor calcula cuál era la buena).
- En la lista de jugadas, la jugada marcada muestra el icono de su categoría.
- En **📚 Biblioteca › 📌 Marcadores** los ves todos con un minitablero; puedes buscar en las notas, filtrar por categoría, editarlos ✏ o borrarlos 🗑. Pulsa uno para abrir la partida justo en esa jugada.
- Para cambiar un marcador, vuelve a la misma jugada y pulsa otra vez 📌.

> **Ejemplo:** en tu partida, en la jugada 23 tu rival hizo un sacrificio en h7 que no viste → márcala como «⚔ Táctica» con la nota «Sacrificio griego: alfil en d3 + caballo a g5» → días después aparecerá como tarjeta para que lo encuentres tú.

## 🔎 11. Buscar en tus comentarios y notas
- En **📚 Biblioteca › 🔎 Buscar notas** escribe una palabra o frase y pulsa Buscar (o `Intro`).
- Busca en **todos los comentarios de todas tus partidas guardadas** y en las notas de los marcadores. No distingue mayúsculas ni tildes («peon» encuentra «peón»).
- Cada resultado indica la partida y la jugada; púlsalo para ir allí.

> **Ejemplo:** busca «columna abierta» para repasar todas las partidas donde comentaste un plan con la torre.

## 🗂 12. Abrir ficheros .pgn grandes
- En **📚 Biblioteca › 🗂 Abrir .pgn** pulsa **📂 Abrir .pgn** (puedes elegir varios ficheros). También hay una «Antología de clásicos» de prueba.
- El fichero se abre **sólo en memoria**: no se guarda nada y desaparece al cerrar la página o al pulsar **✖ Cerrar fichero**.
- Filtra por jugador, evento, año, ECO o resultado. Pulsa una fila para ver la partida.
- Para quedarte con alguna: **💾** en su fila, o **«Guardar en la biblioteca las partidas filtradas»** para varias de golpe. Las que ya tengas no se duplican (✔).
- **☁ Descargar mis partidas de Lichess**: escribe tu usuario, cuántas partidas quieres (20 a 300), el ritmo y si sólo puntuables o sólo las analizadas, y pulsa **☁ Descargar**. No hace falta token. Llegan a esta misma lista, sólo en memoria; guarda con 💾 las que te interesen. Si Lichess ya las analizó, sus evaluaciones se conservan y el gráfico se dibuja al momento.
- Ficheros grandes: hasta unos 200 MB van bien; por encima se pide confirmación y a partir de 400 MB se rechazan. Como referencia, un fichero de 11 MB (21.000 partidas) se abre en menos de un segundo.

> **Ejemplo con Lichess:** «☁ Descargar mis partidas» → tu usuario → «Últimas 20», «Rápidas» → abre la que perdiste → «🤖 Analizar y comentar» → lee el informe y pulsa «🎯 Aprende de tus errores».

> **Ejemplo:** descargas el .pgn de un torneo (500 partidas) → ábrelo → filtra «Carlsen» → guarda sólo esas 11 → cierra el fichero para liberar memoria.

## 📊 13. Estadísticas personales
- En **📚 Biblioteca › 📊 Estadísticas** escribe tu nombre tal como sale en las cabeceras de tus partidas (por ejemplo, tu usuario de Lichess) y pulsa **Guardar**. Si usas varios, sepáralos con punto y coma: `rafa; Karino Arillo, Rafael`. Debajo salen como botones los nombres que más aparecen en tu biblioteca, para añadirlos con un clic.
- Se calculan con **tus partidas guardadas en la biblioteca**: número de partidas, resultados, puntuación, precisión media y errores por partida.
- Debajo verás:
  - **💡 Conclusiones**: tu fase más floja, tu error más habitual, si puntúas menos con un color y tu mejor y peor apertura.
  - Los resultados **por color** y la precisión **por fases** (apertura, medio juego y final).
  - **🔍 Tus errores más frecuentes**, con un botón **🎯 Entrenar** en cada fila que abre ejercicios de ese tipo.
  - **📖 Aperturas**: cómo te va con cada una. Pulsa una fila para ver esas partidas en «Mis partidas».
  - **📈 Evolución por meses** de tu precisión y tu puntuación (con los datos también en una tabla).
- Filtra por periodo, ritmo (bala, blitz, rápidas…) y color.
- La precisión y los errores sólo cuentan las partidas **analizadas**. Las que traen el análisis de Lichess ya cuentan. Para el resto pulsa **🤖 Analizarlas ahora**: el motor las analiza una tras otra mientras sigues usando la aplicación. Elige antes el ritmo de análisis (rápido, normal o profundo); se puede detener cuando quieras.

> **Ejemplo:** descargas tus últimas 100 partidas rápidas de Lichess y las guardas → escribes tu usuario en Estadísticas → pulsas «🤖 Analizarlas ahora» → las conclusiones dicen que tu fase más floja es el final y que «Mates que permitiste» es tu error más habitual → pulsas su 🎯 Entrenar.

## 🔍 14. Buscar la posición, la estructura de peones o el material
- Pon en el tablero la posición que te interesa (de una partida, del editor o de un FEN) y ve a **📚 Biblioteca › 🔍 Posición**.
- Elige qué buscar:
  - **La misma posición**: mismas piezas en las mismas casillas y mismo turno.
  - **La misma estructura de peones**: los mismos peones en las mismas casillas, estén donde estén las piezas. Sirve para estudiar los planes típicos de una estructura (Carlsbad, peón aislado de dama…).
  - **El mismo material**: por ejemplo, torre y peón contra torre. Ideal para repasar finales.
- Busca en tu biblioteca y, si lo marcas, también en el .pgn abierto. Te dice cuántas partidas hay, cómo terminaron y cómo te fue a ti.
- Pulsa un resultado para abrir la partida justo en ese momento.

> **Ejemplo:** abres el .pgn de un torneo, juegas en el tablero tu línea de la Defensa Francesa hasta la jugada 6 y buscas «La misma posición»: ves las partidas que la siguieron y cuántas ganaron las blancas.

## 🌍 15. Aperturas: explorador y enciclopedia (y el token de Lichess)
- La pestaña **🌍 Aperturas** muestra, para la posición del tablero, qué jugadas se han hecho, cuántas veces y con qué resultado (barra blanco / tablas / negro), y partidas de ejemplo que puedes cargar.
- Tres fuentes:
  - **Maestros**: partidas reales de jugadores de +2200 (necesita token de Lichess).
  - **Lichess**: millones de partidas online de 1800 a 2500 (necesita token).
  - **Mi biblioteca + .pgn abierto**: tus propias partidas; funciona sin conexión y sin token.
- La **enciclopedia ECO local** (abajo) tiene más de 170 aperturas con nombre en español; busca «Najdorf», «Londres» o «C60» y pulsa para cargarla. Funciona sin conexión.
- El nombre de la apertura aparece arriba junto al título y reconoce transposiciones.

> **🔑 Cómo conseguir y poner el token de Lichess (gratis, una sola vez):**
1. > Entra en [lichess.org](https://lichess.org) con tu cuenta (si no tienes, créala gratis).
2. > Abre [esta página de creación de tokens](https://lichess.org/account/oauth/token/create?description=AjedrezBase) (Preferencias → API access tokens → «+»).
3. > Deja la descripción «AjedrezBase» y **no marques ningún permiso**: el explorador no los necesita.
4. > Pulsa el botón de crear al final de la página. Lichess muestra un código que empieza por `lip_`. **Cópialo ya**: no se vuelve a mostrar.
5. > Aquí, abre **⚙ Ajustes**, pégalo en «Token personal de Lichess» y pulsa **🔌 Probar token**.

> El token se guarda sólo en este navegador y sólo se envía a Lichess. Si lo pierdes o lo quieres anular, bórralo en esa misma página de Lichess y crea otro.

## 👑 16. Finales: tablas Syzygy y finales fundamentales
- Con **7 piezas o menos**, **🔍 Consultar posición** da el resultado exacto con juego perfecto y la valoración de cada jugada: 🏆 gana, 🟰 tablas, ❌ pierde. DTZ = jugadas hasta que se reinicia la regla de 50; DTM = jugadas hasta el mate.
- **Practicar**: activa la casilla y juega; el rival responderá con la defensa perfecta de la tabla. Ideal para comprobar si sabes ganar (o hacer tablas) un final.
- **Finales fundamentales**: Lucena, Philidor, Saavedra, oposición, regla del cuadrado y los mates básicos, con una explicación de la idea clave.

> **Ejemplo:** carga «Posición de Lucena» → activa «Practicar» → intenta ganar con blancas; si la tabla dice «🟰 Tablas» tras tu jugada, has perdido la victoria.

## 🎯 17. Entrenar: repertorio, errores de tus partidas y tarjetas
- **Entrenar una partida o repertorio**: carga una partida con tus líneas y variantes → pestaña **🎯 Entrenar** → elige con qué bando entrenas → **▶ Empezar**. Tú haces tus jugadas; el rival responde eligiendo al azar entre tus variantes. **💡 Pista** marca la pieza y, si la pulsas otra vez, la jugada.
- Si la partida está en la biblioteca, se programa su repaso: si fallas, vuelve mañana; si la haces perfecta, se espacia (1, 3, 7, 16, 35, 75 días). **📅 Entrenar la siguiente partida pendiente** te pone la que toca.
- **🎯 Errores de tus partidas**: ejercicios con las posiciones de los `?` y `??` de las partidas analizadas de tu biblioteca. Elige el tipo (táctica, encuentra el mate, defensa, convertir la ventaja, planteamiento, apertura o final) y cuántos, y pulsa **▶ Pendientes**, o **Al azar** para repasar aunque no toque. Con **Sólo mis jugadas** marcado salen sólo tus errores; para eso tienes que poner tu nombre en Estadísticas. Los que fallas vuelven al día siguiente y los que aciertas se espacian. Al terminar, **↩ Volver a tu partida**.
- **🧠 Tarjetas de tus marcadores**: **▶ Repasar pendientes** te muestra, una a una, las posiciones que marcaste para que encuentres la jugada. **↩ Volver a la partida** te devuelve a donde estabas.

> **Ejemplo de repertorio:** crea una partida con 1.e4 c5 2.Cf3 d6 3.d4 y añade como variantes las respuestas que preparas contra 2…Cc6 y 2…e6 → guárdala con la etiqueta «repertorio» → entrénala con blancas cada vez que te lo pida.

## 🔮 18. Adivina la jugada
- Reproduce una partida intentando acertar, una a una, las jugadas de un bando. En **🎯 Entrenar › 🔮 Adivina la jugada** elige la partida: **la del tablero** (empieza en la jugada en la que estés), **una clásica** de la antología al azar o **una de tus partidas** guardadas al azar (si pusiste tu nombre en Estadísticas, adivinas tus propias jugadas).
- El bando **automático** es el de abajo para la partida del tablero, el ganador en las clásicas y el tuyo en tus partidas. Puedes elegirlo tú.
- En cada jugada, haz la tuya en el tablero. El motor la puntúa de **0 a 5** según lo que pierde respecto a la mejor (5 = excelente, 4 = muy buena, 3 = buena, 2 = dudosa, 1 = floja, 0 = error) y puntúa igual la jugada de la partida, así que al final comparas tu puntuación con la del jugador. También se cuentan las **coincidencias** con la partida.
- **💡 Pista** marca la pieza que se movió (esa jugada vale como mucho 3 puntos) y **👁 Ver la jugada** la enseña sin puntos. Después se juega la jugada real y el rival responde.
- La partida queda con tus intentos como variantes y un comentario con los puntos en cada jugada: puedes analizarla o guardarla. **↩ Volver a tu partida** recupera lo que tenías en el tablero.

> **Ejemplo:** elige «Una clásica de la antología» y «Bando: automático» → ▶ Empezar → si te toca «La Inmortal», juegas las blancas de Anderssen. ¿Encontrarás 23.Ae7#?

## 🙈 19. A ciegas y visualización
- **🙈 Ocultar piezas** (o la tecla `B`) esconde las piezas del tablero: sigues viendo la última jugada marcada y puedes mover pulsando las casillas o escribiendo la jugada en el recuadro de debajo del tablero. **👁 Ojear** las muestra dos segundos.
- **🤖 Jugar a ciegas vs CPU** abre la partida contra la CPU con las piezas ocultas; al terminar se vuelven a mostrar.
- **Sigue la línea de memoria**: ves una posición de una partida (clásica o tuya) y, escritas, las siguientes 2, 4, 6 u 8 medias jugadas, sin que se muevan las piezas. Después te pregunta dónde ha acabado una pieza (pulsa la casilla) o qué hay en una casilla (elige la respuesta). Al contestar, el tablero muestra la posición final. Son 10 preguntas.
- **Color de las casillas**: te dice una casilla y tienes que contestar si es clara u oscura, sin mirar (el tablero se tapa). Son 20 preguntas.
- **Encuentra la casilla**: pulsa en 30 segundos todas las casillas que puedas, con las coordenadas ocultas. Se guarda tu récord con blancas y con negras abajo (gira el tablero con ⇅ para practicar con negras).

> **Ejemplo:** empieza con «Sigue la línea» a 2 medias jugadas; cuando aciertes 9 de 10, sube a 4, luego a 6… Y prueba una partida a ciegas contra la CPU de nivel 1 sin reloj.

## 💾 20. Ocupación de memoria y espacio
- Arriba de **📚 Biblioteca** tienes el medidor:
  - **Biblioteca (permanente)**: lo que ocupan tus partidas y marcadores guardados. Se recomiendan hasta 100 MB (unas 50.000–100.000 partidas), porque se carga entera al abrir la página.
  - **Fichero .pgn abierto**: lo que ocupa en memoria el fichero que tengas abierto (recomendado hasta 200 MB).
  - La línea de abajo indica el espacio total que el navegador permite a esta página y, en Chrome, la memoria que usa.
- La barra pasa a naranja y rojo al acercarse al límite, y se pide confirmación antes de guardar o abrir algo muy grande.
- **🔒 Proteger datos** pide al navegador que no borre tu biblioteca aunque se quede sin espacio (algunos navegadores sólo lo conceden a páginas que usas a menudo o que tienes en marcadores).
- Para liberar espacio: borra partidas que no uses, cierra el fichero .pgn al terminar y guarda copias de seguridad de vez en cuando.

## 🛠 21. Ajustes y personalización
- **Barra superior**: estilo de piezas (clásicas, minimalistas, diagrama, unicode), notación en pantalla (española, figurines, inglesa) y colores del tablero.
- **⚙ Ajustes**: motor (automático o sólo interno), tiempo por jugada al analizar, número de líneas del motor, tiempo del análisis continuo, token de Lichess, coordenadas, mostrar jugadas legales y recordar la partida al recargar.
- **🔊** activa o silencia los sonidos.
- Todos los ajustes se recuerdan en este navegador.

## ⌨ 22. Atajos de teclado
| Tecla | Acción |
| --- | --- |
| `←` `→` | Jugada anterior / siguiente |
| `↑` `↓` | Cambiar entre variantes alternativas |
| `Inicio` `Fin` | Principio / final de la línea |
| `Espacio` | Reproducción automática |
| `F` | Girar el tablero |
| `E` | Activar / pausar el análisis continuo |
| `M` | Marcar la posición |
| `X` | Ver la amenaza del rival |
| `B` | Ocultar / mostrar las piezas (a ciegas) |
| Rueda del ratón | Avanzar / retroceder (con el puntero sobre el tablero) |
| `?` | Abrir esta ayuda |
| `Esc` | Cerrar ventanas |

Los atajos no funcionan mientras escribes en un recuadro de texto.

## 📤 23. Imagen, impresión y enlaces para compartir
- **🖼 Imagen**: descarga la posición del tablero como PNG, con sus flechas y círculos y un pie con la partida y la jugada. Si el navegador lo permite, además la copia al portapapeles para pegarla en un correo, un chat o un documento.
- **🖨 Imprimir**: prepara la partida comentada para imprimirla o guardarla como PDF (elige «Guardar como PDF» en la ventana de impresión): cabecera con jugadores y evento, jugadas con comentarios y variantes, y diagramas en las jugadas marcadas con 📌, en las ??, ? y !! y en la posición final.
- **🔗 Enlace**: copia un enlace que abre la partida justo en la jugada en la que estás, con las jugadas de la línea (y la posición inicial si no es la normal). Quien lo abra la verá en su navegador sin que se guarde nada; puede guardarla con 💾 si le interesa. Los comentarios y las variantes no viajan en el enlace: para eso, comparte el .pgn.

> **Ejemplo:** quieres preguntarle a un compañero del club por la jugada 18 → sitúate en ella → **🔗 Enlace** → pégalo en WhatsApp. Para tu cuaderno de estudio → **🖨 Imprimir** → «Guardar como PDF».

## 📲 24. Versión web, instalación y uso sin conexión
- **Versión web**: [rkarillo-tech.github.io/ajedrezbase](https://rkarillo-tech.github.io/ajedrezbase/). Es la forma recomendada: Stockfish y las consultas a Lichess funcionan sin problemas y tu biblioteca queda siempre en la misma dirección.
- **Instalarla**: en la versión web aparece el botón **⬇ Instalar** arriba (o el icono de instalar en la barra de direcciones de Chrome y Edge). En el móvil: Android con Chrome → menú ⋮ → «Instalar aplicación»; iPhone/iPad con Safari → Compartir → «Añadir a pantalla de inicio».
- **Sin conexión**: una vez abierta con internet, la aplicación (incluido Stockfish) queda guardada y funciona sin conexión. Sólo necesitan internet el explorador de Lichess, la nube y las tablas Syzygy.
- **Actualizaciones**: con conexión siempre se carga la última versión; no hay que hacer nada.
- **Archivo suelto**: también puedes descargar `index.html` y abrirlo con doble clic. Funciona igual, pero la biblioteca de esa copia es distinta de la de la versión web.

## 🩺 25. Problemas frecuentes
**«Lichess ha rechazado la consulta: hace falta un token personal»**

Lichess exige ahora un token gratuito para su explorador. Sigue los pasos del apartado 15. Mientras tanto, usa «Mi biblioteca + .pgn abierto» o la enciclopedia ECO.

**«Lichess pide esperar» o «demasiadas consultas»**

Lichess limita las consultas seguidas. La aplicación hace una cada vez y, si Lichess pide una pausa, espera el minuto que exige antes de volver a preguntar. Basta con esperar.

**«Esta partida se ha modificado en otra pestaña»**

Tienes la aplicación abierta en dos pestañas o ventanas. Para no perder nada, no se guarda encima de los cambios de la otra: vuelve a abrir la partida desde la biblioteca, o pulsa 💾 si quieres quedarte con la versión de esta pestaña.

**«Motor interno ⚠» en vez de Stockfish**

El navegador no ha dejado arrancar Stockfish (pasa en vistas previas de archivos o sin conexión la primera vez). Abre la versión web ([rkarillo-tech.github.io/ajedrezbase](https://rkarillo-tech.github.io/ajedrezbase/)) o el archivo directamente con Chrome, Edge o Firefox (doble clic).

**Las estadísticas dicen que no hay partidas mías**

Tu nombre tiene que coincidir con el de las cabeceras «White»/«Black» de tus partidas (no importan mayúsculas ni tildes). Usa los botones con los nombres más frecuentes, y si usas varios, sepáralos con «;». Además, las partidas tienen que estar guardadas en la biblioteca, no sólo en el .pgn abierto.

**«No hay ejercicios» en «Errores de tus partidas»**

Los ejercicios salen de las partidas analizadas de tu biblioteca. Analízalas con «🤖 Analizar y comentar» y guárdalas, o pulsa «🤖 Analizarlas ahora» en Estadísticas. Prueba también a desmarcar «Sólo mis jugadas» o a elegir «Todos los errores».

**Importo en inglés y veo las jugadas en español**

Es normal: la «Notación» de la barra superior sólo cambia cómo se muestran. Elige «Inglesa» si prefieres verlas como en el PGN.

**«No aparece mi biblioteca»**

La biblioteca depende del navegador y de la dirección desde la que abres la página. Ábrela siempre igual, o usa ⬇ Copia de seguridad / ⬆ Restaurar copia para pasarla.

**El gráfico sale casi vacío**

Sólo se dibuja con las posiciones evaluadas. Pulsa 📈 Completar gráfico o 🤖 Analizar y comentar.

**«Jugada ilegal o no reconocida» al importar**

Revisa esa jugada en el texto (a veces el PGN tiene erratas o mezcla notaciones). Prueba a fijar la «Notación de entrada» en vez de «Automática». Lo importado hasta ese punto se conserva.

**La nube dice que la posición no está**

La nube de Lichess sólo guarda posiciones que alguien analizó a fondo. Usa el motor local.
