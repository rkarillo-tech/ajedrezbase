/* ---------- 21c. 📖 Aperturas explicadas ----------
   Un artículo por familia de aperturas (qué es, sus ideas, cómo jugarla con cada color, errores y trampas típicos y
   su origen), con notas cortas para las variantes principales. Cubre todas las aperturas de la enciclopedia ECO
   local: cada entrada se asigna al primer artículo cuyo patrón encaja con su nombre (los específicos van antes).
   Redactados con ayuda de IA para AjedrezBase; funcionan sin conexión y sin IA configurada.
   Las jugadas de «moves» van en SAN inglés y se muestran en la notación elegida. */
const OPENING_ARTICLES = [
  // ===================== 1.e4 e5 =====================
  { id: "espanola", name: "Apertura Española (Ruy López)", eco: "C60–C99", moves: "1. e4 e5 2. Nf3 Nc6 3. Bb5", match: /^(Española|Apertura Española|Berlinesa)/,
    que: "El alfil de rey ataca al caballo que defiende e5. No amenaza ganar el peón todavía (si 4.Axc6 dxc6 5.Cxe5, Dd4 lo recupera), pero crea una presión duradera sobre el centro negro. Es una de las aperturas más profundas y jugadas en la élite desde hace más de un siglo.",
    ideas: ["Las blancas preparan c3 y d4 para tener un centro de peones fuerte.", "El alfil suele retirarse a a4 y b3, desde donde apunta a f7.", "Con negras, ...a6 y ...b5 echan al alfil; el plan clásico es aguantar el punto e5.", "Partidas largas de maniobras: el caballo de b1 viaja por d2–f1–g3 en la Española Cerrada."],
    blancas: "Enroca pronto, juega Te1, c3 y d4. No tengas prisa: la Española recompensa la paciencia y el juego en todo el tablero.",
    negras: "Elige un sistema: la Defensa Morphy (3...a6), sólida y rica; la Berlinesa (3...Cf6), muy segura; o el Ataque Marshall si te gusta sacrificar un peón por la iniciativa.",
    errores: "Cuidado con la trampa del Arca de Noé: si las blancas juegan d4 descuidadamente, ...b5 y ...c5 pueden encerrar al alfil de b3. Y con negras, no cambies en d4 sin motivo: cedes el centro.",
    origen: "Ya aparece en el manuscrito de Gotinga (hacia 1500), pero lleva el nombre del clérigo extremeño Ruy López de Segura, que la analizó en su libro de 1561.",
    v: [[/Berlinesa · Muro/, "El «Muro de Berlín» (cambio de damas temprano): Kramnik lo usó para quitarle el título a Kaspárov en 2000. Final sólido para negras, a pesar de perder el enroque."],
        [/Berlinesa/, "3...Cf6: contraataca e4 en lugar de defender e5. Muy sólida, la preferida de muchos campeones."],
        [/Cambio/, "4.Axc6: las blancas dan la pareja de alfiles a cambio de dejar a las negras con peones doblados; Fischer la usaba para buscar finales favorables."],
        [/Marshall/, "8...d5: sacrificio de peón para atacar al rey blanco. Lo estrenó Marshall contra Capablanca en 1918 (ganó Capablanca), y hoy es una de las armas más temidas."],
        [/Abierta/, "5...Cxe4: las negras toman el peón y juegan activamente, a cambio de una estructura algo más débil."],
        [/Cerrada|Morphy|5\.O-O/, "La línea principal: ...Ae7, ...b5, ...d6 y ...O-O; partidas largas y estratégicas."]] },
  { id: "italiana", name: "Apertura Italiana (Giuoco Piano)", eco: "C50–C54", moves: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5", match: /^(Apertura Italiana|Giuoco)/,
    que: "Los dos bandos desarrollan los alfiles hacia las casillas más sensibles del rival (f7 y f2). Es la apertura con la que empiezan casi todos los jugadores, pero también se juega en la élite, sobre todo en su versión lenta (Giuoco Pianissimo, con d3).",
    ideas: ["Con c3 y d4 las blancas buscan un centro grande (Giuoco Piano).", "Con d3 juegan una partida tranquila de maniobras, parecida a la Española.", "Las negras desarrollan con ...Cf6, ...d6 y ...O-O, y a veces ...a6 para guardar el alfil.", "El punto f7 es el objetivo táctico típico al principio."],
    blancas: "Desarrolla, enroca y decide: ataque directo con c3–d4, o maniobras con d3, Te1, Cbd2–f1–g3.",
    negras: "Imita el desarrollo sin descuidar f7. Si las blancas juegan d4, cambia en el momento justo para no quedarte sin centro.",
    errores: "El error típico de principiante: dejar el caballo en g5 con la dama en h5 apuntando a f7. Y con negras, retirar el alfil de c5 cuando lo atacan con b4 sin mirar si se pierde el tiempo.",
    origen: "Es de las aperturas más antiguas: la estudiaron los italianos Polerio y Greco entre los siglos XVI y XVII; «Giuoco Piano» significa «juego tranquilo».",
    v: [[/Pianissimo/, "Con d3: juego lento y posicional; hoy es la forma más jugada en la élite."], [/4\.c3/, "4.c3 y d4: el plan clásico para conquistar el centro."]] },
  { id: "evans", name: "Gambito Evans", eco: "C51–C52", moves: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4", match: /^Gambito Evans/,
    que: "Las blancas dan el peón de b4 para ganar tiempos con c3 y d4 y abrir líneas contra el rey negro. Es el gambito romántico por excelencia dentro de la Italiana.",
    ideas: ["Tras 4...Axb4 5.c3, el alfil negro tiene que moverse otra vez y las blancas juegan d4 con tiempo.", "Las blancas buscan Db3 (contra f7), Aa3 (impide el enroque negro) y e5.", "Las negras pueden devolver el peón para terminar el desarrollo."],
    blancas: "Juega rápido: c3, d4, O-O y ataque. El peón da igual si consigues la iniciativa.",
    negras: "Acepta y devuelve el material en el momento oportuno; o declina con 4...Ab6. Lo importante es enrocar.",
    errores: "Con negras, intentar conservar todo el material a cualquier precio suele acabar con el rey en el centro (como en la Siempreviva de Anderssen, 1852).",
    origen: "La inventó el capitán de barco galés William Davies Evans hacia 1827; fue la gran moda del siglo XIX y Kaspárov la resucitó en los años noventa." },
  { id: "dos-caballos", name: "Defensa de los Dos Caballos", eco: "C55–C59", moves: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6", match: /^(Defensa de los Dos Caballos|Dos Caballos)/,
    que: "En lugar de 3...Ac5, las negras contraatacan e4 con el caballo. Es una defensa activa y táctica: si las blancas atacan f7 con 4.Cg5, las negras suelen sacrificar un peón por la iniciativa.",
    ideas: ["Tras 4.Cg5 d5 5.exd5, lo correcto es 5...Ca5 (no 5...Cxd5).", "Con 4.d3 las blancas evitan las complicaciones y vuelven a una Italiana tranquila.", "Las negras buscan actividad rápida de piezas a cambio de material."],
    blancas: "Si te gustan las posiciones claras, 4.d3. Si quieres ganar un peón y defenderte, 4.Cg5.",
    negras: "Conoce bien las líneas con 4.Cg5: tras 5...Ca5 tienes buen juego por el peón.",
    errores: "El clásico «Fegatello» (o hígado frito): tras 4.Cg5 d5 5.exd5 Cxd5?! 6.Cxf7! Rxf7 7.Df3+, el rey negro queda expuesto. Es una trampa que conviene conocer.",
    origen: "Ya la analizaron Polerio y otros italianos en el siglo XVI; el ataque Fegatello aparece en manuscritos de esa época.",
    v: [[/Fegatello/, "6.Cxf7: el sacrificio que da nombre al «hígado frito»; muy peligroso para las negras en la práctica."], [/4\.Cg5/, "4.Cg5: ataque directo a f7; las negras responden 4...d5 y sacrifican un peón."]] },
  { id: "escocesa", name: "Apertura Escocesa", eco: "C44–C45", moves: "1. e4 e5 2. Nf3 Nc6 3. d4", match: /^(Apertura Escocesa|Gambito Escocés)/,
    que: "Las blancas abren el centro de inmediato con 3.d4. Tras 3...exd4 4.Cxd4 consiguen espacio y desarrollo fácil, a cambio de liberar también el juego de las negras.",
    ideas: ["Partida abierta con piezas activas desde el principio.", "Las negras suelen atacar el caballo de d4 con ...Ac5 o ...Cf6.", "El Gambito Escocés (4.Ac4) da un peón para atacar rápido."],
    blancas: "Desarrollo claro: Cxd4, Cc3, Ae2 o Ac4, O-O. Busca ventaja de espacio sin complicarte.",
    negras: "Contraataca enseguida el caballo de d4 o el peón de e4: ...Cf6 y ...Ac5 son las respuestas más naturales.",
    errores: "Con negras, perder tiempo con la dama (...Dh4 sin preparación) puede salir caro si las blancas desarrollan con tiempo.",
    origen: "Toma el nombre de la partida por correspondencia entre Edimburgo y Londres de 1824. Kaspárov la recuperó en la élite en los años noventa.",
    v: [[/Gambito Escocés/, "4.Ac4: en lugar de recuperar el peón, las blancas desarrollan y atacan f7."]] },
  { id: "cuatro-caballos", name: "Tres y Cuatro Caballos", eco: "C46–C49", moves: "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6", match: /^(Apertura de los Tres Caballos|Apertura de los Cuatro Caballos|Cuatro Caballos)/,
    que: "Los caballos salen por su casilla natural antes que los alfiles. Es una apertura sólida y simétrica, ideal para aprender a desarrollar sin riesgos.",
    ideas: ["Con 4.Ab5 se convierte en una especie de Española sólida.", "Con 4.d4 las blancas abren el centro (variante Escocesa).", "Las negras pueden copiar el desarrollo o jugar 4...Cd4 (la defensa Rubinstein), más ambiciosa."],
    blancas: "Busca 4.Ab5 o 4.d4 y juega con el pequeño plus del primer movimiento.",
    negras: "Desarrolla igual y no tengas miedo de la simetría: la posición es muy sólida.",
    errores: "En posiciones simétricas, quien rompe la simetría sin pensar suele salir perdiendo. Cuidado con las clavadas de los alfiles en b5 y b4.",
    origen: "Muy popular en el siglo XIX y principios del XX; se considera una de las aperturas clásicas más sanas." },
  { id: "petrov", name: "Defensa Petrov (Rusa)", eco: "C42–C43", moves: "1. e4 e5 2. Nf3 Nf6", match: /^Defensa Petrov/,
    que: "Las negras no defienden e5: contraatacan e4 con su caballo. Es una de las defensas más sólidas contra 1.e4 y una de las favoritas de los jugadores que buscan tablas con negras sin sufrir.",
    ideas: ["Tras 3.Cxe5, NO se juega 3...Cxe4? por 4.De2: primero 3...d6 y luego ...Cxe4.", "Estructuras simétricas y posiciones equilibradas.", "Las blancas intentan aprovechar el pequeño adelanto en el desarrollo."],
    blancas: "Busca líneas con enroque largo o con c4 para crear desequilibrios: si no, la simetría da tablas.",
    negras: "Aprende el orden correcto de jugadas y no copies todo: a partir de cierto momento hay que desarrollar con ideas propias.",
    errores: "La trampa principal: 3.Cxe5 Cxe4?? 4.De2 y las negras pierden la dama tras 4...Cf6?? 5.Cc6+ (descubierta).",
    origen: "La analizaron los rusos Alexander Petrov y Carl Jaenisch en el siglo XIX; en la era moderna la han usado Kárpov, Krámnik o Caruana." },
  { id: "philidor", name: "Defensa Philidor", eco: "C41", moves: "1. e4 e5 2. Nf3 d6", match: /^Defensa Philidor/,
    que: "Las negras defienden e5 con un peón en lugar de con una pieza. Es sólida pero algo pasiva: el alfil de f8 queda encerrado detrás de d6.",
    ideas: ["Las blancas juegan d4 y consiguen más espacio.", "Las negras mantienen el punto e5 (sistema Hanham, con ...Cd7, ...Ae7, ...c6).", "Partidas lentas y estratégicas."],
    blancas: "d4, Cc3, Ac4 y O-O: desarrollo natural y presión sobre f7.",
    negras: "Mantén e5 y no te precipites; cuidado con las clavadas del alfil en g5 y las amenazas sobre f7.",
    errores: "Ojo con los ataques rápidos sobre f7: la famosa Partida de la Ópera (Morphy, 1858) empezó con esta defensa y es un manual de lo que pasa si te retrasas en el desarrollo.",
    origen: "Lleva el nombre del compositor y ajedrecista francés François-André Danican Philidor, que la recomendaba en su libro de 1749." },
  { id: "gambito-rey", name: "Gambito de Rey", eco: "C30–C39", moves: "1. e4 e5 2. f4", match: /^Gambito de Rey/,
    que: "Las blancas ofrecen el peón de f para desviar el peón de e5, dominar el centro con d4 y abrir la columna f contra el rey negro. Es el gambito romántico más famoso.",
    ideas: ["Si las negras toman (2...exf4), las blancas juegan Cf3, d4 y Ac4 apuntando a f7.", "Las negras pueden defender el peón con ...g5 o devolverlo con ...d5 para liberar su juego.", "El rey blanco también queda algo expuesto en la diagonal e1–h4."],
    blancas: "Juega con energía: desarrollo rápido, d4 y O-O; la columna f es tu arma.",
    negras: "La respuesta más sana es contragolpear en el centro con ...d5 en el momento adecuado.",
    errores: "Con blancas, cuidado con ...Dh4+ si el rey no tiene casilla. Con negras, aferrarse al peón sin desarrollar es peligroso.",
    origen: "Ya lo analizó Ruy López en 1561 y fue la apertura estrella del siglo XIX: la «Inmortal» de Anderssen (1851) es un Gambito de Rey. En el siglo XX lo jugaron Spassky y Bronstein.",
    v: [[/Aceptado/, "2...exf4: las negras se quedan el peón y las blancas buscan compensación con desarrollo y ataque."]] },
  { id: "abiertas-otras", name: "Otras aperturas abiertas (1.e4 e5)", eco: "C20–C29, C40, C44", moves: "1. e4 e5", match: /^(Apertura Abierta|Gambito Danés|Apertura del Centro|Apertura de Alfil|Apertura Vienesa|Apertura de Caballo de Rey|Gambito Letón|Apertura Ponziani)/,
    que: "Con 1.e4 e5 empiezan las «partidas abiertas»: centro abierto, desarrollo rápido y táctica. Además de la Española y la Italiana hay muchas alternativas, algunas sólidas y otras muy agudas.",
    ideas: ["2.Cf3 es lo más natural: desarrolla atacando e5.", "La Vienesa (2.Cc3) y la Apertura de Alfil (2.Ac4) preparan f4.", "Los gambitos (Danés, Letón) sacrifican peones para atacar.", "La Ponziani (3.c3) prepara d4 con un centro grande."],
    blancas: "Prioriza desarrollar rápido y controlar el centro; en las partidas abiertas cada tiempo cuenta.",
    negras: "Responde a los gambitos devolviendo material si así terminas el desarrollo; el rey seguro es lo primero.",
    errores: "En las partidas abiertas el error más caro es dejar el rey en el centro con la columna e abierta.",
    origen: "Son las aperturas más antiguas del ajedrez moderno; casi todas ya se analizaban en los siglos XVI a XIX.",
    v: [[/Danés/, "Gambito Danés (3.c3 dxc3 4.Ac4): las blancas dan dos peones para tener los dos alfiles apuntando al rey."], [/Letón/, "Gambito Letón (2...f5): un contragambito muy arriesgado para las negras."],
        [/Vienesa/, "Vienesa (2.Cc3): prepara f4 sin dar tanto como el Gambito de Rey."], [/Ponziani/, "Ponziani (3.c3): prepara d4; la respuesta enérgica es 3...d5 o 3...Cf6."],
        [/Centro/, "Apertura del Centro (2.d4 exd4 3.Dxd4): la dama sale pronto y las negras ganan tiempo con ...Cc6."], [/Alfil/, "Apertura de Alfil (2.Ac4): flexible, puede transponer a la Italiana o la Vienesa."]] },
  // ===================== 1.e4, otras defensas =====================
  { id: "siciliana", name: "Defensa Siciliana", eco: "B20–B99", moves: "1. e4 c5", match: /^(Defensa Siciliana|Siciliana|Najdorf|Dragón)/,
    que: "Las negras responden a 1.e4 con un peón de flanco que controla d4. La partida queda desequilibrada desde el principio: es la defensa más jugada y la que más puntos da a las negras en la práctica.",
    ideas: ["En la Siciliana Abierta (2.Cf3 y 3.d4) las negras cambian su peón c por el peón d blanco: tienen mayoría central y la columna c semiabierta.", "Las blancas suelen atacar en el flanco de rey; las negras, en el de dama.", "A menudo hay enroques opuestos y carreras de ataques.", "Cada sistema (Najdorf, Dragón, Sveshnikov, Taimanov…) tiene sus planes propios."],
    blancas: "Elige entre la Abierta (lo más ambicioso: mucha teoría y ataque) o sistemas sin d4 como la Alapin (2.c3), la Rossolimo o la Cerrada (2.Cc3).",
    negras: "Elige un sistema y estudia sus estructuras típicas: la ruptura ...d5 y el contraataque por la columna c son claves.",
    errores: "Con negras, retrasar demasiado el desarrollo del flanco de rey en la Siciliana Abierta; con blancas, lanzar el ataque sin tener el centro asegurado.",
    origen: "La analizó Giulio Polerio en 1594 y se popularizó en el siglo XX: Fischer y Kaspárov la convirtieron en su arma principal.",
    v: [[/Najdorf · Ataque Inglés/, "Ataque Inglés (Ae3, f3, Dd2 y g4): enroque largo y avalancha de peones contra el rey negro."],
        [/Najdorf · 6\.Ag5/, "6.Ag5: la línea más aguda de la Najdorf, con variantes como la del Peón Envenenado."],
        [/Najdorf/, "Najdorf (5...a6): flexible; prepara ...e5 o ...e6 y ...b5. La favorita de Fischer y Kaspárov. Lleva el nombre de Miguel Najdorf."],
        [/Yugoslavo/, "Ataque Yugoslavo: enroques opuestos y carrera de ataques; las blancas abren la columna h y cambian el alfil de g7."],
        [/Dragón Acelerado/, "Dragón Acelerado: ...g6 sin ...d6, para poder jugar ...d5 de una vez."],
        [/Dragón/, "Dragón (...g6 y ...Ag7): el alfil de g7 «escupe fuego» por la gran diagonal. El nombre lo puso Dus-Chotimirsky por la constelación del Dragón."],
        [/Sveshnikov/, "Sveshnikov (...e5): las negras aceptan un agujero en d5 a cambio de actividad; la popularizó Evgeni Sveshnikov en los años setenta."],
        [/Scheveningen/, "Scheveningen (...e6 y ...d6): un «pequeño centro» muy sólido y flexible."],
        [/Richter-Rauzer/, "Richter-Rauzer (Ag5 contra la Clásica): las blancas presionan d6 y suelen enrocar largo."],
        [/Taimanov/, "Taimanov (...e6 y ...Cc6): flexible, con muchas transposiciones."], [/Kan/, "Kan (...e6 y ...a6): muy flexible, con la dama a menudo en c7."],
        [/Alapin/, "Alapin (2.c3): prepara d4 para recapturar con peón; evita la teoría de la Abierta."],
        [/Smith-Morra/, "Smith-Morra (3.c3): gambito de peón por desarrollo rápido y columnas abiertas."],
        [/Rossolimo/, "Rossolimo (3.Ab5): las blancas cambian a menudo el alfil por el caballo y juegan posicionalmente."],
        [/Cerrada/, "Cerrada (2.Cc3 y g3): las blancas evitan d4 y preparan un ataque lento con f4."],
        [/Moscú/, "Ataque Moscú (3.Ab5+): una forma sólida de evitar la teoría con ...d6."]] },
  { id: "francesa", name: "Defensa Francesa", eco: "C00–C19", moves: "1. e4 e6 2. d4 d5", match: /^(Defensa Francesa|Francesa|Winawer)/,
    que: "Las negras preparan ...d5 con ...e6: atacan el centro blanco con peones y aceptan una posición algo cerrada. Es una defensa sólida y combativa, con estructuras de peones muy claras.",
    ideas: ["Cadenas de peones: si las blancas juegan e5, las negras atacan la base con ...c5 y ...f6.", "El «alfil malo» de c8 es el problema clásico de las negras.", "Las blancas suelen atacar en el flanco de rey; las negras, en el de dama."],
    blancas: "Elige entre el Avance (3.e5, espacio), la Tarrasch (3.Cd2, flexible) o 3.Cc3 (lo más exigente).",
    negras: "Ataca la cadena de peones con ...c5 y busca activar el alfil de c8 (por b7 o por d7–e8–h5).",
    errores: "Con negras, quedarse pasivo y dejar que las blancas ataquen sin oposición; con blancas, perder el control de d4.",
    origen: "Toma su nombre de la partida por correspondencia entre Londres y París de 1834, en la que los franceses la usaron con éxito.",
    v: [[/Winawer/, "Winawer (3...Ab4): las negras clavan el caballo y aceptan desequilibrios; muy aguda. Lleva el nombre de Szymon Winawer."],
        [/Avance/, "Avance (3.e5): espacio para las blancas; las negras atacan con ...c5, ...Cc6 y ...Db6."],
        [/Tarrasch/, "Tarrasch (3.Cd2): evita la clavada de la Winawer; las negras suelen quedarse con un peón aislado tras ...c5."],
        [/Cambio/, "Cambio (3.exd5): estructura simétrica y tranquila."], [/Clásica/, "Clásica (3...Cf6): las negras atacan e4 con el caballo."],
        [/Rubinstein/, "Rubinstein (3...dxe4): sólida, pero cede el centro."]] },
  { id: "caro-kann", name: "Defensa Caro-Kann", eco: "B10–B19", moves: "1. e4 c6 2. d4 d5", match: /^(Defensa Caro-Kann|Caro-Kann)/,
    que: "Como la Francesa, prepara ...d5, pero con ...c6: así el alfil de c8 puede salir antes de cerrar con ...e6. Es una defensa muy sólida, con estructuras sanas y pocos puntos débiles.",
    ideas: ["El alfil de c8 sale a f5 o g4 antes de jugar ...e6.", "Las negras suelen tener una buena estructura para el final.", "Las blancas buscan espacio (Avance) o un ataque con enroques opuestos (Clásica con h4–h5)."],
    blancas: "El Avance (3.e5) es lo más popular; el Panov (cambio con c4) lleva a posiciones de peón aislado.",
    negras: "Desarrolla con ...Af5, ...e6, ...Cd7, ...Cgf6 y no tengas prisa: la Caro-Kann premia la solidez.",
    errores: "La trampa más famosa: 1.e4 c6 2.d4 d5 3.Cc3 dxe4 4.Cxe4 Cd7 5.De2 Cgf6?? 6.Cd6#, mate ahogado. En la Variante Karpov hay que jugar ...Cgf6 sólo cuando el caballo no pueda saltar a d6.",
    origen: "La analizaron Horatio Caro y Marcus Kann en la década de 1880. Capablanca, Botvinnik, Kárpov y Anand la usaron en campeonatos del mundo.",
    v: [[/Avance/, "Avance (3.e5): espacio para las blancas; las negras sacan el alfil a f5 antes de ...e6."], [/Panov/, "Panov-Botvinnik (c4): estructuras de peón aislado de dama, con juego activo de piezas."],
        [/Cambio/, "Cambio (3.exd5 cxd5): simétrica; las blancas suelen jugar Ad3, c3 y Af4."], [/Karpov/, "Karpov (4...Cd7): prepara ...Cgf6 sin aceptar peones doblados; muy sólida."],
        [/Clásica/, "Clásica (4...Af5): el alfil sale antes; las blancas lo hostigan con Cg3 y h4–h5."]] },
  { id: "escandinava", name: "Defensa Escandinava", eco: "B01", moves: "1. e4 d5", match: /^(Defensa Escandinava|Escandinava)/,
    que: "Las negras atacan el peón de e4 enseguida. Tras 2.exd5 suelen recapturar con la dama aunque las blancas ganen un tiempo con Cc3. Es una defensa directa con poca teoría.",
    ideas: ["La dama negra se coloca en a5, d6 o d8.", "Las negras desarrollan el alfil a f5 o g4 y juegan ...c6 y ...e6: una estructura parecida a la Caro-Kann.", "Las blancas ganan algo de espacio y tiempos."],
    blancas: "Desarrolla con tiempo (Cc3, d4, Cf3) y aprovecha la posición de la dama negra.",
    negras: "Saca el alfil de c8 antes de ...e6 y cuida que la dama no quede atrapada.",
    errores: "Con negras, mover la dama demasiadas veces; con blancas, perseguirla sin desarrollar.",
    origen: "Es probablemente la defensa más antigua conocida: aparece en el poema valenciano «Scachs d'amor» (hacia 1475), la primera partida con las reglas modernas. Su nombre viene de los analistas escandinavos del siglo XIX.",
    v: [[/Da5/, "3...Da5: la dama clava el caballo de c3 y queda segura."]] },
  { id: "alekhine", name: "Defensa Alekhine", eco: "B02–B05", moves: "1. e4 Nf6", match: /^(Defensa Alekhine|Alekhine)/,
    que: "Las negras provocan a los peones blancos: el caballo ataca e4 y, si las blancas avanzan, el caballo sigue huyendo. La idea es que el gran centro blanco se convierta en un objetivo.",
    ideas: ["Las blancas pueden ganar mucho espacio (Ataque de los Cuatro Peones) o jugar con calma (3.d4 y 4.Cf3).", "Las negras atacan el centro con ...d6, ...g6 o ...Ag4.", "Es una defensa hipermoderna: se cede el centro para atacarlo después."],
    blancas: "No te sobreextiendas: con un centro sólido y desarrollo normal tendrás ventaja de espacio.",
    negras: "Ataca el centro blanco con ...d6 y presiona el peón de e5; tu caballo en b6 debe volver al juego.",
    errores: "Con negras, perder demasiados tiempos con el caballo; con blancas, avanzar todos los peones y quedarse sin piezas desarrolladas.",
    origen: "La introdujo Alexander Alekhine en 1921, en la época de la escuela hipermoderna." },
  { id: "pirc-moderna", name: "Defensas Pirc y Moderna", eco: "B06–B09", moves: "1. e4 d6 2. d4 Nf6 3. Nc3 g6", match: /^(Defensa Pirc|Pirc|Defensa Moderna)/,
    que: "Las negras ceden el centro y colocan el alfil en g7 para atacarlo después. La Pirc juega antes ...Cf6; la Moderna empieza con ...g6 y deja el caballo para más tarde. Son defensas hipermodernas y flexibles.",
    ideas: ["El alfil de g7 presiona la gran diagonal hacia d4 y b2.", "Las negras rompen después con ...e5 o ...c5.", "Las blancas pueden atacar con el Ataque Austriaco (f4) o con Ae3, Dd2 y Ah6."],
    blancas: "Aprovecha el espacio: Ataque Austriaco (f4) o el sistema con Ae3, Dd2, f3 y enroque largo.",
    negras: "No te quedes sólo defendiendo: prepara ...e5 o ...c5 y el contraataque en el flanco de dama.",
    errores: "Con negras, esperar demasiado: el centro blanco puede avanzar (e5) y aplastar la posición.",
    origen: "Lleva el nombre del esloveno Vasja Pirc; en la Inmortal de Kaspárov (contra Topalov, Wijk aan Zee 1999) Topalov jugó una Pirc.",
    v: [[/Austriaco/, "Ataque Austriaco (f4): el centro blanco es enorme; las negras deben contraatacar rápido con ...c5 o ...e5."]] },
  { id: "e4-otras", name: "Otras defensas contra 1.e4", eco: "B00", moves: "1. e4", match: /^(Defensa Nimzowitsch|Defensa Owen|Apertura de Peón de Rey)/,
    que: "1.e4 ocupa el centro, abre la diagonal del alfil y de la dama, y suele llevar a partidas dinámicas. Además de las defensas principales hay respuestas poco habituales, como 1...Cc6 (Nimzowitsch) o 1...b6 (Owen), que buscan sacar al rival de la teoría.",
    ideas: ["Las respuestas principales son 1...e5, 1...c5, 1...e6, 1...c6 y 1...d5.", "Las defensas raras ceden el centro para atacarlo después.", "Contra ellas, desarrollo natural y centro fuerte."],
    blancas: "Contra las defensas poco habituales: d4, Cc3, Cf3, desarrollo y enroque. No necesitas teoría.",
    negras: "Si eliges una defensa rara, conoce bien sus planes: el rival tiene más espacio y debes saber contraatacar.",
    errores: "Con negras, ceder el centro sin un plan para atacarlo después.",
    origen: "1.e4 era la jugada favorita de Fischer («la mejor jugada de salida»); las defensas de 1...Cc6 y 1...b6 llevan el nombre de Aron Nimzowitsch y del inglés John Owen (siglo XIX)." },
  // ===================== 1.d4 d5 =====================
  { id: "gambito-dama", name: "Gambito de Dama", eco: "D06–D69", moves: "1. d4 d5 2. c4", match: /^(Gambito de Dama|Defensa Tarrasch)/,
    que: "Las blancas ofrecen el peón de c4 para desviar el peón de d5 y dominar el centro. No es un gambito de verdad: si las negras lo toman, las blancas suelen recuperarlo. Es la base del ajedrez posicional y una de las aperturas más jugadas en campeonatos del mundo.",
    ideas: ["En el Rehusado (2...e6) las negras mantienen d5 y su posición es muy sólida; el problema es el alfil de c8.", "En el Aceptado (2...dxc4) las negras devuelven el peón a cambio de juego libre.", "Las blancas presionan con Ag5, Tc1 y la columna c; el ataque de minorías (b4–b5) es un plan típico.", "Las rupturas negras ...c5 y ...e5 liberan la posición."],
    blancas: "Desarrolla con Cc3, Ag5 o Af4, e3 y Cf3; presiona d5 y busca el ataque de minorías en las estructuras de Cambio.",
    negras: "Elige: el Rehusado (sólido), la Eslava o Semieslava, el Aceptado o la Tarrasch (activa, con peón aislado).",
    errores: "La trampa clásica del Rehusado: 4...Cbd7 5.cxd5 exd5 6.Cxd5?? Cxd5! 7.Axd8 Ab4+ y las negras recuperan la dama con ventaja (la trampa del Elefante).",
    origen: "Ya aparece en el manuscrito de Gotinga (hacia 1490); se impuso a finales del siglo XIX y dominó los campeonatos del mundo del siglo XX.",
    v: [[/Aceptado/, "Aceptado (2...dxc4): las negras devuelven el peón y buscan ...c5 y ...e6 con juego libre."], [/Cambio/, "Variante del Cambio (cxd5 exd5): estructura de Carlsbad; plan típico de las blancas: ataque de minorías (b4–b5)."],
        [/Tarrasch/, "Tarrasch (...c5): las negras aceptan un peón aislado en d5 a cambio de piezas activas; Siegbert Tarrasch la consideraba la única defensa correcta."],
        [/4\.Ag5/, "4.Ag5 Ae7: la línea clásica; las negras liberan con ...Ce4 (Lasker) o se defienden con la Tartakower (...b6)."]] },
  { id: "eslava", name: "Defensas Eslava y Semieslava", eco: "D10–D19, D43–D49", moves: "1. d4 d5 2. c4 c6", match: /^(Defensa Eslava|Eslava|Defensa Semieslava|Semieslava)/,
    que: "Las negras defienden d5 con ...c6 en lugar de ...e6, para no encerrar el alfil de c8. En la Semieslava juegan además ...e6: una estructura muy sólida que puede volverse explosiva.",
    ideas: ["En la Eslava el alfil sale a f5 o g4 antes de ...e6.", "Las negras a menudo toman en c4 y defienden el peón con ...b5.", "La Semieslava tiene variantes muy agudas (Botvinnik, Merano) con ataques en los dos flancos."],
    blancas: "Cc3, Cf3 y e3 (o Ag5); si las negras toman en c4, recupera el peón con a4 y e3.",
    negras: "En la Eslava, saca el alfil a f5 antes de ...e6; en la Semieslava conoce las ideas de ...dxc4 y ...b5.",
    errores: "En la Eslava, tomar en c4 y defender el peón sin terminar el desarrollo; en la Semieslava, entrar sin preparación en las líneas más agudas.",
    origen: "Su nombre viene de los jugadores eslavos que la desarrollaron a principios del siglo XX; se jugó mucho en los duelos Alekhine–Euwe de 1935 y 1937. La Merano toma su nombre del torneo de Merano de 1924.",
    v: [[/Botvinnik/, "Botvinnik (Ag5 dxc4 e4 b5): una de las líneas más complicadas de la teoría, con ataques mutuos."], [/Merano/, "Merano (6.Ad3 dxc4 7.Axc4 b5): las negras ganan espacio en el flanco de dama."],
        [/Aceptada/, "5...Af5: la línea principal de la Eslava; el alfil sale antes de ...e6."]] },
  { id: "d4-d5-otras", name: "Otras defensas con 1.d4 d5", eco: "D00–D09", moves: "1. d4 d5", match: /^(Apertura de Peón de Dama · 1\.\.\.d5|Defensa Chigorin|Contragambito Albin|Ataque Veresov)/,
    que: "Tras 1.d4 d5 las blancas pueden jugar el Gambito de Dama (2.c4) o sistemas sin c4. Las negras también tienen respuestas menos habituales al gambito, como la Chigorin (2...Cc6) o el Contragambito Albin (2...e5).",
    ideas: ["La Chigorin desarrolla piezas y da la pareja de alfiles a cambio de actividad.", "El Albin sacrifica un peón para tener un peón incómodo en d4 y opciones tácticas.", "El Veresov (2.Cc3 y Ag5) evita la teoría del gambito."],
    blancas: "Contra el Albin, devuelve el peón en el momento justo y no caigas en la trampa de Lasker.",
    negras: "Las defensas poco habituales exigen conocer bien sus trampas y sus planes.",
    errores: "La trampa de Lasker en el Albin: tras 2...e5 3.dxe5 d4 4.e3? Ab4+ 5.Ad2 dxe3!, y si 6.Axb4?? exf2+ 7.Re2 fxg1=C+! las negras ganan.",
    origen: "La Chigorin lleva el nombre de Mijaíl Chigorin; el Albin, del rumano Adolf Albin, que lo jugó contra Lasker en Nueva York en 1893.",
    v: [[/Albin/, "Albin (2...e5): contragambito con el peón de d4 incómodo para las blancas."], [/Chigorin/, "Chigorin (2...Cc6): piezas antes que peones; juego activo y original."], [/Veresov/, "Veresov (2.Cc3 y Ag5): sistema poco teórico, con ideas de f3 y e4."]] },
  { id: "londres", name: "Sistema Londres", eco: "D02, A46–A48", moves: "1. d4 d5 2. Bf4", match: /^Sistema Londres/,
    que: "Un sistema más que una apertura: las blancas colocan casi siempre las mismas piezas (Af4, e3, c3, Cf3, Ad3, Cbd2) contra cualquier defensa. Es muy popular en todos los niveles porque requiere poca teoría.",
    ideas: ["Estructura en pirámide: d4, e3 y c3, con el alfil fuera antes de e3.", "Un caballo en e5 y un ataque en el flanco de rey son planes típicos.", "Las negras suelen responder con ...c5 y ...Db6 para presionar b2."],
    blancas: "Coloca tus piezas y busca Ce5; contra ...c5 y ...Db6, decide si defiendes b2 o cambias damas.",
    negras: "Ataca el centro con ...c5 y presiona b2 con ...Db6; un desarrollo rápido y ...Ad6 neutralizan al alfil de f4.",
    errores: "Con blancas, jugar en piloto automático: si las negras atacan pronto (...c5 y ...Db6), hay que reaccionar con precisión.",
    origen: "Su nombre viene del torneo de Londres de 1922, donde se jugó varias veces. En el siglo XXI lo han popularizado Kamsky y Carlsen." },
  { id: "colle", name: "Sistemas Colle y Torre", eco: "D05, A46", moves: "1. d4 d5 2. Nf3 Nf6 3. e3", match: /^(Sistema Colle|Ataque Torre|Apertura de Peón de Dama · 2\.Cf3|Peón de Dama · 2\.Cf3)/,
    que: "Sistemas tranquilos con 1.d4 en los que las blancas desarrollan sin c4: el Colle con e3, Ad3 y la ruptura e4; el Torre con Ag5 clavando el caballo.",
    ideas: ["Colle: c3, Cbd2, Ad3, O-O y e4 para abrir el centro y atacar al rey.", "Colle-Zukertort: b3 y Ab2 para apuntar al flanco de rey.", "Torre: Ag5, e3 y c3, con un plan claro y poca teoría."],
    blancas: "Desarrolla todo y prepara la ruptura e4 (Colle) o aprovecha la clavada (Torre).",
    negras: "Responde con ...c5 y desarrollo rápido; no dejes que e4 llegue en buenas condiciones.",
    errores: "Con blancas, la pasividad: estos sistemas necesitan una ruptura central para no quedarse sin plan.",
    origen: "El Colle lleva el nombre del belga Edgard Colle (años veinte); el Torre, del mexicano Carlos Torre Repetto, que ganó con él a Lasker en Moscú en 1925 con el célebre «molino»." },
  // ===================== 1.d4 Cf6 =====================
  { id: "nimzo", name: "Defensa Nimzo-India", eco: "E20–E59", moves: "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4", match: /^(Defensa Nimzo-India|Nimzo-India)/,
    que: "Las negras clavan el caballo de c3 para impedir e4. Suelen cambiar el alfil por el caballo y dejar a las blancas con peones doblados a cambio de la pareja de alfiles. Es una de las defensas más respetadas contra 1.d4.",
    ideas: ["La lucha gira alrededor de la casilla e4.", "Las blancas tienen la pareja de alfiles; las negras, mejor estructura de peones.", "Muchos sistemas distintos: Rubinstein (e3), Clásica (Dc2), Sämisch (a3)…"],
    blancas: "Evita los peones doblados con Dc2 (Clásica) o acéptalos a cambio del centro con a3 (Sämisch) o e3 (Rubinstein).",
    negras: "Controla e4 con ...Ce4, ...b6 y ...Ab7, o ataca el centro con ...c5 y ...d5.",
    errores: "Con negras, cambiar en c3 sin motivo: la pareja de alfiles blanca puede ser muy fuerte en posiciones abiertas.",
    origen: "La desarrolló Aron Nimzowitsch, uno de los padres de la escuela hipermoderna, en los años diez y veinte del siglo XX.",
    v: [[/Sämisch/, "Sämisch (4.a3): las blancas aceptan los peones doblados a cambio de los dos alfiles y un centro grande."], [/Clásica/, "Clásica (4.Dc2): las blancas recapturan con la dama para no doblar peones."], [/Rubinstein/, "Rubinstein (4.e3): desarrollo sólido y flexible."]] },
  { id: "india-dama", name: "Defensas India de Dama y Bogo-India", eco: "E11–E19", moves: "1. d4 Nf6 2. c4 e6 3. Nf3 b6", match: /^(Defensa India de Dama|Defensa Bogo-India|Peón de Dama · 3\.Cf3)/,
    que: "Cuando las blancas evitan la Nimzo-India con 3.Cf3, las negras pueden fianquetar el alfil de dama (India de Dama, 3...b6) o dar el jaque de alfil igualmente (Bogo-India, 3...Ab4+). Ambas son sólidas y fáciles de manejar.",
    ideas: ["En la India de Dama el alfil de b7 controla e4 desde lejos.", "En la Bogo-India las negras cambian a menudo el alfil por el de d2 y juegan con ...d6 y ...e5 o ...d5.", "Estructuras flexibles, pocas debilidades."],
    blancas: "Contra la India de Dama, el fianchetto (g3) disputa la gran diagonal; contra la Bogo-India, 4.Ad2 o 4.Cbd2.",
    negras: "Controla e4 y no tengas prisa por abrir la posición.",
    errores: "En las estructuras de fianchetto opuesto, quien pierde el control de la gran diagonal suele quedarse sin juego.",
    origen: "Son aperturas de la escuela hipermoderna; la Bogo-India lleva el nombre de Efim Bogoljubov.",
    v: [[/Bogo-India/, "Bogo-India (3...Ab4+): el alfil da jaque para cambiarse o colocar mal a las piezas blancas."]] },
  { id: "catalana", name: "Apertura Catalana", eco: "E00–E09", moves: "1. d4 Nf6 2. c4 e6 3. g3", match: /^(Apertura Catalana|Defensa India de Dama\/Catalana)/,
    que: "Las blancas combinan el Gambito de Dama con el fianchetto del alfil de rey. El alfil de g2 presiona la gran diagonal y el flanco de dama negro durante toda la partida.",
    ideas: ["Si las negras toman en c4, las blancas suelen recuperar el peón con Da4 o Dc2.", "El alfil de g2 presiona b7 y la diagonal larga.", "Partidas posicionales con presión a largo plazo."],
    blancas: "Desarrollo tranquilo (Ag2, O-O, Dc2) y presión en el flanco de dama.",
    negras: "Elige entre tomar en c4 y defender el peón o mantener la estructura cerrada con ...Ae7 y ...c6.",
    errores: "Con negras, intentar quedarse el peón de c4 a cualquier precio suele dejar el flanco de dama debilitado.",
    origen: "Recibió el nombre en el torneo de Barcelona de 1929, donde Tartakower la jugó a petición de los organizadores. En la era moderna la han usado mucho Krámnik y Carlsen." },
  { id: "india-rey", name: "Defensa India de Rey", eco: "E60–E99, A48", moves: "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6", match: /^(Defensa India de Rey|India de Rey|Ataque Indio de Rey)/,
    que: "Las negras dejan que las blancas construyan un gran centro y lo atacan después con ...e5 o ...c5, con el alfil de g7 apuntando a la gran diagonal. Es una defensa ambiciosa y de ataque, con posiciones muy desequilibradas.",
    ideas: ["En muchas líneas el centro se cierra (d5) y cada bando ataca en un flanco: las negras en el de rey (...f5, ...g5), las blancas en el de dama (c5).", "El alfil de g7 parece encerrado, pero se activa cuando el centro se abre.", "Hay carreras de ataque muy agudas (Mar del Plata)."],
    blancas: "Sistemas: Clásico (Cf3 y Ae2), Sämisch (f3), Cuatro Peones (f4) o el fianchetto (g3). Juega en el flanco de dama.",
    negras: "Rompe con ...e5 y, si el centro se cierra, ataca con ...f5 en el flanco de rey.",
    errores: "Con negras, quedarse pasivo: la India de Rey sólo funciona si atacas. Con blancas, ignorar el ataque negro en el flanco de rey.",
    origen: "Una defensa hipermoderna que se popularizó tras la Segunda Guerra Mundial con Bronstein y Boleslavski; fue arma de Fischer y de Kaspárov.",
    v: [[/Mar del Plata/, "Mar del Plata (...Cc6 y centro cerrado): carrera de ataques, las negras en el flanco de rey con ...f5–f4 y ...g5."],
        [/Sämisch/, "Sämisch (5.f3): las blancas refuerzan e4 y suelen enrocar largo para atacar."], [/Cuatro Peones/, "Cuatro Peones (f4): el centro blanco más grande posible; las negras contraatacan con ...c5."],
        [/Fianchetto/, "Fianchetto (g3): juego más posicional, con el alfil de g2 frente al de g7."], [/Clásica/, "Clásica (Cf3, Ae2 y O-O): la línea principal."], [/Ataque Indio de Rey/, "El Ataque Indio de Rey es el mismo esquema con blancas (Cf3, g3, Ag2, d3, e4): un tiempo más."]] },
  { id: "grunfeld", name: "Defensa Grünfeld", eco: "D70–D99", moves: "1. d4 Nf6 2. c4 g6 3. Nc3 d5", match: /^(Defensa Grünfeld|Grünfeld)/,
    que: "Las negras dejan que las blancas tengan un gran centro de peones (tras cxd5 Cxd5 e4) y lo atacan con piezas: el alfil de g7, ...c5 y ...Cc6. Es una defensa dinámica y muy concreta.",
    ideas: ["En la Variante del Cambio las blancas tienen centro de peones en c3–d4–e4; las negras lo presionan.", "El alfil de g7 es la pieza clave.", "Mucha teoría y posiciones tácticas."],
    blancas: "Mantén el centro (Ae3, Tc1, Cf3) y no dejes que el alfil de g7 y la presión negra lo deshagan.",
    negras: "Presiona d4 con ...c5, ...Cc6 y ...Ag4; cambia piezas si el centro blanco no avanza.",
    errores: "Con negras, jugar ...c5 sin preparación y perder el peón; con blancas, avanzar d5 sin apoyo.",
    origen: "La presentó el austriaco Ernst Grünfeld en 1922; fue un arma de Kaspárov en sus campeonatos del mundo. La «Partida del Siglo» (Byrne–Fischer, 1956) es una Grünfeld.",
    v: [[/Cambio/, "Cambio (cxd5 Cxd5 e4 Cxc3 bxc3): las blancas tienen un centro grande; las negras lo atacan con ...c5."]] },
  { id: "benoni", name: "Benoni, Benko y Budapest", eco: "A43–A44, A51–A79", moves: "1. d4 Nf6 2. c4 c5 3. d5", match: /^(Benoni|Defensa Benoni|Gambito Benko|Gambito Budapest)/,
    que: "Defensas que atacan el centro blanco con peones de flanco: en la Benoni las negras aceptan una estructura desequilibrada con mayoría en el flanco de dama; en el Benko sacrifican un peón para abrir las columnas a y b; el Budapest es un contragambito con ...e5.",
    ideas: ["Benoni Moderna: las blancas tienen mayoría central (e4–e5); las negras, en el flanco de dama (...b5) y el alfil de g7.", "Benko: tras ...b5 y ...a6, las torres negras presionan las columnas a y b durante toda la partida.", "Budapest: las negras recuperan el peón de e5 con ...Cg4 y buscan juego rápido de piezas."],
    blancas: "Contra la Benoni, avanza e4–e5 en el momento justo; contra el Benko, devuelve el peón o consolida con calma; contra el Budapest, no te obsesiones con quedarte el peón.",
    negras: "Busca actividad: en la Benoni, ...b5; en el Benko, presión en las columnas; en el Budapest, desarrollo rápido.",
    errores: "En la Benoni, cuidado con el avance e4–e5 de las blancas; en el Budapest, la trampa 4.Af4 Cc6 5.Cf3 Ab4+ 6.Cbd2 De7 7.a3 Cgxe5 8.axb4?? Cd3#, mate ahogado.",
    origen: "El nombre «Benoni» viene de un libro de Aaron Reinganum (1825); Tal y Fischer jugaron la Benoni Moderna. El Benko lo popularizó Pal Benko en los años sesenta y setenta; el Budapest lo jugaron jugadores de Budapest en 1916, y Vidmar ganó con él a Rubinstein en Berlín en 1918.",
    v: [[/Benko/, "Benko (...b5): sacrificio de peón por presión a largo plazo en las columnas a y b."], [/Budapest/, "Budapest (2...e5): contragambito; las negras suelen recuperar el peón."], [/Moderna/, "Benoni Moderna (...e6 y ...exd5): estructura desequilibrada y muy dinámica."]] },
  { id: "holandesa", name: "Defensa Holandesa", eco: "A80–A99", moves: "1. d4 f5", match: /^(Defensa Holandesa|Holandesa)/,
    que: "Las negras controlan e4 con el peón f desde la primera jugada. Es una defensa combativa que busca el ataque en el flanco de rey, a cambio de debilitar un poco al propio rey.",
    ideas: ["Leningrado: ...g6 y ...Ag7, juego parecido a la India de Rey.", "Muro de Piedra (Stonewall): peones en c6, d5, e6 y f5; casilla e5 para el caballo y debilidad en e5.", "Las negras atacan con ...De8–h5 o ...g5 en algunos sistemas."],
    blancas: "El fianchetto (g3 y Ag2) es lo más sólido; también hay gambitos agresivos (Staunton, 2.e4).",
    negras: "Elige la estructura (Leningrado o Stonewall) y conoce su plan; cuida la diagonal e8–h5.",
    errores: "Con negras, olvidar que la diagonal h5–e8 queda débil: Dh5+ es una amenaza típica en las primeras jugadas.",
    origen: "La recomendó el holandés Elias Stein en un libro de 1789. Botvinnik la usó en campeonatos del mundo.",
    v: [[/Leningrado/, "Leningrado (...g6 y ...Ag7): la desarrollaron los jugadores de Leningrado en los años cincuenta."], [/Stonewall/, "Muro de Piedra: estructura muy sólida, con el caballo en e4 y la debilidad de e5."], [/2\.g3/, "2.g3: el sistema principal de las blancas, con el alfil en g2."]] },
  { id: "trompowsky", name: "Ataque Trompowsky", eco: "A45", moves: "1. d4 Nf6 2. Bg5", match: /^Ataque Trompowsky/,
    que: "Las blancas atacan el caballo de f6 enseguida, amenazando doblar los peones negros. Saca al rival de la teoría desde la segunda jugada.",
    ideas: ["Si las negras juegan 2...Ce4, el alfil se retira a f4 o h4.", "Axf6 da la pareja de alfiles a cambio de dañar la estructura negra.", "Partidas originales y poco teóricas."],
    blancas: "Juega con las piezas: c3, e3, Cd2 y, si conviene, cambia en f6.",
    negras: "2...Ce4 o 2...e6 son respuestas sólidas; no temas los peones doblados si tienes la pareja de alfiles.",
    errores: "Con blancas, dejar el alfil sin retirada cuando las negras juegan ...Ce4 y ...h6.",
    origen: "Lleva el nombre del brasileño Octávio Trompowsky, que la jugó en los años treinta y cuarenta." },
  { id: "d4-generico", name: "Apertura de Peón de Dama", eco: "A40–A50", moves: "1. d4", match: /^(Apertura de Peón de Dama|Peón de Dama|Defensa India$|Benoni Antigua)/,
    que: "1.d4 ocupa el centro con un peón defendido por la dama. Lleva a partidas más estratégicas que 1.e4: las negras suelen elegir entre 1...d5 (defensas clásicas) y 1...Cf6 (defensas indias).",
    ideas: ["El peón de d4 está defendido desde el principio, así que las partidas son más lentas y posicionales.", "c4 es la jugada clave para atacar d5 y ganar espacio.", "Las defensas indias controlan el centro con piezas y fianchettos."],
    blancas: "Prepara c4 y desarrolla: Cc3, Cf3, e3 o e4, según la defensa negra.",
    negras: "Elige entre las defensas clásicas (Gambito de Dama Rehusado, Eslava) o las indias (Nimzo, India de Rey, Grünfeld).",
    errores: "Con negras, ceder el centro sin un plan concreto para atacarlo.",
    origen: "1.d4 dominó los campeonatos del mundo del siglo XX; las defensas indias son hijas de la escuela hipermoderna de los años veinte." },
  // ===================== Aperturas de flanco =====================
  { id: "inglesa", name: "Apertura Inglesa", eco: "A10–A39", moves: "1. c4", match: /^(Apertura Inglesa|Inglesa)/,
    que: "Las blancas controlan d5 con el peón c. Es una apertura flexible que puede transponer a muchas aperturas de 1.d4 o llevar a posiciones propias, como una Siciliana con los colores cambiados.",
    ideas: ["Siciliana Invertida (1...e5): las blancas juegan la Siciliana con un tiempo más.", "El fianchetto del alfil de rey (g3 y Ag2) es casi siempre parte del plan.", "Juego en el flanco de dama con b4–b5."],
    blancas: "Cc3, g3, Ag2 y ataque en el flanco de dama; si las negras dejan el centro, ocúpalo con d4.",
    negras: "Responde con ...e5 (Siciliana invertida), ...c5 (simétrica) o ...Cf6 y ...e6 (estructuras de 1.d4).",
    errores: "Con blancas, jugar sin plan: la flexibilidad no sirve si no sabes adónde vas.",
    origen: "Recibe su nombre por Howard Staunton, que la jugó en su encuentro contra Saint-Amant en 1843. Botvinnik, Kaspárov y Carlsen la han usado mucho.",
    v: [[/Siciliana Invertida/, "Siciliana Invertida (1...e5): las blancas tienen la estructura de la Siciliana con un tiempo de más."], [/Simétrica/, "Simétrica (1...c5): partidas lentas en las que gana quien rompe la simetría en el momento oportuno."], [/Anglo-India/, "Anglo-India (1...Cf6): puede transponer a la Nimzo-India o a la India de Rey."]] },
  { id: "reti", name: "Apertura Réti", eco: "A04–A09", moves: "1. Nf3 d5 2. c4", match: /^(Apertura Réti|Réti)/,
    que: "Las blancas no ocupan el centro con peones: lo controlan con el caballo, el fianchetto y c4. Es la apertura hipermoderna por excelencia.",
    ideas: ["El alfil de g2 y el peón de c4 atacan d5 a la vez.", "Puede transponer a la Inglesa, la Catalana o al Gambito de Dama.", "Con d3 y e4 se convierte en el Ataque Indio de Rey."],
    blancas: "Cf3, g3, Ag2, O-O y c4: presión sobre el centro negro sin comprometerse.",
    negras: "Ocupa el centro con ...d5 y ...c6 o ...e6; un esquema sólido neutraliza al alfil de g2.",
    errores: "Con blancas, dejar que las negras consoliden el centro sin atacarlo nunca.",
    origen: "Lleva el nombre de Richard Réti, que con ella ganó a Capablanca en Nueva York 1924, acabando con una racha de ocho años del cubano sin perder." },
  { id: "flanco-otras", name: "Otras aperturas de flanco", eco: "A00–A03", moves: "1. b3", match: /^(Apertura Polaca|Ataque Grob|Apertura Larsen|Apertura Bird)/,
    que: "Aperturas poco habituales que empiezan por un peón de flanco. Sacan al rival de la teoría y llevan a posiciones originales, pero dan a las negras más facilidad para ocupar el centro.",
    ideas: ["Larsen (1.b3): fianchetto del alfil de dama para controlar e5 y d4 desde lejos.", "Bird (1.f4): control de e5, como una Holandesa con blancas.", "Polaca (1.b4): gana espacio en el flanco de dama.", "Grob (1.g4): muy arriesgada; debilita al propio rey."],
    blancas: "Conoce bien el plan de tu sistema: al no ocupar el centro, tienes que controlarlo con piezas.",
    negras: "Ocupa el centro con peones (...e5 y ...d5) y desarrolla rápido.",
    errores: "Con el Grob, la debilidad del flanco de rey; con el Bird, el contragambito From (1...e5) obliga a conocer sus trampas.",
    origen: "La Larsen la popularizó el danés Bent Larsen en los años sesenta y setenta (antes la jugaba Nimzowitsch); Bird, el inglés Henry Bird en el siglo XIX; la Polaca (u «Orangután») la jugó Tartakower en Nueva York 1924 y la estudió a fondo el soviético Alexéi Sokolski; el Grob, el suizo Henri Grob.",
    v: [[/Polaca/, "Polaca (1.b4): Tartakower la llamó «Orangután» tras visitar el zoo de Nueva York en 1924."], [/Grob/, "Grob (1.g4): sorpresa arriesgada; ...d5 y ...Axg4 la castigan."], [/Larsen/, "Larsen (1.b3): el alfil de b2 controla la gran diagonal."], [/Bird/, "Bird (1.f4): control de e5; cuidado con el contragambito From (1...e5)."]] }
];

