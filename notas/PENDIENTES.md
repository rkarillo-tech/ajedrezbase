# Mejoras pendientes

Lista general de lo que queda por hacer, para que cualquier sesión de trabajo la encuentre.
Junta la auditoría externa de la 1.52.0 (sobre la interfaz) con las mejoras que quedaban abiertas.
Al terminar una tarea, márcala con ✅ y la versión, o bórrala.

## A. Correcciones

- ✅ **A1** (1.52.1). Guardado al pasar a otra partida. Si fallaba la escritura, los cambios se perdían. Si la partida se había modificado en otra pestaña, se descartaban sin avisar. Ahora se rescatan (↩ Recuperar), o se pregunta y se guardan como copia.
- ✅ **A2** (1.52.1). Pestañas accesibles: `aria-controls` / `aria-labelledby`, tabulación solo en la activa, y ← → Inicio Fin con el foco en ellas.
- ✅ **A3** (1.55.0). Ampliar la comprobación de lo que dice la IA (`aiCheckClaims`). Hoy solo detecta «pieza de/en casilla» y «mi dama». Faltan «amenaza mate», «gana material», «pieza colgada» y similares, que se pueden comprobar con el motor y las reglas.
  Hecho: amenaza de mate (en una o dos jugadas), jaque, pieza sin defensa o clavada y derechos de enroque. Queda sin comprobar «gana material» o «gana una pieza» a varias jugadas vista: para no acusar sin razón haría falta seguir las líneas del motor.

## B. Distribución y experiencia de uso

- ✅ **B1** (1.53.0). Jugadas y comentario junto al tablero en Estudio, y el cuadro de PGN (importar/exportar) en una sección plegable. En la 1.52.0, la lista de jugadas (`#moves`) empieza en y≈1098 px, también a 1920×1080. Hoy queda debajo del motor, en la columna del tablero.
- ✅ **B2** (1.53.0). Herramientas del motor: dejar visibles Analizar, Flecha, la evaluación y la mejor jugada. Radar, Colores, Nube, Amenaza, Habla con tus piezas y Piensa conmigo van a un desplegable «Herramientas». Renombrar «⚡ Jugar» (por ejemplo, «⚡ Hacer la mejor») para no confundirlo con «Jugar vs CPU».
- ✅ **B3** (1.53.0). Móvil: bienvenida compacta (ocupa 456 px antes del tablero a 390×844) y etiquetas de las pestañas más legibles (`.tab-btn` a `.6rem`).
- ✅ **B4** (1.57.0). Indicar claramente qué estás haciendo: «Analizando una partida», «Problema 3 de 10», «Jugando contra la CPU».
- ✅ **B5** (1.57.0). Ajustes por categorías: Apariencia, Tablero, Motor, IA, Datos y sincronización, Accesibilidad y Avanzado. Tiempo del motor como «Rápido / Equilibrado / Profundo»; los milisegundos, en Avanzado.
- **B6**. Tablero manejable con teclado: las casillas no son enfocables. Moverse con flechas, Enter para elegir origen y destino, Esc para cancelar.

- **B7**. Lo que está debajo del tablero en el ordenador: el motor, el recuadro de la partida contra la CPU (con Piensa conmigo, Colores, Radar, Profesor…) y el profesor IA. Con 900 px de alto o menos hay que bajar para verlo. Opciones: llevar a la columna derecha lo que se está haciendo (partida contra la CPU, motor, profesor), encima de las jugadas, o compactar la navegación. Se deja así de momento (decisión del 20/11/2026).

## C. Funciones nuevas

- ✅ **C1** (1.54.0). **Planes por estructura de peones.** Reconocer la estructura (Carlsbad, peón aislado de dama, Maroczy, cadenas de la Francesa, India de Rey…). Explicar el plan típico de cada bando y enseñar partidas modelo con el índice de posiciones. Sin conexión, y como contexto para el profesor IA.
  Lo que ya hay: `63-indice.js` calcula una firma de la estructura de peones y `30-analisis.js` detecta peones aislados. Falta el catálogo de estructuras con sus planes.
- ✅ **C2** (1.56.0). **Entrenador con memoria entre sesiones.** Recordar qué temas cuestan de una clase a otra, no solo con las partidas analizadas. Proponer una sesión corta diaria desde «📅 Hoy» y repetir los ejercicios fallados al cabo de unos días.
  Lo que ya hay: `77-entrenador-ia.js` usa los temas flojos y los errores, pero no guarda un historial propio. El repaso espaciado de otros ejercicios se puede reutilizar.
- ✅ **C3** (1.55.0). **Comentar tu repertorio.** El profesor IA comenta tus líneas de repertorio jugada a jugada: la idea de cada una y qué hacer si el rival se sale. Stockfish revisa antes las jugadas dudosas y los comentarios se guardan en el PGN del repertorio.
  Lo que ya hay: «🩺 Revisar» (jugadas dudosas) y «💾 Añadir como comentario» (1.52.0).
- ✅ **C4** (1.58.0). **«Vigilancia en una sola consulta»** para modelos locales: la IA responde libremente, Stockfish revisa después las jugadas que recomienda y solo se le pide corregir si alguna es mala. Es la alternativa que no se eligió para acelerar las propuestas. Solo si siguen siendo lentas.
- ✅ **C5** (1.59.0). **Más adelante.** Modo básico/avanzado. Estado de los servicios (qué motor, IA y recursos en línea hay disponibles). Comparar dos posiciones. Espacios de trabajo personalizados.