/* Artículo de una entrada ECO (la primera familia cuyo patrón encaja) y la nota de su variante, si la hay */
function openingArticleOf(entry) {
  if (!entry) return null;
  const art = OPENING_ARTICLES.find(a => a.match.test(entry.name));
  if (!art) return null;
  const note = (art.v || []).find(([re]) => re.test(entry.name));
  return { art, note: note ? note[1] : "" };
}
const openingArticleById = id => OPENING_ARTICLES.find(a => a.id === id) || null;
/* Para el profesor IA: un resumen corto de la apertura de la posición */
function openingArticleText(node) {
  const d = ECO.detect(node);
  const r = d && openingArticleOf(d.entry);
  if (!r) return "";
  return `Apertura explicada (${r.art.name}${d.entry.name !== r.art.name ? ` · ${d.entry.name}` : ""}): ${r.art.que}${r.note ? " " + r.note : ""} Ideas: ${r.art.ideas.join(" ")}`;
}

/* Lecciones de los cursos que hablan de esta apertura (por su nombre principal) */
function openingLessons(art) {
  const key = norm(art.name.replace(/^(Apertura|Defensa|Defensas|Sistemas?|Ataque|Gambito|Otras.*)\s+(de\s+(los\s+)?|del\s+)?/i, "").split(/[ (·]/)[0]);
  if (!key || key.length < 4) return [];
  const out = [];
  for (const c of COURSES) {
    let ls = [];
    try { ls = courseLessons(c.id); } catch {}
    ls.forEach((l, i) => { if (norm(l.title).includes(key)) out.push({ course: c, i, title: l.title }); });
  }
  return out.slice(0, 6);
}

/* La ventana del artículo */
function openOpeningArticle(id, entry) {
  const art = openingArticleById(id);
  if (!art) return;
  const note = entry ? ((art.v || []).find(([re]) => re.test(entry.name)) || [])[1] : "";
  let movesTxt = art.moves;
  try { const g = Pgn.parseGame(art.moves, { lang: "en" }).game; movesTxt = lineText(g.root.state, Pgn.mainlineFrom(g.root).map(n => n.uci), 20); } catch {}
  const lessons = openingLessons(art);
  const variants = ECO_BOOK.filter(e => e.ucis && openingArticleOf(e) && openingArticleOf(e).art === art);
  const sec = (t, html) => `<h3 class="oa-h">${t}</h3>${html}`;
  $("openingTitle").textContent = "📖 " + art.name;
  $("openingBody").innerHTML = `
    <div class="small oa-meta">ECO ${esc(art.eco)} · <b>${esc(movesTxt)}</b></div>
    ${entry && entry.name !== art.name ? `<div class="note-box small oa-variant"><b>${esc(entry.eco)} · ${esc(entry.name)}</b>${note ? `: ${esc(note)}` : ""}</div>` : ""}
    ${sec("Qué es", `<p>${esc(art.que)}</p>`)}
    ${sec("Características e ideas", `<ul>${art.ideas.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`)}
    ${sec("Cómo jugarla", `<p><b>Con blancas:</b> ${esc(art.blancas)}</p><p><b>Con negras:</b> ${esc(art.negras)}</p>`)}
    ${sec("Errores y trampas típicos", `<p>${esc(art.errores)}</p>`)}
    ${sec("Origen", `<p>${esc(art.origen)}</p>`)}
    ${variants.length > 1 ? sec("Variantes en la enciclopedia", `<div class="oa-variants">${variants.map(e => `<button class="sm-btn" data-oa-eco="${esc(e.key)}" title="Poner en el tablero">${esc(e.eco)} ${esc(e.name)}</button>`).join("")}</div>`) : ""}
    ${lessons.length ? sec("Para aprenderla en los cursos", `<div class="oa-variants">${lessons.map((l, k) => `<button class="sm-btn" data-oa-lesson="${k}">${esc(l.course.icon)} ${esc(l.title)}</button>`).join("")}</div>`) : ""}
    <div class="controls oa-actions">
      <button class="sm-btn primary" data-oa-play>♟ Ver en el tablero</button>
      <button class="sm-btn" data-oa-explorer>🌍 Abrir en el explorador</button>
      ${aiProvider() ? `<button class="sm-btn" data-oa-ask>🤖 Preguntar al profesor IA</button>` : ""}
    </div>
    <p class="small oa-note">Texto redactado con ayuda de IA para AjedrezBase. Si ves algún error, avísanos en el repositorio del proyecto.</p>`;
  const body = $("openingBody");
  const setEntry = e => {
    const r = Pgn.parseGame(e.moves, { lang: "en" });
    r.game.headers.Event = e.name; r.game.headers.ECO = e.eco || "";
    return setGame(r.game, { name: e.name, current: Pgn.mainlineFrom(r.game.root).pop() }) !== false;
  };
  const target = entry && openingArticleOf(entry) && openingArticleOf(entry).art === art ? entry : { name: art.name, moves: art.moves, eco: art.eco.split(/[–,]/)[0] };
  const inBoard = () => ECO.detect(cur()) && openingArticleOf(ECO.detect(cur()).entry) && openingArticleOf(ECO.detect(cur()).entry).art === art;
  body.querySelector("[data-oa-play]").onclick = () => { closeModals(); if (!inBoard()) setEntry(target); };
  body.querySelector("[data-oa-explorer]").onclick = () => { closeModals(); if (inBoard() || setEntry(target)) switchTab("explorer"); };
  const ask = body.querySelector("[data-oa-ask]");
  if (ask) ask.onclick = () => { closeModals(); if (inBoard() || setEntry(target)) { $("aiQuestion").value = `Explícame los planes típicos de la ${art.name} en esta posición.`; aiAsk($("aiQuestion").value); } };
  body.querySelectorAll("[data-oa-eco]").forEach(b => b.onclick = () => { const e = ECO.byKey.get(b.dataset.oaEco); if (e) { closeModals(); setEntry(e); } });
  body.querySelectorAll("[data-oa-lesson]").forEach(b => b.onclick = () => { const l = lessons[+b.dataset.oaLesson]; closeModals(); switchTab("courses"); openLesson(l.course.id, l.i); });
  openModal("openingModal");
  body.scrollTop = 0;
}

/* Recuadro de la pestaña Aperturas: la apertura de la posición del tablero, en corto */
function renderOpeningBrief() {
  const box = $("openingBrief");
  if (!box) return;
  const d = ECO.detect(cur());
  const r = d && openingArticleOf(d.entry);
  if (!r) { box.innerHTML = `<p class="small">Cuando la posición del tablero sea de una apertura conocida, aquí verás qué es y cómo se juega. Mientras tanto, busca una en la enciclopedia de abajo o pulsa una de estas:</p>
    <div class="oa-variants">${["espanola", "italiana", "siciliana", "francesa", "caro-kann", "gambito-dama", "londres", "india-rey", "nimzo", "inglesa"].map(id => `<button class="sm-btn" data-oa-open="${id}">${esc(openingArticleById(id).name)}</button>`).join("")}</div>`;
    box.querySelectorAll("[data-oa-open]").forEach(b => b.onclick = () => openOpeningArticle(b.dataset.oaOpen));
    return; }
  box.innerHTML = `<div class="oa-brief-head"><b>${esc(r.art.name)}</b>${d.entry.name !== r.art.name ? ` <span class="small">· ${esc(d.entry.eco)} ${esc(d.entry.name)}</span>` : ""}</div>
    <p class="small">${esc(r.note || r.art.que)}</p>
    <button class="sm-btn primary" data-oa-open="${r.art.id}">📖 Leer el artículo completo</button>`;
  box.querySelector("[data-oa-open]").onclick = () => openOpeningArticle(r.art.id, d.entry);
}
$("ecoBanner").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("ecoBanner").click(); } });
$("ecoBanner").addEventListener("click", () => {
  const d = ECO.detect(cur());
  const r = d && openingArticleOf(d.entry);
  if (r) openOpeningArticle(r.art.id, d.entry);
  else { switchTab("explorer"); toast("Esta posición no es de una apertura de la enciclopedia: elige una en «Aperturas explicadas»."); }
});