## D. Calidad y mantenimiento

- **D1**. Revisar los 34 artículos de aperturas de la 1.46.0 y los planes de las 13 estructuras de peones de la 1.54.0 (`src/app/38-estructuras.js`). Los redactó la IA; necesita a un jugador con buen nivel.
- **D2**. Probar la parte del profesor IA que usa Claude. Necesita el SDK de Anthropic aparte y en la CI solo se ejecuta si está configurado.
- **D3**. Pruebas de fallos: CDN caída, sin conexión la primera vez, cambio de motor durante un análisis.
- **D4**. Revisar los usos de `innerHTML` donde se pinta texto de PGN o comentarios importados (hay unos 160).
- **D5**. Bibliotecas grandes: carga bajo demanda y lista virtualizada (hoy la biblioteca se carga entera; límite recomendado de 100 MB).

## E. Auditoría externa de la 1.59.0

Todos los puntos se han comprobado en el código. E1–E5 son fallos; E6–E9, mejoras.

- ✅ **E1** (1.59.1). Triple repetición con captura al paso. `gameStatus` (`20-tablero.js`) compara `posKey`, que excluye la casilla al paso: con `1.e4 Cf6 2.e5 d5 3.Cf3 Cfd7 4.Cg1 Cf6 5.Cf3 Cfd7 6.Cg1 Cf6` declaraba tablas (cuenta 3; según la FIDE son 2, porque en la primera era legal `exd6`). Hace falta una clave propia para repeticiones que incluya el al paso solo si la captura es legal.
- ✅ **E2** (1.59.1). Guardado de colecciones PGN (`saveCollGames`, `60-biblioteca.js`). Si fallaba la escritura anunciaba «N guardadas» igualmente; las partidas se marcaban con ✔ antes de escribirlas; si fallaba una tanda de 250 no decía cuántas habían entrado; y una partida que se detiene en una jugada ilegal se guardaba incompleta sin avisar. Mostrar cuántas se han guardado completas, cuáles tienen errores y cuáles quedan pendientes.
- ✅ **E3** (1.59.1). Precisión en jugadas de apertura (`classifyMove`, `30-analisis.js`). Toda posición del catálogo ECO contaba como pérdida 0 y precisión 100 %, también el Gambito Letón o una transposición a una posición con nombre. Calcular siempre la pérdida y usar el ECO solo como etiqueta.
- ✅ **E4** (1.59.1). Símbolos PGN. Al exportar se perdían `$36`, `$37`, `$40`, `$132`, `$142`, `$146` y cualquier código fuera de la tabla; `$36` y `$37` (iniciativa de cada bando) se leían como el mismo «→», y solo se guardaba un símbolo de jugada y otro de posición por movimiento. Conservar los códigos originales.
- ✅ **E5** (1.59.1). Deshacer «Cortar» (`80-interfaz.js`). Borraba hasta 6 medios movimientos sin confirmar y sin forma de recuperarlos, comentarios incluidos. Aclarar qué se elimina y ofrecer ↩ Deshacer.
- **E6**. Versiones de una partida. `gameSig` solo mira jugadores, fecha y las 60 primeras jugadas de la línea principal: al importar una colección, otra edición de la misma partida con comentarios o variantes distintas se descarta en silencio. Omitir solo las copias idénticas (PGN normalizado) y guardar o preguntar cuando cambian las notas.
- **E7**. Origen de la evaluación en el informe: motor, tiempo por posición, si alguna evaluación es de otro motor o de un análisis anterior (hoy se reutilizan si tienen profundidad suficiente) y si entró el motor de respaldo. Botón «Analizar más a fondo esta posición» en cada momento crítico (reutilizar `explainCurrentMove` forzando el recálculo con más tiempo).
- **E8**. Recorrido guiado: tras importar, confirmación visible («Partida cargada · 32 jugadas») con «Analizar y comentar»; al terminar, «Revisar el primer momento crítico» y después «Practicar». Sugerencias que se pueden ignorar, no un asistente. Hoy el mensaje de importación queda dentro de la sección plegable del PGN.
- **E9**. Notación descriptiva española (`P4R`, `C3AR`, `PxP`) como modo de entrada aparte: filas contadas desde cada bando, jugada estándar al lado en la planilla y, si una captura es ambigua, elegir en el tablero. Guardar en PGN estándar. Es la más costosa.

## Orden previsto

1. ✅ 1.52.1: A1 y A2.
2. ✅ 1.53.0: B1, B2 y B3.
3. ✅ 1.54.0: C1.
4. ✅ 1.55.0: C3 y A3.
5. ✅ 1.56.0: C2.
6. ✅ 1.57.0: B4 y B5 · ✅ 1.58.0: C4 · ✅ 1.59.0: C5.
7. ✅ 1.59.1: E1, E2, E3, E4 y E5 (correcciones).
8. Después: E6, E7, E8 y E9; B6, B7 y la serie D según haga falta. D1 queda pendiente de que lo revise una persona.
