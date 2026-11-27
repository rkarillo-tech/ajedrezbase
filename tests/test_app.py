#!/usr/bin/env python3
"""Pruebas de extremo a extremo de AjedrezBase con Playwright.

Uso:
    python3 -m pip install playwright
    python3 -m playwright install chromium
    python3 tests/test_app.py        (construye antes index.html con build.py)

Las conexiones a Lichess y a los CDN de Stockfish se bloquean para que las pruebas no dependan
de la red: se usa el motor interno, que es el respaldo sin conexión.

Si se define STOCKFISH_DIR con la carpeta bin/ del paquete npm «stockfish@19.0.1», se prueba
además el Stockfish 19 real sirviéndolo desde esa carpeta (así lo hace la integración continua).
"""
import functools
import http.server
import os
import json
import pathlib
import re
import signal
import sys
import time
import threading
import traceback
import urllib.parse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
fallos = []

PGN_SERBIA = """[Event "SRB-chT 2nd League West"]
[White "Irizanin, Radoje"]
[Black "Ikic, Alija"]
[Result "1-0"]

1. d4 Nf6 2. Nf3 g6 3. Bg5 Bg7 4. Nbd2 d6 5. e4 c5 6. dxc5 dxc5 7. c3 O-O 8. Bc4 Nc6
9. Qe2 Na5 10. Bd3 Qc7 11. O-O h6 12. Bh4 Nh5 13. Bg3 Nxg3 14. hxg3 Bg4 15. Nc4 Nxc4
16. Bxc4 Rad8 17. Rfe1 e5 18. Rad1 Rxd1 19. Rxd1 Rd8 20. Bd5 Bf6 21. Re1 Kg7 22. Qb5 b6
23. Nh2 Bc8 24. Nf1 h5 25. Qe2 Bg4 26. Qc2 Bc8 27. a4 h4 28. gxh4 Bxh4 29. Bc4 Bg5 30. a5 bxa5
31. Qb3 Bb7 32. g3 Bc6 33. Bd5 Be8 34. Ne3 Bxe3 35. Rxe3 a4 36. Qa3 Rb8 37. Qa2 Rb6 38. Qa3
(38. Re2 Qe7 39. Qa3 Rb5 (39... g5 40. Rd2 Rh6)) 38... Qe7 39. Qa2 g5 40. Re2 Rh6 41. c4 Qd7
42. Qa3 Qh3 43. Qf3 Qh2+ 44. Kf1 Qh3+ 45. Kg1 Qd7 46. Qa3 Rb6 {...necitko} 1-0"""

PGN_LICHESS = """[Event "Rated Blitz game"]
[Site "https://lichess.org/abc"]
[White "rafa"]
[Black "otro"]
[Result "1-0"]

1. e4 { [%eval 0.2] } 1... e5 { [%eval 0.3] } 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 1-0

[Event "Rated Rapid game"]
[Site "https://lichess.org/def"]
[White "otro"]
[Black "rafa"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1
"""


def comprobar(cond, msg):
    print(("  ✓ " if cond else "  ✗ ") + msg, flush=True)
    if not cond:
        fallos.append(msg)
        if os.environ.get("GITHUB_ACTIONS"):
            print(f"::error title=Prueba fallida::{msg}", flush=True)


def nueva_pagina(ctx, url=URL, plegado=False):
    pg = ctx.new_page()
    errores = []
    pg.on("pageerror", lambda e: errores.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(url)
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    if not plegado:
        # Desde la 1.53, «Importar / exportar» y las herramientas del motor empiezan plegados; las pruebas los usan
        # directamente, así que se despliegan (queda recordado en los ajustes de este contexto)
        pg.evaluate("if (!settings.engineTools) $('engineToolsBtn').click(); $('importDetails').open = true; settings.importOpen = true; saveSettings();")
    return pg, errores


def contexto(browser, **kw):
    kw.setdefault("viewport", {"width": 1400, "height": 1000})
    ctx = browser.new_context(**kw)
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", lambda r: r.abort())
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    ctx.route("**/*lichess*/**", lambda r: r.abort())
    return ctx


def revelar(pg, sel):
    """1.57: los ajustes van por pestañas; antes de tocar un control, se abre la pestaña en la que está"""
    pg.evaluate(f"settingsReveal({json.dumps(sel.lstrip('#'))})")


def entrenar(pg, seccion):
    """Abre la pestaña Entrenar y, dentro, la actividad indicada (puzzles, rep, drill, cards, guess o blind)."""
    pg.click('.tab-btn[data-tab="tools"]')
    if not pg.is_visible(f'#trainMenu [data-train-open="{seccion}"]'):
        pg.click("#trainBackBtn")
    pg.click(f'#trainMenu [data-train-open="{seccion}"]')


def casilla(pg, nombre):
    return pg.locator(f'.square[aria-label^="{nombre}"]')


def arrastrar(pg, origen, destino):
    a, b = origen.bounding_box(), destino
    pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2)
    pg.mouse.down()
    pg.mouse.move(a["x"] + a["width"] / 2 + 12, a["y"] + a["height"] / 2 + 12, steps=4)
    if isinstance(b, tuple):
        pg.mouse.move(*b, steps=8)
    else:
        bb = b.bounding_box()
        pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, steps=8)
    pg.mouse.up()


def prueba_tablero_y_partidas(browser):
    print("Tablero, importación, variantes y análisis")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("document.querySelectorAll('#engineLines .pv-line').length > 0", timeout=20000)
    comprobar("Motor interno" in pg.inner_text("#engineSourceBadge"), "sin CDN arranca el motor interno de respaldo")
    pg.fill("#moveInput", PGN_SERBIA)
    pg.click("#importBtn")
    comprobar("99 jugadas importadas" in pg.inner_text("#importResult"), "importa un PGN con variantes anidadas (99 jugadas)")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == 92, "la línea principal tiene las 92 medias jugadas del PGN")
    comprobar(pg.locator("#moves .var").count() >= 2, "las variantes se muestran sangradas")
    comprobar("No está en la biblioteca" in pg.inner_text("#saveState"), "importar no guarda nada en la biblioteca")
    pg.evaluate("document.activeElement.blur(); goTo(game.root)")
    casilla(pg, "e2").click(); casilla(pg, "e4").click()
    comprobar(pg.evaluate("game.root.children.length") == 2, "jugar otra cosa desde el inicio crea una variante")
    comprobar("NO está guardada" in pg.inner_text("#saveState"), "avisa de cambios sin guardar")
    pg.fill("#annotation", "Idea de prueba para la lista")
    pg.wait_for_timeout(300)
    comprobar("Idea de prueba para la lista" in pg.inner_text("#moves"), "la lista de jugadas se actualiza al escribir un comentario")
    pg.evaluate("document.activeElement.blur()")
    pg.click("#flipBtn")
    comprobar(pg.locator('#board .square').first.get_attribute("aria-label").startswith("h1"), "al girar el tablero se recolocan las casillas")
    pg.click("#flipBtn")
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root)[5])")
    pg.click("#autoAnnotateBtn")
    pg.wait_for_function("document.getElementById('reportBox').classList.contains('show')", timeout=180000)
    comprobar("%" in pg.inner_text("#repWAcc"), "el análisis completo calcula la precisión")
    comprobar(pg.locator("#evalChartSvg polygon").count() == 1, "dibuja el gráfico de evaluación")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_editor(browser):
    print("Editor de posición")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.click("#editPosBtn")
    pg.wait_for_timeout(500)
    comprobar(pg.is_visible("#editorPanel"), "se abre el editor")
    pg.click("#edStartPosBtn")
    arrastrar(pg, casilla(pg, "d1"), casilla(pg, "h5"))
    arrastrar(pg, casilla(pg, "a8"), (1390, 500))
    arrastrar(pg, pg.locator("#paletteBlack .palette-btn").nth(2), casilla(pg, "d4"))
    fen = pg.input_value("#edFen")
    comprobar(fen.startswith("1nbqkbnr/pppppppp/8/7Q/3q4/"), "mover libre, quitar arrastrando fuera y añadir desde la paleta")
    pg.click("#edKingsBtn")
    arrastrar(pg, pg.locator("#paletteWhite .palette-btn").nth(3), casilla(pg, "a1"))
    pg.select_option("#edTurn", "w")
    pg.click("#edApplyBtn")
    comprobar(pg.evaluate("Chess.toFen(game.root.state)") == "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "aplica la posición montada")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_biblioteca(browser):
    print("Biblioteca, marcadores, búsqueda y tarjetas")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.fill("#moveInput", PGN_SERBIA)
    pg.click("#importBtn")
    pg.click("#saveGame")
    pg.wait_for_function("Lib.games.size === 1")
    comprobar("Está en tu biblioteca" in pg.inner_text("#saveState"), "guarda la partida al pulsar 💾")
    pg.fill("#gameTags", "Repertorio, India de Rey")
    pg.locator("#gameTags").press("Tab")
    pg.click("#favToggle")
    pg.wait_for_function("(() => { const r = Lib.games.get(ui.libId); return r.fav && r.tags.includes('repertorio'); })()", timeout=5000)
    comprobar(True, "favorita y etiquetas se guardan solas")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root)[29])")
    pg.click("#markBtn")
    pg.locator("#markCats button", has_text="Táctica").click()
    pg.fill("#markNote", "Cxc4 elimina el caballo de a5")
    pg.click("#markSaveBtn")
    pg.wait_for_function("Lib.marks.size === 1")
    comprobar(pg.locator("#moves .mv-mark").count() == 1, "el marcador aparece en la lista de jugadas")
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="search"]')
    pg.fill("#commentSearch", "NECITKO")
    pg.click("#commentSearchBtn")
    pg.wait_for_timeout(400)
    comprobar(pg.locator("#searchResults .mark-card").count() == 1, "la búsqueda encuentra el comentario sin distinguir mayúsculas")
    entrenar(pg, "cards")
    pg.click("#cardsDueBtn")
    ans = pg.evaluate("Lib.marks.get(trainer.markId).answer")
    casilla(pg, ans[:2]).click(); casilla(pg, ans[2:4]).click()
    pg.wait_for_timeout(400)
    comprobar("Correcto a la primera" in pg.inner_text("#trainFeedback"), "la tarjeta del marcador se resuelve y se reprograma")
    pg.click("#cardsBackBtn")
    comprobar(pg.evaluate("ui.libId") is not None, "vuelve a la partida tras repasar")
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="collection"]')
    pg.click("#loadSampleDbBtn")
    comprobar(pg.inner_text("#collCount") == "6", "abre la antología en memoria sin guardarla")
    pg.fill("#dbFilterInput", "kasparov")
    pg.wait_for_timeout(300)
    pg.click("#saveCollFilteredBtn")
    pg.wait_for_function("Lib.games.size === 3", timeout=20000)
    comprobar(True, "guarda en la biblioteca sólo las partidas filtradas")
    pg.wait_for_timeout(500)
    comprobar("de 100 MB" in pg.inner_text("#meterLibTxt"), "el medidor muestra la ocupación de la biblioteca")
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    comprobar(pg.evaluate("Lib.games.size") == 3 and pg.evaluate("Lib.marks.size") == 1, "la biblioteca se conserva al recargar")
    pg.click('.tab-btn[data-tab="library"]')
    pg.locator("#libBody tr", has_text="Topalov").locator("[data-del]").click()
    pg.wait_for_function("Lib.games.size === 2")
    comprobar(True, "borra partidas una a una")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_ayuda_y_movil(browser):
    print("Ayuda, créditos y móvil")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.keyboard.press("?")
    comprobar(pg.is_visible("#helpModal") and pg.locator("#helpBody > details").count() >= 20, "la guía se abre con «?» y tiene todos los apartados")
    pg.fill("#helpSearch", "probar token")
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("!document.getElementById('help-aperturas').hidden && document.getElementById('help-cpu').hidden"), "el buscador de la ayuda filtra apartados")
    pg.keyboard.press("Escape")
    pg.click("#licBtn")
    comprobar("MIT" in pg.inner_text("#licModal") and "Stockfish" in pg.inner_text("#licModal"), "licencia MIT y créditos de terceros visibles")
    pg.keyboard.press("Escape")
    comprobar(pg.is_visible("#welcomeBox") and pg.locator("#welcomeBox [data-welcome]").count() == 5, "la primera vez se muestran los «Primeros pasos»")
    pg.click('#welcomeBox [data-welcome="puzzles"]')
    comprobar(not pg.is_visible("#welcomeBox") and pg.is_visible("#puzzleStartBtn") and pg.evaluate("settings.welcomed === true"), "un acceso de «Primeros pasos» lleva a su sitio (problemas) y cierra el panel")
    pg.click("#welcomeBtn")
    pg.click('#welcomeBox [data-welcome="lichess"]')
    comprobar(pg.is_visible("#liUser") and pg.evaluate("document.activeElement.id") == "liUser", "«Traer mis partidas de Lichess» abre la descarga con el cursor en el usuario")
    pg.click("#welcomeBtn")
    pg.click('#welcomeBox [data-welcome="analyse"]')
    comprobar(pg.is_visible("#moveInput") and pg.evaluate("document.activeElement.id") == "moveInput", "«Analizar una partida mía» deja listo el cuadro para pegarla")
    pg.click("#welcomeBtn")
    comprobar(pg.is_visible("#welcomeBox"), "«Primeros pasos», al pie, lo vuelve a abrir")
    pg.click("#welcomeClose")
    pg.reload(); pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    comprobar(not pg.is_visible("#welcomeBox"), "una vez cerrado no vuelve a salir solo")
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("document.documentElement.scrollWidth") <= 390, "sin desplazamiento horizontal en el móvil")
    pg.click('.tab-btn[data-tab="tools"]')
    comprobar(pg.evaluate("document.documentElement.scrollWidth") <= 390, "sin desplazamiento horizontal en el móvil en la pestaña Entrenar")
    comprobar(pg.locator("#trainMenu .train-card").count() == 7 and pg.is_visible("#todayBox") and not pg.is_visible("#puzzleStartBtn") and not pg.is_visible("#trainBackBtn"),
              "Entrenar se abre con «Hoy» y un menú de actividades, sin todas las secciones apiladas")
    pg.click('#trainMenu [data-train-open="puzzles"]')
    comprobar(pg.is_visible("#puzzleStartBtn") and not pg.is_visible("#trainMenu") and not pg.is_visible("#drillDueBtn") and pg.is_visible("#trainBackBtn"),
              "cada tarjeta abre sólo su actividad, con un botón para volver")
    comprobar(pg.evaluate("document.documentElement.scrollWidth") <= 390, "sin desplazamiento horizontal en el móvil dentro de una actividad")
    pg.click("#trainBackBtn")
    comprobar(pg.is_visible("#trainMenu") and not pg.is_visible("#puzzleStartBtn"), "«← Todas las actividades» vuelve al menú")
    pg.click('#trainMenu [data-train-open="rep"]')
    pg.click('.tab-btn[data-tab="tools"]')
    comprobar(pg.is_visible("#trainMenu") and not pg.is_visible("#repNewBtn"), "pulsar la pestaña Entrenar estando en una actividad también vuelve al menú")
    pg.click('.tab-btn[data-tab="study"]')
    cab = pg.evaluate("document.querySelector('header').getBoundingClientRect().height")
    comprobar(not pg.is_visible("#pieceStyleSelect") and pg.is_visible("#soundToggle") and cab < 100, "en el móvil la cabecera es compacta (piezas, notación y colores están en ⚙ Ajustes)")
    pg.click("#settingsBtn")
    comprobar(pg.is_visible("#pieceStyleSelect") and pg.is_visible("#displayLang") and pg.is_visible("#themeSelect"), "⚙ Ajustes reúne el diseño de las piezas, la notación y los colores del tablero")
    revelar(pg, "#themeSelect") or pg.select_option("#themeSelect", "green"); revelar(pg, "#pieceStyleSelect") or pg.select_option("#pieceStyleSelect", "neo"); revelar(pg, "#displayLang") or pg.select_option("#displayLang", "en")
    comprobar(pg.evaluate("document.body.dataset.theme === 'green' && settings.pieceStyle === 'neo'") and "Nf3" in pg.inner_text("#moves"), "y los cambios se aplican al momento")
    revelar(pg, "#themeSelect") or pg.select_option("#themeSelect", "wood"); revelar(pg, "#pieceStyleSelect") or pg.select_option("#pieceStyleSelect", "staunton"); revelar(pg, "#displayLang") or pg.select_option("#displayLang", "es")
    pg.keyboard.press("Escape")
    barra = pg.evaluate("""() => { const r = document.querySelector('.mode-tabs').getBoundingClientRect(); const b = [...document.querySelectorAll('.mode-tabs .tab-btn')];
      return { abajo: r.bottom, alto: r.height, fija: getComputedStyle(document.querySelector('.mode-tabs')).position, n: b.filter(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none').length,
               caben: b.every(e => e.getBoundingClientRect().right <= innerWidth + 0.5 && e.getBoundingClientRect().left >= -0.5) }; }""")
    comprobar(barra["fija"] == "fixed" and abs(barra["abajo"] - 844) < 1 and barra["alto"] < 70 and barra["n"] == 7 and barra["caben"],
              "en el móvil las pestañas son una barra fija abajo y caben todas (con «Tablero»)")
    pg.click('.tab-btn[data-tab="library"]')
    arriba = pg.evaluate("document.getElementById('tab-library').getBoundingClientRect().top")
    comprobar(pg.is_visible("#tab-library") and 0 <= arriba < 200 and pg.evaluate("scrollY") > 200, "al pulsar una pestaña en el móvil su contenido queda a la vista")
    pg.click("#tabBoardBtn")
    pg.wait_for_function("scrollY === 0", timeout=3000)
    comprobar(pg.evaluate("ui.activeTab") == "library", "«♟ Tablero» vuelve al tablero sin cambiar de pestaña")
    pg.click('.tab-btn[data-tab="study"]')
    pg.click("#tabBoardBtn")
    comprobar(pg.is_visible("#moreBtn") and not any(pg.is_visible(s) for s in ("#exportControls", "#varControls", "#undoBtn", "#editPosBtn", "#drawBar", "#typeMoveRow")),
              "en el móvil las acciones secundarias están recogidas tras «⋯»")
    pg.click("#moreBtn")
    comprobar(all(pg.is_visible(s) for s in ("#pngBtn", "#promoteVarBtn", "#undoBtn", "#editPosBtn", "#drawToggle", "#moveTyped")) and pg.get_attribute("#moreBtn", "aria-expanded") == "true"
              and pg.evaluate("document.documentElement.scrollWidth") <= 390, "«⋯» las despliega")
    pg.click("#drawToggle"); pg.click("#moreBtn")
    comprobar(pg.is_visible("#drawToggle") and not pg.is_visible("#pngBtn"), "con el modo dibujo activado su barra sigue visible aunque se cierre «⋯»")
    pg.click("#drawToggle")
    comprobar(not pg.is_visible("#drawToggle"), "y se recoge al desactivarlo")
    pg.keyboard.press("b")
    comprobar(pg.is_visible("#moveTyped"), "con las piezas ocultas se puede escribir la jugada sin abrir «⋯»")
    pg.keyboard.press("b")
    pos = pg.evaluate("""() => { const y = id => document.getElementById(id).getBoundingClientRect().top;
      return { tablero: document.getElementById('bottomBar').getBoundingClientRect().bottom, nav: y('navControls'), jugadas: y('moves'), motor: y('engineBox') }; }""")
    comprobar(pos["tablero"] <= pos["nav"] < pos["jugadas"] < pos["motor"], "en vertical, bajo el tablero van la navegación y las jugadas, y después el motor")
    pg.set_viewport_size({"width": 844, "height": 390})
    pg.wait_for_timeout(300)
    caja = pg.evaluate("""() => { const b = document.getElementById('bottomBar').getBoundingClientRect(), m = document.getElementById('moves').getBoundingClientRect();
      return { abajo: b.bottom, derecha: b.right, jugadasIzq: m.left, ancho: document.documentElement.scrollWidth }; }""")
    comprobar(caja["abajo"] <= 390 and caja["jugadasIzq"] > caja["derecha"] and caja["ancho"] <= 844, "en horizontal el tablero cabe entero y las jugadas van a su lado")
    # Tabletas en horizontal (p. ej. Huawei MatePad T3 10 con la aplicación instalada: unos 960 × 576)
    for w, h in [(960, 576), (962, 601), (800, 780), (1100, 540)]:
        pg.set_viewport_size({"width": w, "height": h})
        pg.wait_for_timeout(250)
        caja = pg.evaluate("""() => { const b = document.getElementById('bottomBar').getBoundingClientRect(), m = document.getElementById('moves').getBoundingClientRect();
          return { abajo: b.bottom, derecha: b.right, jugadasIzq: m.left, ancho: document.documentElement.scrollWidth }; }""")
        comprobar(caja["abajo"] <= h and caja["jugadasIzq"] > caja["derecha"] and caja["ancho"] <= w, f"tableta en horizontal ({w}×{h}): el tablero cabe entero y las jugadas van a su lado")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_sin_conexion(browser):
    print("Versión web instalable y uso sin conexión")
    class Silencioso(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Silencioso, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    ctx = contexto(browser)
    try:
        pg, errores = nueva_pagina(ctx, url)
        pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=20000)
        comprobar(pg.locator('link[rel="manifest"]').count() == 1, "enlaza el manifiesto para poder instalarla")
        cached = pg.evaluate("caches.keys().then(k => Promise.all(k.map(n => caches.open(n).then(c => c.keys())))).then(a => a.flat().map(r => r.url))")
        comprobar(any(u.endswith("/index.html") or u.endswith("/") for u in cached) and any("sf-worker.js" in u for u in cached), "guarda la aplicación y el lanzador de Stockfish para usarlos sin conexión")
        ctx.set_offline(True)
        pg.reload()
        pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
        comprobar(pg.locator("#board .square").count() == 64, "sin conexión la aplicación se abre igual")
        comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    finally:
        ctx.close()
        srv.shutdown()


def prueba_v11(browser):
    print("Novedades 1.1: amenaza, aprende de tus errores, planilla, imagen, impresión, enlace")
    ctx = contexto(browser, accept_downloads=True)
    pg, errores = nueva_pagina(ctx)
    pg.fill("#moveInput", "1. e4 e5 2. Dh5 Cc6 3. Ac4")
    pg.click("#importBtn")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.keyboard.press("x")
    pg.wait_for_function("!document.getElementById('threatInfo').hidden", timeout=20000)
    comprobar("Dxf7#" in pg.inner_text("#threatInfo") and pg.locator("#arrowsGroup line[stroke-dasharray]").count() == 1, "«Ver amenaza» descubre Dxf7# con una flecha discontinua")
    pg.fill("#moveTyped", "g6")
    pg.locator("#moveTyped").press("Enter")
    comprobar(pg.inner_text("#moves .mv.active") == "g6", "jugar escribiendo la jugada")
    pg.fill("#moveInput", "1. e4 e5 2. Ac4 Cc6 3. Dh5 Cf6 4. Dxf7#")
    pg.click("#importBtn")
    pg.click("#autoAnnotateBtn")
    pg.wait_for_function("document.getElementById('reportBox').classList.contains('show')", timeout=120000)
    comprobar(pg.locator("#retryStart button").count() == 3, "tras el análisis se ofrece «Aprende de tus errores»")
    pg.locator("#retryStart button", has_text="Todos").click()
    comprobar(pg.is_visible("#retryBox") and "Error 1 de" in pg.inner_text("#retryBox"), "se abre el primer error")
    comprobar("oculto" in pg.inner_text("#engineLines"), "el motor se oculta durante el ejercicio")
    best = pg.evaluate("retryNode().parent.eval.best")
    casilla(pg, best[:2]).click(); casilla(pg, best[2:4]).click()
    pg.wait_for_timeout(300)
    comprobar("Exacto" in pg.inner_text("#retryBox"), "acertar la jugada del motor resuelve el error")
    pg.locator("#retryBox [data-a=end]").click()
    comprobar(not pg.evaluate("Retry.active") and "Repaso terminado" in pg.inner_text("#retryBox"), "al terminar se muestra el resumen")
    pg.click("#moveViewBtn")
    comprobar(pg.locator("#moves .sheet-row").count() >= 4 and pg.locator("#moves .sheet-cell").count() >= 8, "vista de planilla en dos columnas")
    pg.click("#moveViewBtn")
    with pg.expect_download() as dl:
        pg.click("#pngBtn")
    png = pathlib.Path(dl.value.path()).read_bytes()
    comprobar(png[:4] == b"\x89PNG" and len(png) > 20000, "exporta la posición como imagen PNG")
    pg.evaluate("buildPrintView()")
    comprobar(pg.locator("#printView .pv-diagram").count() >= 1 and "Dxf7#" in pg.inner_text("#printView"), "prepara la vista de impresión con diagramas")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root)[3])")
    link = pg.evaluate("shareLink()")
    pg2, err2 = nueva_pagina(ctx, URL + link[link.index("#"):])
    pg2.wait_for_timeout(300)
    comprobar(pg2.evaluate("Pgn.pathTo(cur()).length - 1") == 4 and pg2.evaluate("Pgn.mainlineFrom(game.root).length") == 7, "el enlace abre la partida en la misma jugada")
    comprobar(not errores and not err2, "sin errores de JavaScript" + (": " + "; ".join(errores + err2) if errores or err2 else ""))
    ctx.close()


def prueba_v12(browser):
    print("Novedades 1.2: informe de la partida, comentarios estratégicos, descarga de Lichess")
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", lambda r: r.abort())
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    llamadas = []
    def lichess(r):
        llamadas.append(r.request.url)
        if "/api/games/user/nadie" in r.request.url:
            return r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"})
        r.fulfill(status=200, body=PGN_LICHESS, content_type="application/x-chess-pgn", headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("**/*lichess*/**", lichess)
    pg, errores = nueva_pagina(ctx)
    notas = pg.evaluate("""() => {
      const textos = pgn => { const g = Pgn.parseGame(Pgn.splitGames(pgn)[0], { lang: 'en' }).game; return Pgn.mainlineFrom(g.root).map(n => strategicNotes(n).map(x => x.txt).join(' | ')); };
      return { esp: textos('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6'),
               damas: textos('1. d4 d5 2. c4 dxc4 3. e3 Nf6 4. Bxc4 e6 5. Nf3 c5 6. O-O a6 7. dxc5 Qxd1 8. Rxd1') };
    }""")
    comprobar("pareja de alfiles" in notas["esp"][7], "comentario estratégico: «… pareja de alfiles» en la variante del cambio de la Española")
    comprobar(any("damas" in t for t in notas["damas"]), "comentario estratégico: «Se cambian las damas»")
    pg.fill("#moveInput", "1. e4 e5 2. Ac4 Cc6 3. Dh5 Cf6 4. Dxf7#")
    pg.click("#importBtn")
    pg.click("#autoAnnotateBtn")
    pg.wait_for_function("document.getElementById('reportBox').classList.contains('show')", timeout=120000)
    informe = pg.inner_text("#reportExtra")
    comprobar("Momentos clave" in informe and "Precisión por fases" in informe and "practicar" in informe.lower(), "el informe muestra resumen, momentos clave, fases y qué practicar")
    pg.locator("#reportExtra [data-k]").first.click()
    comprobar(pg.inner_text("#moves .mv.active") in ("Cf6", "Cf6??", "Nf6"), "pulsar un momento clave lleva a esa jugada")
    pg.evaluate("buildPrintView()")
    comprobar("Momentos clave" in pg.inner_text("#printView"), "el informe sale también en la versión para imprimir")
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="collection"]')
    pg.click("#lichessImport summary")
    pg.fill("#liUser", "rafa")
    pg.select_option("#liPerf", "blitz")
    pg.check("#liRated")
    pg.click("#liBtn")
    pg.wait_for_function("document.querySelectorAll('#pgnDbBody tr').length === 2", timeout=5000)
    url = llamadas[-1] if llamadas else ""
    comprobar("/api/games/user/rafa?" in url and "perfType=blitz" in url and "rated=true" in url and "evals=true" in url, "descarga las partidas del usuario de Lichess con los filtros elegidos")
    pg.locator("#pgnDbBody tr").first.click()
    comprobar(pg.evaluate("(game.root.children[0].eval || {}).cp") == 20, "se conservan las evaluaciones que trae Lichess")
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="collection"]')
    pg.fill("#liUser", "nadie")
    pg.click("#liBtn")
    pg.wait_for_timeout(500)
    comprobar("no existe el usuario" in pg.inner_text("#toast"), "avisa si el usuario de Lichess no existe")
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready")
    comprobar(pg.input_value("#liUser") == "rafa", "recuerda el último usuario de Lichess que funcionó")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


PGN_MIAS = """[Event "Rated Blitz game"]
[Site "https://lichess.org/a1"]
[Date "2026.09.10"]
[White "otro"]
[Black "rafa"]
[Result "1-0"]
[TimeControl "180+2"]

1. e4 { [%eval 0.3] } 1... e5 { [%eval 0.3] } 2. Bc4 { [%eval 0.2] } 2... Nc6 { [%eval 0.3] } 3. Qh5 { [%eval 0.2] } 3... Nf6 { [%eval #1] } 4. Qxf7# 1-0

[Event "Rated Blitz game"]
[Site "https://lichess.org/a2"]
[Date "2026.10.02"]
[White "rafa"]
[Black "otro"]
[Result "1-0"]
[TimeControl "180+2"]

1. d4 { [%eval 0.2] } 1... d5 { [%eval 0.3] } 2. c4 { [%eval 0.3] } 2... e6 { [%eval 0.4] } 3. Nc3 { [%eval 0.3] } 3... Nf6 { [%eval 0.3] } 4. Bg5 { [%eval 0.3] } 4... Be7 { [%eval 0.3] } 1-0
"""


def prueba_v13(browser):
    print("Novedades 1.3: estadísticas, ejercicios con tus errores y búsqueda de posición")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("t => setCollection(t, false, 'mías')", PGN_MIAS)
    pg.evaluate("saveCollGames([0, 1])")
    pg.wait_for_function("Lib.games.size === 2")
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="stats"]')
    pg.wait_for_timeout(300)
    comprobar("Escribe arriba tu nombre" in pg.inner_text("#statsOut") and "rafa (2)" in pg.inner_text("#nameChips"), "sin nombres configurados pide el tuyo y sugiere los más frecuentes")
    pg.fill("#myNames", "rafa")
    pg.click("#myNamesSave")
    pg.wait_for_function("document.querySelector('#statsOut .st-tiles')", timeout=10000)
    txt = pg.inner_text("#statsOut")
    comprobar("2 analizadas" in txt and "+1 =0 −1" in txt and "50 %" in txt, "estadísticas: partidas, resultados y puntuación (con los análisis que trae el PGN)")
    comprobar("Mates que permitiste" in txt and pg.locator("#statsOut .st-chart").count() == 1, "estadísticas: errores más frecuentes y evolución por meses")
    pg.select_option("#stColor", "1")
    pg.wait_for_function("document.querySelector('#statsOut .st-tiles b').textContent === '1'", timeout=5000)
    comprobar(True, "el filtro de color recalcula las estadísticas")
    antes = pg.evaluate("Pgn.mainlineFrom(game.root).length")
    entrenar(pg, "drill")
    pg.wait_for_function("document.getElementById('drillInfo').textContent.includes('1 posición')", timeout=10000)
    comprobar("1 pendiente" in pg.inner_text("#drillBadge"), "los errores de tus partidas aparecen como ejercicios pendientes")
    pg.click("#drillDueBtn")
    pg.wait_for_function("Retry.active && Retry.state === 'ask'", timeout=30000)
    comprobar("Ejercicio 1 de 1" in pg.inner_text("#retryBox") and "3...Cf6" in pg.inner_text("#retryBox"), "el ejercicio muestra la partida y el error cometido")
    best = pg.evaluate("retryNode().parent.eval.best")
    casilla(pg, best[:2]).click(); casilla(pg, best[2:4]).click()
    pg.wait_for_function("Retry.state === 'solved'", timeout=30000)
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("Object.values([...Lib.games.values()].find(r => r.drills).drills)[0].box") == 1, "el repaso queda registrado para volver más adelante")
    pg.locator("#retryBox [data-a=end]").click()
    pg.locator("#retryBox [data-back-retry]").click()
    comprobar(not pg.evaluate("Retry.active") and pg.evaluate("Pgn.mainlineFrom(game.root).length") == antes, "«Volver a tu partida» recupera lo que tenías en el tablero")
    pg.click('.tab-btn[data-tab="study"]')
    pg.fill("#moveInput", "1. e4 e5 2. Ac4 Cc6 3. Dh5")
    pg.click("#importBtn")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="position"]')
    pg.uncheck("#posColl")
    pg.click("#posBtn")
    pg.wait_for_function("!PosSearch.running && document.getElementById('posStatus').textContent")
    comprobar(pg.locator("#posResults .mark-card").count() == 1 and "1 partida con la misma posición" in pg.inner_text("#posStatus"), "encuentra en la biblioteca la partida que pasa por la posición del tablero")
    pg.select_option("#posMode", "pawns")
    pg.click("#posBtn")
    pg.wait_for_function("!PosSearch.running && document.getElementById('posStatus').textContent.includes('estructura')")
    comprobar(pg.locator("#posResults .mark-card").count() == 1 and "tras <b>1...e5</b>".replace("<b>", "").replace("</b>", "") in pg.inner_text("#posResults"), "busca también por estructura de peones (desde la primera vez que aparece)")
    pg.select_option("#posMode", "exact")
    pg.click("#posBtn")
    pg.wait_for_function("!PosSearch.running && document.getElementById('posStatus').textContent.includes('misma posición')")
    pg.locator("#posResults .mark-card").first.click()
    comprobar(pg.evaluate("Pgn.pathTo(cur()).length - 1") == 5 and pg.evaluate("ui.activeTab") == "study" and pg.evaluate("Pgn.mainlineFrom(game.root).length") == 7, "al pulsar un resultado se abre la partida en ese momento")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_v14(browser):
    print("Novedades 1.4: CPU con estilos y reloj, adivina la jugada, a ciegas y visualización")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    eleccion = pg.evaluate("""() => {
      const s = Chess.parseFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3');
      const lineas = [{ cp: 30, pv: ['b1c3'] }, { cp: 22, pv: ['f3f7'] }, { cp: 25, pv: ['g1e2'] }, { cp: -300, pv: ['c4f7'] }];
      const r = {};
      for (const st of ['balanced', 'aggressive', 'positional', 'defensive']) r[st] = cpuPick(s, lineas, st, 20, () => 0.5);
      r.nunca = [...Array(40)].every(() => cpuPick(s, lineas, 'human', 20) !== 'c4f7');
      return r;
    }""")
    comprobar(eleccion["balanced"] == "b1c3" and eleccion["aggressive"] == "f3f7" and eleccion["defensive"] == "g1e2", "los estilos de la CPU eligen jugadas distintas entre las casi igual de buenas")
    comprobar(eleccion["nunca"], "ningún estilo elige una jugada que pierde material claramente")
    pg.fill("#moveInput", "1. e4 e5 2. Cf3")
    pg.click("#importBtn")
    pg.click("#playCpuToggle")
    comprobar(pg.is_visible("#cpuModal"), "«Jugar vs CPU» abre el cuadro con nivel, estilo y reloj")
    pg.select_option("#cpuColor", "1")
    pg.select_option("#cpuStyle", "aggressive")
    pg.select_option("#cpuClock", "3+2")
    pg.select_option("#cpuFrom", "new")
    pg.click("#cpuStartBtn")
    comprobar(pg.evaluate("ui.cpu.on") and pg.is_visible("#bottomClock") and pg.inner_text("#bottomClock") == "3:00", "empieza una partida nueva con el reloj a 3:00")
    comprobar(pg.evaluate("game.headers.White") == "Tú" and "agresivo" in pg.evaluate("game.headers.Black") and pg.evaluate("game.headers.TimeControl") == "180+2", "apunta los jugadores y el ritmo en la cabecera")
    casilla(pg, "e2").click(); casilla(pg, "e4").click()
    pg.wait_for_function("Pgn.pathTo(cur()).length === 3 && !ui.cpu.thinking", timeout=20000)
    comprobar(True, "la CPU responde a tu jugada")
    comprobar("oculto" in pg.inner_text("#engineLines") and pg.is_disabled("#backBtn"), "durante la partida se oculta el motor y no se puede navegar")
    # El incremento se comprueba pulsando el reloj sin esperar (no depende de lo que tarde la máquina)
    inc = pg.evaluate("""() => {
      const saved = { ms: Object.assign({}, Clock.ms), turn: Clock.turn, last: Clock.last };
      const mover = Clock.turn, before = Clock.ms[mover];
      Clock.last = Date.now();
      clockPress(mover);
      const d = Clock.ms[mover] - before;
      Object.assign(Clock, { ms: saved.ms, turn: saved.turn, last: saved.last });
      renderClocks();
      return d;
    }""")
    comprobar(pg.evaluate("Clock.started && Clock.turn === 1") and 1900 <= inc <= 2000, "el reloj corre y suma el incremento al mover")
    comprobar("Deshacer" not in pg.inner_text("#cpuBox"), "con reloj no se puede deshacer")
    pg.locator("#cpuBox [data-c=draw]").click()
    comprobar("rechaza" in pg.inner_text("#toast") and pg.evaluate("ui.cpu.on"), "la CPU rechaza unas tablas prematuras")
    pg.evaluate("Clock.ms[1] = 200")
    pg.wait_for_function("ui.cpu.over", timeout=5000)
    comprobar("Has perdido" in pg.inner_text("#cpuBox") and "tiempo" in pg.inner_text("#cpuBox") and pg.evaluate("game.headers.Result") == "0-1", "si se te acaba el tiempo pierdes y se apunta el resultado")
    comprobar("Revancha" in pg.inner_text("#cpuBox") and not pg.is_disabled("#backBtn"), "al terminar se puede revisar, analizar o pedir la revancha")
    pg.locator("#cpuBox [data-c=rematch]").click()
    pg.wait_for_function("ui.cpu.on && ui.cpu.side === 1 && Pgn.pathTo(cur()).length === 2", timeout=20000)
    comprobar(pg.evaluate("ui.flipped") and pg.evaluate("game.headers.Black") == "Tú", "la revancha cambia los colores y la CPU sale con blancas")
    pg.locator("#cpuBox [data-c=stop]").click()
    pg.click("#playCpuToggle")
    pg.select_option("#cpuColor", "board")
    pg.select_option("#cpuClock", "")
    pg.select_option("#cpuFrom", "here")
    pg.check("#cpuBlind")
    pg.click("#cpuStartBtn")
    comprobar(pg.evaluate("boardEl.classList.contains('blind')") and not pg.is_visible("#bottomClock"), "partida a ciegas y sin reloj desde la posición del tablero")
    pg.fill("#moveTyped", "Cf6")
    pg.locator("#moveTyped").press("Enter")
    pg.wait_for_function("Pgn.pathTo(cur()).length === 4 && !ui.cpu.thinking", timeout=20000)
    pg.locator("#cpuBox [data-c=undo]").click()
    comprobar(pg.evaluate("Pgn.pathTo(cur()).length") == 2, "sin reloj se puede deshacer tu jugada y la de la CPU")
    pg.locator("#cpuBox [data-c=resign]").click()
    comprobar(pg.evaluate("game.headers.Result") == "1-0" and not pg.evaluate("boardEl.classList.contains('blind')"), "rendirse termina la partida y vuelve a mostrar las piezas")

    pg.fill("#moveInput", "1. e4 e5 2. Ac4 Cc6 3. Dh5 Cf6 4. Dxf7#")
    pg.click("#importBtn")
    antes = pg.evaluate("Pgn.mainlineFrom(game.root).length")
    entrenar(pg, "guess")
    pg.select_option("#guessSource", "board")
    pg.select_option("#guessSide", "1")
    pg.click("#guessStartBtn")
    pg.wait_for_function("Guess.active && Guess.state === 'ask'", timeout=20000)
    comprobar("Jugada 1 de 4" in pg.inner_text("#guessBox") and "oculto" in pg.inner_text("#engineLines"), "«Adivina la jugada» pregunta las jugadas de un bando con el motor oculto")
    comprobar(pg.locator("#moves .mv").count() == 0, "no se ven las jugadas que faltan por adivinar")
    casilla(pg, "e2").click(); casilla(pg, "e4").click()
    pg.wait_for_function("Guess.n === 1 && Guess.state === 'ask'", timeout=30000)
    comprobar("Como en la partida" in pg.inner_text("#guessBox") and pg.evaluate("Pgn.pathTo(cur()).length") == 3, "acertar la jugada de la partida; después responde el rival")
    casilla(pg, "g1").click(); casilla(pg, "f3").click()
    pg.wait_for_function("Guess.n === 2 && Guess.state === 'ask'", timeout=30000)
    comprobar("partida: " in pg.inner_text("#guessBox") and pg.evaluate("Guess.max") == 10, "otra jugada se puntúa con el motor y se compara con la de la partida")
    pg.locator("#guessBox [data-g=hint]").click()
    comprobar(pg.locator("#board .hint-sq").count() == 1, "la pista marca la pieza que se movió")
    pg.locator("#guessBox [data-g=show]").click()
    pg.wait_for_function("Guess.n === 3 && Guess.state === 'ask'", timeout=30000)
    best = pg.evaluate("Guess.line[Guess.i].uci")
    casilla(pg, best[:2]).click(); casilla(pg, best[2:4]).click()
    pg.wait_for_function("!Guess.active", timeout=30000)
    txt = pg.inner_text("#guessBox")
    comprobar("Partida terminada" in txt and "Coincidencias: 2/4" in txt and pg.evaluate("Guess.max") == 20, "al final se comparan tus puntos con los del jugador")
    comprobar(pg.evaluate("game.root.children[0].children[0].children.length") == 2 and "Adivina la jugada" in pg.evaluate("game.root.comment"), "la partida resultante guarda tus intentos como variantes")
    pg.locator("#guessBox [data-g=back]").click()
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == antes and not pg.evaluate("Guess.active"), "«Volver a tu partida» recupera la partida del tablero")
    pg.select_option("#guessSource", "classic")
    pg.select_option("#guessSide", "auto")
    pg.click("#guessStartBtn")
    pg.wait_for_function("Guess.active && Guess.state === 'ask'", timeout=20000)
    comprobar(pg.evaluate("Guess.side === (Guess.result === '0-1' ? -1 : 1)"), "con una clásica adivinas, por defecto, el bando ganador")
    pg.locator("#guessBox [data-g=end]").click()
    pg.locator("#guessBox [data-g=back]").click()

    entrenar(pg, "blind")
    pg.keyboard.press("b")
    comprobar(pg.evaluate("boardEl.classList.contains('blind')") and "ocultas" in pg.inner_text("#blindBadge"), "la tecla B oculta las piezas")
    pg.click("#peekBtn")
    comprobar(not pg.evaluate("boardEl.classList.contains('blind')"), "«Ojear» las muestra un momento")
    pg.keyboard.press("b")
    pg.select_option("#visMode", "line")
    pg.select_option("#visPlies", "4")
    pg.click("#visStartBtn")
    comprobar("Sigue la línea · 1 de 10" in pg.inner_text("#visBox") and pg.locator("#visBox .vis-line").count() == 1, "«Sigue la línea» muestra la posición y las jugadas escritas")
    for _ in range(2):
        q = pg.evaluate("({ t: Vis.q.type, a: Vis.q.answer, s: Vis.q.type === 'where' ? Chess.sqName(Vis.q.answer) : '' })")
        if q["t"] == "where":
            casilla(pg, q["s"]).click()
        else:
            pg.locator(f'#visBox [data-v="{q["a"]}"]').click()
        comprobar("Correcto" in pg.inner_text("#visBox") and pg.locator("#board .vis-ok").count() == 1, "acertar dónde está la pieza o qué hay en la casilla" + (" (casilla)" if q["t"] == "where" else " (pieza)"))
        pg.locator("#visBox [data-v=next]").click()
    pg.locator("#visBox [data-v=end]").click()
    comprobar("2 de 2 aciertos" in pg.inner_text("#visBox"), "resumen del ejercicio de visualización")
    pg.locator("#visBox [data-v=back]").click()
    pg.select_option("#visMode", "color")
    pg.click("#visStartBtn")
    comprobar(pg.evaluate("boardEl.classList.contains('vis-hide')"), "en «color de las casillas» se tapa el tablero")
    claro = pg.evaluate("((Vis.q.sq >> 4) + (Vis.q.sq & 7)) % 2 === 0")
    pg.locator("#visBox [data-v=%s]" % ("l" if claro else "d")).click()
    comprobar(pg.evaluate("Vis.ok") == 1 and "✔" in pg.inner_text("#visBox"), "acertar el color de una casilla")
    pg.locator("#visBox [data-v=end]").click()
    pg.select_option("#visMode", "coords")
    pg.click("#visStartBtn")
    comprobar(pg.evaluate("boardEl.classList.contains('no-coords')"), "en «encuentra la casilla» se ocultan las coordenadas")
    for _ in range(3):
        casilla(pg, pg.evaluate("Chess.sqName(Vis.q.sq)")).click()
    pg.evaluate("Vis.end = Date.now()")
    pg.wait_for_function("!Vis.active", timeout=3000)
    comprobar("3 casillas en 30 s" in pg.inner_text("#visBox") and "récord" in pg.inner_text("#visBox"), "cuenta las casillas encontradas y guarda el récord")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_cursos(browser):
    print("Novedades 1.5: cursos")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.click('.tab-btn[data-tab="courses"]')
    comprobar(pg.locator("#courseList details.course").count() == 11 and "0 de 128" in pg.inner_text("#courseProgress"), "la pestaña Cursos muestra los once cursos y el progreso")
    pg.locator('details[data-course="finales"] summary').click()
    pg.locator('details[data-course="finales"] .lesson-row', has_text="Lucena").click()
    comprobar(pg.is_visible("#lessonBox") and "construir el puente" in pg.inner_text("#lessonBox") and pg.evaluate("Chess.toFen(game.root.state)").startswith("1K1k4/1P6"), "abrir una lección la pone en el tablero con su explicación")
    comprobar(pg.locator("#arrowsGroup line, #arrowsGroup circle").count() >= 1, "las casillas y flechas de la lección se dibujan en el tablero")
    pg.set_viewport_size({"width": 1366, "height": 768})
    pg.evaluate("scrollTo(0, 0)")
    pg.wait_for_timeout(300)
    caja = pg.evaluate("""() => { const b = document.getElementById('board').getBoundingClientRect(), l = document.getElementById('lessonBox').getBoundingClientRect();
      return { bajo: document.getElementById('bottomBar').getBoundingClientRect().bottom, derecha: b.right, izq: l.left, arriba: l.top, alto: innerHeight }; }""")
    comprobar(caja["bajo"] <= caja["alto"] and caja["izq"] > caja["derecha"] and caja["arriba"] < caja["alto"] / 2, "en un portátil el tablero cabe entero y la explicación está a su lado, arriba")
    pg.evaluate("scrollTo(0, 400)")
    pg.wait_for_timeout(200)
    comprobar(0 <= pg.evaluate("document.getElementById('lessonBox').getBoundingClientRect().top") < 120, "la explicación se queda a la vista al desplazar la página")
    pg.set_viewport_size({"width": 1400, "height": 1000})
    pg.evaluate("scrollTo(0, 0)")
    pg.locator("#lessonBox [data-l=fwd]").click()
    comprobar("alejar al rey" in pg.inner_text("#lessonBox").lower() or "aparta" in pg.inner_text("#lessonBox") and "paso 1 de" in pg.inner_text("#lessonBox"), "▶ Siguiente avanza y muestra el comentario de la jugada")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    comprobar("Lección terminada" in pg.inner_text("#lessonBox") and pg.locator('details[data-course="finales"] .lesson-row', has_text="Lucena").locator(".lesson-num").inner_text() == "✔", "al llegar al final la lección queda marcada como terminada")
    pg.locator("#lessonBox [data-l=next]").click()
    comprobar("Philidor" in pg.inner_text("#lessonBox") and pg.evaluate("ui.flipped"), "«Lección siguiente» abre la siguiente (con las negras abajo si toca)")
    pg.locator("#lessonBox [data-l=practice]").click()
    comprobar(pg.evaluate("trainer.active && trainer.side === -1") and not pg.is_visible("#lessonBox"), "🎯 Practicar entrena las jugadas de la lección y oculta la explicación")
    pg.click("#stopTrainBtn")
    pg.click('.tab-btn[data-tab="courses"]')
    pg.locator('details[data-course="tactica"] summary').click()
    pg.locator('details[data-course="tactica"] .lesson-row', has_text="mate del pastor").click()
    pg.locator("#lessonBox [data-l=practice]").click()
    casilla(pg, "h5").click(); casilla(pg, "f7").click()
    pg.wait_for_timeout(300)
    comprobar("Perfecto" in pg.inner_text("#trainFeedback") and not pg.evaluate("trainer.active"), "los ejercicios se resuelven con 🎯 Resolver")
    pg.click("#backToCoursesBtn")
    pg.locator('details[data-course="partidas"] summary').click()
    pg.locator('details[data-course="partidas"] .lesson-row', has_text="Siglo").click()
    comprobar("Fischer" in pg.inner_text("#topName") + pg.inner_text("#bottomName") and pg.evaluate("ui.flipped") and "1956" in pg.inner_text("#lessonBox"), "las partidas magistrales se abren con sus jugadores y desde el lado del ganador")
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    pg.click('.tab-btn[data-tab="courses"]')
    comprobar("2 de 128" in pg.inner_text("#courseProgress"), "el progreso de los cursos se conserva al recargar")
    pg.locator('details[data-course="aperturas"] summary').click()
    pg.locator('details[data-course="aperturas"] [data-coll]').click()
    comprobar(pg.inner_text("#collCount") == "12" and pg.evaluate("ui.activeTab") == "library", "un curso se puede abrir como .pgn para guardar sus lecciones")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_versiones(browser):
    print("Novedades 1.7: versiones de las partidas y pruebas en las lecciones")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.fill("#moveInput", "1. e4 e5 2. Nf3 Nc6 3. Bb5")
    pg.click("#importBtn")
    pg.click("#saveGame")
    pg.wait_for_function("Lib.games.size === 1")
    comprobar(pg.is_visible("#copyGameBtn") and pg.is_disabled("#versionsBtn"), "una partida guardada ofrece guardar copia; aún no tiene versiones anteriores")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    casilla(pg, "a7").click(); casilla(pg, "a6").click()
    pg.wait_for_function("!ui.dirty && Lib.games.get(ui.libId).plies === 6", timeout=8000)
    comprobar(pg.evaluate("Lib.games.get(ui.libId).orig.plies") == 5 and "Versiones (1)" in pg.inner_text("#versionsBtn"), "antes del primer cambio se guarda el original")
    pg.evaluate("cur().comment = 'comentario estropeado'; markDirty()")
    pg.wait_for_function("!ui.dirty", timeout=8000)
    comprobar(pg.evaluate("(Lib.games.get(ui.libId).versions || []).length") == 0, "en la misma sesión no se acumulan versiones a cada cambio")
    pg.click("#versionsBtn")
    comprobar(pg.locator("#versionsList .version-row").count() == 2 and "Original" in pg.inner_text("#versionsList"), "el cuadro de versiones muestra el original y la actual")
    pg.locator("#versionsList [data-restore]").first.click()
    pg.wait_for_function("Lib.games.get(ui.libId).plies === 5 && !ui.dirty", timeout=8000)
    rec = pg.evaluate("(() => { const r = Lib.games.get(ui.libId); return { orig: r.orig.plies, vers: (r.versions || []).map(v => v.plies) }; })()")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == 5 and rec["orig"] == 5 and rec["vers"] == [6], "restaurar el original guarda la versión actual en el historial")
    pg.click("#copyGameBtn")
    pg.wait_for_function("Lib.games.size === 2")
    comprobar("(copia)" in pg.input_value("#gameName") and pg.evaluate("!Lib.games.get(ui.libId).orig"), "guardar como copia crea una partida nueva y deja la original")
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    comprobar(pg.evaluate("[...Lib.games.values()].some(r => r.orig && r.versions && r.versions.length === 1)"), "las versiones se conservan al recargar")
    pg.click('.tab-btn[data-tab="courses"]')
    pg.locator('details[data-course="finales"] summary').click()
    pg.locator('details[data-course="finales"] .lesson-row', has_text="cuadrado").click()
    pg.locator("#lessonBox [data-l=fwd]").click()
    pg.evaluate("document.activeElement.blur()")
    casilla(pg, "e5").click(); casilla(pg, "e4").click()
    comprobar("Jugada tuya" in pg.inner_text("#lessonBox") and pg.locator("#lessonBox [data-l=main]").count() == 1, "una jugada propia en la lección se identifica como prueba")
    pg.locator("#lessonBox [data-l=main]").click()
    comprobar(pg.inner_text("#moves .mv.active").startswith("a6"), "«Línea principal» vuelve a la lección")
    pg.locator("#lessonBox [data-l=reset]").click()
    comprobar(pg.evaluate("cur() === game.root && game.root.children.length === 1 && game.root.children[0].children.length === 1"), "↺ Reiniciar borra las pruebas")
    casilla(pg, "a5").click(); casilla(pg, "a6").click()
    dialogos = []
    pg.on("dialog", lambda d: dialogos.append(d.message))
    pg.locator("#lessonBox [data-l=next]").click()
    comprobar(not dialogos and "oposición" in pg.inner_text("#lessonBox"), "pasar de lección no pregunta por las pruebas sin guardar")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_motor_ayuda(browser):
    print("Novedades 1.8: ayuda del motor, comparar tu jugada y estado del motor")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.click("#engineHelpBtn")
    comprobar(pg.is_visible("#engineHelp") and "punto de vista de las" in pg.inner_text("#engineHelp"), "❔ explica cómo leer los números del motor")
    pg.click("#engineHelpBtn")
    pg.fill("#moveInput", "1. e4 e5 2. Nf3 Nc6")
    pg.click("#importBtn")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.wait_for_function("!document.getElementById('engineVerdict').hidden", timeout=20000)
    comprobar(any(x in pg.inner_text("#engineVerdict") for x in ("Igualdad", "ventaja", "Ventaja")), "debajo del número se explica la valoración con palabras")
    casilla(pg, "f3").click(); casilla(pg, "g5").click()
    pg.wait_for_selector("#moveCompare [data-cmp=run]", timeout=5000)
    pg.click("#moveCompare [data-cmp=run]")
    pg.wait_for_function("document.getElementById('moveCompare').textContent.includes('la del motor,') || document.getElementById('moveCompare').textContent.includes('es la jugada que propone')", timeout=30000)
    txt = pg.inner_text("#moveCompare")
    comprobar("3.Cg5" in txt and ("Error" in txt or "Imprecisión" in txt or "Buena" in txt or "Excelente" in txt), "⚖ compara tu jugada con la del motor y la califica")
    if pg.locator("#moveCompare [data-cmp=best]").count():
        antes = pg.evaluate("cur().parent.children.length")
        pg.click("#moveCompare [data-cmp=best]")
        comprobar(pg.evaluate("cur().parent.children.length") == antes + 1 and "propone el motor" in pg.inner_text("#moveCompare"), "«Probar la del motor» la juega como variante")
    pg.click("#settingsBtn")
    comprobar("Motor interno" in pg.inner_text("#engineStatus") and "jsDelivr" in pg.inner_text("#engineStatus") and "bloqueador" in pg.inner_text("#engineStatus"), "Ajustes explica por qué no se ha cargado Stockfish 19")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def jugar_lo_que_toca(pg, max_jugadas=40):
    """Hace, en el entrenador, la jugada esperada (la primera de las variantes) hasta que termine."""
    for _ in range(max_jugadas):
        pg.wait_for_function("!trainer.active || (trainerUserTurn() && !trainer.busy)", timeout=10000)
        if not pg.evaluate("trainer.active"):
            return
        u = pg.evaluate("cur().children[0].uci")
        casilla(pg, u[:2]).click(); casilla(pg, u[2:4]).click()
        pg.wait_for_timeout(120)


def prueba_entrenamiento_19(browser):
    print("Novedades 1.9: repertorios, problemas de táctica e informe del entrenador")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    # Repertorios
    pg.click('.tab-btn[data-tab="courses"]')
    pg.locator('details[data-course="repertorios"] summary').click()
    comprobar(pg.locator('details[data-course="repertorios"] .lesson-row').count() == 8, "el curso de repertorios tiene ocho repertorios")
    pg.locator('details[data-course="repertorios"] .lesson-row', has_text="Caro-Kann").click()
    comprobar(pg.evaluate("ui.flipped") and "Entrenar repertorio" in pg.inner_text("#lessonBox"), "un repertorio con negras se abre con las negras abajo y se entrena con 🎯")
    pg.locator("#lessonBox [data-l=practice]").click()
    jugar_lo_que_toca(pg)
    pg.wait_for_function("document.getElementById('trainFeedback').textContent.includes('Próximo repaso')", timeout=10000)
    comprobar("Línea perfecta" in pg.inner_text("#trainFeedback") and pg.evaluate("Object.values(LS.get('ajedrezRepasos', {}))[0].box") == 1, "al terminar una línea se programa el repaso del repertorio")
    pg.click('.tab-btn[data-tab="courses"]')
    comprobar("mañana" in pg.locator('details[data-course="repertorios"] .lesson-row', has_text="Caro-Kann").inner_text(), "la lista de cursos dice cuándo toca repasar cada repertorio")
    # Problemas de táctica
    entrenar(pg, "puzzles")
    comprobar(pg.evaluate("PUZZLES.length") >= 20 and pg.locator("#puzzleTheme option").count() >= 4, "hay un banco de problemas con varios temas")
    pg.select_option("#puzzleCount", "5")
    pg.click("#puzzleStartBtn")
    pg.wait_for_function("trainer.active && trainer.puzzle && trainerUserTurn() && !trainer.busy", timeout=10000)
    comprobar("Problema 1 de 5" in pg.inner_text("#trainFeedback") and pg.evaluate("Pgn.pathTo(cur()).length") == 2, "el problema empieza con la jugada del rival ya hecha")
    jugar_lo_que_toca(pg)
    pg.wait_for_function("document.getElementById('trainFeedback').textContent.includes('Tu nivel')", timeout=10000)
    comprobar("Resuelto" in pg.inner_text("#trainFeedback") and pg.evaluate("LS.get('ajedrezNivelProblemas', {}).n") == 1, "resolver un problema ajusta tu nivel y lo programa para repasarlo")
    pg.click("#stopPuzzlesBtn")
    comprobar("Sesión terminada" in pg.inner_text("#trainFeedback") and "1 hechos" in pg.inner_text("#puzzleInfo") or "1 hechos" in pg.inner_text("#puzzleInfo"), "al terminar se resume la sesión")
    pg.click("#puzzlesBackBtn")
    # Informe del entrenador
    pg.click('.tab-btn[data-tab="study"]')
    pg.fill("#moveInput", "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6")
    pg.click("#importBtn")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.click("#playCpuToggle")
    pg.select_option("#cpuColor", "-1")
    pg.select_option("#cpuClock", "")
    pg.select_option("#cpuFrom", "here")
    pg.click("#cpuStartBtn")
    pg.wait_for_function("ui.cpu.over", timeout=20000)
    comprobar("Informe del entrenador" in pg.inner_text("#cpuBox"), "al terminar contra la CPU se ofrece el informe del entrenador")
    pg.locator("#cpuBox [data-c=coach]").click()
    pg.wait_for_function("document.getElementById('cpuBox').textContent.includes('Tu precisión')", timeout=120000)
    txt = pg.inner_text("#cpuBox")
    comprobar("3...Cf6" in txt and "Era mejor" in txt and "💡" in txt, "el informe enseña tus errores más caros, la jugada buena y un consejo")
    pg.locator("#cpuBox [data-k=retry]").click()
    comprobar(pg.evaluate("Retry.active") and "Error 1 de" in pg.inner_text("#retryBox"), "los errores del informe se practican como ejercicios")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_dia_a_dia(browser):
    print("Novedades 1.10: plan de hoy y racha, examen, temas y comparación con el repertorio")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.click('.tab-btn[data-tab="tools"]')
    comprobar("0 días seguidos" in pg.inner_text("#todayBox") and pg.locator("#todayBox .cal-d").count() >= 100, "«Hoy» muestra la racha, los objetivos y el calendario")
    pg.click("#todayNextBtn")
    pg.wait_for_function("trainer.active && trainer.puzzle && trainerUserTurn() && !trainer.busy", timeout=10000)
    comprobar(True, "«Siguiente tarea de hoy» empieza por los problemas del día")
    jugar_lo_que_toca(pg)
    pg.wait_for_function("document.getElementById('trainFeedback').textContent.includes('Tu nivel')", timeout=10000)
    comprobar("1 día seguido" in pg.inner_text("#todayBox") and "1 de 5" in pg.inner_text("#todayBox") and pg.inner_text("#streakBadge") == "🔥1", "hacer un problema cuenta para la racha y para el objetivo del día")
    pg.click("#stopPuzzlesBtn")
    entrenar(pg, "puzzles")
    pg.locator("#puzzleStats").evaluate("e => e.parentElement.open = true")
    comprobar(pg.locator("#puzzleStats .theme-table tr").count() >= 1, "📊 muestra el acierto por temas")
    # Examen: uno bien y otro mal (una jugada equivocada cuenta como fallo)
    pg.click("#examStartBtn")
    pg.wait_for_function("trainer.active && trainer.puzzle && trainerUserTurn() && !trainer.busy", timeout=10000)
    comprobar("Examen" in pg.inner_text("#trainFeedback") and pg.locator("#trainFeedback [data-pz=hint]").count() == 0, "el examen tiene tiempo y no tiene pistas")
    jugar_lo_que_toca(pg)
    pg.wait_for_selector("#examNextBtn", timeout=10000)
    comprobar("Correcto" in pg.inner_text("#trainFeedback"), "acertar un problema del examen")
    pg.click("#examNextBtn")
    pg.wait_for_function("trainer.active && trainer.puzzle && trainerUserTurn() && !trainer.busy", timeout=10000)
    mala = pg.evaluate("(() => { const ok = cur().children[0].uci; return Chess.legal(cur().state).map(m => Chess.uci(m)).find(u => u !== ok && !(() => { const s = Chess.apply(cur().state, Chess.moveFromUci(cur().state, u)); return !Chess.legal(s).length && Chess.inCheck(s); })()); })()")
    casilla(pg, mala[:2]).click(); casilla(pg, mala[2:4]).click()
    pg.wait_for_selector("#examNextBtn", timeout=10000)
    comprobar("La buena era" in pg.inner_text("#trainFeedback"), "fallar en el examen enseña la solución")
    pg.click("#examStopBtn")
    comprobar("Resultado del examen" in pg.inner_text("#trainFeedback") and "nivel estimado" in pg.inner_text("#trainFeedback"), "al terminar el examen se estima tu nivel")
    pg.click("#examBackBtn")
    # Comparación con el repertorio
    pg.evaluate("t => setCollection(t, false, 'mías')", PGN_MIAS)
    pg.evaluate("saveCollGames([0, 1])")
    pg.wait_for_function("Lib.games.size === 2")
    pg.evaluate("settings.myNames = 'rafa'; saveSettings()")
    entrenar(pg, "rep")
    pg.click("#repCompareBtn")
    txt = pg.inner_text("#repCompareOut")
    comprobar("2 partidas" in txt and "Te saliste en 1...e5" in txt and "1...c6" in txt and "Te saliste en 4.Ag5" in txt and "4.cxd5" in txt, "compara tus partidas con tu repertorio y dice dónde te saliste (con el repertorio que más jugadas sigue)")
    pg.locator("#repCompareOut [data-rep]").first.click()
    comprobar(pg.evaluate("ui.lesson && ui.lesson.course") == "repertorios", "desde la comparación se abre la línea del repertorio")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_cpu_adaptativa(browser):
    print("Novedades 1.12: CPU adaptativa")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.click("#playCpuToggle")
    pg.select_option("#cpuLevel", "a")
    comprobar(pg.is_visible("#cpuAdaptiveInfo") and "Empezará en el nivel 5" in pg.inner_text("#cpuAdaptiveInfo"), "el nivel adaptativo explica desde dónde empieza")
    pg.select_option("#cpuClock", "")
    pg.select_option("#cpuColor", "1")
    pg.select_option("#cpuFrom", "new")
    pg.click("#cpuStartBtn")
    comprobar(pg.evaluate("ui.cpu.adaptive && ui.cpu.level === 5") and "adaptativo" in pg.evaluate("game.headers.Black"), "la CPU adaptativa juega en su nivel actual")
    pg.locator("#cpuBox [data-c=resign]").click()
    comprobar("demasiado corta" in pg.inner_text("#cpuBox") and pg.evaluate("LS.get('ajedrezCpuAdaptativa', null)") is None, "una partida demasiado corta no cambia el nivel")
    pg.click('.tab-btn[data-tab="study"]')
    pg.fill("#moveInput", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6")
    pg.click("#importBtn")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.click("#playCpuToggle")
    pg.select_option("#cpuFrom", "here")
    pg.click("#cpuStartBtn")
    pg.wait_for_function("ui.cpu.on && !ui.cpu.thinking", timeout=20000)
    pg.evaluate("ui.cpu.startNode = game.root")
    pg.locator("#cpuBox [data-c=resign]").click()
    comprobar("Nivel adaptativo: 5 → 2" in pg.inner_text("#cpuBox") and pg.evaluate("LS.get('ajedrezCpuAdaptativa').a") == 2, "al perder, el nivel adaptativo baja")
    pg.click("#playCpuToggle")
    comprobar("Nivel actual: 2" in pg.inner_text("#cpuAdaptiveInfo") and "1 partida" in pg.inner_text("#cpuAdaptiveInfo"), "el cuadro muestra tu nivel adaptativo y su evolución")
    pg.select_option("#cpuFrom", "new")
    pg.click("#cpuStartBtn")
    comprobar(pg.evaluate("ui.cpu.level") == 2, "la siguiente partida se juega en el nuevo nivel")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_ayuda_contra_cpu(browser):
    print("Novedades 1.34: «Piensa conmigo» y «Habla con tus piezas» en las partidas contra la CPU")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.click('.tab-btn[data-tab="study"]')
    pg.fill("#moveInput", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6")
    pg.click("#importBtn")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.click("#playCpuToggle")
    pg.select_option("#cpuLevel", "a")
    pg.select_option("#cpuClock", "")
    pg.select_option("#cpuColor", "1")
    pg.select_option("#cpuFrom", "here")
    pg.click("#cpuStartBtn")
    pg.wait_for_function("ui.cpu.on && !ui.cpu.thinking && cur().state.t === 1", timeout=20000)
    comprobar(pg.locator("#cpuBox [data-c=think]").is_visible() and pg.locator("#cpuBox [data-c=talk]").is_visible(), "en la partida contra la CPU están los botones de ayuda")
    pg.locator("#cpuBox [data-c=talk]").click()
    comprobar(pg.is_visible("#talkBox") and pg.evaluate("shapeList().some(s => s.color === 'red')") and pg.evaluate("ui.cpu.helped") == 1, "«Habla con tus piezas» funciona en tu turno y dibuja sus flechas")
    pg.locator("#cpuBox [data-c=think]").click()
    pg.wait_for_function("!Think.busy", timeout=30000)
    comprobar("Piensa conmigo" in pg.inner_text("#thinkBox") and pg.evaluate("ui.cpu.helped") == 2 and "ayuda pedida 2 veces" in pg.inner_text("#cpuBox"), "«Piensa conmigo» explica la posición y se cuenta la ayuda")
    # En el turno de la CPU no se puede
    pg.evaluate("$('thinkBox').hidden = true; Think.node = null; ui.cpu.thinking = true")
    pg.evaluate("thinkWithMe()")
    comprobar("Espera a que juegue la CPU" in pg.inner_text("#toast"), "mientras piensa la CPU, la ayuda espera")
    pg.evaluate("ui.cpu.thinking = false")
    pg.evaluate("ui.cpu.startNode = game.root")
    pg.locator("#cpuBox [data-c=resign]").click()
    comprobar("Partida con ayuda" in pg.inner_text("#cpuBox") and pg.evaluate("LS.get('ajedrezCpuAdaptativa', null)") is None, "una partida con ayuda no cambia el nivel adaptativo")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_mis_repertorios(browser):
    print("Novedades 1.14: mis repertorios, su revisión y el tamaño del tablero")
    ctx = contexto(browser)
    e4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b"
    def explorador(r):
        fen = urllib.parse.parse_qs(urllib.parse.urlparse(r.request.url).query).get("fen", [""])[0]
        datos = {"white": 0, "draws": 0, "black": 0, "moves": []}
        if fen.startswith(e4):
            jug = [("c5", 400), ("e5", 350), ("e6", 150), ("c6", 100)]
            datos = {"white": 400, "draws": 200, "black": 400, "moves": [{"san": s, "uci": "", "white": n // 2, "draws": n // 4, "black": n - n // 2 - n // 4} for s, n in jug]}
        r.fulfill(status=200, content_type="application/json", body=json.dumps(datos), headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("**/explorer.lichess.ovh/**", explorador)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.evaluate("settings.token = 'lip_prueba'; settings.explorerDb = 'lichess'; settings.myNames = 'Yo Mismo'; saveSettings()")
    entrenar(pg, "rep")
    comprobar("Aún no tienes repertorios propios" in pg.inner_text("#myRepList"), "Mis repertorios explica cómo empezar cuando no hay ninguno")
    pg.fill("#repNewName", "Blancas: 1.e4")
    pg.click("#repNewBtn")
    pg.wait_for_function("ui.libId && ui.activeTab === 'study'")
    comprobar(pg.evaluate("ui.tags.includes('repertorio') && Lib.games.get(ui.libId).title === 'Blancas: 1.e4'"), "crear un repertorio lo guarda en la biblioteca con la etiqueta «repertorio» y lo abre")
    jugar = lambda camino, ucis: pg.evaluate(f"""(() => {{ goTo(resolvePath(game.root, {json.dumps(camino)})); for (const u of {json.dumps(ucis)}) playMove(Chess.moveFromUci(cur().state, u), 'user'); }})()""")
    jugar([], ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"])
    jugar(["e2e4"], ["c7c5", "g1f3"])
    jugar(["e2e4"], ["e7e6", "f1a6"])
    pg.wait_for_function("!ui.dirty", timeout=5000)
    comprobar("(1... c5" in pg.evaluate("Lib.games.get(ui.libId).pgn"), "las líneas jugadas en el tablero se guardan solas en el repertorio")
    entrenar(pg, "rep")
    comprobar("3 líneas" in pg.inner_text("#myRepList") and "con blancas" in pg.inner_text("#myRepList").lower(), "la lista muestra el bando y cuántas líneas tiene")
    pg.locator("[data-rep-review]").first.click()
    pg.wait_for_function("!RepReview.busy", timeout=180000)
    rev = pg.inner_text("#repReviewOut")
    comprobar("falta 1...c6" in rev and "falta 1...c5" not in rev and "falta 1...e5" not in rev, "la revisión encuentra los huecos (respuestas frecuentes del rival que faltan) con el explorador de Lichess")
    comprobar("Jugadas dudosas" in rev and "2.Aa6" in rev, "la revisión señala con el motor las jugadas tuyas que pierden material")
    comprobar("Líneas sin tu respuesta" in rev and "Pon tu nombre" not in rev, "la revisión comprueba también las líneas sin terminar y tus partidas")
    pg.locator("#repReviewOut [data-gap]").first.click()
    comprobar(pg.evaluate("ui.activeTab === 'study' && cur().san === 'c6' && cur().parent.san === 'e4'"), "«➕ Prepararla» abre el repertorio en esa posición con la jugada del rival ya hecha")
    jugar(["e2e4", "c7c6"], ["d2d4"])
    pg.wait_for_function("!ui.dirty", timeout=5000)
    comprobar("(1... c6 2. d4)" in pg.evaluate("Lib.games.get(ui.libId).pgn"), "tu respuesta al hueco queda guardada en el repertorio")
    # Una partida tuya en la que el rival se sale del repertorio
    pg.evaluate("""(async () => { const g = Pgn.parseGame('[White "Yo Mismo"]\\n[Black "Rival"]\\n[Result "1-0"]\\n\\n1. e4 d5 2. exd5 Qxd5 3. Nc3 1-0', { lang: 'en' }).game; setGame(g, { name: 'Partida de prueba', noConfirm: true }); await saveToLibrary({ silent: true, force: true }); })()""")
    pg.wait_for_function("[...Lib.games.values()].some(r => r.title === 'Partida de prueba')")
    entrenar(pg, "rep")
    pg.click("#repCompareBtn")
    cmp_txt = pg.inner_text("#repCompareOut")
    comprobar("El rival se salió en 1...d5" in cmp_txt and "Blancas: 1.e4" in cmp_txt and pg.locator("#repCompareOut [data-add]").count() == 1, "la comparación usa tus repertorios y ofrece preparar la línea nueva del rival")
    pg.locator("#repCompareOut [data-add]").first.click()
    comprobar(pg.evaluate("cur().san === 'd5' && cur().parent.san === 'e4' && Lib.games.get(ui.libId).title === 'Blancas: 1.e4'"), "preparar la línea nueva abre tu repertorio con la jugada del rival")
    entrenar(pg, "rep")
    pg.locator("[data-rep-train]").first.click()
    comprobar(pg.evaluate("trainer.active && trainer.side === 1 && trainer.libId === ui.libId"), "▶ Entrenar empieza el entrenamiento del repertorio con su bando")
    pg.click("#stopTrainBtn")
    pg.locator("[data-rep-side]").first.click()
    pg.wait_for_timeout(400)
    comprobar('[Orientation "black"]' in pg.evaluate("[...Lib.games.values()].find(r => r.title === 'Blancas: 1.e4').pgn"), "se puede cambiar el bando de un repertorio")
    pg.select_option("#repFromCourse", "1")
    pg.wait_for_function("ui.libId && Lib.games.get(ui.libId).title.startsWith('Mi repertorio con negras')")
    comprobar(pg.evaluate("ui.flipped && Lib.games.get(ui.libId).tags.includes('repertorio')"), "un repertorio del curso se puede copiar a tus repertorios para cambiarlo")
    pg.evaluate("(() => { const r = [...Lib.games.values()].find(x => x.title === 'Blancas: 1.e4'); r.srs = { box: 1, due: Date.now() - 1000, reps: 1 }; })()")
    comprobar(pg.evaluate("dueCounts().mine.length") == 1, "los repertorios propios pendientes cuentan en el plan de hoy")
    # Tamaño del tablero
    ancho = lambda: pg.evaluate("document.getElementById('board').getBoundingClientRect().width")
    antes = ancho()
    pg.click("#settingsBtn")
    revelar(pg, "#setBoardSize"); pg.locator("#setBoardSize").fill("70")
    comprobar(abs(ancho() - antes * 0.7) < antes * 0.06 and "70 %" in pg.inner_text("#boardSizeVal"), "en Ajustes se puede hacer el tablero más pequeño")
    revelar(pg, "#boardSizeReset") or pg.click("#boardSizeReset")
    comprobar(abs(ancho() - antes) < 2 and pg.evaluate("settings.boardSize") == 100, "«Automático» devuelve el tablero a su tamaño")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_sorpresas_y_planes(browser):
    print("Novedades 1.15: sorpresas y trampas, planes de apertura y cómo estudiar aperturas")
    ctx = contexto(browser)
    tras = {
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w": [("Nf3", 700), ("Bc4", 150), ("Nc3", 100), ("f4", 50)],
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b": [("Nc6", 550), ("d6", 200), ("Ba3", 180), ("Nf6", 70)],
        "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b": [("Nf6", 600), ("Nc6", 300), ("Bc5", 100)],
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b": [("Nf6", 600), ("Nc6", 300), ("Bc5", 100)],
    }
    def explorador(r):
        fen = urllib.parse.parse_qs(urllib.parse.urlparse(r.request.url).query).get("fen", [""])[0]
        jug = next((v for k, v in tras.items() if fen.startswith(k)), [])
        tot = sum(n for _, n in jug)
        datos = {"white": tot // 2, "draws": tot // 4, "black": tot - tot // 2 - tot // 4, "moves": [{"san": s, "uci": "", "white": n // 2, "draws": n // 4, "black": n - n // 2 - n // 4} for s, n in jug]}
        r.fulfill(status=200, content_type="application/json", body=json.dumps(datos), headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("**/explorer.lichess.ovh/**", explorador)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.evaluate("settings.token = 'lip_prueba'; saveSettings()")
    pg.fill("#moveInput", "1. e4 e5")
    pg.click("#importBtn")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.click('.tab-btn[data-tab="explorer"]')
    pg.select_option("#explorerDbSelect", "lichess")
    pg.click("#surpriseBtn")
    pg.wait_for_function("!Surprise.busy && document.getElementById('surpriseOut').textContent.includes('Trampas')", timeout=120000)
    txt = pg.inner_text("#surpriseOut")
    comprobar("Tras 2.Cf3, el 18 % responde 2...Aa3" in txt, "«Sorpresas y trampas» encuentra la trampa: tras 2.Cf3, una respuesta frecuente que pierde")
    comprobar("Sorpresas" in txt and "Errores frecuentes" in txt and "lo mejor según el motor" in txt, "también muestra las sorpresas, los errores frecuentes y la mejor jugada")
    pg.locator("#surpriseOut [data-sp2]").first.click()
    pg.wait_for_timeout(600)
    comprobar(pg.evaluate("cur().san === 'Ba3' && cur().parent.san === 'Nf3'"), "«▶ Verla» juega la trampa en el tablero")
    # Planes de apertura y cómo estudiar aperturas
    pg.click('.tab-btn[data-tab="courses"]')
    comprobar(pg.locator('details[data-course="planes"]').count() == 1, "hay un curso de planes de apertura")
    pg.locator('details[data-course="planes"] summary').click()
    pg.locator('details[data-course="planes"] .lesson-row', has_text="minorías").click()
    comprobar("ataque de minorías" in pg.inner_text("#lessonBox") and pg.locator("#lessonBox [data-l=practice]").count() == 1, "la lección de planes plantea la pregunta y ofrece resolverla")
    pg.locator("#lessonBox [data-l=practice]").click()
    pg.evaluate("trainerUserMove(Chess.moveFromUci(cur().state, 'h2h3'))")
    comprobar("no es la jugada buscada" in pg.inner_text("#trainFeedback"), "en una lección, una jugada distinta se explica como «no es la jugada buscada»")
    pg.evaluate("trainerUserMove(Chess.moveFromUci(cur().state, 'a1b1'))")
    comprobar("Correcto" in pg.inner_text("#trainFeedback"), "la jugada del plan (Tab1) se da por buena")
    pg.evaluate("stopTraining(true)")
    pg.click('.tab-btn[data-tab="courses"]')
    pg.locator('details[data-course="aperturas"] summary').click()
    comprobar(pg.locator('details[data-course="aperturas"] .lesson-row', has_text="Cómo estudiar aperturas").count() == 1, "el curso de aperturas incluye «Cómo estudiar aperturas»")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_tactil_y_tema(browser):
    print("Novedades 1.16: dibujar flechas con el dedo y tema claro")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    comprobar(pg.is_visible("#drawToggle"), "el botón «✏ Dibujar flechas» aparece también en el ordenador (para los paneles táctiles)")
    pg.evaluate("setGame(Pgn.newGame(), { noConfirm: true })")
    cen = lambda n: (lambda b: (b["x"] + b["width"] / 2, b["y"] + b["height"] / 2))(casilla(pg, n).bounding_box())
    (a1, a2), (b1, b2) = cen("d2"), cen("d4")
    pg.keyboard.down("Control"); pg.mouse.move(a1, a2); pg.mouse.down(); pg.mouse.move(b1, b2, steps=4)
    comprobar(pg.locator("#arrowsGroup line[opacity]").count() == 1, "mientras se dibuja se ve la flecha provisional")
    pg.mouse.up(); pg.keyboard.up("Control")
    comprobar(pg.evaluate("JSON.stringify(cur().shapes)") == '[{"color":"green","from":"d2","to":"d4"}]' and not pg.evaluate("game.root.children.length"), "Ctrl + arrastrar dibuja una flecha (sin mover la pieza)")
    pg.mouse.move(a1, a2); pg.mouse.down(button="right"); pg.mouse.move(b1, b2, steps=4)
    pg.mouse.wheel(0, 120)
    pg.mouse.up(button="right")
    comprobar(pg.evaluate("cur().shapes.length") == 0 and pg.evaluate("cur() === game.root"), "con el botón derecho se borra repitiendo la flecha, y la rueda no mueve las jugadas mientras se dibuja")
    pg.evaluate("setGame(Pgn.parseGame('1. e4 e5 2. Nf3 Nc6 *', { lang: 'en' }).game, { noConfirm: true }); goTo(game.root); ui.drawAt = 0")
    pg.mouse.move(a1, a2)
    for _ in range(4): pg.mouse.wheel(0, 8)
    pg.wait_for_timeout(150)
    comprobar(pg.evaluate("cur() === game.root"), "los desplazamientos pequeños de un panel táctil no avanzan jugadas sueltas")
    pg.wait_for_timeout(300)
    pg.mouse.wheel(0, 100)
    pg.wait_for_timeout(150)
    comprobar(pg.evaluate("cur().san") == "e4", "un desplazamiento claro de la rueda sí avanza una jugada")
    pg.click("#settingsBtn")
    revelar(pg, "#setUiTheme") or pg.select_option("#setUiTheme", "light")
    fondo = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    comprobar(pg.evaluate("document.documentElement.dataset.ui") == "light" and fondo == "rgb(242, 244, 247)", "en Ajustes se puede elegir el tema claro")
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    comprobar(pg.evaluate("document.documentElement.dataset.ui") == "light" and pg.evaluate("document.getElementById('setUiTheme').value") == "light", "el tema claro se recuerda al volver a abrir")
    pg.click("#settingsBtn")
    revelar(pg, "#setUiTheme") or pg.select_option("#setUiTheme", "dark")
    comprobar(pg.evaluate("document.documentElement.dataset.ui") is None, "y se puede volver al tema oscuro")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()
    # Automático: sigue el modo del sistema
    ctx = contexto(browser, color_scheme="light")
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("settings.uiTheme = 'auto'; saveSettings(); applyUiTheme()")
    comprobar(pg.evaluate("document.documentElement.dataset.ui") == "light", "«Automático» usa el tema claro si el sistema está en modo claro")
    ctx.close()
    # Tableta táctil: modo dibujo
    ctx = browser.new_context(viewport={"width": 962, "height": 601}, has_touch=True, is_mobile=True)
    for patron in ("**/cdnjs.cloudflare.com/**", "**/unpkg.com/**", "**/cdn.jsdelivr.net/**", "**/*lichess*/**"):
        ctx.route(patron, lambda r: r.abort())
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("setGame(Pgn.newGame(), { noConfirm: true })")
    comprobar(pg.is_visible("#drawToggle") and not pg.is_visible("#drawTools"), "en una pantalla táctil aparece «✏ Dibujar flechas»")
    pg.click("#drawToggle")
    centro = lambda n: (lambda b: (b["x"] + b["width"] / 2, b["y"] + b["height"] / 2))(casilla(pg, n).bounding_box())
    (x1, y1), (x2, y2) = centro("e2"), centro("e4")
    pg.mouse.move(x1, y1); pg.mouse.down(); pg.mouse.move(x2, y2, steps=5); pg.mouse.up()
    comprobar(pg.evaluate("JSON.stringify(cur().shapes)") == '[{"color":"green","from":"e2","to":"e4"}]' and not pg.evaluate("game.root.children.length"), "con el modo dibujo, arrastrar el dedo dibuja una flecha y no mueve la pieza")
    pg.locator('.draw-color[data-color="red"]').click()
    x, y = centro("d5")
    pg.mouse.click(x, y)
    comprobar(pg.evaluate("cur().shapes.some(s => s.from === 'd5' && s.to === 'd5' && s.color === 'red')") and pg.locator("#drawingLayer circle").count() == 1, "tocar una casilla la rodea con el color elegido")
    pg.click("#drawClear")
    comprobar(pg.evaluate("cur().shapes.length") == 0, "🧽 borra las flechas de la posición")
    pg.click("#drawToggle")
    pg.mouse.move(x1, y1); pg.mouse.down(); pg.mouse.move(x2, y2, steps=5); pg.mouse.up()
    comprobar(pg.evaluate("cur().san") == "e4", "al salir del modo dibujo, el dedo vuelve a mover las piezas")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_rival_humano(browser):
    print("Novedades 1.16: rival humano por Elo")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    reparto = """(elo => { const g = Pgn.parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *', {lang:'en'}).game; const n = Pgn.mainlineFrom(g.root).pop();
      const lines = ['d2d3','b1c3','e1g1','d2d4','f3g5'].map((u, i) => ({ cp: [100, 60, 20, -50, -150][i], pv: [u] })); let best = 0;
      for (let i = 0; i < 2000; i++) if (humanPick(n, lines, elo) === 'd2d3') best++; return best / 2000; })"""
    fuerte, flojo = pg.evaluate(f"({reparto})(2200)"), pg.evaluate(f"({reparto})(800)")
    comprobar(fuerte > 0.7 and flojo < 0.45, f"el rival humano fuerte casi siempre elige la mejor ({fuerte:.0%}) y el flojo se equivoca mucho más ({flojo:.0%})")
    pg.click("#playCpuToggle")
    pg.select_option("#cpuLevel", "h1000")
    comprobar(pg.is_visible("#cpuAdaptiveInfo") and "unos 1000 de Elo" in pg.inner_text("#cpuAdaptiveInfo") and pg.is_disabled("#cpuStyle"), "al elegir un rival humano se explica cómo juega (y el estilo no se usa)")
    pg.select_option("#cpuColor", "-1")
    pg.select_option("#cpuClock", "")
    pg.select_option("#cpuFrom", "new")
    pg.click("#cpuStartBtn")
    pg.wait_for_function("ui.cpu.on && !ui.cpu.thinking && cur().state.t === -1", timeout=20000)
    primera = pg.evaluate("cur().uci")
    comprobar(pg.evaluate("ui.cpu.human") == 1000 and pg.evaluate("game.headers.White") == "Rival humano ~1000" and primera in pg.evaluate("ECO_BOOK.filter(e => e.ucis).map(e => e.ucis[0])"), "el rival humano empieza con una apertura del libro y aparece como «Rival humano ~1000»")
    pg.evaluate("playMove(Chess.legal(cur().state)[0], 'user')")
    pg.wait_for_function("ui.cpu.on && !ui.cpu.thinking && cur().state.t === -1", timeout=20000)
    comprobar("humano ~1000" in pg.inner_text("#cpuBox"), "el panel de la partida muestra el rival humano")
    pg.locator("#cpuBox [data-c=resign]").click()
    pg.locator("#cpuBox [data-c=rematch]").click()
    comprobar(pg.evaluate("ui.cpu.on && ui.cpu.human === 1000 && ui.cpu.side === -1"), "la revancha es contra el mismo rival humano, con los colores cambiados")
    pg.locator("#cpuBox [data-c=stop]").click()
    pg.click("#playCpuToggle")
    pg.select_option("#cpuLevel", "8")
    comprobar(not pg.is_disabled("#cpuStyle") and pg.is_hidden("#cpuAdaptiveInfo"), "los niveles normales siguen como antes (con su estilo)")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_rival_explorador_y_piensa(browser):
    print("Novedades 1.17: preparar un rival, valoración en el explorador y «Piensa conmigo»")
    ctx = contexto(browser)
    partidas = []
    for i in range(3):
        partidas.append(f'[Event "Rated blitz game"]\n[White "Alguien{i}"]\n[Black "RivalX"]\n[Result "1-0"]\n[Termination "Time forfeit"]\n\n1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 1-0')
    for i in range(2):
        partidas.append(f'[Event "Rated blitz game"]\n[White "RivalX"]\n[Black "Otro{i}"]\n[Result "1-0"]\n[Termination "Normal"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 1-0')
    partidas.append('[Event "Rated blitz game"]\n[White "Otro9"]\n[Black "RivalX"]\n[Result "1-0"]\n[Termination "Normal"]\n\n1. e4 { [%eval 0.3] } e5 { [%eval 0.3] } 2. Nf3 { [%eval 0.3] } f6 { [%eval 2.5] } 3. Nxe5 { [%eval 2.4] } fxe5 { [%eval 4.0] } 4. Qh5+ { [%eval 4.1] } 1-0')
    pgn_rival = "\n\n".join(partidas) + "\n"
    def lichess_api(r):
        url = r.request.url
        if "/api/games/user/RivalX" in url:
            r.fulfill(status=200, content_type="application/x-chess-pgn", body=pgn_rival, headers={"Access-Control-Allow-Origin": "*"})
        elif "/api/cloud-eval" in url:
            fen = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("fen", [""])[0]
            if fen.startswith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w"):
                r.fulfill(status=200, content_type="application/json", body=json.dumps({"depth": 45, "knodes": 9000, "pvs": [{"moves": "e2e4 e7e5", "cp": 31}, {"moves": "d2d4 d7d5", "cp": 24}]}), headers={"Access-Control-Allow-Origin": "*"})
            else:
                r.fulfill(status=404, body="{}", headers={"Access-Control-Allow-Origin": "*"})
        else:
            r.abort()
    ctx.route("**/lichess.org/api/**", lichess_api)
    def explorador(r):
        datos = {"white": 500, "draws": 300, "black": 200, "moves": [{"san": s, "uci": "", "white": n // 2, "draws": n // 4, "black": n - n // 2 - n // 4, "averageRating": 2400} for s, n in [("e4", 500), ("d4", 350), ("Nf3", 150)]], "topGames": []}
        r.fulfill(status=200, content_type="application/json", body=json.dumps(datos), headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("**/explorer.lichess.ovh/**", explorador)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.evaluate("settings.token = 'lip_prueba'; settings.explorerDb = 'masters'; saveSettings()")
    # Valoración en el explorador
    pg.evaluate("setGame(Pgn.newGame(), { noConfirm: true })")
    pg.click('.tab-btn[data-tab="explorer"]')
    pg.wait_for_function("[...document.querySelectorAll('#explorerMovesBody .exp-eval')].length === 3 && [...document.querySelectorAll('#explorerMovesBody .exp-eval')].every(td => td.textContent !== '…')", timeout=60000)
    celdas = pg.evaluate("[...document.querySelectorAll('#explorerMovesBody .exp-eval')].map(td => td.textContent)")
    comprobar(celdas[0] == "+0.31☁" and celdas[1] == "+0.24☁" and celdas[2].endswith("⚙"), f"el explorador muestra la valoración de cada jugada (nube de Lichess ☁ y, si falta, el motor ⚙): {celdas}")
    # Preparar un rival: crea antes un repertorio propio con 1.e4 e5
    pg.evaluate("""(async () => { const g = Pgn.parseGame('1. e4 e5 2. Nf3 Nc6 *', { lang: 'en' }).game; setGame(g, { name: 'Mi 1.e4', tags: ['repertorio'], noConfirm: true }); await saveToLibrary({ silent: true, force: true }); })()""")
    pg.wait_for_function("[...Lib.games.values()].some(r => r.title === 'Mi 1.e4')")
    pg.click('.tab-btn[data-tab="explorer"]')
    pg.fill("#rivalUser", "RivalX")
    pg.click("#rivalBtn")
    pg.wait_for_function("!Rival.busy && document.getElementById('rivalOut').textContent.includes('Sus líneas')", timeout=60000)
    txt = pg.inner_text("#rivalOut")
    comprobar("6 partidas (2 con blancas, 4 con negras)" in txt and "Contra 1.e4: 1...d5 (75 %)" in txt, "el informe del rival resume sus partidas y sus primeras jugadas con cada color")
    comprobar("3 fueron por tiempo" in txt and "se apura con el reloj" in txt, "detecta que pierde a menudo por tiempo")
    comprobar("En su única partida analizada en Lichess cometió 2 errores" in txt and "la mayoría en la apertura" in txt, "cuenta sus errores en las partidas analizadas y dice en qué fase falla")
    comprobar("Mi 1.e4" in txt and "1.e4 d5" in txt and "(3 partidas)" in txt, "encuentra las líneas del rival que se salen de tu repertorio")
    pg.locator("#rivalOut [data-rv]").first.click()
    comprobar(pg.evaluate("cur().san === 'd5' && Lib.games.get(ui.libId).title === 'Mi 1.e4'"), "«➕ Prepararla» abre tu repertorio con la jugada del rival")
    # Piensa conmigo
    pg.evaluate("setGame(Pgn.newGame('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'), { noConfirm: true })")
    pg.click("#thinkBtn")
    pg.wait_for_function("!Think.busy && document.getElementById('thinkBox').textContent.includes('La situación')", timeout=60000)
    piensa = pg.inner_text("#thinkBox")
    comprobar("Dxf7#" in piensa and "mate en 1" in piensa and "Lo que va a pasar" in piensa, "«Piensa conmigo» encuentra la mejor jugada y explica el razonamiento")
    pg.locator("#thinkBox [data-t=play]").click()
    comprobar(pg.evaluate("cur().san") == "Qxf7#" and pg.is_hidden("#thinkBox"), "desde «Piensa conmigo» se puede jugar la jugada propuesta")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_reloj_dos_jugadores_y_ventaja(browser):
    print("Novedades 1.18: tiempos de reloj, dos jugadores y ventaja de material")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pgn = """[White "Yo"]
[Black "Rival"]
[Result "0-1"]
[TimeControl "180+2"]

1. e4 { [%eval 0.3] [%clk 0:03:00] } e5 { [%eval 0.3] [%clk 0:03:00] } 2. Nf3 { [%eval 0.3] [%clk 0:02:58] } Nc6 { [%eval 0.3] [%clk 0:02:59] } 3. Bc4 { [%eval 0.3] [%clk 0:02:40] } Nf6 { [%eval 0.3] [%clk 0:02:55] } 4. Ng5 { [%eval 0.3] [%clk 0:00:25] } d5 { [%eval 0.3] [%clk 0:02:50] } 5. exd5 { [%eval 0.3] [%clk 0:00:20] } Nxd5 { [%eval 0.3] [%clk 0:02:45] } 6. Qf3 { [%eval -3.0] [%clk 0:00:12] } Qxg5 { [%eval -3.0] [%clk 0:02:40] } 0-1"""
    pg.evaluate(f"setGame(Pgn.parseGame({json.dumps(pgn)}, {{ lang: 'en' }}).game, {{ noConfirm: true }})")
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root)[6])")
    comprobar(pg.is_visible("#topClock") and {pg.inner_text("#topClock"), pg.inner_text("#bottomClock")} == {"2:55", "0:25"}, "los tiempos de reloj de la partida se ven en las barras de los jugadores al recorrerla")
    tip = pg.evaluate("document.querySelector(`.mv[data-id='${Pgn.mainlineFrom(game.root)[6].id}']`).title")
    comprobar("tardó 2:17" in tip and "le quedaban 0:25" in tip, "al pasar por una jugada se ve cuánto tardó y cuánto le quedaba")
    comprobar("[%clk 0:00:25]" in pg.evaluate("Pgn.exportPgn(game)"), "los tiempos se conservan al exportar el PGN")
    pg.evaluate("ui.report = buildGameReport([game.root, ...Pgn.mainlineFrom(game.root)]); renderGameReport()")
    rep = pg.inner_text("#reportExtra")
    comprobar("El reloj" in rep and "la jugada que más pensó fue 4.Cg5 (2:17)" in rep and "errores los cometió con poco tiempo" in rep, "el informe explica cómo se usó el reloj y qué errores se cometieron con poco tiempo")
    # Dos jugadores
    pg.click("#playCpuToggle")
    pg.select_option("#cpuOpponent", "two")
    comprobar(pg.is_disabled("#cpuLevel") and pg.is_visible("#cpuFlipWrap") and pg.is_hidden("#cpuOddsWrap"), "al elegir «otra persona» se ocultan las opciones de la CPU y aparece «girar el tablero»")
    pg.select_option("#cpuColor", "1"); pg.select_option("#cpuClock", "3+2"); pg.select_option("#cpuFrom", "new")
    pg.check("#cpuAutoFlip")
    pg.click("#cpuStartBtn")
    comprobar(pg.evaluate("ui.cpu.on && ui.cpu.two") and "dos jugadores" in pg.inner_text("#cpuBox") and pg.evaluate("game.headers.Event") == "Partida entre dos jugadores", "empieza una partida entre dos jugadores")
    pg.evaluate("playMove(Chess.moveFromUci(cur().state, 'e2e4'), 'user')")
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("cur().san === 'e4' && ui.flipped && !ui.cpu.thinking") and pg.evaluate("canUserMove()"), "nadie juega por las negras: le toca a la otra persona, y el tablero se gira")
    pg.evaluate("playMove(Chess.moveFromUci(cur().state, 'e7e5'), 'user')")
    comprobar(pg.evaluate("!ui.flipped && cur().clk != null && cur().parent.clk != null"), "con reloj, cada jugada guarda el tiempo que quedaba")
    pg.locator("#cpuBox [data-c=resign]").click()
    comprobar("Se rinden las blancas" in pg.inner_text("#cpuBox") and pg.evaluate("game.headers.Result") == "0-1", "se rinde el bando al que le toca mover")
    # Ventaja de material contra la CPU
    pg.click("#playCpuToggle")
    pg.select_option("#cpuOpponent", "cpu")
    pg.select_option("#cpuLevel", "1"); pg.select_option("#cpuColor", "1"); pg.select_option("#cpuClock", ""); pg.select_option("#cpuFrom", "new")
    pg.select_option("#cpuOdds", "cpu:q")
    pg.click("#cpuStartBtn")
    comprobar(pg.evaluate("game.root.state.b[3] === '.' && game.headers.SetUp === '1'") and "ventaja: la CPU sin la dama" in pg.evaluate("game.headers.Event"), "con ventaja, la CPU empieza sin la dama")
    pg.locator("#cpuBox [data-c=stop]").click()
    pg.click("#playCpuToggle")
    pg.select_option("#cpuOdds", "me:r"); pg.select_option("#cpuColor", "1")
    pg.click("#cpuStartBtn")
    comprobar(pg.evaluate("game.root.state.b[112] === '.' && !(game.root.state.c & 2)"), "y también se puede dar ventaja tú (sin la torre de a1 y sin enroque largo)")
    pg.locator("#cpuBox [data-c=stop]").click()
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_filtros_avanzados(browser):
    print("Novedades 1.19: filtros avanzados en la biblioteca y en los .pgn")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("settings.myNames = 'Yo Mismo'; saveSettings()")
    partidas = [
        ("Yo Mismo", "Ana", "1800", "1700", "2024.03.01", "1-0", "180+2", "B90", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0"),
        ("Luis", "Yo Mismo", "1900", "1850", "2023.05.10", "1-0", "600+0", "C60", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0"),
        ("Yo Mismo", "Eva", "1500", "1550", "2025.01.20", "1/2-1/2", "60+0", "D35", "1. d4 d5 2. c4 e6 3. Nc3 Nf6 1/2-1/2"),
        ("Kasparov", "Karpov", "2740", "2720", "1985.10.15", "0-1", "", "B44", "1. e4 c5 2. Nf3 e6 3. d4 cxd4 0-1"),
    ]
    for w, b, we, be, d, r, tc, eco, mv in partidas:
        pgn = f'[White "{w}"]\n[Black "{b}"]\n[WhiteElo "{we}"]\n[BlackElo "{be}"]\n[Date "{d}"]\n[Result "{r}"]\n' + (f'[TimeControl "{tc}"]\n' if tc else "") + f'[ECO "{eco}"]\n\n{mv}'
        pg.evaluate(f"""(async () => {{ setGame(Pgn.parseGame({json.dumps(pgn)}, {{ lang: 'en' }}).game, {{ noConfirm: true, name: {json.dumps(w + ' - ' + b)} }}); await saveToLibrary({{ silent: true, force: true }}); }})()""")
    pg.wait_for_function("Lib.games.size === 4")
    pg.click('.tab-btn[data-tab="library"]')
    pg.locator("#libAdv summary").click()
    filas = lambda: pg.locator("#libBody tr").count()
    pg.fill("#libEloMin", "1800"); pg.wait_for_timeout(400)
    comprobar(filas() == 2 and "Elo medio" in pg.inner_text("#libAdvStats"), "filtrar por Elo medio mínimo deja sólo esas partidas y muestra su resumen")
    pg.fill("#libEloMin", ""); pg.select_option("#libSpeed", "blitz"); pg.wait_for_timeout(400)
    comprobar(filas() == 1 and "Yo Mismo - Ana" in pg.inner_text("#libBody"), "filtrar por ritmo (blitz) usa el control de tiempo")
    pg.select_option("#libSpeed", ""); pg.select_option("#libColor", "1"); pg.wait_for_timeout(400)
    comprobar(filas() == 2 and "tu puntuación: 75 %" in pg.inner_text("#libAdvStats"), "filtrar las partidas en las que juego con blancas, con mi puntuación")
    pg.select_option("#libColor", ""); pg.select_option("#libResult", "loss"); pg.wait_for_timeout(400)
    comprobar(filas() == 1 and "Luis - Yo Mismo" in pg.inner_text("#libBody"), "filtrar las partidas que perdí")
    pg.select_option("#libResult", ""); pg.fill("#libEco", "B40-B99"); pg.wait_for_timeout(400)
    comprobar(filas() == 2, "filtrar por un rango de aperturas ECO")
    pg.fill("#libEco", ""); pg.fill("#libYearMax", "1999"); pg.wait_for_timeout(400)
    comprobar(filas() == 1 and "Kasparov" in pg.inner_text("#libBody") and "1 activo" in pg.inner_text("#libAdvCount"), "filtrar por año, con el número de filtros activos")
    pg.click("#libAdvClear"); pg.wait_for_timeout(300)
    comprobar(filas() == 4, "«Quitar filtros» vuelve a mostrar todas")
    # En un .pgn abierto
    pg.evaluate("setCollection(SAMPLE_MULTI_PGN, false, 'Antología'); switchSub('collection')")
    total = pg.evaluate("Coll.games.length")
    pg.locator("#dbAdv summary").click()
    pg.fill("#dbYearMax", "1900"); pg.wait_for_timeout(400)
    viejas = pg.evaluate("collFiltered().length")
    comprobar(0 < viejas < total and pg.evaluate("collFiltered().every(i => +(Coll.games[i].headers.Date || '0').slice(0, 4) <= 1900)"), f"los filtros también funcionan en un .pgn abierto ({viejas} de {total} anteriores a 1900)")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_importar_curso(browser):
    print("Novedades 1.21: añadir cursos desde un .pgn")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("window.prompt = (m, d) => d")   # acepta el nombre propuesto
    pg.click('.tab-btn[data-tab="courses"]')
    antes = pg.locator("#courseList details.course").count()
    pg.set_input_files("#courseFileInput", str(ROOT / "cursos" / "trampas.pgn"))
    pg.wait_for_function(f"document.querySelectorAll('#courseList details.course').length === {antes + 1}")
    curso = pg.locator("#courseList details.course").last
    comprobar("Trampas y miniaturas" in curso.inner_text() and curso.locator(".lesson-row").count() == 6 and "0 de 6" in curso.inner_text(), "un curso en .pgn se añade a la pestaña Cursos con sus lecciones")
    curso.locator(".lesson-row", has_text="Réti").click()
    comprobar("Réti – Tartakower" in pg.inner_text("#lessonBox"), "las lecciones del curso añadido se abren con su panel")
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root).pop()); renderLesson()")
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("(() => { const c = COURSES.find(x => x.user); return (courseDone()[c.id] || []).includes(2); })()"), "al terminar una lección del curso añadido, queda marcada")
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    pg.evaluate("window.prompt = (m, d) => d")
    pg.click('.tab-btn[data-tab="courses"]')
    comprobar(pg.locator("#courseList details.course").count() == antes + 1 and "1 de 6" in pg.locator("#courseList details.course").last.inner_text(), "el curso añadido y su progreso se conservan al recargar")
    # Un .pgn de partidas normales (sin título ni número) también sirve como curso
    sueltas = '[Event "Torneo del club"]\n[White "Ana"]\n[Black "Luis"]\n[Date "2025.03.01"]\n\n1. e4 e5 2. Nf3 Nc6 *\n\n[Event "Torneo del club"]\n[White "Eva"]\n[Black "Ana"]\n\n1. d4 d5 *\n'
    pg.evaluate(f"importCourseFile(new File([{json.dumps(sueltas)}], 'club.pgn'))")
    pg.wait_for_function(f"document.querySelectorAll('#courseList details.course').length === {antes + 2}")
    texto = pg.locator("#courseList details.course").last.inner_text()
    comprobar("Torneo del club" in texto and "Ana – Luis (2025)" in texto and "Eva – Ana" in texto, "un .pgn de partidas sin título ni número se convierte en curso (con títulos y números)")
    pg.locator("#courseList details.course").last.locator("[data-rmc]").click()
    comprobar(pg.locator("#courseList details.course").count() == antes + 1, "un curso añadido se puede quitar")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_marcadores_y_velocidad(browser):
    print("Novedades 1.23: marcadores a mano y velocidad del modo Auto")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("setGame(Pgn.parseGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *', { lang: 'en' }).game, { noConfirm: true, name: 'Española de prueba' })")
    comprobar(pg.is_hidden("#gameMarksBox"), "sin marcadores no aparece el recuadro de marcadores")
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root)[4])")
    pg.click("#markBtn")   # 1.53: con las jugadas en la columna derecha, el de debajo de la lista se oculta (es el mismo)
    pg.wait_for_selector("#markModal.open")
    comprobar("Marcar jugada" in pg.inner_text("#markTitle") and "tras 3.Ab5" in pg.inner_text("#markWhere"), "«📌 Marcar jugada» abre el cuadro para esa jugada (guardando antes la partida)")
    pg.locator("#markCats .cat-chip", has_text="Favorita").click()
    pg.fill("#markNote", "La Española: el alfil presiona c6")
    pg.click("#markSaveBtn")
    pg.wait_for_function("!document.getElementById('gameMarksBox').hidden", timeout=5000)
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root)[8])")
    pg.keyboard.press("m")
    pg.wait_for_selector("#markModal.open")
    pg.fill("#markNote", "Enroque")
    pg.click("#markSaveBtn")
    pg.wait_for_function("document.querySelectorAll('#gameMarksBox .gm-row').length === 2", timeout=5000)
    caja = pg.inner_text("#gameMarksBox")
    comprobar("Marcadores de esta partida (2)" in caja and "3.Ab5" in caja and "el alfil presiona c6" in caja and "5.O-O" in caja, "los marcadores de la partida aparecen debajo de las jugadas, en orden y con su nota")
    pg.evaluate("goTo(game.root)")
    pg.locator("#gameMarksBox .gm-row").first.click()
    comprobar(pg.evaluate("cur().san") == "Bb5", "un clic en un marcador lleva a esa jugada")
    pg.locator("#gameMarksBox [data-allmarks]").click()
    comprobar(pg.evaluate("ui.activeTab === 'library'") and pg.is_visible("#sub-marks"), "«Ver todos» abre la lista de todos los marcadores")
    # Velocidad del modo Auto
    pg.click('.tab-btn[data-tab="study"]')
    pg.evaluate("goTo(game.root)")
    pg.click("#playBtn")
    comprobar(pg.is_visible("#autoSpeedRow") and pg.input_value("#autoSpeed") == "2000", "al pulsar ▶ Auto aparece el selector de velocidad (Normal: 2 s)")
    pg.select_option("#autoSpeed", "500")
    pg.wait_for_timeout(1300)
    rapido = pg.evaluate("Pgn.pathTo(cur()).length - 1")
    comprobar(rapido >= 2 and pg.evaluate("settings.autoplayMs") == 500, f"con «Muy rápida» avanza cada medio segundo ({rapido} jugadas en 1,3 s)")
    pg.select_option("#autoSpeed", "6000")
    antes = pg.evaluate("Pgn.pathTo(cur()).length")
    pg.wait_for_timeout(1500)
    comprobar(pg.evaluate("Pgn.pathTo(cur()).length") == antes, "con «Muy lenta» no avanza en un segundo y medio")
    pg.click("#playBtn")
    comprobar(pg.is_hidden("#autoSpeedRow") and pg.input_value("#setAutoSpeed") == "6000", "al pausar se oculta el selector, y la velocidad queda guardada en Ajustes")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_habla_con_tus_piezas(browser):
    print("Novedades 1.24: «Habla con tus piezas»")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.evaluate("setGame(Pgn.newGame('r1bq1rk1/pp2bppp/2np1n2/4p3/4P3/N1N5/PPP1BPPP/R1BQ1RK1 w - - 0 10'), { noConfirm: true })")
    pg.click("#talkBtn")
    pg.wait_for_function("!Talk.busy && !document.getElementById('talkBox').hidden && document.getElementById('talkEngine') && !document.getElementById('talkEngine').textContent.startsWith('⏳')", timeout=30000)
    txt = pg.inner_text("#talkBox")
    comprobar("La entrevista" in txt and "El caballo de a3" in txt and "en la banda" in txt and pg.locator("#talkBox .talk-row").first.inner_text().startswith("😤"), "la entrevista encuentra la pieza más infeliz (el caballo en la banda)")
    comprobar("Su hogar ideal sería d5" in txt and "puesto avanzado" in txt and "Ca3 → c4 → e3 → d5" in txt, "propone la casilla soñada (d5) y la ruta para llegar")
    comprobar("Los peones no se entrevistan" in txt and "motor" in pg.inner_text("#talkEngine"), "recuerda que los peones no se entrevistan y el motor revisa la maniobra")
    comprobar(pg.evaluate("Talk.shapes.length") == 5, "dibuja la ruta en el tablero (pieza, flechas y casilla soñada)")
    pg.locator("#talkBox .talk-row", has_text="El alfil de e2").click()
    pg.wait_for_function("!Talk.busy", timeout=30000)
    comprobar("de la pieza elegida: El alfil de e2" in pg.inner_text("#talkBox"), "se puede «hablar» con cualquier pieza pulsándola")
    pg.locator("#talkBox [data-k=rival]").click()
    pg.wait_for_function("!Talk.busy", timeout=30000)
    comprobar("negras (el rival)" in pg.inner_text("#talkBox") and "Profilaxis" in pg.inner_text("#talkBox"), "«Escuchar al rival» hace la entrevista a las piezas del rival (profilaxis)")
    pg.locator("#talkBox [data-k=rival]").click()
    pg.wait_for_function("!Talk.busy && document.getElementById('talkBox').textContent.includes('Ca3 → c4')", timeout=30000)
    pg.locator("#talkBox [data-k=play]").click()
    comprobar(pg.evaluate("cur().san") == "Nc4" and pg.is_hidden("#talkBox"), "«▶ Jugar» hace la primera jugada de la ruta")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_paquetes_de_problemas(browser):
    print("Paquetes de problemas descargables")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    entrenar(pg, "puzzles")
    # Paquetes descargables: se sirven desde la carpeta problemas/ del repositorio (sin red)
    base = pg.evaluate("PUZZLES.length")
    pg.locator("#packBox").evaluate("e => e.open = true")
    comprobar(pg.locator("#packList .pack-row").count() == 5 and "1500 problemas" in pg.inner_text("#packList"), "«Más problemas» ofrece los paquetes por nivel")
    pg.route("**/problemas/*.json", lambda r: r.abort())
    pg.click('[data-pack-get="basico"]')
    pg.wait_for_function("document.querySelector('.toast.show') && document.querySelector('.toast').textContent.includes('No se pudo descargar')", timeout=10000)
    comprobar(pg.evaluate("PUZZLES.length") == base and pg.is_visible('[data-pack-get="basico"]'), "sin conexión avisa y no cambia nada")
    pg.unroute("**/problemas/*.json")
    pg.route("**/problemas/*.json", lambda r: r.fulfill(path=str(ROOT / "problemas" / r.request.url.rsplit("/", 1)[1]), content_type="application/json"))
    pg.click('[data-pack-get="basico"]')
    pg.wait_for_function(f"PUZZLES.length === {base + 1500}", timeout=15000)
    pg.wait_for_selector('[data-pack-del="basico"]', timeout=5000)
    comprobar(pg.is_visible('[data-pack-del="basico"]') and "+1500" in pg.inner_text("#packBadge") and "Enfilada" in pg.inner_text("#puzzleTheme")
              and f"({base + 1500})" in pg.inner_text("#puzzleTheme"), "descargar un paquete añade sus problemas y sus temas al banco")
    pg.reload(); pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    pg.wait_for_function(f"PUZZLES.length === {base + 1500}", timeout=10000)
    comprobar(True, "el paquete queda guardado en el navegador y vuelve al recargar")
    entrenar(pg, "puzzles")
    pg.select_option("#puzzleTheme", "skewer"); pg.select_option("#puzzleCount", "5")
    pg.click("#puzzleStartBtn")
    pg.wait_for_function("trainer.active && trainer.puzzle && trainerUserTurn() && !trainer.busy", timeout=10000)
    comprobar(pg.evaluate("Puz.cur.pack === 'basico' && Puz.cur.themes.includes('skewer')") and "Enfilada" not in pg.inner_text("#trainFeedback"), "los problemas del paquete se entrenan igual que los demás (y no se chiva el tema antes de resolver)")
    jugar_lo_que_toca(pg)
    pg.wait_for_function("document.getElementById('trainFeedback').textContent.includes('Enfilada')", timeout=10000)
    comprobar(True, "al resolverlo dice su tema")
    pg.click("#stopPuzzlesBtn")
    entrenar(pg, "puzzles")
    pg.locator("#packBox").evaluate("e => e.open = true")
    pg.click('[data-pack-del="basico"]')
    pg.wait_for_function(f"PUZZLES.length === {base}", timeout=5000)
    pg.wait_for_selector('[data-pack-get="basico"]', timeout=5000)
    comprobar(pg.is_visible('[data-pack-get="basico"]') and not pg.is_visible("#packBadge"), "«Quitar» lo retira del banco")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_sincronizacion(browser):
    print("Novedades 1.32: sincronizar entre dispositivos con un archivo compartido")
    import json as _json, tempfile
    archivo = {"txt": "", "m": 1000}
    escrituras = []
    # El archivo compartido vive aquí; cada «dispositivo» lo ve a través de un selector de archivos simulado
    INIT = """
      window.__mk = () => ({ name: 'ajedrezbase-sync.json',
        getFile: async () => { const f = JSON.parse(await window.__rd()); return { lastModified: f.m, text: async () => f.txt }; },
        createWritable: async () => { let pend = ''; return { write: async t => { pend = t; }, close: async () => { await window.__wr(pend); } }; },
        queryPermission: async () => 'granted', requestPermission: async () => 'granted' });
      window.showSaveFilePicker = async () => window.__mk();
      window.showOpenFilePicker = async () => [window.__mk()];
    """
    def dispositivo(nombre):
        ctx = contexto(browser)
        ctx.expose_function("__rd", lambda: _json.dumps(archivo))
        def wr(txt):
            archivo["txt"] = txt; archivo["m"] += 1
            escrituras.append(nombre)
        ctx.expose_function("__wr", wr)
        ctx.add_init_script(INIT)
        pg, errores = nueva_pagina(ctx)
        return ctx, pg, errores
    guardar = "async (a) => { const r = Pgn.parseGame(a[1]); await importRecords([recordFromGame(r.game, { title: a[0] })], []); refreshLibraryViews(); }"
    titulos = lambda pg: sorted(pg.evaluate("[...Lib.games.values()].map(r => r.title)"))
    def al_dia(pg):
        pg.evaluate("syncCheck()")
        pg.wait_for_function("!syncBusy && !syncTimer && !syncDirty", timeout=10000)
    ctxA, A, errA = dispositivo("A")
    ctxB, B, errB = dispositivo("B")
    comprobar(not A.is_visible("#syncChip"), "sin archivo vinculado no hay indicador en la cabecera")
    A.evaluate(guardar, ["Uno", "1. e4 e5 2. Nf3 Nc6 *"])
    A.click("#settingsBtn"); revelar(A, "#syncStatus")
    comprobar("Sin archivo vinculado" in A.inner_text("#syncStatus") and A.is_visible('[data-sync="new"]'), "Ajustes ofrece vincular un archivo")
    A.click('[data-sync="new"]')
    A.wait_for_function("syncState === 'ok' && !syncBusy && !syncDirty", timeout=10000)
    datos = _json.loads(archivo["txt"])
    comprobar(datos["app"] == "AjedrezBase" and datos["sync"] == 1 and [g["title"] for g in datos["games"]] == ["Uno"] and "id" not in datos["games"][0],
              "crear el archivo guarda en él la biblioteca")
    comprobar("Al día" in A.inner_text("#syncStatus") and A.is_visible('[data-sync="now"]') and A.inner_text("#syncChip") == "☁", "el estado pasa a «Al día» y aparece ☁ arriba")
    A.keyboard.press("Escape")
    # Segundo dispositivo, con cosas propias: se combinan
    B.evaluate(guardar, ["Dos", "1. d4 d5 2. c4 e6 *"])
    B.evaluate("LS.set('ajedrezProblemas', { p1: { reps: 3, due: 9, box: 2 }, p2: { reps: 1, due: 4, box: 1 } }); LS.set('ajedrezActividad', { '2026-11-01': { puzzle: 4 } })")
    A.evaluate("LS.set('ajedrezProblemas', { p1: { reps: 1, due: 5, box: 1 } }); LS.set('ajedrezActividad', { '2026-11-01': { puzzle: 2, card: 1 } })")
    al_dia(A)
    B.click("#settingsBtn"); revelar(B, "#syncStatus"); B.click('[data-sync="open"]')
    B.wait_for_function("syncState === 'ok' && !syncBusy && !syncDirty && Lib.games.size === 2", timeout=10000)
    B.keyboard.press("Escape")
    comprobar(titulos(B) == ["Dos", "Uno"], "al vincular el archivo en otro dispositivo se combinan las dos bibliotecas")
    comprobar(B.evaluate("LS.get('ajedrezProblemas', {})") == {"p1": {"reps": 3, "due": 9, "box": 2}, "p2": {"reps": 1, "due": 4, "box": 1}}
              and B.evaluate("LS.get('ajedrezActividad', {})['2026-11-01']") == {"puzzle": 4, "card": 1}, "el progreso se une entrada a entrada, sin perder nada")
    al_dia(A)
    comprobar(titulos(A) == ["Dos", "Uno"] and A.evaluate("LS.get('ajedrezProblemas', {}).p1.reps") == 3, "el primer dispositivo recibe lo del segundo")
    comprobar("Sincronizado" in A.inner_text(".toast"), "avisa de lo que ha llegado")
    n = len(escrituras)
    for pg in (A, B, A, B):
        pg.evaluate("syncNow({ force: true })"); pg.wait_for_function("!syncBusy", timeout=10000)
    comprobar(len(escrituras) == n, "cuando los dos tienen lo mismo, nadie vuelve a escribir el archivo")
    # Un cambio se guarda solo, y gana el más reciente
    B.evaluate("(async () => { const r = [...Lib.games.values()].find(x => x.title === 'Uno'); r.fav = true; await DB.put('games', r); })()")
    B.wait_for_function("!syncBusy && !syncTimer && !syncDirty", timeout=10000)
    comprobar(len(escrituras) == n + 1 and escrituras[-1] == "B", "un cambio se guarda solo en el archivo a los pocos segundos")
    al_dia(A)
    comprobar(A.evaluate("[...Lib.games.values()].find(x => x.title === 'Uno').fav") is True and A.evaluate("Lib.games.size") == 2, "el cambio llega al otro dispositivo sin duplicar la partida")
    # Borrar en uno borra en el otro
    A.evaluate("(async () => { const r = [...Lib.games.values()].find(x => x.title === 'Dos'); await DB.delMany('games', [r.id]); Lib.games.delete(r.id); refreshLibraryViews(); })()")
    A.wait_for_function("!syncBusy && !syncTimer && !syncDirty", timeout=10000)
    al_dia(B)
    comprobar(titulos(B) == ["Uno"], "lo que se borra en un dispositivo se borra en el otro")
    al_dia(A)
    comprobar(titulos(A) == ["Uno"], "y no vuelve")
    # La misma partida guardada por separado en los dos no se duplica
    for pg in (A, B):
        pg.evaluate(guardar, ["Tres", "1. c4 e5 2. Nc3 Nf6 *"])
        pg.wait_for_function("!syncBusy && !syncTimer && !syncDirty", timeout=10000)
    al_dia(A); al_dia(B); al_dia(A)
    comprobar(titulos(A) == ["Tres", "Uno"] and titulos(B) == ["Tres", "Uno"] and len(_json.loads(archivo["txt"])["games"]) == 2, "la misma partida guardada en los dos queda una sola vez")
    # Ajustes: viajan, salvo los propios de cada dispositivo
    B.evaluate("settings.token = 'lip_secreto'; saveSettings()")
    B.click("#settingsBtn"); revelar(B, "#themeSelect"); B.select_option("#themeSelect", "coral"); B.keyboard.press("Escape")
    B.wait_for_function("!syncBusy && !syncTimer && !syncDirty", timeout=10000)
    al_dia(A)
    comprobar(A.evaluate("settings.theme") == "coral" and A.evaluate("document.body.dataset.theme") == "coral" and A.evaluate("settings.token") == "", "los ajustes llegan y se aplican sin recargar")
    comprobar("lip_secreto" not in archivo["txt"], "el token de Lichess no sale del dispositivo")
    # Un archivo que no es de AjedrezBase no se pisa
    bueno = archivo["txt"]
    archivo["txt"] = '{"hola": 1}'; archivo["m"] += 1
    A.evaluate("syncCheck()"); A.wait_for_function("!syncBusy && syncErr", timeout=10000)
    A.click("#settingsBtn"); revelar(A, "#syncStatus")
    comprobar("no es un archivo de sincronización" in A.inner_text("#syncStatus") and archivo["txt"] == '{"hola": 1}' and A.inner_text("#syncChip") == "⚠", "un archivo ajeno no se sobrescribe y se avisa")
    archivo["txt"] = bueno; archivo["m"] += 1
    A.click('[data-sync="now"]'); A.wait_for_function("!syncBusy && !syncErr", timeout=10000)
    A.click('[data-sync="unlink"]')
    A.wait_for_function("syncState === 'none'", timeout=5000)
    comprobar("Sin archivo vinculado" in A.inner_text("#syncStatus") and not A.is_visible("#syncChip") and A.evaluate("Lib.games.size") == 2, "desvincular deja los datos en el navegador")
    A.keyboard.press("Escape")
    comprobar(not errA and not errB, "sin errores de JavaScript" + (": " + "; ".join(errA + errB) if errA or errB else ""))
    # Copia de seguridad completa: se restaura combinando, también donde no se puede vincular un archivo
    ctxC = contexto(browser)
    ctxC.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; try { delete Window.prototype.showSaveFilePicker; delete Window.prototype.showOpenFilePicker; } catch (e) {}")
    C, errC = nueva_pagina(ctxC)
    C.wait_for_function("syncState === 'unsupported'", timeout=10000)
    C.click("#settingsBtn")
    comprobar("Copia de seguridad" in C.inner_text("#syncStatus") and C.locator("#syncBtns button").count() == 0, "donde el navegador no puede vincular un archivo, se explica la alternativa")
    C.keyboard.press("Escape")
    C.evaluate(guardar, ["Cuatro", "1. Nf3 d5 *"])
    copia = pathlib.Path(tempfile.mkdtemp()) / "copia.json"
    copia.write_text(_json.dumps(B.evaluate("syncPayload()")), encoding="utf-8")
    C.click('.tab-btn[data-tab="library"]')
    C.set_input_files("#jsonFileInput", str(copia))
    C.wait_for_function("Lib.games.size === 3", timeout=10000)
    comprobar(titulos(C) == ["Cuatro", "Tres", "Uno"] and C.evaluate("LS.get('ajedrezProblemas', {}).p2.reps") == 1 and "Copia restaurada" in C.inner_text(".toast"),
              "«Restaurar copia» trae partidas y progreso y los combina con lo que había")
    C.evaluate("(async () => { const r = [...Lib.games.values()].find(x => x.title === 'Uno'); await DB.delMany('games', [r.id]); Lib.games.delete(r.id); })()")
    C.set_input_files("#jsonFileInput", str(copia))
    C.wait_for_function("Lib.games.size === 3", timeout=10000)
    comprobar(titulos(C) == ["Cuatro", "Tres", "Uno"], "restaurar recupera también lo que se había borrado")
    vieja = pathlib.Path(tempfile.mkdtemp()) / "vieja.json"
    vieja.write_text(_json.dumps({"app": "AjedrezBase", "version": 3, "games": [{"id": 7, "title": "Antigua", "pgn": "1. b3 e5 *"}], "marks": []}), encoding="utf-8")
    C.set_input_files("#jsonFileInput", str(vieja))
    C.wait_for_function("Lib.games.size === 4", timeout=10000)
    comprobar("Antigua" in titulos(C), "las copias de versiones anteriores se siguen pudiendo restaurar")
    comprobar(not errC, "sin errores de JavaScript" + (": " + "; ".join(errC) if errC else ""))
    ctxA.close(); ctxB.close(); ctxC.close()


def prueba_tu_semana(browser):
    print("Novedades 1.31: «Tu semana»")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.click('.tab-btn[data-tab="tools"]')
    comprobar("aún sin actividad" in pg.inner_text("#weekSummary"), "sin actividad, «Tu semana» lo dice")
    pg.locator("#weekBox").evaluate("e => e.open = true")
    comprobar("plan de hoy" in pg.inner_text("#weekBody") and pg.locator("#weekBody [data-week]").count() == 1, "y propone empezar por el plan de hoy")
    # Actividad simulada: ayer y anteayer con problemas (la horquilla, floja), y dos días de la semana anterior
    pg.evaluate("""() => {
      const key = n => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
      const a = {};
      a[key(1)] = { puzzle: 6, lesson: 1, pzOk: 3, pzFail: 3, pzTh: { fork: [4, 3], mate: [2, 0] }, nivel: 1260 };
      a[key(2)] = { puzzle: 4, pzOk: 4, pzFail: 0, pzTh: { pin: [4, 0] }, nivel: 1290 };
      a[key(8)] = { puzzle: 2, nivel: 1210 };
      a[key(9)] = { puzzle: 1, nivel: 1200 };
      localStorage.setItem('ajedrezActividad', JSON.stringify(a));
      localStorage.setItem('ajedrezNivelProblemas', JSON.stringify({ r: 1260, n: 13 }));
      renderToday();
    }""")
    txt = pg.inner_text("#weekSummary")
    comprobar("2 de 7 días" in txt and "11 actividades" in txt and "↗" in txt, "el titular resume los días entrenados y la actividad, y dice si sube")
    cuerpo = pg.inner_text("#weekBody")
    comprobar("10 problemas" in cuerpo and "1 lección" in cuerpo and "2 días y 3 actividades" in cuerpo, "detalla lo hecho y lo compara con los 7 días anteriores")
    comprobar("7 de 10 a la primera (70 %)" in cuerpo and "nivel 1260" in cuerpo and "+50 en la semana" in cuerpo, "acierto en los problemas y cuánto ha cambiado el nivel")
    comprobar("Horquilla" in cuerpo and "1 de 4 a la primera" in cuerpo, "señala el tema que más se ha resistido en la semana")
    pg.click('#weekBody [data-week="theme:fork"]')
    pg.wait_for_function("trainer.active && trainer.puzzle && trainerUserTurn() && !trainer.busy", timeout=10000)
    comprobar(pg.evaluate("Puz.cur.themes.includes('fork')"), "«Practicarlo» abre problemas de ese tema")
    jugar_lo_que_toca(pg)
    pg.wait_for_function("document.getElementById('trainFeedback').textContent.includes('Tu nivel')", timeout=10000)
    hoy = pg.evaluate("actDays()[dayKey()]")
    comprobar(hoy["puzzle"] == 1 and hoy["pzOk"] + hoy["pzFail"] == 1 and "fork" in hoy["pzTh"] and hoy["nivel"] > 0, "cada problema resuelto anota el acierto, sus temas y el nivel del día")
    comprobar("3 de 7 días" in pg.inner_text("#weekSummary") and pg.evaluate("streakInfo().cur") == 3, "y el resumen se actualiza (sin que esos datos alteren la racha)")
    pg.click("#stopPuzzlesBtn")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_geometria_y_ciegas(browser):
    print("Novedades 1.25: ruta del caballo, rebotes del alfil y problemas a ciegas")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    comprobar(pg.evaluate("bishopCircuit(Chess.sqIdx('d2'), -15).map(Chess.sqName).join(' ')") == "h6 f8 a3 c1"
              and pg.evaluate("bishopCircuit(Chess.sqIdx('g8'), 15).map(Chess.sqName).join(' ')") == "a2 b1 h7",
              "los rebotes del alfil salen como en el vídeo (d2: h6 f8 a3 c1; g8: a2 b1 h7)")
    comprobar(pg.evaluate("knightPath(knightBfs(Chess.sqIdx('d2')), Chess.sqIdx('h7')).length") == 4, "el caballo va de d2 a h7 en tres saltos")
    fen0 = pg.evaluate("Chess.toFen(game.current.state)")
    entrenar(pg, "blind")
    # Ruta del caballo
    pg.select_option("#visMode", "knight")
    pg.click("#visStartBtn")
    comprobar(pg.evaluate("ui.visBoard && ui.visBoard.b[Vis.q.from] === 'N' && ui.visBoard.b.filter(p => p !== '.').length === 1")
              and "Ruta del caballo · 1 de 10" in pg.inner_text("#visBox"), "la ruta del caballo pone un caballo solo en el tablero")
    for sq in pg.evaluate("Vis.q.path.slice(1).map(Chess.sqName)"):
        casilla(pg, sq).click()
    comprobar("Correcto" in pg.inner_text("#visBox") and pg.locator("#arrowsGroup line").count() == pg.evaluate("Vis.q.dist"), "marcar la ruta más corta es un acierto y se dibuja con flechas")
    pg.locator("#visBox [data-v=next]").click()
    frm = pg.evaluate("Vis.q.from")
    mala = pg.evaluate("Chess.sqName([...Array(128).keys()].find(x => !(x & 0x88) && x !== Vis.q.from && !TALK_N.includes(x - Vis.q.from)))")
    casilla(pg, mala).click()
    comprobar("no puede saltar" in pg.inner_text("#visBox") and pg.evaluate("Vis.q.route.length") == 0, "un salto imposible se avisa sin contar como fallo")
    pg.locator("#visBox [data-v=give]").click()
    comprobar("La más corta" in pg.inner_text("#visBox") and "cambia de color en cada salto" in pg.inner_text("#visBox"), "«Ver la solución» enseña la ruta y el truco del color")
    pg.locator("#visBox [data-v=end]").click()
    comprobar("1 de 2 aciertos" in pg.inner_text("#visBox") and pg.evaluate("ui.visBoard") is None and pg.evaluate("Chess.toFen(viewState())") == fen0, "al terminar vuelve la partida del tablero, intacta")
    # Rebotes del alfil
    pg.select_option("#visMode", "bishop")
    pg.click("#visStartBtn")
    for sq in pg.evaluate("Vis.q.bounces.map(Chess.sqName)"):
        casilla(pg, sq).click()
    comprobar("Correcto" in pg.inner_text("#visBox") and "como la del alfil" in pg.inner_text("#visBox"), "marcar en orden los rebotes del alfil")
    pg.locator("#visBox [data-v=next]").click()
    mala = pg.evaluate("Chess.sqName([...Array(128).keys()].find(x => !(x & 0x88) && x !== Vis.q.bounces[0] && x !== Vis.q.sq))")
    casilla(pg, mala).click()
    comprobar("rebota en" in pg.inner_text("#visBox") and pg.evaluate("Vis.bad") == 1, "un rebote equivocado enseña el recorrido correcto")
    pg.locator("#visBox [data-v=end]").click()
    # Caballo esquivando al alfil
    pg.select_option("#visMode", "dodge")
    pg.click("#visStartBtn")
    ok = pg.evaluate("""(() => { const q = Vis.q; return ui.visBoard.b[q.bsq] === 'b' && q.path.slice(1).every(x => !q.blocked.has(x)) && q.dist >= 3; })()""")
    comprobar(ok and "sin pisar ninguna casilla" in pg.inner_text("#visBox"), "con el alfil, la ruta más corta evita sus casillas")
    pisada = pg.evaluate("(() => { const x = TALK_N.map(d => Vis.q.from + d).find(x => !(x & 0x88) && Vis.q.blocked.has(x) && x !== Vis.q.bsq); return x == null ? '' : Chess.sqName(x); })()")
    if pisada:
        casilla(pg, pisada).click()
        comprobar("se come al caballo" in pg.inner_text("#visBox"), "pisar una casilla del alfil es un fallo")
    pg.locator("#visBox [data-v=end]").click()
    # Problemas a ciegas
    pg.select_option("#visMode", "blindpz")
    comprobar(pg.is_visible("#visSecs") and not pg.is_visible("#visPlies"), "en «problemas a ciegas» se elige el tiempo para memorizar")
    pg.select_option("#visSecs", "5")
    pg.click("#visStartBtn")
    pg.wait_for_function("trainer.active && trainer.puzzle && Puz.blindPhase === 'look'", timeout=10000)
    comprobar("Memoriza la posición" in pg.inner_text("#trainFeedback") and not pg.evaluate("ui.blind"), "primero se ve la posición unos segundos")
    pg.locator("#trainFeedback [data-pz=hide]").click()
    comprobar(pg.evaluate("ui.blind && boardEl.classList.contains('blind')") and "de memoria" in pg.inner_text("#trainFeedback"), "después se ocultan las piezas")
    for _ in range(4):
        if not pg.evaluate("trainer.active"):
            break
        pg.wait_for_function("!trainer.active || !trainer.busy", timeout=10000)
        if not pg.evaluate("trainer.active"):
            break
        u = pg.evaluate("cur().children[0].uci")
        casilla(pg, u[:2]).click(); casilla(pg, u[2:4]).click()
        pg.wait_for_timeout(300)
    pg.wait_for_function("!trainer.active", timeout=10000)
    comprobar("Resuelto a ciegas" in pg.inner_text("#trainFeedback") and not pg.evaluate("ui.blind"), "al resolverlo se vuelven a ver las piezas")
    comprobar(pg.evaluate("puzRating().n") == 0, "los problemas a ciegas no cambian tu nivel de problemas")
    pg.click("#stopPuzzlesBtn")
    comprobar("Problemas a ciegas: 1 de 1" in pg.inner_text("#trainFeedback"), "resumen de los problemas a ciegas")
    pg.click("#puzzlesBackBtn")
    # Curso de geometría: el estudio de Réti como ejercicio
    pg.click('.tab-btn[data-tab="courses"]')
    pg.locator('details[data-course="geometria"] summary').click()
    comprobar(pg.locator('details[data-course="geometria"] .lesson-row').count() == 6, "el curso «📐 Geometría del tablero» tiene sus seis lecciones")
    pg.locator('details[data-course="geometria"] .lesson-row', has_text="Réti").click()
    comprobar(pg.is_visible("#lessonBox") and "Réti" in pg.inner_text("#lessonBox") and pg.evaluate("Chess.toFen(game.root.state)").startswith("7K/8/k1P5/7p"), "la lección del estudio de Réti se abre en el tablero")
    casilla(pg, "h8").click(); casilla(pg, "g7").click()
    pg.wait_for_timeout(400)
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).some(n => n.san === 'Kg7')") and "diagonal" in pg.inner_text("#lessonBox"), "en el ejercicio, 1.Rg7 es la jugada buena")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_que_hago_ahora(browser):
    print("Novedades 1.40: curso «¿Qué hago ahora?» y «Practicar» explica los errores de la lección")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true; setGame(Pgn.newGame(), { noConfirm: true })")
    pg.click('.tab-btn[data-tab="courses"]')
    pg.locator('details[data-course="decisiones"] summary').click()
    filas = pg.locator('details[data-course="decisiones"] .lesson-row')
    comprobar(filas.count() == 25 and pg.evaluate("courseLessons('decisiones').every(l => l.exercise)"), "el curso «🤔 ¿Qué hago ahora?» tiene 25 situaciones, todas para resolver")
    filas.filter(has_text="qué me amenaza").click()
    comprobar(pg.is_visible("#lessonBox") and "amenaza" in pg.inner_text("#lessonBox") and pg.evaluate("ui.flipped"), "la lección se abre con su pregunta, desde el lado de quien mueve (negras)")
    pg.locator("#lessonBox [data-l=practice]").click()
    pg.wait_for_function("trainer.active && trainerUserTurn()")
    casilla(pg, "g8").click(); casilla(pg, "f6").click()
    pg.wait_for_timeout(200)
    txt = pg.inner_text("#trainFeedback")
    comprobar(pg.evaluate("cur() === game.root") and "error" in txt and "Qxf7#" in pg.evaluate("$('trainFeedback').textContent.replace('Dxf7#', 'Qxf7#')") and pg.evaluate("trainer.errors") == 1,
              "en «Practicar», jugar el error de la lección (3...Cf6??) no cuenta como correcto: se explica la respuesta (Dxf7#)")
    casilla(pg, "d8").click(); casilla(pg, "e7").click()
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("cur().parent === game.root && cur().san") == "Qe7" and "❌" not in pg.inner_text("#trainFeedback") and pg.evaluate("trainer.errors") == 1, "una alternativa válida de la lección (3...De7) sí se acepta")
    pg.evaluate("if (trainer.active) exitTraining()")
    pg.click('.tab-btn[data-tab="courses"]')
    filas.filter(has_text="última fila").click()
    pg.locator("#lessonBox [data-l=practice]").click()
    pg.wait_for_function("trainer.active && trainerUserTurn()")
    pg.click("#hintTrainBtn"); pg.click("#hintTrainBtn")
    comprobar(pg.evaluate("trainer.hintArrow && Chess.sqName(trainer.hintArrow.from) + Chess.sqName(trainer.hintArrow.to)") == "g2g3", "la pista enseña la jugada buena, nunca la marcada como error")
    pg.evaluate("if (trainer.active) exitTraining()")
    # El curso de geometría ya no da por buenas las jugadas que explica como errores
    pg.click('.tab-btn[data-tab="courses"]')
    pg.locator('details[data-course="geometria"] summary').click()
    pg.locator('details[data-course="geometria"] .lesson-row', has_text="Réti").click()
    pg.locator("#lessonBox [data-l=practice]").click()
    pg.wait_for_function("trainer.active && trainerUserTurn()")
    casilla(pg, "h8").click(); casilla(pg, "h7").click()
    pg.wait_for_timeout(200)
    comprobar(pg.evaluate("cur() === game.root") and "error" in pg.inner_text("#trainFeedback"), "en el estudio de Réti, 1.Rh7? ya no cuenta como correcta")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_contrarreloj(browser):
    print("Novedades 1.41: contrarreloj de problemas")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true; setGame(Pgn.parseGame('1. e4 e5 2. Nf3', { lang: 'en' }).game, { noConfirm: true })")
    nivel = pg.evaluate("puzRating().r")
    entrenar(pg, "puzzles")
    pg.click("#rushBtn3")
    pg.wait_for_function("Puz.rush && trainer.active && trainerUserTurn() && !trainer.busy")
    comprobar("Contrarreloj" in pg.inner_text("#trainFeedback") and "3:00" in pg.inner_text("#trainFeedback") or "2:5" in pg.inner_text("#trainFeedback"), "⚡ Contrarreloj 3 min: empieza el reloj con el primer problema")
    escalera = pg.evaluate("[Puz.cur.rating, ...Puz.queue.slice(0, 15).map(p => p.rating)]")
    comprobar(escalera[0] < 900 and sum(escalera[-5:]) / 5 > sum(escalera[:5]) / 5, "los problemas empiezan fáciles y se van endureciendo")
    pg.click("#hintTrainBtn") if pg.is_visible("#hintTrainBtn") else None
    comprobar(not pg.evaluate("trainer.hintArrow") and pg.evaluate("trainer.hints") == 0, "sin pistas")
    # Las promesas tienen límite propio y atrapan cualquier error: si no, una excepción en la página dejaría
    # esperando a la prueba para siempre (pasó en la CI con un problema cuya solución era la única jugada legal)
    jugar = """(fallo) => new Promise(res => { const t0 = Date.now(); const go = () => { try {
        if (!Puz.rush) return res("fin");
        if (Date.now() - t0 > 15000) return res("atasco");
        if (!(trainer.active && trainerUserTurn() && !trainer.busy)) return setTimeout(go, 40);
        const g = cur().children[0].move;
        const otra = fallo ? Chess.legal(cur().state).find(m => !(m.from === g.from && m.to === g.to && (m.promotion || '') === (g.promotion || ''))) : null;
        playMove(otra || g, 'user');
        setTimeout(() => res(fallo && !otra ? "sin alternativa" : "ok"), 120);
      } catch (e) { res("error: " + e.message); } }; go(); })"""
    for _ in range(8):
        if pg.evaluate("Puz.ok") >= 2: break
        pg.evaluate(jugar, False)
    comprobar(pg.evaluate("Puz.ok") >= 2 and pg.evaluate("Puz.rush.strikes") == 0, "cada problema resuelto suma y pasa solo al siguiente")
    r = pg.evaluate(jugar, True)
    while r == "sin alternativa":
        r = pg.evaluate(jugar, True)
    comprobar(r == "ok" and pg.evaluate("Puz.rush && Puz.rush.strikes") == 1, "un fallo es una cruz y se pasa al siguiente")
    for _ in range(12):
        if not pg.evaluate("!!Puz.rush"): break
        r = pg.evaluate(jugar, True)
        if r.startswith("error") or r == "atasco": break
    comprobar(not r.startswith("error") and r != "atasco", "la contrarreloj sigue fluida con varios fallos seguidos" + ("" if not (r.startswith("error") or r == "atasco") else f" ({r})"))
    pg.wait_for_function("!Puz.rush")
    ok = pg.evaluate("Puz.ok")
    comprobar("terminada" in pg.inner_text("#trainFeedback") and "récord" in pg.inner_text("#trainFeedback") and pg.evaluate("rushRecords()[180]") == ok, "con tres fallos se acaba y se guarda el récord")
    comprobar(pg.evaluate("puzRating().r") == nivel and pg.evaluate("Object.keys(puzSrs()).length") == 0, "no cambia tu nivel de problemas ni los repasos")
    pg.click("#puzzlesBackBtn")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == 3 and str(ok) in pg.inner_text("#rushInfo"), "«Volver a tu partida» la recupera, y el récord se ve junto al botón")
    pg.click("#rushBtn5")
    pg.wait_for_function("Puz.rush && trainer.active")
    pg.click("#stopTrainBtn") if pg.is_visible("#stopTrainBtn") else pg.click("#trainFeedback [data-pz=end]")
    comprobar(not pg.evaluate("!!Puz.rush") and not pg.evaluate("trainer.active"), "se puede terminar en cualquier momento")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_colores_jugadas(browser):
    print("Novedades 1.42: colores en las jugadas de la pieza elegida")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    pg.evaluate("$('welcomeBox').hidden = true; loadFen('r1bqkb1r/pppp1p1p/2n2np1/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 5')")
    casilla(pg, "g1").click()
    comprobar(pg.locator(".square.target").count() == 2 and pg.locator(".square[class*=' q-']").count() == 0 and not pg.is_visible("#moveQLegend"), "sin activar, las jugadas legales se ven como siempre")
    casilla(pg, "g1").click()
    pg.keyboard.press("c")
    comprobar(pg.evaluate("settings.moveColors") and pg.is_checked("#moveColorsToggle"), "la tecla C (o el interruptor «🎨 Colores») activa la ayuda")
    # Posición inequívoca para cualquier motor y cualquier velocidad: el caballo puede comerse una dama sin defensa
    # (antes se usaba una posición de diferencias pequeñas y, en la CI, el motor interno a poca profundidad valoraba distinto)
    pg.evaluate("loadFen('4k3/8/8/3q4/8/4N3/PP6/4K3 w - - 0 1')")
    casilla(pg, "e3").click()
    pg.wait_for_function("MoveQ.done", timeout=30000)
    clases = pg.evaluate("Object.fromEntries([...document.querySelectorAll('.square.target')].map(e => [e.dataset.sq, e.className.split(' ').find(c => c.startsWith('q-'))]))")
    d5, g4 = str(pg.evaluate("Chess.sqIdx('d5')")), str(pg.evaluate("Chess.sqIdx('g4')"))
    comprobar(clases.get(d5) == "q-best" and clases.get(g4) == "q-blunder" and len(clases) == 8 and pg.is_visible("#moveQLegend"),
              "al elegir el caballo, comer la dama (Cxd5) sale en verde y cualquier otra jugada en rojo; y aparece la leyenda")
    comprobar("pierde" in (pg.get_attribute(f'.square[data-sq="{g4}"]', "title") or ""), "cada casilla dice cuánto pierde esa jugada")
    casilla(pg, "e3").click()
    pg.evaluate("loadFen('r1bqkb1r/pppp1p1p/2n2np1/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 5')")
    casilla(pg, "g1").click()
    pg.wait_for_function("MoveQ.done", timeout=30000)
    casilla(pg, "e2").click()
    pg.wait_for_timeout(200)
    comprobar(pg.evaluate("cur().san") == "Ne2" and not pg.is_visible("#moveQLegend"), "se juega pulsando el destino, y al soltar la pieza desaparecen los colores")
    # En los ejercicios no se puede usar (destriparía la solución)
    entrenar(pg, "puzzles")
    pg.click("#puzzleStartBtn")
    pg.wait_for_function("trainer.active && trainerUserTurn() && !trainer.busy", timeout=20000)
    casilla(pg, pg.evaluate("Chess.sqName(cur().children[0].move.from)")).click()
    pg.wait_for_timeout(600)
    comprobar(pg.locator(".square[class*=' q-']").count() == 0 and not pg.evaluate("MoveQ.busy"), "en los problemas y ejercicios no colorea nada")
    pg.evaluate("exitTraining()")
    pg.click("#puzzlesBackBtn") if pg.is_visible("#puzzlesBackBtn") else None
    # Contra la CPU sí, pero cuenta como ayuda
    pg.evaluate("setGame(Pgn.newGame(), { noConfirm: true }); ui.flipped = false")
    pg.click("#playCpuToggle")
    pg.select_option("#cpuOpponent", "cpu")
    pg.select_option("#cpuColor", "1") if pg.locator("#cpuColor option[value='1']").count() else None
    pg.click("#cpuStartBtn")
    pg.wait_for_function("ui.cpu.on && !ui.cpu.thinking && cur().state.t === ui.cpu.side * -1", timeout=20000)
    comprobar(pg.locator("#cpuBox [data-c=colors]").count() == 1 and "on" in (pg.get_attribute("#cpuBox [data-c=colors]", "class") or ""), "contra la CPU hay un botón «🎨 Colores» en el panel de la partida")
    mio = "e2" if pg.evaluate("ui.cpu.side") == -1 else "e7"
    casilla(pg, mio).click()
    pg.wait_for_function("MoveQ.done", timeout=30000)
    comprobar(pg.locator(".square[class*=' q-']").count() >= 1 and pg.evaluate("ui.cpu.helped") == 1 and "ayuda" in pg.inner_text("#cpuBox"), "y al usarlo cuenta como ayuda pedida")
    casilla(pg, mio).click(); casilla(pg, mio).click()
    pg.wait_for_function("MoveQ.done", timeout=30000)
    comprobar(pg.evaluate("ui.cpu.helped") == 1, "mirar otra vez en la misma posición no suma otra ayuda")
    pg.evaluate("stopCpu(true)")
    pg.evaluate("setMoveColors(false)")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_ayudas_profesor(browser):
    print("Novedades 1.43: radar, voz, nivel de las explicaciones, modo profesor y profesor IA")
    ctx = contexto(browser)
    # Voz: se sustituye la síntesis del navegador para ver qué se leería
    ctx.add_init_script("""(() => { window.__dicho = []; const synth = { speak(u) { window.__dicho.push(u.text); setTimeout(() => u.onend && u.onend(), 30); }, cancel() {}, getVoices() { return [{ lang: 'es-ES', name: 'prueba' }]; }, onvoiceschanged: null };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      window.SpeechSynthesisUtterance = function (t) { this.text = t; }; })();""")
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    pg.evaluate("$('welcomeBox').hidden = true; loadFen('r1bqkb1r/pppp1ppp/2n5/4p1N1/2B1n3/2N5/PPPP1PPP/R1BQK2R w KQkq - 0 5')")
    # 1. Radar
    comprobar(pg.locator(".radar-ring").count() == 0, "sin activar, el radar no marca nada")
    pg.keyboard.press("r")
    rojo = pg.evaluate("[...document.querySelectorAll('.radar-ring.danger')].map(e => Chess.sqName(+e.closest('.square').dataset.sq))")
    azul = sorted(pg.evaluate("[...document.querySelectorAll('.radar-ring.chance')].map(e => Chess.sqName(+e.closest('.square').dataset.sq))"))
    comprobar(rojo == ["g5"] and azul == ["e4", "f7"] and pg.is_visible("#radarLegend"), "🛡 Radar (tecla R): rojo el caballo de g5 (atacado y sin defensa); azul el caballo de e4 y el peón de f7, que se pueden ganar")
    comprobar("sin defensa" in (pg.get_attribute(".radar-ring.danger", "title") or ""), "cada anillo dice por qué está en peligro")
    pg.evaluate("setBlind(true)")
    comprobar(not pg.is_visible(".radar-ring.danger"), "con las piezas ocultas no se ven los anillos")
    pg.evaluate("setBlind(false); setRadar(false)")
    # 2 y 3. Nivel de las explicaciones y voz en «Piensa conmigo»
    pg.evaluate("loadFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 4'); setExplainLevel('basic')")
    pg.click("#thinkBtn")
    pg.wait_for_function("!Think.busy && $('thinkBox').querySelector('h3')", timeout=60000)
    txt = pg.inner_text("#thinkBox")
    comprobar("Para recordar" in txt and not any(c in txt.split("2. La mejor jugada")[0] for c in ["+0.", "−0.", "+1.", "−1."]) and pg.locator("#thinkBox ol li").count() <= 3,
              "en el nivel de iniciación, «Piensa conmigo» no da cifras, enseña menos jugadas y añade una regla para recordar")
    pg.select_option("#thinkBox .explain-level", "advanced")
    pg.wait_for_function("!Think.busy && $('thinkBox').textContent.includes('Línea completa')", timeout=60000)
    comprobar(pg.evaluate("settings.explainLevel") == "advanced" and "profundidad" in pg.inner_text("#thinkBox"), "el selector del propio recuadro cambia al nivel avanzado: más detalle y la línea completa")
    pg.evaluate("setExplainLevel('club')")
    comprobar(pg.locator("#thinkBox .speak-btn").count() == 1, "cada explicación tiene su botón 🔊")
    pg.click("#thinkBox .speak-btn")
    pg.wait_for_function("window.__dicho.length > 0")
    dicho = pg.evaluate("window.__dicho[0]")
    comprobar("Piensa conmigo" in dicho and not any(x in dicho for x in ["🧠", "▶ Jugar"]) and (" captura en " in dicho or " a " in dicho), "🔊 lee la explicación con la notación en palabras, sin emojis ni botones")
    comprobar(pg.evaluate("chessToSpeech('3. Cxf7+ O-O 12...Txe1#')") == "3. caballo captura en f7, jaque enroque corto 12. torre captura en e1, mate", "«3. Cxf7+» se lee «caballo captura en f7, jaque»")
    pg.evaluate("settings.voiceAuto = true; window.__dicho = []; $('thinkBox').hidden = true; Think.node = null")
    pg.click("#thinkBtn")
    pg.wait_for_function("window.__dicho.length > 0", timeout=60000)
    comprobar(True, "con «Leer automáticamente», cada explicación nueva se lee sola")
    pg.evaluate("settings.voiceAuto = false; $('thinkBox').hidden = true; Think.node = null")
    # 5. Modo profesor contra la CPU (desde una posición fija, para que la prueba no dependa de lo que juegue la CPU)
    pg.evaluate("const g = Pgn.parseGame('1. e4 e5', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() }); ui.flipped = false")
    pg.click("#playCpuToggle")
    pg.select_option("#cpuOpponent", "cpu"); pg.select_option("#cpuColor", "1"); pg.select_option("#cpuClock", ""); pg.select_option("#cpuFrom", "here")
    pg.check("#cpuCoachChk")
    pg.click("#cpuStartBtn")
    pg.wait_for_function("ui.cpu.on && !ui.cpu.thinking && cur().state.t === 1", timeout=20000)
    comprobar("on" in (pg.get_attribute("#cpuBox [data-c=tutor]", "class") or ""), "🎓 el modo profesor se activa en el cuadro de la partida (y tiene su botón)")
    jugadas = pg.evaluate("Pgn.mainlineFrom(game.root).length")
    casilla(pg, "f1").click(); casilla(pg, "a6").click()
    pg.wait_for_function("ui.cpu.coach || (!ui.cpu.checking && !ui.cpu.thinking && cur().state.t === 1)", timeout=30000)
    comprobar(pg.is_visible(".coach-banner") and "error" in pg.inner_text(".coach-banner") and pg.evaluate("cur().state.t") == -1 and pg.evaluate("cur().san") == "Ba6",
              "2.Aa6?? (regala el alfil) para la partida: el profesor avisa del error antes de que juegue la CPU")
    pg.click(".coach-banner [data-c=tutorShow]")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == jugadas and pg.evaluate("cur().state.t") == 1 and pg.evaluate("shapeList().some(s => s.color === 'blue')") and pg.evaluate("ui.cpu.helped") >= 1,
              "«Otra vez, viendo la buena» deshace la jugada, enseña la mejor con una flecha azul y cuenta como ayuda")
    casilla(pg, "g1").click(); casilla(pg, "f3").click()
    pg.wait_for_function("cur().state.t === 1 && !ui.cpu.thinking && !ui.cpu.checking", timeout=30000)
    comprobar(pg.evaluate("!ui.cpu.coach") and not pg.is_visible(".coach-banner") and pg.evaluate("Pgn.mainlineFrom(game.root).length") == jugadas + 2, "una buena jugada (2.Cf3) no se interrumpe: la CPU responde")
    pg.evaluate("stopCpu(true); settings.cpuCoach = false")
    # 4. Profesor IA (Ollama y Gemini simulados)
    comprobar(not pg.is_visible("#aiBox"), "sin proveedor, el recuadro del profesor IA no aparece y no se envía nada")
    pedido = {}
    def ollama(r):
        pedido["ollama"] = json.loads(r.request.post_data)
        r.fulfill(status=200, headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, body=json.dumps({"message": {"role": "assistant", "content": "**Desarrolla** el caballo con Cf3.\n- Controla el centro.\n<img src=x onerror=alert(1)>"}}))
    ctx.route("http://localhost:11434/api/chat", ollama)
    ctx.route("http://localhost:11434/api/tags", lambda r: r.fulfill(status=200, headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, body=json.dumps({"models": [{"name": "qwen2.5:7b"}]})))
    pg.evaluate("setGame(Pgn.parseGame('1. e4 e5', { lang: 'en' }).game, { noConfirm: true, current: Pgn.parseGame('1. e4 e5', { lang: 'en' }).game.root }); goEnd()")
    pg.click("#settingsBtn")
    revelar(pg, "#setAiProvider") or pg.select_option("#setAiProvider", "ollama")
    pg.evaluate("settings.aiWatch = false")   # 1.58: esta prueba mira las reglas del modo de siempre, no la vigilancia
    comprobar(pg.is_visible("#aiUrlRow") and not pg.is_visible("#aiKeyRow") and "tu ordenador" in pg.inner_text("#aiNote"), "Ajustes: con Ollama se pide la dirección y no una clave")
    revelar(pg, "#aiTestBtn") or pg.click("#aiTestBtn")
    pg.wait_for_function("$('aiTestResult').textContent.includes('Funciona')", timeout=15000)
    pg.keyboard.press("Escape")
    comprobar(pg.is_visible("#aiBox"), "con un proveedor elegido aparece el recuadro de preguntas")
    pg.click("#aiBox [data-aiq]")
    pg.wait_for_function("$('aiAnswer').querySelector('.ai-text')", timeout=60000)
    u = pedido["ollama"]["messages"][1]["content"]
    ok = "FEN" in u and "Mejores líneas del motor" in u and "Pregunta del alumno" in u and pedido["ollama"]["model"] == "qwen2.5:7b" and "No inventes jugadas" in pedido["ollama"]["messages"][0]["content"]
    if not ok: print("    (lo que recibió la IA:)", u[:600].replace("\n", " | "))
    comprobar(ok, "a la IA se le da la posición, las líneas del motor y la pregunta, con la orden de no inventar jugadas")
    comprobar(pg.locator("#aiAnswer .ai-text b").count() == 1 and pg.locator("#aiAnswer img").count() == 0 and "<img" in pg.inner_text("#aiAnswer"), "la respuesta se muestra como texto: las negritas sí, el HTML no se ejecuta")
    comprobar(pg.locator("#aiAnswer .speak-btn").count() == 1, "la respuesta también se puede leer en voz alta")
    def gemini(r):
        pedido["gemini"] = (r.request.headers.get("x-goog-api-key"), json.loads(r.request.post_data))
        r.fulfill(status=200, headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, body=json.dumps({"candidates": [{"content": {"parts": [{"text": "Juega **Cf3**."}]}}]}))
    ctx.route("https://generativelanguage.googleapis.com/**", gemini)
    pg.evaluate("settings.aiProvider = 'gemini'; settings.aiKey = 'clave-de-prueba'; settings.aiModel = ''")
    pg.fill("#aiQuestion", "¿Qué hago?"); pg.click("#aiAskBtn")
    pg.wait_for_function("$('aiAnswer').textContent.includes('Cf3') && $('aiAnswer').textContent.includes('Gemini')", timeout=60000)
    comprobar(pedido["gemini"][0] == "clave-de-prueba" and "No inventes" in pedido["gemini"][1]["systemInstruction"]["parts"][0]["text"], "con Gemini, la clave va en su cabecera y se envía la misma información")
    comprobar("aiKey" not in pg.evaluate("JSON.stringify(syncPayload().ls.ajedrezSettings)"), "la clave no viaja con la sincronización ni en las copias de seguridad")
    # Claude: con el SDK oficial de Anthropic (servido en local) y la API simulada
    sdk = os.environ.get("ANTHROPIC_SDK_FILE")
    if sdk and pathlib.Path(sdk).exists():
        cuerpo = pathlib.Path(sdk).read_bytes()
        ctx.route("**/@anthropic-ai/sdk@*/+esm", lambda r: r.fulfill(status=200, body=cuerpo, headers={"Content-Type": "application/javascript", "Access-Control-Allow-Origin": "*"}))
        def claude(r):
            pedido["claude"] = (r.request.all_headers(), json.loads(r.request.post_data))
            r.fulfill(status=200, headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "request-id": "req_prueba"}, body=json.dumps({
                "id": "msg_prueba", "type": "message", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "end_turn", "stop_sequence": None,
                "content": [{"type": "text", "text": "Lo mejor es **Cf3**: desarrolla y ataca e5."}], "usage": {"input_tokens": 10, "output_tokens": 10}}))
        ctx.route("https://api.anthropic.com/**", claude)
        pg.evaluate("settings.aiProvider = 'claude'; settings.aiKey = 'sk-ant-prueba'; settings.aiModel = ''; AI.sdk = null")
        pg.fill("#aiQuestion", "¿Qué hago?"); pg.click("#aiAskBtn")
        pg.wait_for_function("$('aiAnswer').textContent.includes('desarrolla y ataca')", timeout=60000)
        h, b = pedido["claude"]
        comprobar(b["model"] == "claude-opus-5-5" and b["fallbacks"] == "default" and b["output_config"]["effort"] == "low" and "server-side-fallback-2026-07-01" in h.get("anthropic-beta", "")
                  and h.get("authorization") == "Bearer sk-ant-prueba" and h.get("anthropic-dangerous-direct-browser-access") == "true" and "sk-ant-prueba" not in json.dumps(b),
                  "con Claude se usa el SDK oficial: claude-opus-5-5, reserva automática ante rechazos, esfuerzo bajo y la clave sólo en la cabecera de autorización")
        def claude_mal(r):
            r.fulfill(status=401, headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, body=json.dumps({"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}}))
        ctx.unroute("https://api.anthropic.com/**"); ctx.route("https://api.anthropic.com/**", claude_mal)
        pg.click("#aiAskBtn")
        pg.wait_for_function("$('aiAnswer').textContent.includes('rechaza la clave')", timeout=60000)
        comprobar(True, "si la clave no vale, se dice claramente")
    else:
        print("  (se omite la parte de Claude: define ANTHROPIC_SDK_FILE con el SDK de Anthropic empaquetado para el navegador)")
    pg.evaluate("settings.aiProvider = 'none'; settings.aiKey = ''; renderAiBox()")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_ollama(browser):
    print("Novedades 1.43.1: conectar Ollama (permiso de la página, lista de modelos y modelos que razonan)")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    estado = {"bloqueado": True}
    modelos = ["deepseek-r1:8b", "qwen2.5-coder:7b", "qwen3.5-hermes:latest", "gemma4:12b", "nomic-embed-text:v1.5", "qwen3.5:9b", "dolphin3:8b", "sin-think:1b", "solo-razona:1b"]
    def tags(r):
        if estado["bloqueado"]: r.abort()   # como hace el navegador cuando Ollama no da permiso a la página (CORS)
        else: r.fulfill(status=200, headers=cab, body=json.dumps({"models": [{"name": n, "model": n} for n in modelos]}))
    def chat(r):
        if estado["bloqueado"]: r.abort(); return
        cuerpo = json.loads(r.request.post_data)
        estado["ultimo"] = cuerpo
        m = cuerpo["model"]
        if m == "solo-razona:1b": r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": "", "thinking": "mmm..."}})); return
        if m == "sin-think:1b":
            if "think" in cuerpo: r.fulfill(status=400, headers=cab, body=json.dumps({"error": f'"{m}" does not support thinking'})); return
            r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": "Hola"}})); return
        if m not in modelos: r.fulfill(status=404, headers=cab, body=json.dumps({"error": f"model '{m}' not found"})); return
        if "embed" in m: r.fulfill(status=400, headers=cab, body=json.dumps({"error": f'"{m}" does not support chat'})); return
        txt = "<think>\nEl usuario quiere un saludo.\n</think>\n\nHola" if m.startswith("deepseek") else "Hola"
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": txt}}))
    ctx.route("http://localhost:11434/api/tags", tags)
    ctx.route("http://localhost:11434/api/chat", chat)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true")
    pg.click("#settingsBtn")
    revelar(pg, "#setAiProvider") or pg.select_option("#setAiProvider", "ollama")
    comprobar("paso a paso" in pg.inner_text("#aiNote"), "al elegir Ollama, Ajustes enlaza los pasos para darle permiso a la página")
    revelar(pg, "#setAiModel") or pg.fill("#setAiModel", "deepseek-r1:8b"); revelar(pg, "#setAiModel") or pg.dispatch_event("#setAiModel", "change")
    revelar(pg, "#aiTestBtn") or pg.click("#aiTestBtn")
    pg.wait_for_function("$('aiTestResult').textContent.includes('❌')", timeout=15000)
    msg = pg.inner_text("#aiTestResult")
    comprobar("OLLAMA_ORIGINS" in msg and "no deja entrar a esta página" in msg and pg.locator("#aiTestResult .help-link").count() == 1,
              "si Ollama no deja entrar a la página, se explica (permiso con OLLAMA_ORIGINS) y se enlazan los pasos")
    pg.click("#aiTestResult .help-link")
    pg.wait_for_timeout(300)
    comprobar(pg.is_visible("#help-ollama") and "setx OLLAMA_ORIGINS" in pg.inner_text("#helpModal"), "«Ver los pasos» abre la ayuda en «Conectar Ollama», con los pasos para Windows, macOS y Linux")
    pg.keyboard.press("Escape")
    estado["bloqueado"] = False
    pg.click("#settingsBtn")
    revelar(pg, "#setAiModel") or pg.fill("#setAiModel", "qwen2.5:7b"); revelar(pg, "#setAiModel") or pg.dispatch_event("#setAiModel", "change")
    revelar(pg, "#aiTestBtn") or pg.click("#aiTestBtn")
    pg.wait_for_function("$('aiTestResult').textContent.includes('Tus modelos')", timeout=15000)
    msg = pg.inner_text("#aiTestResult")
    opciones = pg.evaluate("[...$('aiModelList').options].map(o => o.value)")
    comprobar("no tiene el modelo «qwen2.5:7b»" in msg and "gemma4:12b" in msg and "nomic-embed-text" not in msg and "nomic-embed-text:v1.5" not in opciones and len(opciones) == 8,
              "con un modelo que no está, la prueba dice cuáles hay para conversar (sin los de embeddings) y los pone en la lista de la casilla")
    for nombre in ("deepseek-r1:8b", "gemma4:12b"):
        revelar(pg, "#setAiModel") or pg.fill("#setAiModel", nombre); revelar(pg, "#setAiModel") or pg.dispatch_event("#setAiModel", "change")
        revelar(pg, "#aiTestBtn") or pg.click("#aiTestBtn")
        pg.wait_for_function("$('aiTestResult').textContent.includes('Funciona')", timeout=15000)
        comprobar("«Hola»" in pg.inner_text("#aiTestResult") and "think" not in pg.inner_text("#aiTestResult"), f"con «{nombre}» funciona" + (" (sin enseñar su razonamiento <think>)" if nombre.startswith("deepseek") else ""))
    revelar(pg, "#setAiModel") or pg.fill("#setAiModel", "qwen3.5"); revelar(pg, "#setAiModel") or pg.dispatch_event("#setAiModel", "change")
    revelar(pg, "#aiTestBtn") or pg.click("#aiTestBtn")
    pg.wait_for_function("$('aiTestResult').textContent.includes('❌') || $('aiTestResult').textContent.includes('Funciona') || $('aiTestResult').textContent.includes('Tus modelos')", timeout=15000)
    comprobar("Funciona" in pg.inner_text("#aiTestResult") and pg.input_value("#setAiModel") == "qwen3.5:9b" and pg.evaluate("settings.aiModel") == "qwen3.5:9b",
              "escribir el modelo sin la etiqueta («qwen3.5») se completa solo con la versión instalada (qwen3.5:9b)")
    pg.keyboard.press("Escape")
    pg.evaluate("settings.aiProvider = 'none'; settings.aiModel = ''; renderAiBox()")
    # Ajustes para los modelos locales: sin razonamiento interno y con la ventana de contexto a la medida de la pregunta
    pg.evaluate("settings.aiProvider = 'ollama'; settings.aiModel = 'qwen3.5:9b'")
    r = pg.evaluate("aiCall('Sistema', 'x'.repeat(30000)).then(t => t)")
    u = estado["ultimo"]
    comprobar(u.get("think") is False and u["options"]["num_ctx"] >= 12288 and u["options"]["num_ctx"] % 2048 == 0,
              f"a Ollama se le pide no razonar por dentro y una ventana de contexto a la medida de la pregunta ({u['options']['num_ctx']} tokens)")
    pg.evaluate("settings.aiModel = 'sin-think:1b'")
    comprobar(pg.evaluate("aiCall('s', 'di hola')") == "Hola" and "think" not in estado["ultimo"], "si el modelo no admite esa opción, se repite sin ella")
    pg.evaluate("settings.aiModel = 'solo-razona:1b'")
    msg = pg.evaluate("aiCall('s', 'di hola').then(() => '', e => e.message)")
    comprobar("se ha quedado razonando" in msg, "si el modelo sólo razona y no responde, se dice claramente")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_buscador_y_contexto_ia(browser):
    print("Novedades 1.44.0: buscador de comandos (Ctrl + K) y contexto del profesor IA (repertorio, explorador y partidas modelo)")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    pedido = {}
    def chat(r):
        pedido["m"] = json.loads(r.request.post_data)
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": "Juega **Cc3**, como en tu repertorio."}}))
    def explorador(r):
        r.fulfill(status=200, headers=cab, body=json.dumps({"white": 500, "draws": 300, "black": 200, "opening": {"eco": "B12", "name": "Caro-Kann Defense"},
            "moves": [{"san": "Nc3", "white": 200, "draws": 100, "black": 80}, {"san": "e5", "white": 150, "draws": 100, "black": 60}],
            "topGames": [{"id": "abc", "white": {"name": "Kasparov, Garry", "rating": 2800}, "black": {"name": "Karpov, Anatoly", "rating": 2750}, "year": 1990, "winner": "white"}]}))
    ctx.route("http://localhost:11434/api/chat", chat)
    ctx.route("https://explorer.lichess.ovh/**", explorador)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true")
    # 1. Buscador de comandos
    pg.keyboard.press("Control+k")
    comprobar(pg.is_visible("#cmdInput") and pg.locator("#cmdList .cmd-item").count() > 5, "Ctrl + K abre el buscador con las funciones principales")
    def busca(q):
        pg.fill("#cmdInput", q)
        return pg.evaluate("Cmd.shown.slice(0, 5).map(x => x.cat + ': ' + x.name)")
    comprobar(busca("radar")[0] == "Función: Radar de piezas en peligro", "«radar» encuentra la función")
    comprobar(any(x.startswith("Apertura: Siciliana") for x in busca("siciliana")), "«siciliana» encuentra las aperturas de la enciclopedia")
    comprobar(any("Lucena" in x for x in busca("lucena")), "«lucena» encuentra la lección")
    comprobar(busca("tablero 3d")[0] == "Ajuste: Tablero en 3D", "«tablero 3d» encuentra el ajuste")
    pg.keyboard.press("Enter")
    pg.wait_for_function("$('settingsModal').classList.contains('open') && document.querySelector('.cmd-flash')", timeout=5000)
    comprobar(True, "al elegir un ajuste se abre ⚙ Ajustes y se resalta")
    pg.keyboard.press("Escape")
    pg.keyboard.press("/")
    comprobar(busca("Cf3")[0] == "Jugada: Jugar Cf3", "una jugada legal escrita se ofrece para jugarla")
    pg.keyboard.press("Enter")
    pg.wait_for_function("cur().san === 'Nf3'", timeout=5000)
    comprobar(True, "Intro juega la jugada en el tablero")
    pg.keyboard.press("/"); busca("sorpresas"); pg.keyboard.press("Enter")
    pg.wait_for_function("ui.activeTab === 'explorer'", timeout=5000)
    comprobar(True, "una función de otra pestaña abre esa pestaña")
    pg.keyboard.press("/"); busca("radar"); pg.keyboard.press("Enter")
    pg.wait_for_function("settings.radar === true", timeout=5000)
    comprobar(True, "y las funciones se ejecutan directamente")
    pg.evaluate("setRadar(false)")
    # 2. Contexto del profesor IA: repertorio propio, .pgn abierto (partida modelo) y explorador de Lichess
    carlsen = '[White "Carlsen, Magnus"]\n[Black "Nakamura, Hikaru"]\n[Result "1-0"]\n[Date "2019.01.01"]\n\n1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 {La retirada del alfil.} 6. h4 h6 1-0\n'
    pg.evaluate("""async (pgn) => {
      const g = Pgn.parseGame('1. e4 c6 2. d4 d5 3. Nc3 (3. e5 Bf5) dxe4', { lang: 'en' }).game;
      setGame(g, { name: 'Mi e4', tags: ['repertorio'], noConfirm: true });
      await saveToLibrary({ silent: true, force: true });
      setCollection(pgn, false, 'carlsen.pgn');
      Object.assign(settings, { aiProvider: 'ollama', aiWatch: false, aiModel: 'qwen2.5:7b', token: 'lip_prueba' }); renderAiBox(); syncAiCtxForm();
      const g2 = Pgn.parseGame('1. e4 c6 2. d4 d5', { lang: 'en' }).game;
      setGame(g2, { noConfirm: true, current: Pgn.mainlineFrom(g2.root).pop() });
    }""", carlsen)
    comprobar(pg.locator(".ai-ctx input[type=checkbox]:checked").count() == 5, "las cuatro fuentes de contexto y las propuestas de la IA vienen activadas")
    pg.fill("#aiQuestion", "¿Qué hago?"); pg.click("#aiAskBtn")
    pg.wait_for_function("$('aiAnswer').querySelector('.ai-text')", timeout=60000)
    u = pedido["m"]["messages"][1]["content"]
    comprobar("tu repertorio «Mi e4»" in u and "Jugada preparada: Cc3" in u, "a la IA se le dice que la posición está en tu repertorio y qué tienes preparado")
    comprobar("partidas de maestros: 1000" in u and "Kasparov, Garry" in u, "y lo que juegan los maestros, con sus partidas destacadas (explorador de Lichess)")
    comprobar("Carlsen, Magnus – Nakamura, Hikaru" in u and "Después se jugó: 3.Cc3" in u and "los cursos" in u, "y partidas modelo del .pgn abierto y de los cursos, con lo que se jugó después")
    comprobar("contexto comprobado" in pedido["m"]["messages"][0]["content"] and "No inventes jugadas" in pedido["m"]["messages"][0]["content"], "con la orden de citar de dónde sale cada dato y de no inventar jugadas")
    comprobar("Mi e4" in pg.inner_text("#aiAnswer") and "maestros" in pg.inner_text("#aiAnswer"), "bajo la respuesta se ve qué fuentes se han consultado")
    pg.evaluate("const g = Pgn.parseGame('1. e4 c6 2. d4 d5 3. f3', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() })")
    pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=60000)
    comprobar("Tú te saliste de tu repertorio «Mi e4»" in pedido["m"]["messages"][1]["content"], "si te sales del repertorio, se le dice en qué jugada y qué tenías preparado")
    pg.evaluate("const g = Pgn.parseGame('1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() })")
    pg.click("#aiAskBtn")
    pg.wait_for_function("$('aiAnswer').querySelector('[data-ai-model]')", timeout=60000)
    pg.click("#aiAnswer [data-ai-model]")
    pg.wait_for_function("game.headers.White === 'Carlsen, Magnus' && cur().san === 'Bg6'", timeout=5000)
    comprobar(True, "una partida modelo se abre justo en la posición")
    pg.click(".ai-ctx summary")
    pg.uncheck("#aiPropose"); pg.uncheck("#aiCtxRep"); pg.uncheck("#aiCtxModels"); pg.uncheck("#aiCtxGames"); pg.uncheck("#aiCtxLichess")
    pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=60000)
    comprobar("Contexto (datos" not in pedido["m"]["messages"][1]["content"], "sin fuentes marcadas, sólo se envía lo del motor")
    pg.evaluate("Object.assign(settings, { aiProvider: 'none', token: '', aiCtxRep: true, aiCtxModels: true, aiCtxGames: true, aiCtxLichess: true, aiPropose: true }); renderAiBox(); syncAiCtxForm()")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_propuestas_ia(browser):
    print("Novedades 1.45.0: la IA propone sus propias jugadas (sin ver al motor) y Stockfish las comprueba")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    llamadas = []
    def chat(r):
        m = json.loads(r.request.post_data)
        llamadas.append(m)
        if "SÓLO con JSON" in m["messages"][0]["content"]:
            txt = '```json\n{"lineas":[{"jugadas":"Cf3 Cc6 Ab5","idea":"desarrollo y presión en e5"},{"jugadas":"Aa6","idea":"atacar b7"},{"jugadas":"Axf7","idea":"sacrificio"}]}\n```'
        else:
            txt = "Juega **Cf3**. No juegues Aa6, que pierde el alfil. Otra idea sería Txh7."
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": txt}}))
    ctx.route("http://localhost:11434/api/chat", chat)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    pg.evaluate("$('welcomeBox').hidden = true; Object.assign(settings, { aiProvider: 'ollama', aiWatch: false, aiModel: 'qwen2.5:7b', aiCtxLichess: false }); renderAiBox(); syncAiCtxForm();"
                "const g = Pgn.parseGame('1. e4 e5', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() })")
    pg.fill("#aiQuestion", "¿Qué hago?"); pg.click("#aiAskBtn")
    pg.wait_for_function("$('aiAnswer').querySelector('.ai-text')", timeout=90000)
    propuesta, final = llamadas[0], llamadas[-1]
    comprobar(len(llamadas) == 2 and "Mejores líneas del motor" not in propuesta["messages"][1]["content"] and "FEN" in propuesta["messages"][1]["content"],
              "primero la IA propone sus jugadas viendo la posición pero no al motor")
    u = final["messages"][1]["content"]
    comprobar("Tus propuestas" in u and "2.Cf3 Cc6 3.Ab5" in u and "BUENA" in u, "la línea buena llega juzgada a la respuesta final")
    comprobar("2.Aa6" in u and "ERROR" in u and "refutación del motor" in u, "la que regala el alfil llega como error, con la refutación del motor")
    comprobar("«Axf7»: ILEGAL" in u, "la ilegal se descarta y se le dice que no la mencione")
    comprobar("BUENA o JUGABLE" in final["messages"][0]["content"] and "No inventes jugadas" in final["messages"][0]["content"], "sólo puede recomendar las del motor y sus propuestas buenas o jugables")
    comprobar(propuesta.get("options", {}).get("num_predict") == 450 and "options" in final and "num_predict" not in final["options"],
              "la consulta interna de propuestas es corta (con límite de longitud) y la respuesta que lees, no")
    comprobar("unas 200 palabras" in final["messages"][0]["content"], "por defecto, respuestas normales (unas 200 palabras, con el porqué de lo importante)")
    comprobar("Tu papel:" in final["messages"][0]["content"] and "enseñarle a pensar" in final["messages"][0]["content"] and "tutor" in propuesta["messages"][0]["content"],
              "la IA recibe su papel: un tutor que enseña a pensar (también al proponer jugadas)")
    pg.click("#aiBox [data-ai-depth=deep]")
    llamadas.clear(); pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=90000)
    comprobar("unas 400 palabras" in llamadas[-1]["messages"][0]["content"] and "el porqué de cada jugada que cites" in llamadas[-1]["messages"][0]["content"] and pg.evaluate("settings.aiDepth") == "deep",
              "📏 «Detalladas» pide explicar a fondo el porqué de cada jugada (y se recuerda)")
    pg.click("#aiBox [data-ai-depth=normal]")
    caja = pg.inner_text("#aiAnswer")
    comprobar(pg.locator("#aiAnswer .ai-prop").count() == 3 and "✔ buena" in caja and "✗ error" in caja and "⛔ ilegal" in caja and "Refutación" in caja,
              "bajo la respuesta se ven las propuestas con su veredicto y la refutación")
    comprobar(pg.locator("#aiAnswer .ai-prop .pv-mv").count() >= 4, "las jugadas de las propuestas se pueden ver en el minitablero")
    marcadas = pg.evaluate("[...document.querySelectorAll('#aiAnswer .ai-unverified')].map(x => x.textContent)")
    comprobar(marcadas == ["Txh7⚠"] and "no están comprobadas" not in caja and "no está comprobada" in caja,
              "una jugada de la respuesta que nadie ha comprobado se marca con ⚠ (y las comprobadas no)")
    pg.click(".ai-ctx summary"); pg.uncheck("#aiPropose")
    llamadas.clear()
    pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=90000)
    comprobar(len(llamadas) == 1 and "Tus propuestas" not in llamadas[0]["messages"][1]["content"], "sin la casilla, una sola consulta y sin propuestas")
    # Si otro cálculo (el análisis en vivo) interrumpe el del profesor, se repite en vez de quedarse sin líneas
    r = pg.evaluate("""async () => { const s = cur().state; const p = evalState(s, 800, 2);
      setTimeout(() => Engine.start({ purpose: 'live', fen: Chess.toFen(s), moves: [], stm: s.t, movetime: 300, multipv: 1, resolve() {} }), 60);
      const out = await p; return !!(out && out.lines && out.lines.some(l => l.pv && l.pv.length)); }""")
    comprobar(r, "si el análisis en vivo interrumpe el cálculo del profesor, se repite (antes se quedaba sin las líneas del motor)")
    pg.evaluate("Object.assign(settings, { aiProvider: 'none', aiPropose: true, aiCtxLichess: true }); renderAiBox(); syncAiCtxForm()")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_aperturas_explicadas(browser):
    print("Novedades 1.46.0: aperturas explicadas")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true; const g = Pgn.parseGame('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() })")
    pg.click("#ecoBanner")
    pg.wait_for_selector("#openingModal.open")
    texto = pg.inner_text("#openingBody")
    comprobar("Defensa Siciliana" in pg.inner_text("#openingTitle") and "Najdorf" in texto and all(t in texto for t in ("Qué es", "Características e ideas", "Cómo jugarla", "Con blancas", "Con negras", "Errores y trampas", "Origen")),
              "pulsar la apertura de la cabecera abre su artículo (Siciliana, con la nota de la Najdorf) con todos sus apartados")
    comprobar(pg.locator("#openingBody [data-oa-eco]").count() > 10, "el artículo enlaza las variantes de la enciclopedia")
    pg.click("#openingBody [data-oa-explorer]")
    pg.wait_for_function("ui.activeTab === 'explorer' && !document.querySelector('.modal-back.open')", timeout=5000)
    comprobar("Defensa Siciliana" in pg.inner_text("#openingBrief") and pg.evaluate("cur().san") == "a6", "en la pestaña Aperturas se resume la apertura de la posición, sin cambiar la partida")
    pg.click("#openingBrief [data-oa-open]")
    pg.wait_for_selector("#openingModal.open")
    pg.keyboard.press("Escape")
    pg.fill("#ecoSearchInput", "Petrov")
    pg.wait_for_function("$('ecoLocalList').rows.length === 1 && $('ecoLocalList').textContent.includes('Petrov')", timeout=5000)
    pg.click("#ecoLocalList .eco-read")
    pg.wait_for_selector("#openingModal.open")
    comprobar("Petrov" in pg.inner_text("#openingTitle") and "Cxe4??" in pg.inner_text("#openingBody"), "el botón 📖 de la enciclopedia abre el artículo, con su trampa típica")
    pg.click("#openingBody [data-oa-play]")
    pg.wait_for_function("ECO.detect(cur()) && ECO.detect(cur()).entry.name.includes('Petrov')", timeout=5000)
    comprobar(True, "«Ver en el tablero» pone la apertura en el tablero")
    pg.keyboard.press("Control+k"); pg.fill("#cmdInput", "leer caro")
    comprobar(pg.evaluate("Cmd.shown[0] && Cmd.shown[0].name") == "Leer: Defensa Caro-Kann", "el buscador encuentra los artículos")
    pg.keyboard.press("Enter")
    pg.wait_for_function("$('openingModal').classList.contains('open') && $('openingTitle').textContent.includes('Caro-Kann')", timeout=5000)
    comprobar(True, "y los abre")
    pg.keyboard.press("Escape")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_entrenador_ia(browser):
    print("Novedades 1.47.0: entrenador IA (una clase guiada con tus errores y problemas del tema)")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    llamadas, pista = [], ["¿Qué pieza rival está sin defender?"]
    def chat(r):
        m = json.loads(r.request.post_data)
        llamadas.append(m)
        u = m["messages"][1]["content"]
        txt = "Hoy toca **táctica**." if "presentación" in u else pista[0] if "pista número" in u else "Funciona porque gana material. Otra idea: Txh7." if "Explica" in u else "Buen trabajo."
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": txt}}))
    ctx.route("http://localhost:11434/api/chat", chat)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    # Una partida tuya con un error ya analizado: la torre de a1 se deja tomar en vez de capturar la dama colgada
    pg.evaluate("""() => { $('welcomeBox').hidden = true; settings.myNames = 'Yo';
      for (let i = 0; i < 3; i++) Lib.games.set('coach' + i, { id: 'coach' + i, title: 'Mi partida ' + i, white: 'Yo', black: 'Rival', pgn: '[White "Yo"]\\n[Black "Rival"]\\n\\n*', tags: [],
        analysis: { err: [{ fen: '4k3/8/8/3q4/8/8/8/R2QK3 w - - 0 1', uci: 'a1a8', best: 'd1d5', th: 'material', mover: 1, ply: 20 + i, ph: 'medio', cls: '??' }] } }); }""")
    pg.click('.tab-btn[data-tab="tools"]'); pg.click('#trainMenu [data-train-open="coach"]')
    diag = pg.inner_text("#coachDiag")
    comprobar("3 errores en 3 partidas" in diag and "Táctica: no perder material" in diag and "se repite en tus partidas" in diag, "el entrenador mira tus errores y propone qué trabajar (y por qué)")
    pg.select_option("#coachLen", "4"); pg.click("#coachStartBtn")
    pg.wait_for_function("Coach.state === 'ask'", timeout=30000)
    comprobar(pg.is_visible("#coachBox") and pg.evaluate("Coach.queue.filter(x => x.kind === 'drill').length") == 2 and pg.evaluate("Coach.queue[0].kind") == "puzzle",
              "la clase mezcla problemas del tema y posiciones de tus partidas (empieza con un problema)")
    comprobar(pg.evaluate("quiz()") and not pg.is_visible("#evalBarOuter:not(.hidden-eval)") and not pg.is_visible("#engineBox"), "durante la clase el motor no se ve")
    comprobar(pg.evaluate("$('coachBox').parentElement === $('toolsPanel') && $('coachBox').getBoundingClientRect().top < innerHeight / 2"), "en el ordenador, el recuadro del entrenador va junto al tablero, arriba a la derecha, sin desplazarse")
    malo = pg.evaluate("(() => { const s = Coach.ex.node.state; return Chess.uci(Chess.legal(s).find(m => Chess.uci(m) !== Coach.ex.best)); })()")
    pg.evaluate(f"playMove(Chess.moveFromUci(Coach.ex.node.state, '{malo}'), 'user')")
    pg.wait_for_function("Coach.state === 'ask' && Coach.hint === 1", timeout=30000)
    comprobar("❌" in pg.inner_text("#coachBox") and pg.locator("#coachBox .coach-hint").count() == 1 and pg.evaluate("cur() === Coach.ex.node"),
              "una jugada mala no se hace: se marca en rojo y llega la primera pista")
    pg.evaluate("playMove(Chess.moveFromUci(Coach.ex.node.state, Coach.ex.best), 'user')")
    pg.wait_for_function("Coach.state === 'solved'", timeout=30000)
    comprobar("¡Exacto!" in pg.inner_text("#coachBox") and "Línea" in pg.inner_text("#coachBox"), "la buena se acepta y se explica con la línea del motor")
    pg.click("#coachBox [data-co=next]")
    pg.wait_for_function("Coach.state === 'ask' && Coach.ex.kind === 'drill'", timeout=30000)
    comprobar("De tu partida" in pg.inner_text("#coachBox") and pg.evaluate("Coach.arrows.some(a => a.color === 'threat')"), "las posiciones de tus partidas enseñan el error que cometiste")
    pg.fill("#coachWhy", "quiero ganar material"); pg.press("#coachWhy", "Enter")
    comprobar("Anotado" in pg.inner_text("#coachBox") and pg.evaluate("Coach.state") == "ask", "sin IA, Intro en «Tu idea» la anota y pide la jugada")
    pg.evaluate("playMove(Chess.moveFromUci(Coach.ex.node.state, 'a1a8'), 'user')")
    comprobar("justo lo que se jugó en la partida" in pg.inner_text("#coachBox"), "repetir el error de la partida se detecta")
    pg.evaluate("playMove(Chess.moveFromUci(Coach.ex.node.state, 'd1d5'), 'user')")
    pg.wait_for_function("Coach.state === 'solved'", timeout=30000)
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("Object.values(Lib.games.get(Coach.ex.d.rec.id).drills || {}).length") == 1, "lo resuelto cuenta para el repaso de tus errores")
    comprobar(pg.locator("#coachAsk").count() == 1 and pg.locator("#coachBox [data-co-q]").count() >= 2, "al terminar el ejercicio se puede seguir preguntando (con preguntas rápidas)")
    pg.fill("#coachAsk", "¿y si juego Ta8+?"); pg.press("#coachAsk", "Enter")
    pg.wait_for_function("!Coach.chatBusy && Coach.chat.length === 1", timeout=30000)
    comprobar("valoración" in pg.inner_text("#coachBox .coach-answer") and "Ta8" in pg.inner_text("#coachBox .coach-answer"), "sin IA, una pregunta sobre otra jugada se responde con la valoración del motor")
    pg.click("#coachBox [data-co=next]"); pg.wait_for_function("Coach.state === 'ask'", timeout=30000)
    pg.click("#coachBox [data-co=show]")
    comprobar("La buena era" in pg.inner_text("#coachBox"), "«Solución» la enseña")
    pg.click("#coachBox [data-co=next]"); pg.wait_for_function("Coach.state === 'ask'", timeout=30000)
    pg.click("#coachBox [data-co=skip]"); pg.wait_for_function("Coach.state === 'summary'", timeout=30000)
    comprobar("de 4" in pg.inner_text("#coachBox") and "Mi consejo" in pg.inner_text("#coachBox"), "al final, un resumen con qué entrenar después")
    pg.click("#coachBox [data-co=end]")
    comprobar(not pg.evaluate("Coach.active") and not pg.is_visible("#coachBox"), "«Volver a tu partida» termina la clase")
    # Con la IA: presentación, pistas que no pueden revelar la solución y explicación que comenta tu razonamiento
    pg.evaluate("Object.assign(settings, { aiProvider: 'ollama', aiWatch: false, aiModel: 'qwen2.5:7b' }); renderAiBox()")
    pg.click('.tab-btn[data-tab="tools"]')
    if not pg.is_visible("#coachStartBtn"): pg.click('#trainMenu [data-train-open="coach"]')
    pg.click("#coachStartBtn"); pg.wait_for_function("Coach.state === 'ask'", timeout=30000)
    comprobar("Hoy toca" in pg.inner_text("#coachBox"), "con IA, la IA presenta la clase")
    buena = pg.evaluate("(() => { const s = Coach.ex.node.state, L = Chess.legal(s), m = Chess.moveFromUci(s, Coach.ex.best, L); return formatSan(Chess.san(s, m, L), 'es', s.t).replace(/[+#]/g, ''); })()")
    pista[0] = f"Juega {buena} y ganas."
    pg.click("#coachBox [data-co=hint]")
    pg.wait_for_function("!$('coachBox').textContent.includes('piensa…')", timeout=30000)
    comprobar(buena not in pg.inner_text("#coachBox .coach-hint"), "si la pista de la IA revela la solución, se descarta y se da la del entrenador")
    pista[0] = "¿Qué pieza rival está sin defender?"
    pg.click("#coachBox [data-co=hint]")
    pg.wait_for_function("!$('coachBox').textContent.includes('piensa…')", timeout=30000)
    comprobar("sin defender" in pg.inner_text("#coachBox .coach-hint") and pg.evaluate("Coach.hintSq") >= 0, "una pista que no la revela se muestra (y la segunda marca la pieza)")
    pg.fill("#coachWhy", "creo que hay que atacar al rey"); pg.click("#coachBox [data-co=idea]")
    pg.wait_for_function("$('coachBox').querySelector('.coach-idea') && !$('coachBox').textContent.includes('valora tu idea…')", timeout=30000)
    comprobar("Valora su idea" in llamadas[-1]["messages"][1]["content"] and "Buen trabajo" in pg.inner_text("#coachBox .coach-idea") and pg.evaluate("Coach.state === 'ask' && Coach.ideaHelp"),
              "con IA, «💬 Valorar mi idea» la comenta sin dar la solución (y cuenta como ayuda)")
    pg.fill("#coachWhy", f"{buena} porque ataca dos piezas"); pg.press("#coachWhy", "Enter")
    pg.wait_for_function("Coach.state === 'solved' && !$('coachBox').textContent.includes('prepara la explicación')", timeout=30000)
    comprobar(True, "si la idea empieza por una jugada («Cf3 porque…»), Intro la juega")
    comprobar("ataca dos piezas" in llamadas[-1]["messages"][1]["content"] and "Funciona porque" in pg.inner_text("#coachBox") and pg.locator("#coachBox .ai-unverified").count() == 1,
              "la IA explica la jugada comentando tu razonamiento, y lo no comprobado lleva ⚠")
    pg.click("#coachBox [data-co-q]")
    pg.wait_for_function("!Coach.chatBusy && Coach.chat.length === 1", timeout=30000)
    seg = llamadas[-1]["messages"][1]["content"]
    comprobar("Nueva pregunta del alumno: ¿Qué otras jugadas valían" in seg and "Conversación hasta ahora" in seg and "Explicación que ya le diste" in seg and pg.locator("#coachBox .coach-answer").count() == 1,
              "con IA, tras el ejercicio el entrenador responde preguntas recordando la explicación y la conversación")
    jug = pg.evaluate("(() => { const s = Coach.ex.node.state, L = Chess.legal(s); const m = L.find(m => Chess.uci(m) !== Coach.ex.best); return formatSan(Chess.san(s, m, L), 'es', s.t); })()")
    pg.fill("#coachAsk", f"¿y si juego {jug}?"); pg.press("#coachAsk", "Enter")
    pg.wait_for_function("!Coach.chatBusy && Coach.chat.length === 2", timeout=60000)
    comprobar("Jugadas que menciona el alumno, valoradas por el motor" in llamadas[-1]["messages"][1]["content"] and "Alumno: ¿Qué otras jugadas valían" in llamadas[-1]["messages"][1]["content"],
              "si pregunta por otra jugada, el motor la valora antes de que conteste la IA (y recuerda lo anterior)")
    exp = [m for m in llamadas if "Explica en 2 a 4 frases" in m["messages"][1]["content"]][-1]["messages"][1]["content"]
    fen_ej = pg.evaluate("Chess.toFen(Coach.ex.node.state)")
    comprobar("Posición del ejercicio (antes de la jugada del alumno)" in exp and fen_ej in exp and "(le toca al alumno)" in exp and "El alumno ha jugado" in exp and "Material al final de la línea del motor" in exp,
              "la explicación usa la posición del ejercicio (antes de tu jugada), lo que jugaste y lo que gana de verdad la línea (antes usaba la de después)")
    comprobar("No inventes jugadas" in llamadas[-1]["messages"][0]["content"], "con la orden de no inventar jugadas")
    pg.click("#coachBox [data-co=end]")
    pg.evaluate("Object.assign(settings, { aiProvider: 'none', myNames: '' }); ['coach0', 'coach1', 'coach2'].forEach(k => Lib.games.delete(k)); renderAiBox()")
    # En el móvil: justo debajo del tablero y sin desbordar la página
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.click('.tab-btn[data-tab="tools"]')
    if not pg.is_visible("#coachStartBtn"): pg.click('#trainMenu [data-train-open="coach"]')
    comprobar(pg.evaluate("document.documentElement.scrollWidth") <= 390, "en el móvil, la sección del entrenador no desborda la página")
    pg.click("#coachStartBtn"); pg.wait_for_function("Coach.state === 'ask'", timeout=30000); pg.wait_for_timeout(600)
    r = pg.evaluate("(() => { const b = $('coachBox').getBoundingClientRect(), w = $('bottomBar').getBoundingClientRect(); return { gap: b.top - w.bottom, top: b.top, vh: innerHeight }; })()")
    comprobar(0 <= r["gap"] < 20 and r["top"] < r["vh"] - 100 and pg.evaluate("document.documentElement.scrollWidth") <= 390, "en el móvil, el recuadro del entrenador va justo debajo del tablero, a la vista")
    pg.click("#coachBox [data-co=end]")
    pg.set_viewport_size({"width": 1400, "height": 1000})
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_velocidad_y_ordenes(browser):
    print("Novedades 1.48.0: índice de posiciones (más velocidad), órdenes escritas y erratas en el buscador")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    # 300 partidas al azar en un .pgn abierto (con dos jugadores para filtrar)
    pg.evaluate("""() => { $('welcomeBox').hidden = true; let seed = 3; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
      const out = []; for (let g = 0; g < 300; g++) { let s = Chess.parseFen(Chess.START_FEN); const sans = [];
        for (let p = 0; p < 40; p++) { const L = Chess.legal(s); if (!L.length) break; const m = p === 0 ? Chess.moveFromUci(s, ['e2e4', 'd2d4'][g % 2], L) : L[rnd(L.length)]; sans.push((s.t === 1 ? s.full + '. ' : '') + Chess.san(s, m, L)); s = Chess.apply(s, m); }
        out.push(`[White "${g % 3 ? 'Carlsen, Magnus' : 'Otro'}"]\\n[Black "${g % 5 ? 'Nakamura, Hikaru' : 'Otra'}"]\\n[Result "1-0"]\\n\\n${sans.join(' ')} 1-0\\n`); }
      setCollection(out.join('\\n'), false, 'azar.pgn'); }""")
    pg.wait_for_function("!GIdx.building", timeout=60000)
    todo = pg.evaluate("""async () => { const all = await gameIndex(); let ok = 0;
      for (const { src, e } of all.slice(0, 40)) { const g = Pgn.parseGame(Coll.games[src.coll], { lang: 'auto' }).game; const keys = [g.root, ...Pgn.mainlineFrom(g.root)].map(n => Chess.hash(n.state));
        if (keys.length === e.k.length && keys.every((k, i) => k === e.k[i]) && Pgn.mainlineFrom(g.root).map(n => n.uci).join(' ') === e.u) ok++; }
      return { n: all.length, ok, workers: (GIdx.workers || []).length }; }""")
    comprobar(todo["n"] == 300 and todo["ok"] == 40, f"el índice de posiciones coincide con leer cada partida ({todo['ok']}/40 comprobadas, {todo['workers']} proceso(s) en segundo plano)")
    # Buscar posición: lo mismo que contar a mano, y al instante
    pg.evaluate("const g = Pgn.parseGame('1. e4', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() })")
    pg.click('.tab-btn[data-tab="library"]'); pg.click('.sub-btn[data-sub="position"]')
    pg.select_option("#posMode", "exact"); pg.check("#posColl")
    ms = pg.evaluate("async () => { const t0 = performance.now(); await searchPosition(); return performance.now() - t0; }")
    comprobar("150 partidas" in pg.inner_text("#posStatus") and ms < 1500, f"«Buscar posición» encuentra las 150 partidas con 1.e4 en {ms:.0f} ms")
    pg.evaluate("$('explorerDbSelect').value = 'local'; switchTab('explorer'); LocalIdx = null; refreshExplorer()")
    pg.wait_for_function("$('explorerMovesBody').textContent.includes('150') || $('explorerGamesBody').querySelectorAll('tr').length > 1", timeout=20000)
    comprobar(pg.locator("#explorerGamesBody tr").count() > 1, "el explorador de tus partidas usa el mismo índice")
    # Buscador: el .pgn abierto, órdenes, erratas, lo último usado y lo que no encuentra
    pg.keyboard.press("Control+k")
    comprobar(pg.is_visible("#cmdInput"), "el buscador se abre con un .pgn abierto (antes fallaba)")
    def primero(q):
        pg.fill("#cmdInput", q)
        return pg.evaluate("Cmd.shown[0] ? Cmd.shown[0].cat + ': ' + Cmd.shown[0].name : ''")
    comprobar(primero("jugar con negras nivel 5 a 5+3") == "Orden: Jugar con negras, nivel 5, reloj 5+3", "«jugar con negras nivel 5 a 5+3» se entiende")
    pg.keyboard.press("Enter"); pg.wait_for_selector("#cpuModal.open")
    comprobar(pg.evaluate("[$('cpuColor').value, $('cpuLevel').value, $('cpuClock').value]") == ["-1", "11", "5+3"], "y abre la partida con el color, el nivel y el reloj elegidos")
    pg.keyboard.press("Escape")
    pg.evaluate("loadCollGame(0)")
    pg.keyboard.press("Control+k"); primero("ir a la jugada 12"); pg.keyboard.press("Enter")
    pg.wait_for_function("cur().parent && cur().parent.state.full === 12 && cur().parent.state.t === 1", timeout=5000)
    comprobar(True, "«ir a la jugada 12» va a esa jugada")
    pg.keyboard.press("Control+k")
    comprobar(primero("carlsen contra nakamura") == "Orden: Buscar partidas: Carlsen contra Nakamura", "«Carlsen contra Nakamura» busca sus partidas")
    pg.keyboard.press("Enter")
    pg.wait_for_function("$('dbFilterInput').value === 'carlsen nakamura'", timeout=5000)
    comprobar(pg.evaluate("$('dbFilterInput').value") == "carlsen nakamura" and pg.evaluate("collFiltered().length") == 160, "y filtra el .pgn abierto (160 partidas entre ellos)")
    pg.keyboard.press("Control+k")
    comprobar("Siciliana" in primero("sicilana") and "Najdorf" in primero("najdrof"), "las erratas también encuentran («sicilana», «najdrof»)")
    comprobar(primero("modo claro") == "Orden: Aspecto claro" and primero("quita el radar") == "Orden: Desactivar: Radar de piezas en peligro", "órdenes de ajustes («modo claro», «quita el radar»)")
    comprobar(primero("zzzzzz").startswith("Ayuda: Buscar"), "si no encuentra nada, ofrece buscarlo en la ayuda")
    primero("radar"); pg.keyboard.press("Enter"); pg.wait_for_function("settings.radar === true", timeout=5000); pg.evaluate("setRadar(false)")
    pg.keyboard.press("Control+k"); pg.fill("#cmdInput", "")
    comprobar(pg.evaluate("Cmd.shown[0].name") == "Radar de piezas en peligro", "lo último que usaste sale el primero")
    pg.keyboard.press("Escape")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_notacion_ia(browser):
    print("Novedades 1.49.0: la notación de la IA, siempre la tuya, y jugadas pulsables")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    def chat(r):
        m = json.loads(r.request.post_data)
        txt = '{"lineas":[{"jugadas":"Nf3 Nc6 Bb5","idea":"desarrollo"}]}' if "SÓLO con JSON" in m["messages"][0]["content"] else \
              "Juega **Nf3**, luego Bb5. Tu última jugada 1.e4 fue buena; ojo con la casilla e5. Qh5 es mala idea y Bxf7+ un sacrificio."
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": txt}}))
    ctx.route("http://localhost:11434/api/chat", chat)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    pg.evaluate("$('welcomeBox').hidden = true; Object.assign(settings, { aiProvider: 'ollama', aiWatch: false, aiModel: 'qwen2.5:7b', aiCtxLichess: false, lang: 'es' }); renderAiBox();"
                "const g = Pgn.parseGame('1. e4 e5', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() })")
    pg.fill("#aiQuestion", "¿Qué hago?"); pg.click("#aiAskBtn")
    pg.wait_for_function("$('aiAnswer').querySelector('.ai-text')", timeout=90000)
    t = pg.inner_text("#aiAnswer .ai-text")
    comprobar("Cf3" in t and "Ab5" in t and "Dh5" in t and "Axf7+" in t and not any(x in t for x in ("Nf3", "Bb5", "Qh5", "Bxf7")),
              "las jugadas que la IA escribe en inglés (Nf3, Bb5, Qh5) se muestran en tu notación (Cf3, Ab5, Dh5)")
    comprobar(pg.evaluate("[...document.querySelectorAll('#aiAnswer .ai-text .ai-unverified')].map(x => x.textContent)") == ["Axf7+⚠"], "y la no comprobada sigue marcada con ⚠")
    comprobar(pg.locator("#aiAnswer .ai-text .ai-mv").count() >= 4 and pg.locator("#aiAnswer .ai-text .ai-mv[data-board]").count() >= 2, "las jugadas de la respuesta se pueden pulsar")
    pg.click("#aiAnswer .ai-text .ai-mv[data-board]")
    pg.wait_for_function("!hoverTip.hidden && AI.arrow", timeout=3000)
    pg.wait_for_timeout(150)   # el minitablero del clic se abre justo después de la flecha
    comprobar(pg.evaluate("shapeList().some(s => s.color === 'blue')"), "al pulsar una jugada se ve en el minitablero y, si se puede jugar ya, con una flecha en el tablero")
    pg.mouse.click(5, 5)
    comprobar(pg.evaluate("hoverTip.hidden && !AI.arrow"), "pulsar fuera lo cierra")
    pg.fill("#aiQuestion", "¿Y si juego Cc3?"); pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=90000)
    comprobar(pg.locator("#aiAnswer [data-ai-save]").count() == 1 and "Recuerda 1 pregunta anterior" in pg.inner_text("#aiAnswer"), "el profesor recuerda lo que ya le preguntaste en esta posición")
    pg.click("#aiAnswer [data-ai-save]")
    comprobar("Profesor IA (¿Y si juego Cc3?)" in pg.evaluate("cur().comment"), "«💾 Añadir como comentario» guarda la respuesta en la jugada")
    pg.evaluate("settings.lang = 'en'; renderAiBox()")
    pg.click("#aiAskBtn"); pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=90000)
    comprobar("Nf3" in pg.inner_text("#aiAnswer .ai-text") and "Cf3" not in pg.inner_text("#aiAnswer .ai-text"), "con la notación inglesa elegida, se muestran en inglés")
    pg.evaluate("Object.assign(settings, { aiProvider: 'none', lang: 'es', aiCtxLichess: true }); renderAiBox()")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_piezas_ia(browser):
    print("Novedades 1.50.0: lo que la IA dice de las piezas se comprueba en el tablero")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    estado = {"corrige": True}
    llamadas = []
    def chat(r):
        m = json.loads(r.request.post_data)
        llamadas.append(m)
        u = m["messages"][1]["content"]
        if "SÓLO con JSON" in m["messages"][0]["content"]: txt = '{"lineas":[]}'
        elif "Tiene errores sobre la posición" in u and estado["corrige"]: txt = "Tu caballo de d7 defiende e5 y el caballo blanco de f3 presiona d4."
        else: txt = "Cuidado: el alfil de d7 es peligroso y tu caballo de a4 está amenazado."
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": txt}}))
    ctx.route("http://localhost:11434/api/chat", chat)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    pg.evaluate("$('welcomeBox').hidden = true; Object.assign(settings, { aiProvider: 'ollama', aiWatch: false, aiModel: 'qwen2.5:7b', aiCtxLichess: false, aiPropose: false }); renderAiBox();"
                "const g = Pgn.parseGame('1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() }); ui.flipped = true; render()")
    pg.fill("#aiQuestion", "¿Qué hago?"); pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=90000)
    primera = llamadas[0]["messages"][1]["content"]
    comprobar("caballo negro en d7; caballo negro en f6" in primera and primera.index("Piezas de las blancas") < primera.index("FEN"), "la IA recibe la lista de piezas en palabras, cada una con su color, antes que la FEN")
    comprobar("El alumno juega con las negras" in primera and "le toca al rival del alumno" in primera, "y se le dice con qué color juega el alumno (aquí, las negras: el tablero girado) y a quién le toca")
    comprobar(pg.evaluate("game.headers.White = 'Yo Mismo'; settings.myNames = 'Yo Mismo'; aiStudentSide(cur())") == 1 and pg.evaluate("settings.myNames = ''; aiStudentSide(cur())") == -1,
              "si la partida lleva tu nombre, ése es tu color; si no, el del lado del tablero que tienes abajo")
    comprobar(len(llamadas) == 2 and "en d7 hay un caballo negro, no un alfil" in llamadas[1]["messages"][1]["content"] and "en a4 no hay ninguna pieza" in llamadas[1]["messages"][1]["content"],
              "si se equivoca sobre las piezas («el alfil de d7», «tu caballo de a4»), se le pide que corrija diciéndole qué hay de verdad")
    comprobar("caballo de d7 defiende" in pg.inner_text("#aiAnswer .ai-text") and "caballo blanco de f3" in pg.inner_text("#aiAnswer .ai-text") and pg.locator("#aiAnswer .ai-unverified").count() == 0, "y se muestra su respuesta corregida")
    estado["corrige"] = False; llamadas.clear()
    pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=90000)
    comprobar(pg.locator("#aiAnswer .ai-unverified").count() == 2 and "se ha equivocado sobre la posición" in pg.inner_text("#aiAnswer") and "hay un caballo negro" in pg.inner_text("#aiAnswer"),
              "si insiste en el error, se marca con ⚠ y se dice qué hay de verdad en esa casilla")
    pg.evaluate("Object.assign(settings, { aiProvider: 'none', aiCtxLichess: true, aiPropose: true }); renderAiBox()")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_repaso_y_preguntas(browser):
    print("Novedades 1.51.0: el profesor comenta la partida y preguntas sin escribir")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    llamadas = []
    def chat(r):
        m = json.loads(r.request.post_data)
        llamadas.append(m)
        txt = '{"lineas":[]}' if "SÓLO con JSON" in m["messages"][0]["content"] else "En el momento clave las blancas jugaron **Cxe5** y lo mejor era otra cosa. Lección: no comas un peón envenenado."
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": txt}}))
    ctx.route("http://localhost:11434/api/chat", chat)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    pg.evaluate("$('welcomeBox').hidden = true; Object.assign(settings, { aiProvider: 'ollama', aiWatch: false, aiModel: 'qwen2.5:7b', aiCtxLichess: false, aiPropose: false, analysisMs: 300 }); renderAiBox();"
                "loadPgnText('[White \"Yo\"]\\n[Black \"Rival\"]\\n\\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1', { endAtEnd: true })")
    pg.evaluate("analyseGame()")
    pg.wait_for_function("ui.report && !ui.analysing && $('aiReviewBtn')", timeout=120000)
    pg.click("#aiReviewBtn")
    pg.wait_for_function("$('aiReviewBox').querySelector('.ai-text')", timeout=60000)
    u = llamadas[-1]["messages"][1]["content"]
    comprobar("Momento clave 1:" in u and "Piezas de las blancas:" in u and "Lo mejor era" in u and "Comenta la partida como un entrenador" in u,
              "«🤖 Que la comente el profesor» le da a la IA los momentos clave con su posición, lo jugado y lo que era mejor")
    comprobar(pg.locator("#aiReviewBox [data-rv-go]").count() >= 1 and pg.locator("#aiReviewBox .ai-mv").count() >= 1, "el comentario enlaza los momentos clave y sus jugadas se pueden pulsar")
    pg.click("#aiReviewBox [data-rv-go]")
    comprobar(pg.evaluate("!!cur().parent && cur() !== Pgn.mainlineFrom(game.root).pop()"), "«Ir a» lleva al momento clave")
    pg.click("#aiReviewBox [data-rv-save]")
    comprobar("Comentario del profesor IA" in pg.evaluate("game.root.comment"), "se puede guardar como comentario de la partida")
    # Preguntas sin escribir: dependen de la jugada seleccionada
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root)[6])")   # 4.Cxe5
    etiquetas = pg.evaluate("[...$('aiQuick').querySelectorAll('button')].map(b => b.textContent)")
    comprobar("¿Por qué 4.Cxe5?" in etiquetas and "¿Qué amenaza el rival?" in etiquetas, f"las preguntas rápidas cambian con la jugada seleccionada ({', '.join(etiquetas)})")
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root)[5]); playMove(Chess.moveFromUci(cur().state, 'b1c3'), 'user')")   # 4.Cc3 como variante
    etiquetas = pg.evaluate("[...$('aiQuick').querySelectorAll('button')].map(b => b.textContent)")
    comprobar("¿Cc3 o Cxe5?" in etiquetas, "con una variante aparece «¿Cc3 o Cxe5?» para compararlas")
    llamadas.clear()
    pg.click("#aiQuick button:has-text('¿Cc3 o Cxe5?')")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=90000)
    u = llamadas[-1]["messages"][1]["content"]
    comprobar("Compara 4.Cc3 con 4.Cxe5" in u and "Jugada elegida: 4.Cc3" in u and "Alternativa" in u and "4.Cxe5" in u,
              "y la IA recibe la valoración del motor de las dos jugadas")
    pg.evaluate("Object.assign(settings, { aiProvider: 'none', aiCtxLichess: true, aiPropose: true, analysisMs: 1000 }); renderAiBox()")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_fiabilidad(browser):
    print("Fiabilidad: Lichess, varias pestañas")
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", lambda r: r.abort())
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    llamadas = []
    def lichess(r):
        llamadas.append(r.request.url)
        r.fulfill(status=429, body="{}", headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("**/*lichess*/**", lichess)
    pg, errores = nueva_pagina(ctx)
    res = pg.evaluate("""async () => {
      const r1 = await Lichess.fetch('https://explorer.lichess.ovh/masters?fen=x');
      let msg = '';
      try { await Lichess.fetch('https://explorer.lichess.ovh/masters?fen=y'); } catch (e) { msg = e.message; }
      return { st: r1.status, msg, wait: Lichess.waitSeconds() };
    }""")
    comprobar(res["st"] == 429 and "esperar" in res["msg"] and res["wait"] > 50 and len(llamadas) == 1, "tras un 429 de Lichess no se vuelve a consultar durante un minuto")
    pg.fill("#moveInput", "1. e4 e5 2. Nf3")
    pg.click("#importBtn")
    pg2, err2 = nueva_pagina(ctx)
    pg.click("#saveGame")
    pg.wait_for_function("Lib.games.size === 1")
    pg2.wait_for_function("Lib.games.size === 1", timeout=5000)
    comprobar(True, "una partida guardada en una pestaña aparece en las demás")
    pg2.click('.tab-btn[data-tab="library"]')
    pg2.locator("#libBody tr").first.click()
    pg2.evaluate("document.activeElement.blur(); goTo(game.root)")
    casilla(pg2, "d2").click(); casilla(pg2, "d4").click()
    pg2.wait_for_timeout(1800)
    pg.evaluate("document.activeElement.blur(); goTo(game.root)")
    casilla(pg, "c2").click(); casilla(pg, "c4").click()
    pg.wait_for_timeout(1800)
    comprobar("otra pestaña" in pg.inner_text("#saveState"), "no se sobrescriben a ciegas los cambios hechos en otra pestaña")
    # 1.39: si el motor se cuelga en mitad de un cálculo, se pasa al interno y el cálculo se repite
    pg.wait_for_function("Engine.ready && !Engine.running", timeout=20000)
    res = pg.evaluate("""async () => {
      settings.live = false; Engine.cancel(); await new Promise(r => setTimeout(r, 300));
      Engine.watchMs = 500; Engine.kind = "stockfish"; Engine.name = "Stockfish 19"; Engine.w.postMessage = () => {};   // «Stockfish» sordo
      const job = await Promise.race([Engine.analyse(cur(), { purpose: "prueba", movetime: 300 }), new Promise(r => setTimeout(() => r(null), 20000))]);
      Engine.watchMs = 0;
      return { ok: !!(job && job.best && job.lines.length), kind: Engine.kind, note: Engine.note, revived: Engine.revived, toast: $("toast").textContent };
    }""")
    comprobar(res["ok"] and res["kind"] == "internal" and res["revived"] == 1 and "dejó de responder" in res["note"] and "dejó de responder" in res["toast"],
              "si Stockfish deja de responder, se sigue con el motor interno y el cálculo pendiente termina")
    comprobar(not errores and not err2, "sin errores de JavaScript" + (": " + "; ".join(errores + err2) if errores or err2 else ""))
    ctx.close()


def prueba_guardar_al_salir(browser):
    print("1.52.1: al pasar a otra partida no se pierden los cambios sin guardar")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.fill("#moveInput", "1. e4 e5 2. Nf3")
    pg.click("#importBtn")
    pg.click("#saveGame")
    pg.wait_for_function("Lib.games.size === 1 && !ui.dirty")
    # La escritura falla (sin espacio) justo al pasar a otra partida
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    res = pg.evaluate("""async () => {
      const id = ui.libId, put = DB.put;
      DB.put = () => Promise.reject(new Error("QuotaExceededError"));
      cur().comment = "idea importante"; markDirty();
      setGame(Pgn.parseGame("1. d4", { lang: "en" }).game);
      await new Promise(r => setTimeout(r, 300));
      DB.put = put;
      return { id, lib: Lib.games.get(id).pgn.includes("idea importante"), box: !$("rescueBox").hidden, ls: !!LS.get("ajedrezRescue", null), txt: $("rescueText").textContent };
    }""")
    comprobar(not res["lib"] and res["box"] and res["ls"] and "no se pudieron guardar" in res["txt"],
              "si falla el guardado al cambiar de partida, los cambios quedan rescatados y se avisa")
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    comprobar(pg.is_visible("#rescueBox"), "el rescate sigue ahí tras recargar la página")
    pg.click("#rescueOpen")
    lid = json.dumps(res["id"])
    pg.wait_for_function(f"!ui.dirty && Lib.games.get({lid}).pgn.includes('idea importante')", timeout=8000)
    comprobar(pg.evaluate(f"ui.libId === {lid} && $('rescueBox').hidden && !LS.get('ajedrezRescue', null)"),
              "«↩ Recuperar» vuelve a abrir la partida con los cambios y los guarda en la biblioteca")
    # Modificada en otra pestaña: antes se descartaban los cambios en silencio
    res = pg.evaluate("""async () => {
      const id = ui.libId;
      Lib.games.get(id).updated = ui.recUpdated + 5000;   // otra pestaña la ha guardado después
      cur().comment = "cambio de esta pestaña"; markDirty();
      const conf = window.confirm;
      window.confirm = () => false;
      const stay = setGame(Pgn.parseGame("1. c4", { lang: "en" }).game) === false && ui.libId === id;
      window.confirm = () => true;
      setGame(Pgn.parseGame("1. c4", { lang: "en" }).game);
      window.confirm = conf;
      await new Promise(r => setTimeout(r, 400));
      const copy = [...Lib.games.values()].find(r => r.id !== id && r.pgn.includes("cambio de esta pestaña"));
      return { stay, copy: !!copy, title: copy ? copy.title : "", orig: Lib.games.get(id).pgn.includes("cambio de esta pestaña"), n: Lib.games.size };
    }""")
    comprobar(res["stay"], "si la partida cambió en otra pestaña, se pregunta antes de salir y se puede volver a ella")
    comprobar(res["copy"] and "(copia)" in res["title"] and not res["orig"] and res["n"] == 2,
              "al aceptar, tus cambios se guardan como copia y la versión de la otra pestaña queda intacta")
    # Pestañas accesibles
    res = pg.evaluate("""() => {
      const b = document.querySelector('.tab-btn[data-tab="library"]'), p = $("tab-library");
      return { ctl: b.getAttribute("aria-controls"), lbl: p.getAttribute("aria-labelledby") === b.id, sel: document.querySelector('.tab-btn[aria-selected="true"]').dataset.tab,
               tabs: [...document.querySelectorAll('.tab-btn[data-tab]')].filter(x => x.tabIndex === 0).length };
    }""")
    comprobar(res["ctl"] == "tab-library" and res["lbl"] and res["sel"] == "study" and res["tabs"] == 1,
              "cada pestaña dice qué panel controla y sólo la activa está en el orden de tabulación")
    ply = pg.evaluate("Pgn.pathTo(cur()).length")
    pg.focus('.tab-btn[data-tab="study"]')
    pg.keyboard.press("ArrowRight")
    comprobar(pg.evaluate("ui.activeTab") == "courses" and pg.evaluate("document.activeElement.dataset.tab") == "courses" and pg.evaluate("Pgn.pathTo(cur()).length") == ply,
              "con el foco en las pestañas, → cambia de pestaña y no de jugada")
    pg.keyboard.press("End")
    comprobar(pg.evaluate("ui.activeTab") == "tools", "Fin lleva a la última pestaña")
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="marks"]')
    comprobar(pg.evaluate("""(() => { const b = document.querySelector('.sub-btn[data-sub="marks"]'); return b.getAttribute('aria-selected') === 'true' && b.getAttribute('aria-controls') === 'sub-marks'; })()"""),
              "las subpestañas de la biblioteca también son accesibles")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


PGN_COLECCION_1591 = """[White "Ana"]
[Black "Beto"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *

[White "Carla"]
[Black "Dani"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Ke3 Nf6 *

[White "Eva"]
[Black "Fran"]
[Result "*"]

1. c4 e5 2. Nc3 Nf6 *
"""


def prueba_v1591_correcciones(browser):
    print("1.59.1: guardar colecciones sin engañar, deshacer «Cortar» y símbolos PGN")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    # Guardar una colección cuando la base de datos falla
    pg.evaluate("t => setCollection(t, false, 'auditoría')", PGN_COLECCION_1591)
    pg.click('.tab-btn[data-tab="library"]')
    res = pg.evaluate("""async () => {
      const put = DB.putMany;
      DB.putMany = async () => { throw new Error("no queda espacio (prueba)"); };
      const conf = window.confirm, preguntas = [];
      window.confirm = m => { preguntas.push(m); return !m.includes("tienen errores") && !m.includes("tiene errores"); };
      await saveCollGames([0, 1, 2]);
      const tras = { lib: Lib.games.size, saved: Coll.saved.size, informe: $("collSaveReport").textContent, visible: !$("collSaveReport").hidden, toast: $("toast").textContent,
        botones: document.querySelectorAll("#pgnDbBody [data-save]").length, aviso: document.querySelectorAll("#pgnDbBody .msg-err").length };
      DB.putMany = put;
      await saveCollGames([0, 1, 2]);
      const bien = { lib: Lib.games.size, informe: $("collSaveReport").textContent, botones: document.querySelectorAll("#pgnDbBody [data-save]").length, preguntas: preguntas.length };
      window.confirm = () => true;
      await saveCollGames([1]);
      const inc = [...Lib.games.values()].find(r => r.white === "Carla");
      window.confirm = conf;
      return { tras, bien, inc: inc ? { tags: inc.tags, plies: inc.plies } : null, informe3: $("collSaveReport").textContent, pregunta: preguntas.find(m => m.includes("errores")) || "" };
    }""")
    t = res["tras"]
    comprobar(t["lib"] == 0 and t["saved"] == 0 and t["visible"] and "No se ha podido terminar de guardar: no queda espacio (prueba)" in t["informe"] and "2 quedan pendientes" in t["informe"] and t["toast"].startswith("❌") and t["botones"] == 3,
              "si falla la escritura no se anuncia como guardada: nada se marca con ✔ y el resumen dice cuántas quedan pendientes")
    comprobar(t["aviso"] == 1 and "3. Ke3" in res["pregunta"] and "incompleta" in res["pregunta"], "una partida que se detiene en una jugada ilegal se señala con ⚠ y se pregunta antes de guardarla")
    b = res["bien"]
    comprobar(b["lib"] == 2 and b["botones"] == 1 and "2 partidas guardadas completas" in b["informe"] and "1 con errores no se ha guardado" in b["informe"], "al reintentar se guardan las dos completas y la incompleta queda pendiente")
    comprobar(res["inc"] == {"tags": ["incompleta"], "plies": 4} and "1 partida guardada (1 incompleta" in res["informe3"], "si lo confirmas, la incompleta se guarda tal como se pudo leer y con la etiqueta «incompleta»")
    pg.click('.tab-btn[data-tab="study"]')
    # ✂ Cortar dice qué elimina y se puede deshacer
    pg.fill("#moveInput", "1. e4 e5 2. Nf3 {Desarrollo} Nc6 3. Bb5 a6 *")
    pg.click("#importBtn")
    pg.evaluate("goTo(game.root.children[0].children[0].children[0])")
    pg.click("#undoBtn")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == 2 and "Eliminada 2.Cf3 y lo que sigue · 4 jugadas, 1 con comentarios o dibujos" in pg.inner_text("#toast"),
              "✂ Cortar dice qué ha eliminado (cuántas jugadas y si había comentarios)")
    pg.click("#toast .toast-action")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length === 6 && cur().san === 'Nf3' && cur().comment === 'Desarrollo'"), "↩ Deshacer en el aviso recupera la continuación con sus comentarios")
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root)[4])")
    pg.click("#undoBtn")
    pg.evaluate("document.activeElement.blur()")
    pg.keyboard.press("Control+z")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == 6, "también con Ctrl+Z")
    # Símbolos PGN que antes se perdían
    pg.fill("#moveInput", "1. e4 $36 e5 $37 2. Nf3 $142 *")
    pg.click("#importBtn")
    txt = pg.inner_text("#moves")
    pgn = pg.evaluate("Pgn.exportPgn(game)")
    comprobar("→" in txt and "⌓" in txt and "1. e4 $36 e5 $37 2. Nf3 $142" in pgn, "se ven y se exportan $36, $37 y $142")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_versiones_partida(browser):
    print("1.60: versiones de una misma partida (otros comentarios, variantes o continuación)")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    cab = '[White "Ana"]\n[Black "Beto"]\n[Date "1950.01.01"]\n'
    def importar(pgn):
        pg.evaluate("t => loadPgnText(t)", pgn)
    importar(cab + "\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *")
    pg.click("#saveGame")
    pg.wait_for_function("Lib.games.size === 1 && !ui.dirty")
    # La misma partida, comentada por otro autor: se guarda como otra versión, sin preguntar
    importar('[White "Ana"]\n[Black "Beto"]\n[Date "1950.01.01"]\n[Annotator "Kasparov"]\n\n1. e4 e5 2. Nf3 {Desarrollo} Nc6 3. Bb5 {La española} (3. Bc4 Bc5) a6 *')
    pg.evaluate("() => { window._p = []; window.confirm = m => { window._p.push(m); return false; }; }")
    pg.click("#saveGame")
    pg.wait_for_function("Lib.games.size === 2")
    toast = pg.inner_text("#toast")
    comprobar("guardada como otra versión de «Ana – Beto»" in toast and "2 comentarios frente a 0" in toast and "1 variante frente a 0" in toast and pg.evaluate("window._p.length") == 0,
              "la misma partida con otros comentarios y variantes se guarda como otra versión, sin preguntar, y dice en qué se diferencia")
    comprobar(pg.evaluate("[...Lib.games.values()].map(r => r.title).sort().join(' | ')") == "Ana – Beto | Ana – Beto · notas de Kasparov", "la nueva versión lleva el nombre de quien la anota")
    # Una copia idéntica sí se pregunta (y aquí se cancela)
    importar(cab + "\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *")
    pg.evaluate("$('gameName').value = ''")
    pg.click("#saveGame")
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("Lib.games.size") == 2 and "copia idéntica" in pg.evaluate("window._p.join(' ')"), "ante una copia idéntica se pregunta antes de guardarla otra vez")
    # En la biblioteca: aviso de varias versiones y filtro
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="games"]')
    comprobar(pg.locator("#libBody .lib-title", has_text="📑2").count() == 2, "en la biblioteca, cada versión indica cuántas hay (📑2)")
    pg.select_option("#libTagFilter", "*versions")
    comprobar(pg.locator("#libBody tr").count() == 2 and "Con varias versiones (2)" in pg.inner_text("#libTagFilter"), "el filtro «📑 Con varias versiones» las muestra juntas")
    # Copia de seguridad: lo idéntico se omite y otra versión entra
    res = pg.evaluate("""async t => {
      const a = Pgn.parseGame(t[0], { lang: 'en' }).game, b = Pgn.parseGame(t[1], { lang: 'en' }).game;
      const r1 = Object.assign(recordFromGame(a), { id: 101 }), r2 = Object.assign(recordFromGame(b), { id: 102 });
      return importRecords([r1, r2, Object.assign({}, r2, { id: 103 })], []);
    }""", [cab + "\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *", cab + "\n1. e4 e5 2. Nf3 Nc6 3. Bb5 {Otra nota} a6 *"])
    comprobar(res["games"] == 1 and res["dup"] == 2 and pg.evaluate("Lib.games.size") == 3, "al importar una copia de seguridad se omite lo idéntico y entra otra versión")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_origen_evaluacion(browser):
    print("1.61: cómo se obtuvo la evaluación y 🔬 Analizar más a fondo")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.evaluate("settings.analysisMs = 200; settings.live = false; saveSettings()")
    pg.fill("#moveInput", "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0")
    pg.click("#importBtn")
    # Una posición ya evaluada antes, con otro tiempo, se reutiliza: el informe lo dice
    pg.evaluate("Pgn.mainlineFrom(game.root)[1].eval = { cp: 20, depth: 30, source: Engine.kind, engine: Engine.name, ms: 3000, best: 'g1f3', pv: ['g1f3'], second: null }")
    pg.click("#autoAnnotateBtn")
    pg.wait_for_function("document.getElementById('reportBox').classList.contains('show')", timeout=180000)
    nombre = pg.evaluate("Engine.name")
    txt = pg.inner_text("#reportExtra")
    comprobar("Cómo se ha obtenido:" in txt and f"con {nombre} a 200 ms por posición" in txt and f"1 posición con {nombre} a 3 s por posición" in txt and "de un análisis anterior" in txt and "No todas las evaluaciones son del mismo motor" in txt,
              "el informe dice con qué motor y cuánto tiempo por posición, y qué se reutilizó de un análisis anterior")
    comprobar(pg.evaluate("game.analysis && game.analysis.prov.includes('200 ms')"), "la procedencia se guarda con el análisis de la partida")
    botones = pg.locator("#reportExtra [data-deep]")
    comprobar(botones.count() >= 1, "cada momento clave tiene «🔬 Más a fondo»")
    botones.first.click()
    pg.wait_for_function("document.querySelector('#reportExtra .deep-note')", timeout=60000)
    nota = pg.inner_text("#reportExtra .deep-note")
    comprobar("recalculada con" in nota and "a 5 s por posición" in nota and "antes, de" in nota and ("Sigue siendo" in nota or "Ahora es" in nota),
              "«Más a fondo» recalcula esa jugada con más tiempo y dice si cambia el juicio")
    comprobar("a 5 s por posición" in pg.inner_text("#reportExtra .rep-prov"), "el informe se rehace y su procedencia incluye el nuevo cálculo")
    # También desde «⚖ Tu jugada frente a la del motor»
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root)[2])")
    pg.wait_for_selector("#moveCompare [data-cmp=deep]", timeout=10000)
    comprobar("Calculada con" in pg.inner_text("#moveCompare"), "la comparación con el motor dice con qué se calculó")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_recorrido_guiado(browser):
    print("1.62: recorrido guiado (importar → analizar → revisar → practicar)")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    pg.evaluate("$('welcomeBox').hidden = true; settings.analysisMs = 200; settings.live = false; settings.myNames = ''; saveSettings()")
    comprobar(pg.is_hidden("#flowGuide"), "sin partida importada no hay sugerencia")
    pg.fill("#moveInput", '[White "Ana"]\n[Black "Beto"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0')
    pg.click("#importBtn")
    txt = pg.inner_text("#flowGuide")
    comprobar(pg.is_visible("#flowGuide") and "Partida cargada" in txt and "7 jugadas" in txt and pg.locator("#flowGuide [data-flow=analyse]").count() == 1,
              "tras importar, una confirmación que no desaparece («Partida cargada · 7 jugadas») y «🤖 Analizar y comentar»")
    comprobar(pg.evaluate("$('flowGuide').parentElement.id") == "movesDock", "en el ordenador está junto a las jugadas, al lado del tablero")
    pg.click("#flowGuide [data-flow=analyse]")
    pg.wait_for_function("document.getElementById('reportBox').classList.contains('show')", timeout=180000)
    txt = pg.inner_text("#flowGuide")
    comprobar("Análisis terminado" in txt and "1 momento crítico" in txt and "1 error para practicar" in txt and pg.locator("#flowGuide [data-flow=first]").count() == 1 and pg.locator("#flowGuide [data-flow=practice]").count() == 1,
              "al terminar el análisis: «📍 Revisar el primer momento crítico» y «🎯 Practicar»")
    pg.click("#flowGuide [data-flow=first]")
    comprobar(pg.evaluate("cur().san") == "Nf6" and "Momento crítico 1 de 1" in pg.inner_text("#flowGuide") and "3...Cf6??" in pg.inner_text("#flowGuide"),
              "«Revisar el primer momento crítico» lleva el tablero a esa jugada (3...Cf6??)")
    # 🔬 Más a fondo rehace el informe: si la jugada ya no es crítica, la cuenta se pone al día y se dice
    pg.evaluate("ui.report.key = []; flowRefreshMoments()")
    comprobar("ya no es un momento crítico" in pg.inner_text("#flowGuide") and "No queda ningún momento crítico" in pg.inner_text("#flowGuide"),
              "tras «Más a fondo», la cuenta de momentos críticos se pone al día")
    pg.evaluate("ui.report = buildGameReport(ui.analysedLine); flowRefreshMoments()")
    comprobar("Momento crítico 1 de 1" in pg.inner_text("#flowGuide"), "…y vuelve a contar si recupera el momento")
    pg.click("#flowGuide [data-flow=practice]")
    pg.wait_for_function("Retry.active", timeout=10000)
    comprobar(pg.is_hidden("#flowGuide"), "«Practicar» empieza el repaso de los errores y la sugerencia se retira")
    pg.evaluate("retryEnd(true)")
    # Mis nombres: practica sólo los errores propios
    pg.evaluate("settings.myNames = 'beto'; saveSettings(); Flow.step = 'analysed'; renderFlow()")
    comprobar("mis errores (1)" in pg.inner_text("#flowGuide"), "si tu nombre está en «Mis nombres», propone practicar tus errores")
    pg.click("#flowGuide [data-flow=close]")
    comprobar(pg.is_hidden("#flowGuide"), "✖ la oculta")
    # Se puede desactivar del todo
    pg.fill("#moveInput", "1. d4 d5 2. c4 *")
    pg.click("#importBtn")
    comprobar(pg.is_visible("#flowGuide") and "3 jugadas" in pg.inner_text("#flowGuide"), "con otra partida vuelve a aparecer")
    pg.evaluate("$('setFlowGuide').checked = false; $('setFlowGuide').dispatchEvent(new Event('change'))")
    comprobar(pg.is_hidden("#flowGuide") and pg.evaluate("settings.flowGuide") is False, "se desactiva en ⚙ Ajustes")
    pg.evaluate("$('setFlowGuide').checked = true; $('setFlowGuide').dispatchEvent(new Event('change'))")
    pg.evaluate("setGame(Pgn.newGame(), { noConfirm: true })")
    comprobar(pg.is_hidden("#flowGuide"), "al cambiar de partida se quita")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_descriptiva(browser):
    print("1.63: notación descriptiva española (libros antiguos)")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true; settings.live = false; saveSettings()")
    # Importar una partida en descriptiva con una captura ambigua: se para, se elige en el tablero y sigue
    pg.fill("#moveInput", "1. P4R P4D 2. P4AD PxP 3. C3AD C3AR 4. C x P P3R *")
    pg.click("#importBtn")
    comprobar(pg.is_visible("#descPick") and "«PxP» admite 2 jugadas" in pg.inner_text("#descPick") and pg.evaluate("Pgn.mainlineFrom(game.root).length") == 3 and pg.evaluate("cur().san") == "c4",
              "al importar, una jugada ambigua («PxP») para la lectura y el tablero queda en esa posición")
    comprobar(pg.evaluate("DescPick.ucis.join()") == "d5c4,d5e4" and "dxc4" in pg.inner_text("#descPick") and "(PxPA)" in pg.inner_text("#descPick"), "dice las dos lecturas, en algebraica y en descriptiva sin ambigüedad")
    casilla(pg, "d5").click(); casilla(pg, "e4").click()
    pg.wait_for_timeout(200)
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).map(n => n.san).join(' ')") == "e4 d5 c4 dxe4 Nc3 Nf6 Nxe4 e6" and pg.is_hidden("#descPick"), "elegir en el tablero (dxe4) sigue leyendo el resto de la partida")
    # Ver también en descriptiva, en la lista y en la planilla
    pg.click("#descViewBtn")
    txt = pg.inner_text("#moves")
    comprobar("P4R" in txt and "C3AR" in txt and "CxP" in txt and pg.evaluate("settings.showDesc") is True, "📜 Descriptiva muestra cada jugada también en descriptiva (P4R junto a e4)")
    pg.click("#moveViewBtn")
    comprobar("P4R" in pg.inner_text("#moves") and pg.locator("#moves .sheet-row").count() >= 4, "…también en la planilla")
    pg.click("#moveViewBtn")
    pg.click("#descViewBtn")
    comprobar("P4R" not in pg.inner_text("#moves"), "y se quita")
    # Escribir una jugada como en el libro
    pg.evaluate("setGame(Pgn.newGame(), { noConfirm: true })")
    for j in ["p4r", "P-4R", "C3AR", "C3AD", "A4A", "P3D"]:
        pg.fill("#moveTyped", j); pg.press("#moveTyped", "Enter")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).map(n => n.san).join(' ')") == "e4 e5 Nf3 Nc6 Bc4 d6", "en «⌨ Escribe una jugada» se puede escribir como en el libro (p4r, P-4R, C3AR, A4A)")
    pg.evaluate("setGame(Pgn.parseGame('1. e4 d5 2. c4 e6', { lang: 'en' }).game, { noConfirm: true }); goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.fill("#moveTyped", "PxP"); pg.press("#moveTyped", "Enter")
    comprobar(pg.is_visible("#descPick") and pg.evaluate("DescPick.ucis.join()") == "c4d5,e4d5", "si lo escrito admite varias jugadas, se elige")
    pg.locator('#descPick [data-dp="c4d5"]').click()
    comprobar(pg.evaluate("cur().san") == "cxd5" and pg.is_hidden("#descPick"), "…con su botón")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_v153_distribucion(browser):
    print("1.53: jugadas al lado del tablero, herramientas del motor plegadas y bienvenida compacta")
    ctx = contexto(browser, viewport={"width": 1440, "height": 900})
    pg, errores = nueva_pagina(ctx, plegado=True)
    if pg.is_visible("#welcomeClose"):
        pg.click("#welcomeClose")
    r = pg.evaluate("""() => ({ dock: $("moves").parentElement.id, moves: $("moves").getBoundingClientRect().top, ann: $("annotation").getBoundingClientRect().top,
                                 tools: $("engineTools").hidden, imp: $("importDetails").open, mark2: $("markBtn2").offsetParent === null })""")
    comprobar(r["dock"] == "movesDock" and r["moves"] < 400 and r["ann"] < 900,
              "en el ordenador, las jugadas y el comentario se ven al lado del tablero sin bajar la página")
    comprobar(r["tools"] and not r["imp"] and r["mark2"], "las herramientas del motor e «Importar / exportar» empiezan plegados, sin botones repetidos")
    pg.click("#engineToolsBtn")
    comprobar(pg.is_visible("#thinkBtn") and pg.get_attribute("#engineToolsBtn", "aria-expanded") == "true", "«🧰 Herramientas» despliega el resto de herramientas del motor")
    pg.click("#importDetails > summary")
    pg.wait_for_timeout(100)
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    comprobar(pg.is_visible("#thinkBtn") and pg.is_visible("#moveInput"), "se recuerda si estaban desplegados")
    pg.fill("#moveInput", "1. e4 e5 2. Nf3 Nc6")
    pg.click("#importBtn")
    pg.locator("#movesDock .mv").nth(1).click()
    comprobar(pg.evaluate("Pgn.pathTo(cur()).length") == 3, "las jugadas del panel derecho se pueden pulsar como siempre")
    pg.evaluate("fullBoard(true)")
    comprobar(pg.evaluate("!!$('moves').closest('.board-side') && $('movesDock').hidden"), "a pantalla completa las jugadas vuelven junto al tablero")
    pg.evaluate("fullBoard(false)")
    comprobar(pg.evaluate("$('moves').parentElement.id === 'movesDock' && !$('movesDock').hidden"), "al salir vuelven al panel derecho")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()
    ctx = contexto(browser, viewport={"width": 390, "height": 844})
    pg, errores = nueva_pagina(ctx, plegado=True)
    r = pg.evaluate("() => ({ vis: !$('welcomeBox').hidden, h: $('welcomeBox').getBoundingClientRect().height, board: $('board').getBoundingClientRect().top })")
    comprobar(r["vis"] and r["h"] < 230 and r["board"] < 380, f"en el móvil, la bienvenida es compacta y el tablero se ve enseguida ({r['h']:.0f} px)")
    # En un contexto aparte: tras salir de la pantalla completa real (en la CI sí lo es), la ventana no se puede redimensionar enseguida
    comprobar(pg.evaluate("!!$('moves').closest('.board-side') && $('movesDock').hidden"), "en el móvil las jugadas siguen debajo del tablero")
    pg.click('[data-welcome="analyse"]')
    comprobar(pg.is_visible("#moveInput"), "«Analizar una partida mía» despliega «Importar / exportar»")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_estructuras(browser):
    print("1.54: estructuras de peones, sus planes y partidas modelo")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    # Una partida con la estructura Carlsbad en la biblioteca, para las partidas modelo
    pg.fill("#moveInput", "[White \"Modelo\"]\n[Black \"Carlsbad\"]\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 c6 6. e3 Be7 7. Bd3 O-O 8. Qc2 Nbd7 9. Nf3 Re8 10. O-O Nf8 11. Rab1 a5 12. a3 g6 13. b4 axb4 14. axb4 Ne6")
    pg.click("#importBtn")
    pg.click("#saveGame")
    pg.wait_for_function("Lib.games.size === 1")
    pg.click("#newGame")
    comprobar(pg.is_hidden("#structBox"), "en la posición inicial no aparece ninguna estructura")
    pg.fill("#moveInput", "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 c6 6. e3 Be7")
    pg.click("#importBtn")
    pg.evaluate("document.activeElement.blur(); goTo(Pgn.mainlineFrom(game.root).pop())")
    comprobar(pg.is_visible("#structBox") and "Carlsbad" in pg.inner_text("#structName"), "en el Gambito de Dama con cambio reconoce la estructura Carlsbad")
    pg.click("#structBox > summary")
    txt = pg.inner_text("#structBody")
    comprobar("Plan de las blancas" in txt and "b2–b4–b5" in txt and "Plan de las negras" in txt, "explica el plan de cada bando (el ataque de minorías)")
    pg.click("#structShowBtn")
    comprobar(pg.locator("#arrowsGroup circle").count() >= 3 and not pg.evaluate("(cur().shapes || []).length"), "«Ver las casillas clave» las rodea sin guardarlas en la partida")
    pg.click("#structModelsBtn")
    pg.wait_for_selector("#structModels .struct-model", timeout=15000)
    modelos = pg.inner_text("#structModels")
    comprobar("Modelo – Carlsbad" in modelos and "tu biblioteca" in modelos, "encuentra partidas modelo con la misma estructura en tu biblioteca")
    code = pg.evaluate("Struct.code")
    pg.locator("#structModels .struct-model", has_text="tu biblioteca").locator("[data-sm]").click()
    pg.wait_for_timeout(300)
    r = pg.evaluate("({ code: pawnStruct(cur().state.b), prev: cur().parent ? pawnStruct(cur().parent.state.b) : 0, name: $('gameName').value, tab: ui.activeTab })")
    comprobar(r["code"] == code and r["prev"] != code and "Carlsbad" in r["name"] and r["tab"] == "study", "«Abrir» lleva a la partida modelo justo cuando aparece la estructura")
    pg.evaluate("setGame(Pgn.parseGame('1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5 exd5 5. Nf3 Nc6 6. g3 Nf6 7. Bg2 Be7 8. O-O O-O 9. dxc5 Bxc5', { lang: 'en' }).game, { noConfirm: true }); goTo(Pgn.mainlineFrom(game.root).pop())")
    comprobar("Peón aislado" in pg.inner_text("#structName") and "d5" in pg.inner_text("#structName"), "con el peón aislado de las negras, las casillas se giran (aislado en d5)")
    ctxt = pg.evaluate("aiContext(cur()).then(c => ({ text: c.text, sources: c.sources }))")
    comprobar("Peón aislado de dama" in ctxt["text"] and "Plan típico de las negras" in ctxt["text"] and any("estructura" in x for x in ctxt["sources"]),
              "el profesor IA recibe la estructura y sus planes como contexto")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_comentar_repertorio(browser):
    print("1.55: el profesor IA comenta tu repertorio (con Stockfish antes) y se comprueba lo que dice")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    estado = {"consultas": 0, "correcciones": 0}
    def chat(r):
        cuerpo = json.loads(r.request.post_data)
        texto = cuerpo["messages"][-1]["content"]
        estado["consultas"] += 1
        ids = re.findall(r"^\[(n\d+)\]", texto, re.M) or re.findall(r"\[(n\d+)\] «", texto)
        if "errores sobre la posición" in texto:
            estado["correcciones"] += 1
            arr = [{"id": i, "comentario": "Corregido: desarrolla el alfil y prepara el enroque.", "siSeSale": ""} for i in re.findall(r"^\[(n\d+)\] «", texto, re.M)]
        else:
            # El primer comentario se equivoca sobre la posición (en h5 no hay nada): la aplicación debe pedir que lo corrija
            arr = [{"id": i, "comentario": ("El caballo de h5 está indefenso." if k == 0 else "Desarrolla una pieza y lucha por el centro."), "siSeSale": "Si juega otra cosa, sigue con el desarrollo."} for k, i in enumerate(ids)]
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": "Aquí tienes:\n" + json.dumps(arr, ensure_ascii=False)}}))
    ctx.route("http://localhost:11434/api/chat", chat)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=20000)
    entrenar(pg, "rep")
    pg.fill("#repNewName", "Blancas: prueba IA")
    pg.click("#repNewBtn")
    pg.wait_for_function("ui.libId && ui.activeTab === 'study'")
    jugar = lambda camino, ucis: pg.evaluate(f"""(() => {{ goTo(resolvePath(game.root, {json.dumps(camino)})); for (const u of {json.dumps(ucis)}) playMove(Chess.moveFromUci(cur().state, u), 'user'); }})()""")
    jugar([], ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"])
    jugar(["e2e4"], ["e7e6", "f1a6"])
    pg.evaluate("goTo(resolvePath(game.root, ['e2e4', 'e7e5', 'g1f3'])); cur().comment = 'Mi nota: la jugada de siempre'; markDirty()")
    pg.wait_for_function("!ui.dirty", timeout=5000)
    rep_id = pg.evaluate("ui.libId")
    pg.evaluate("settings.aiProvider = 'ollama'; settings.aiModel = 'prueba:1b'; saveSettings()")
    entrenar(pg, "rep")
    pg.locator("[data-rep-ai]").first.click()
    pg.wait_for_function("!RepAI.busy && $('repReviewOut').textContent.includes('Comentarios de')", timeout=240000)
    out = pg.inner_text("#repReviewOut")
    pg.wait_for_function("!ui.dirty", timeout=8000)
    res = pg.evaluate(f"""(() => {{
      const rec = Lib.games.get({json.dumps(rep_id)});
      const g = Pgn.parseGame(rec.pgn, {{ lang: 'en' }}).game;
      const at = p => resolvePath(g.root, p);
      return {{ e4: at(['e2e4']).comment || '', nf3: at(['e2e4', 'e7e5', 'g1f3']).comment || '', ba6: at(['e2e4', 'e7e6', 'f1a6']).comment || '',
               orig: !!rec.orig, open: ui.libId === {json.dumps(rep_id)} }};
    }})()""")
    comprobar("jugadas comentadas" in out or "jugada comentada" in out, "el resumen dice cuántas jugadas se han comentado")
    comprobar(res["nf3"].startswith("Mi nota: la jugada de siempre") and "🤖" in res["nf3"], "los comentarios de la IA (con 🤖) se añaden sin borrar los tuyos")
    comprobar("⚠ Stockfish" in res["ba6"] and "era mejor 2." in res["ba6"], "Stockfish avisa en el comentario de la jugada dudosa (2.Aa6) y dice la mejor")
    comprobar(estado["correcciones"] >= 1 and "h5" not in res["e4"] and ("Corregido" in res["e4"] or "🤖" not in res["e4"]),
              "si la IA se equivoca sobre la posición se le pide corregir, y lo erróneo no se guarda")
    comprobar("Si juega otra cosa" in res["nf3"] and "Si el rival se sale: Si" not in res["nf3"], "incluye qué hacer si el rival se sale")
    comprobar(res["orig"] and res["open"], "el repertorio se guarda solo y la versión anterior queda en 🕘 Versiones")
    # Volver a comentarlo sustituye los de la IA en vez de acumularlos
    entrenar(pg, "rep")
    pg.locator("[data-rep-ai]").first.click()
    pg.wait_for_function("!RepAI.busy && $('repReviewOut').textContent.includes('Comentarios de')", timeout=240000)
    pg.wait_for_function("!ui.dirty", timeout=5000)
    nf3 = pg.evaluate(f"resolvePath(Pgn.parseGame(Lib.games.get({json.dumps(rep_id)}).pgn, {{ lang: 'en' }}).game.root, ['e2e4', 'e7e5', 'g1f3']).comment")
    comprobar(nf3.count("Desarrolla una pieza") == 1 and nf3.startswith("Mi nota"), "al volver a comentarlo, los comentarios de la IA se sustituyen y no se acumulan")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_memoria_entrenador(browser):
    print("1.56: el entrenador recuerda tus clases, repite lo fallado y propone una clase corta en «Hoy»")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    pg.evaluate("$('welcomeBox').hidden = true")
    pg.click('.tab-btn[data-tab="tools"]')
    comprobar("Clase corta del día" in pg.inner_text("#todayBox") and pg.is_visible("#coachDailyBtn"), "«Hoy» propone la clase corta del día con el entrenador")
    pg.click("#coachDailyBtn")
    pg.wait_for_function("Coach.state === 'ask'", timeout=30000)
    comprobar(pg.evaluate("Coach.queue.length") == 4, "la clase del día tiene 4 posiciones")
    pids = []
    for i in range(4):
        pids.append(pg.evaluate("Coach.ex.pid || ''"))
        pg.click("#coachBox [data-co=skip]")
        pg.wait_for_function(f"Coach.state === 'ask' || Coach.state === 'summary'", timeout=30000)
    txt = pg.inner_text("#coachBox")
    comprobar("volverán dentro de 3 días" in txt, "el resumen dice que lo fallado volverá dentro de 3 días")
    mem = pg.evaluate("(() => { const m = LS.get('ajedrezEntrenador', {}); return { ses: (m.sessions || []).length, retry: Object.values(m.retry || {}).filter(r => !r.done).length }; })()")
    comprobar(mem["ses"] == 1 and mem["retry"] == 4, "la clase queda en la memoria del entrenador, con sus 4 posiciones para repetir")
    pg.click("#coachBox [data-co=end]")
    comprobar("hecha" in pg.inner_text("#todayBox"), "en «Hoy» la clase del día aparece como hecha")
    # Cuatro días después: tocan las posiciones falladas
    pg.evaluate("(() => { const m = LS.get('ajedrezEntrenador'); for (const r of Object.values(m.retry)) r.due = Date.now() - 1000; LS.set('ajedrezEntrenador', m); })()")
    pg.click('#trainMenu [data-train-open="coach"]') if pg.is_visible('#trainMenu [data-train-open="coach"]') else entrenar(pg, "coach")
    pg.evaluate("coachRenderStart()")
    comprobar("Hoy repetimos 4 posiciones" in pg.inner_text("#coachDiag") and "Lo que recuerdo de tus clases" in pg.inner_text("#coachDiag"), "el entrenador recuerda la clase anterior y avisa de lo que toca repetir")
    pg.select_option("#coachLen", "4"); pg.click("#coachStartBtn")
    pg.wait_for_function("Coach.state === 'ask'", timeout=30000)
    q = pg.evaluate("Coach.queue.map(x => ({ again: !!x.again, pid: x.pid || '' }))")
    comprobar(q[0]["again"] and q[1]["again"] and q[0]["pid"] in pids and q[1]["pid"] in pids, "la nueva clase empieza por posiciones que fallaste en la anterior")
    pg.evaluate("playMove(Chess.moveFromUci(Coach.ex.node.state, Coach.ex.best), 'user')")
    pg.wait_for_function("Coach.state === 'solved'", timeout=30000)
    pid0 = q[0]["pid"]
    comprobar(pg.evaluate(f"!!LS.get('ajedrezEntrenador').retry['p:{pid0}'].done"), "al acertarla a la primera sale de la lista de repetir")
    pg.click("#coachBox [data-co=end]") if pg.is_visible("#coachBox [data-co=end]") else pg.evaluate("coachEnd()")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_v157_actividad_y_ajustes(browser):
    print("1.57: qué estás haciendo (cabecera) y ajustes por categorías")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true")
    chip = lambda: (pg.wait_for_timeout(250), pg.inner_text("#modeChip"))[1]
    comprobar("Analizando" in chip() and pg.is_visible("#modeChip"), "la cabecera dice qué estás haciendo: analizar una partida")
    entrenar(pg, "puzzles")
    pg.evaluate("startPuzzles()")
    pg.wait_for_function("trainer.active && trainer.puzzle", timeout=10000)
    t = chip()
    comprobar("Problema 1 de" in t and "Problema 1 de" in pg.title(), "con los problemas: «Problema 1 de N», también en el título de la pestaña")
    pg.click("#modeChip")
    pg.evaluate("stopTraining(true)")
    pg.evaluate("openLesson(COURSES[0].id, 0)")
    comprobar("Lección" in chip(), "con una lección abierta, lo dice")
    # Ajustes por categorías
    pg.click("#settingsBtn")
    tabs = pg.locator(".set-tab").count()
    vis = pg.evaluate("[...document.querySelectorAll('.set-sec')].filter(x => x.offsetParent).map(x => x.dataset.set)")
    comprobar(tabs == 7 and len(vis) == 1, "los ajustes van en 7 pestañas y se ve una cada vez")
    pg.click("#setTab-motor")
    comprobar(pg.is_visible("#setEngineSpeed") and not pg.is_visible("#setAiProvider") and pg.get_attribute("#setTab-motor", "aria-selected") == "true", "cada pestaña enseña sólo lo suyo")
    pg.select_option("#setEngineSpeed", "deep")
    r = pg.evaluate("({ a: settings.analysisMs, l: settings.liveMs, inp: $('setAnalysisMs').value })")
    comprobar(r["a"] == 2500 and r["l"] == 10000 and r["inp"] == "2500", "«Profundo» ajusta el tiempo del motor; los milisegundos están en Avanzado")
    pg.click("#setTab-avanzado")
    pg.fill("#setAnalysisMs", "1700"); pg.dispatch_event("#setAnalysisMs", "change")
    pg.click("#setTab-motor")
    comprobar(pg.input_value("#setEngineSpeed") == "custom", "si cambias los milisegundos a mano, la profundidad pasa a «Personalizado»")
    pg.keyboard.press("Escape")
    pg.click("#settingsBtn")
    comprobar(pg.is_visible("#setEngineSpeed"), "al volver a abrir los ajustes, sigue en la última pestaña")
    pg.keyboard.press("Escape")
    pg.evaluate("cmdUse('setAiProvider', false)")
    pg.wait_for_timeout(300)
    comprobar(pg.is_visible("#setAiProvider"), "el buscador abre la pestaña en la que está el ajuste")
    pg.keyboard.press("Escape")
    pg.click("#engineSourceBadge")
    comprobar(pg.is_visible("#engineStatus"), "pulsar el estado del motor abre los ajustes en «Motor»")
    pg.keyboard.press("Escape")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_vigilancia_ia(browser):
    print("1.58: vigilancia en una sola consulta (la IA responde y Stockfish revisa después)")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    llamadas = []
    respuesta = {"txt": ""}
    def chat(r):
        m = json.loads(r.request.post_data)
        llamadas.append(m)
        u = m["messages"][-1]["content"]
        txt = "Mejor **Cc6**, que defiende el peón de e5." if "no son buenas" in u else respuesta["txt"]
        r.fulfill(status=200, headers=cab, body=json.dumps({"message": {"role": "assistant", "content": txt}}))
    ctx.route("http://localhost:11434/api/chat", chat)
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("Engine.ready", timeout=30000)
    pg.evaluate("$('welcomeBox').hidden = true; Object.assign(settings, { aiProvider: 'ollama', aiModel: 'qwen2.5:7b', aiCtxLichess: false, aiPropose: true, aiWatch: null }); renderAiBox(); syncAiCtxForm();"
                "const g = Pgn.parseGame('1. e4 e5 2. Nf3', { lang: 'en' }).game; setGame(g, { noConfirm: true, current: Pgn.mainlineFrom(g.root).pop() })")
    comprobar(pg.evaluate("aiWatchOn()"), "con Ollama, la vigilancia en una sola consulta viene activada")
    # 1) Recomienda una jugada mala: el motor la revisa y se le pide corregir (2 consultas, sin la de propuestas)
    respuesta["txt"] = "Te recomiendo **Aa3**, que ataca el flanco de dama."
    pg.fill("#aiQuestion", "¿Qué hago?"); pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=120000)
    txt = pg.inner_text("#aiAnswer")
    comprobar(len(llamadas) == 2 and not any("SÓLO con JSON" in m["messages"][0]["content"] for m in llamadas), f"recomendaba una jugada mala: una consulta más para corregir y ninguna de propuestas ({len(llamadas)})")
    comprobar("Cc6" in pg.inner_text("#aiAnswer .ai-text") and "se le pidió corregir" in txt and "Aa3" in txt, "la respuesta corregida se enseña y se dice qué se corrigió")
    # 2) Recomienda una jugada buena (y desaconseja una mala): una sola consulta
    llamadas.clear()
    respuesta["txt"] = "Juega **Cc6**, que defiende e5. No juegues Aa3, que pierde el alfil."
    pg.click("#aiAskBtn")
    pg.wait_for_function("!AI.busy && $('aiAnswer').querySelector('.ai-text')", timeout=120000)
    comprobar(len(llamadas) == 1 and "Vigilancia" in pg.inner_text("#aiAnswer"), "si lo que recomienda está bien, basta una sola consulta (y lo que desaconseja no se cuenta)")
    # 3) Desactivada: vuelve el modo de las propuestas comprobadas antes
    llamadas.clear()
    pg.click(".ai-ctx summary"); pg.uncheck("#aiWatch")
    comprobar(not pg.is_disabled("#aiPropose") and pg.evaluate("settings.aiWatch") is False, "se puede desactivar, y entonces vuelve la casilla de las propuestas")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_v159_herramientas(browser):
    print("1.59: modo básico, estado de los servicios, comparar dos posiciones y espacios de trabajo")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true")
    # Estado de los servicios
    comprobar(pg.is_visible("#servicesBtn") and "svc-dot" in (pg.get_attribute("#servicesDot", "class") or ""), "en la cabecera hay un indicador del estado de los servicios")
    pg.click("#servicesBtn")
    t = pg.inner_text("#servicesList")
    comprobar(all(x in t for x in ["Motor", "Conexión", "Profesor IA", "Lichess", "Sincronización"]), "el cuadro dice cómo están el motor, la conexión, el profesor IA, Lichess y la sincronización")
    pg.locator("#servicesList .svc-row", has_text="Profesor IA").locator("button").click()
    comprobar(pg.is_visible("#setAiProvider"), "desde el estado de un servicio se va a su ajuste")
    pg.keyboard.press("Escape")
    # Modo básico
    revelar(pg, "#setUiMode")
    pg.click("#settingsBtn"); revelar(pg, "#setUiMode"); pg.select_option("#setUiMode", "basic")
    pg.keyboard.press("Escape")
    comprobar(pg.evaluate("document.body.classList.contains('ui-basic')") and not pg.is_visible("#exportControls") and not pg.is_visible("#engineToolsBtn"), "en modo básico se ocultan los botones menos usados")
    comprobar(pg.is_visible("#liveToggle") and pg.is_visible("#moves"), "lo esencial sigue a la vista (motor y jugadas)")
    pg.reload(); pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    comprobar(pg.evaluate("document.body.classList.contains('ui-basic')"), "el modo básico se recuerda")
    pg.evaluate("setUiMode('full')")
    # Comparar dos posiciones
    pg.evaluate("$('welcomeBox').hidden = true; const g = Pgn.parseGame('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 c6 6. e3', { lang: 'en' }).game; setGame(g, { noConfirm: true }); goTo(resolvePath(g.root, ['d2d4', 'd7d5', 'c2c4', 'e7e6']))")
    pg.click("#cmpBox > summary"); pg.click("#cmpSetA")
    pg.evaluate("goTo(Pgn.mainlineFrom(game.root).pop())")
    pg.wait_for_timeout(200)
    t = pg.inner_text("#cmpBody")
    comprobar("De A a B" in t and "3.Cc3" in t and "Carlsbad" in t, "compara A con el tablero: las jugadas entre ambas y la estructura (Carlsbad en B)")
    comprobar("peón e2 → e3" in t and "peón c4 ✗" in t and "Ac1 → g5" in t, "dice qué piezas han cambiado de sitio (sin emparejar peones de columnas lejanas)")
    pg.click("#cmpGoA")
    comprobar(pg.evaluate("Pgn.pathTo(cur()).length") == 5, "«Ir a A» vuelve a la posición fijada")
    # Espacios de trabajo
    pg.click("#settingsBtn"); revelar(pg, "#wsSelect")
    opts = pg.evaluate("[...$('wsSelect').options].map(o => o.value)")
    comprobar(opts[:3] == ["analizar", "jugar", "entrenar"], "hay tres espacios de trabajo de serie: Analizar, Jugar y Entrenar")
    pg.select_option("#wsSelect", "entrenar"); pg.click("#wsApply")
    r = pg.evaluate("({ live: settings.live, basic: document.body.classList.contains('ui-basic'), tab: ui.activeTab, arrow: settings.arrow })")
    comprobar(not r["live"] and r["basic"] and r["tab"] == "tools" and not r["arrow"], "«Entrenar» quita el análisis en vivo y la flecha, pone el modo básico y abre Entrenar")
    pg.select_option("#wsSelect", "analizar"); pg.click("#wsApply")
    r = pg.evaluate("({ live: settings.live, basic: document.body.classList.contains('ui-basic'), tab: ui.activeTab, tools: settings.engineTools })")
    comprobar(r["live"] and not r["basic"] and r["tab"] == "study" and r["tools"], "«Analizar» lo devuelve todo para analizar")
    pg.evaluate("window.prompt = () => 'Mis aperturas'; settings.multipv = 2")
    pg.click("#wsSave")
    w = pg.evaluate("(settings.workspaces || []).map(x => ({ n: x.name, m: x.cfg.multipv }))")
    comprobar(len(w) == 1 and "Mis aperturas" in w[0]["n"] and w[0]["m"] == 2 and not pg.is_disabled("#wsDelete"), "se puede guardar el espacio de trabajo actual con un nombre (y borrarlo)")
    pg.keyboard.press("Escape")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_salir_del_entrenamiento(browser):
    print("Salir de cada entrenamiento con los botones de la sesión")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    jugadas = pg.evaluate("Pgn.mainlineFrom(game.root).length")
    entrenar(pg, "puzzles")
    pg.click("#puzzleStartBtn")
    pg.wait_for_function("trainer.active && trainer.puzzle && trainerUserTurn() && !trainer.busy", timeout=10000)
    comprobar(not pg.is_visible("#trainSessionBtns") and pg.locator("#trainFeedback [data-pz]").count() == 3, "en los problemas sólo están sus botones (sin «Pista» y «Salir» repetidos)")
    pg.evaluate("$('stopTrainBtn').click()")
    comprobar("Sesión terminada" in pg.inner_text("#trainFeedback") and not pg.evaluate("Puz.queue.length"), "«Salir» termina la sesión de problemas con su resumen")
    pg.click("#puzzlesBackBtn")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == jugadas and not pg.is_visible("#trainFeedback"), "y se vuelve a la partida que había en el tablero")
    pg.click("#examStartBtn")
    pg.wait_for_function("trainer.active && Puz.exam", timeout=10000)
    pg.evaluate("$('stopTrainBtn').click()")
    comprobar(not pg.evaluate("Puz.exam") and pg.evaluate("Pgn.mainlineFrom(game.root).length") == jugadas, "«Salir» abandona el examen (sin dejar el reloj en marcha) y devuelve tu partida")
    pg.evaluate("""async () => { const r = Pgn.parseGame('1. e4 e5 2. Nf3 *'); await importRecords([recordFromGame(r.game, { title: 'Marcas' })], []);
      const g = [...Lib.games.values()].find(x => x.title === 'Marcas');
      for (const [fen, ans] of [['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'e7e5'], ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'g1f3']]) {
        const m = { gameId: g.id, path: [], cat: 'fav', train: 'best', fenBefore: fen, answer: ans, num: '1.', san: 'e4', color: 1, created: Date.now() };
        m.id = await DB.put('marks', m); Lib.marks.set(m.id, m); }
      refreshLibraryViews(); }""")
    pg.click("#trainBackBtn")
    entrenar(pg, "cards")
    pg.click("#cardsAllBtn")
    pg.wait_for_function("trainer.active && trainer.card", timeout=10000)
    comprobar(pg.is_visible("#stopTrainBtn") and pg.evaluate("$('trainFeedback').nextElementSibling === $('trainSessionBtns')"), "en las tarjetas «Pista» y «Salir» van junto al mensaje")
    pg.click("#stopTrainBtn")
    comprobar("Repaso terminado" in pg.inner_text("#trainFeedback") and not pg.evaluate("Cards.queue.length"), "«Salir» termina el repaso de tarjetas")
    pg.click("#cardsDoneBackBtn")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).length") == jugadas and pg.evaluate("game.headers.Event") != "Tarjeta", "y «Volver a tu partida» la recupera")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_salir_movil(browser):
    print("En el móvil, «Pista» y «Salir» bajan con el mensaje del entrenador")
    ctx = contexto(browser, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    pg, errores = nueva_pagina(ctx)
    pg.click('.tab-btn[data-tab="tools"]')
    pg.click('#trainMenu [data-train-open="rep"]')
    pg.click("#startTrainBtn")
    pg.wait_for_function("trainer.active", timeout=10000)
    caja = pg.evaluate("(() => { const a = $('trainFeedback').getBoundingClientRect(), b = $('stopTrainBtn').getBoundingClientRect(); return [a.bottom, b.top, $('trainFeedback').closest('.board-side') !== null]; })()")
    comprobar(caja[2] and 0 <= caja[1] - caja[0] < 40, "los botones de la sesión quedan justo debajo del mensaje, bajo el tablero")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_pantalla_completa(browser):
    print("Novedades 1.38: tablero a pantalla completa")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true; setGame(Pgn.parseGame('1. e4 e5 2. Nf3 Nc6', { lang: 'en' }).game, { noConfirm: true })")
    antes = pg.locator("#board").bounding_box()
    pg.click("#fullBtn")
    pg.wait_for_timeout(300)
    b, panel = pg.locator("#board").bounding_box(), pg.locator(".board-panel").bounding_box()
    comprobar(pg.evaluate("ui.full") and b["width"] > antes["width"] + 150 and abs(b["width"] - b["height"]) < 2 and b["y"] + b["height"] <= 1000 and panel["width"] == 1400 and panel["height"] == 1000,
              "el botón de la barra pone el tablero a pantalla completa: ocupa la ventana y el tablero crece hasta la altura")
    comprobar(pg.is_visible("#moves") and pg.is_visible("#backBtn") and pg.is_visible("#engineBox") and not pg.evaluate("(e => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + 5, r.top + 5) === e || e.contains(document.elementFromPoint(r.left + 5, r.top + 5)); })(document.querySelector('header'))"),
              "al lado quedan la navegación, las jugadas y el motor; la cabecera queda tapada")
    arrastrar(pg, casilla(pg, "d2"), casilla(pg, "d4"))
    jugada = pg.evaluate("cur().san")
    pg.click("#backBtn")
    comprobar(jugada == "d4" and pg.evaluate("cur() === game.root"), "se mueve y se navega igual")
    pg.evaluate("openModal('settingsModal')")
    revelar(pg, "#setBoard3d")
    comprobar(pg.is_visible("#setBoard3d"), "los cuadros de diálogo se ven por encima")
    pg.keyboard.press("Escape")
    comprobar(pg.evaluate("ui.full") and not pg.is_visible("#setBoard3d"), "Esc cierra primero el cuadro")
    pg.keyboard.press("Escape")
    comprobar(not pg.evaluate("ui.full") and abs(pg.locator("#board").bounding_box()["width"] - antes["width"]) < 2, "y otro Esc sale de la pantalla completa: el tablero vuelve a su tamaño")
    pg.keyboard.press("p")
    comprobar(pg.evaluate("ui.full") and pg.get_attribute("#fullBtn", "aria-pressed") == "true", "la tecla P también la activa")
    pg.evaluate("openEditor()")
    comprobar(not pg.evaluate("ui.full") and pg.is_visible("#editorPanel"), "al abrir el editor de posición se sale sola")
    pg.evaluate("closeEditor()")
    # Las lecciones y los mensajes del entrenador van con el tablero
    pg.evaluate("openLesson(COURSES[0].id, 0)")
    pg.click("#fullBtn")
    comprobar(pg.is_visible("#lessonBox") and pg.evaluate("$('lessonBox').closest('.board-side') !== null"), "a pantalla completa, el texto de la lección va junto al tablero")
    pg.click("#fullBtn")
    comprobar(pg.evaluate("$('lessonBox').parentElement.id") == "toolsPanel", "y al salir vuelve a su columna")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()
    # Móvil en vertical y en horizontal
    for (w, h, nombre) in ((390, 844, "vertical"), (844, 390, "horizontal")):
        ctx = contexto(browser, viewport={"width": w, "height": h}, has_touch=True, is_mobile=True)
        pg, errores = nueva_pagina(ctx)
        pg.evaluate("$('welcomeBox').hidden = true; setGame(Pgn.newGame(), { noConfirm: true })")
        pg.tap("#fullBtn")
        pg.wait_for_timeout(300)
        b = pg.locator("#board").bounding_box()
        nav = pg.locator("#backBtn").bounding_box()
        comprobar(pg.evaluate("ui.full") and b["x"] >= 0 and b["x"] + b["width"] <= w and b["y"] + b["height"] <= h and b["width"] >= min(w, h) - 90 and nav and nav["x"] + nav["width"] <= w and nav["y"] < h
                  and not pg.evaluate("document.documentElement.scrollWidth > innerWidth"),
                  f"móvil en {nombre}: el tablero llena la pantalla y la navegación queda a la vista")
        pg.tap("#fullBtn")
        comprobar(not pg.evaluate("ui.full") and not errores, f"móvil en {nombre}: se sale con el mismo botón, sin errores")
        ctx.close()


def prueba_traer_partidas(browser):
    print("Novedades 1.39: Chess.com, soltar ficheros, pegar y navegación bajo el tablero")
    ctx = contexto(browser)
    cab = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    def partida(w, b, ritmo, fin, reglas="chess", rated=True):
        return {"pgn": f'[Event "Live Chess"]\n[White "{w}"]\n[Black "{b}"]\n[Result "1-0"]\n[TimeControl "180"]\n\n1. e4 {{[%clk 0:02:59]}} e5 {{[%clk 0:02:58]}} 2. Nf3 {{[%clk 0:02:55]}} 1-0\n',
                "time_class": ritmo, "rated": rated, "rules": reglas, "end_time": fin}
    pedidos = []
    def servir(cuerpo, estado=200):
        return lambda r: (pedidos.append(r.request.url), r.fulfill(status=estado, body=json.dumps(cuerpo), headers=cab))
    ctx.route("https://api.chess.com/pub/player/rafa/games/archives", servir({"archives": ["https://api.chess.com/pub/player/rafa/games/2026/09", "https://api.chess.com/pub/player/rafa/games/2026/10", "https://evil.example/pub/player/rafa/games/2026/11x"]}))
    ctx.route("https://api.chess.com/pub/player/rafa/games/2026/10", servir({"games": [partida("rafa", "a", "blitz", 5), partida("b", "rafa", "rapid", 9), partida("x", "rafa", "blitz", 7, "chess960"), partida("rafa", "nopunt", "blitz", 6, rated=False)]}))
    ctx.route("https://api.chess.com/pub/player/rafa/games/2026/09", servir({"games": [partida("rafa", "c", "blitz", 1)]}))
    ctx.route("https://api.chess.com/pub/player/nadie/games/archives", servir({}, 404))
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true; setGame(Pgn.newGame(), { noConfirm: true })")
    orden = pg.evaluate("[...document.querySelectorAll('.board-side > *')].filter(e => e.offsetParent).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(e => e.id)")
    comprobar(orden[0] == "navControls" and orden.index("statusText") < orden.index("engineBox") and pg.locator("#backBtn").bounding_box()["y"] < 900,
              "en el ordenador, la navegación y el estado van justo debajo del tablero, antes del motor")
    pg.click('.tab-btn[data-tab="library"]')
    pg.click('.sub-btn[data-sub="collection"]')
    pg.click("#chesscomImport summary")
    pg.fill("#ccUser", "Rafa")
    pg.check("#ccRated")
    pg.click("#ccBtn")
    pg.wait_for_function("Coll.games.length > 0")
    comprobar(pg.evaluate("Coll.games.map(g => g.headers.White + '-' + g.headers.Black).join(' ')") == "b-rafa rafa-a rafa-c" and "Chess.com" in pg.inner_text("#toast") and pg.evaluate("settings.chesscomUser") == "Rafa",
              "Chess.com: descarga las partidas del usuario, de la más reciente a la más antigua, sin las de otras variantes ni las no puntuables")
    comprobar(all("api.chess.com/pub/player/rafa/" in u for u in pedidos) and len(pedidos) == 3, "sólo se piden direcciones de Chess.com con la forma esperada")
    pg.select_option("#ccPerf", "rapid")
    pg.click("#ccBtn")
    pg.wait_for_function("!$('ccBtn').disabled")
    pg.wait_for_timeout(100)
    comprobar(pg.evaluate("Coll.games.filter(g => g.headers.White === 'b').length") == 2, "el filtro de ritmo se aplica (y se puede añadir a la lista abierta)")
    pg.click("#pgnDbBody tr")
    comprobar(pg.evaluate("cur() === game.root && game.root.children[0].clk") == 179, "las partidas traen los tiempos de reloj")
    pg.evaluate("switchTab('library')")
    pg.fill("#ccUser", "nadie")
    pg.click("#ccBtn")
    pg.wait_for_function("$('toast').textContent.includes('no existe')")
    comprobar("no existe el usuario «nadie» en Chess.com" in pg.inner_text("#toast"), "si el usuario no existe, se dice")
    # Pegar fuera de los recuadros de texto
    pegar = """t => { if (document.activeElement) document.activeElement.blur(); const e = new Event('paste', { bubbles: true, cancelable: true }); e.clipboardData = { getData: () => t }; document.dispatchEvent(e); return e.defaultPrevented; }"""
    comprobar(pg.evaluate(pegar, "1. d4 d5 2. c4 e6 3. Nc3") and pg.evaluate("Pgn.mainlineFrom(game.root).map(n => n.san).join(' ')") == "d4 d5 c4 e6 Nc3" and pg.evaluate("ui.activeTab") == "study",
              "Ctrl + V fuera de un recuadro abre la partida copiada")
    comprobar(not pg.evaluate(pegar, "hola, ¿qué tal estás?") and pg.evaluate("Pgn.mainlineFrom(game.root).length") == 5, "un texto cualquiera no toca la partida")
    comprobar(pg.evaluate(pegar, "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1") and pg.evaluate("Chess.toFen(cur().state)") == "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1", "y una FEN copiada se carga como posición")
    pg.click("#moveInput")
    comprobar(not pg.evaluate("""t => { const e = new Event('paste', { bubbles: true, cancelable: true }); e.clipboardData = { getData: () => t }; document.dispatchEvent(e); return e.defaultPrevented; }""", "1. e4 e5 2. Nf3"), "dentro de un recuadro de texto se pega con normalidad")
    # Enlaces de Lichess (partida y estudio)
    pgn_cab = {"Content-Type": "application/x-chess-pgn", "Access-Control-Allow-Origin": "*"}
    ctx.route("https://lichess.org/game/export/AbCd1234*", lambda r: r.fulfill(status=200, headers=pgn_cab, body='[Event "Rated Blitz game"]\n[White "uno"]\n[Black "dos"]\n[Result "0-1"]\n\n1. f3 { [%eval -0.5] [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. g4 Qh4# 0-1\n'))
    ctx.route("https://lichess.org/api/study/EsTuDi01.pgn", lambda r: r.fulfill(status=200, headers=pgn_cab, body='[Event "Estudio: cap 1"]\n\n1. e4 *\n\n\n[Event "Estudio: cap 2"]\n\n1. d4 d5 *\n'))
    ctx.route("https://lichess.org/game/export/NoExiste*", lambda r: r.fulfill(status=404, headers=pgn_cab, body=""))
    comprobar(pg.evaluate("!!lichessLink('https://lichess.org/AbCd1234/black#12') && !!lichessLink('lichess.org/AbCd1234efgh') && !lichessLink('https://lichess.org/training') && !lichessLink('1. e4 e5 https://lichess.org/AbCd1234') && lichessLink('https://lichess.org/study/EsTuDi01/CaPiTu02').chapter === 'CaPiTu02'"),
              "se reconocen los enlaces de Lichess a partidas y estudios (y nada más)")
    pg.evaluate("switchTab('study')")
    pg.fill("#moveInput", "https://lichess.org/AbCd1234/black")
    pg.click("#importBtn")
    pg.wait_for_function("game.headers.White === 'uno'")
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root).map(n => n.san).join(' ')") == "f3 e5 g4 Qh4#" and pg.evaluate("ui.flipped") and pg.evaluate("game.root.children[0].clk") == 180 and pg.evaluate("game.root.children[0].eval.cp") == -50,
              "un enlace a una partida de Lichess la descarga con relojes y evaluaciones, vista desde el lado del enlace")
    pg.evaluate("ui.flipped = false")
    comprobar(pg.evaluate(pegar, "https://lichess.org/study/EsTuDi01"), "pegar el enlace de un estudio…")
    pg.wait_for_function("Coll.names.includes('Estudio de Lichess')")
    comprobar(pg.evaluate("Coll.games.length") == 2 and pg.evaluate("ui.activeTab + '/' + ui.librarySub") == "library/collection", "…abre sus capítulos en «🗂 Abrir .pgn»")
    pg.evaluate("importLichessLink('https://lichess.org/NoExiste')")
    pg.wait_for_function("$('toast').textContent.includes('no existe')")
    comprobar("esa partida no existe" in pg.inner_text("#toast"), "si la partida no existe, se dice")
    # Soltar ficheros
    soltar = """async ([nombre, texto]) => { const dt = new DataTransfer(); dt.items.add(new File([texto], nombre)); const ev = t => { const e = new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }); window.dispatchEvent(e); return e; };
      ev('dragenter'); const velo = document.body.classList.contains('dropping'); ev('drop'); await new Promise(r => setTimeout(r, 400)); return velo && !document.body.classList.contains('dropping'); }"""
    ok = pg.evaluate(soltar, ["una.pgn", '[Event "x"]\n[White "Ana"]\n[Black "Luis"]\n\n1. c4 c5 (1... e5 2. -- d6) 2. Nc3 *'])
    comprobar(ok and pg.evaluate("Pgn.mainlineFrom(game.root).map(n => n.san).join(' ')") == "c4 c5 Nc3" and "jugadas nulas" in pg.inner_text("#importResult") and pg.evaluate("game.headers.White") == "Ana",
              "soltar un .pgn con una partida la abre en el tablero (y avisa de la variante con jugada nula)")
    pg.evaluate(soltar, ["dos.pgn", '[Event "x"]\n\n1. c4 *\n\n[Event "y"]\n\n1. d4 *\n'])
    comprobar(pg.evaluate("ui.activeTab + '/' + ui.librarySub") == "library/collection" and pg.evaluate("Coll.names.includes('dos.pgn')"), "con varias partidas, el fichero se abre en «🗂 Abrir .pgn»")
    pg.evaluate(soltar, ["foto.png", "x"])
    comprobar(".pgn" in pg.inner_text("#toast"), "un fichero que no es de partidas se rechaza con un aviso")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_tablero3d(browser):
    print("Novedades 1.33: tablero en 3D")
    tres = os.environ.get("THREE_DIR")
    if not tres or not (pathlib.Path(tres) / "three.module.min.js").exists():
        print("  (se omite: define THREE_DIR con la carpeta build/ del paquete npm «three@0.170.0»)")
        return
    codigo = (pathlib.Path(tres) / "three.module.min.js").read_bytes()
    piezas = (ROOT / "assets" / "3d" / "piezas.bin").read_bytes()
    def con_three(ctx):
        ctx.route("**/three@*/build/three.module.min.js", lambda r: r.fulfill(status=200, body=codigo, headers={"Content-Type": "application/javascript", "Access-Control-Allow-Origin": "*"}))
        ctx.route("**/assets/3d/piezas.bin", lambda r: r.fulfill(status=200, body=piezas, headers={"Content-Type": "application/octet-stream", "Access-Control-Allow-Origin": "*"}))
    ctx = contexto(browser)
    con_three(ctx)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true; setGame(Pgn.newGame(), { noConfirm: true })")
    pg.click("#settingsBtn")
    revelar(pg, "#setBoard3d") or pg.check("#setBoard3d")
    pg.keyboard.press("Escape")
    pg.wait_for_function("B3.active", timeout=20000)
    comprobar(pg.is_visible("#board3d canvas") and pg.evaluate("getComputedStyle($('board')).visibility") == "hidden" and pg.evaluate("B3.meshes.size") == 32,
              "al activarlo se descarga Three.js y se ve el tablero en 3D con las 32 piezas")
    pg.wait_for_function("B3.model && b3Real() && [...B3.meshes.values()].every(m => m.children.length === 2)", timeout=20000)
    comprobar(all(pg.evaluate(f"!!(B3.model['{x}'] && B3.model['{x}'].geo)") for x in "kqrbnp") and pg.evaluate("B3.meshes.size") == 32
              and pg.evaluate("B3.meshes.get(Chess.sqIdx('c1')).children[1].geometry === B3.model.b.geo"), "después llegan las piezas Staunton (las seis, también el alfil)")
    def pulsar(sq):
        xy = pg.evaluate("""sq => { const p = cur().state.b[Chess.sqIdx(sq)], y = p === "." ? 0 : "pP".includes(p) ? 0.6 : 0.85;
          const [x, z] = b3Pos(Chess.sqIdx(sq)), v = new B3.T.Vector3(x, y, z).project(B3.camera), r = B3.canvas.getBoundingClientRect();
          return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }""", sq)
        pg.mouse.click(xy[0], xy[1])
        pg.wait_for_timeout(150)
    pulsar("e2")
    comprobar(pg.evaluate("ui.selected === Chess.sqIdx('e2')"), "pulsar una pieza la elige")
    pulsar("e4")
    pg.wait_for_timeout(400)
    comprobar(pg.evaluate("cur().san") == "e4" and pg.evaluate("B3.meshes.get(Chess.sqIdx('e4')).userData.p") == "P", "y pulsar el destino juega la jugada (e4)")
    antes = pg.evaluate("B3.view.theta")
    caja = pg.locator("#board3d canvas").bounding_box()
    pg.mouse.move(caja["x"] + caja["width"] / 2, caja["y"] + caja["height"] / 2)
    pg.mouse.down(); pg.mouse.move(caja["x"] + caja["width"] / 2 + 120, caja["y"] + caja["height"] / 2, steps=6); pg.mouse.up()
    comprobar(pg.evaluate("B3.view.theta") != antes and pg.evaluate("cur().san") == "e4", "arrastrar gira la vista sin mover piezas")
    # 1.38: la luz gira con la cámara y se regulan la luz y los reflejos
    comprobar(abs(pg.evaluate("B3.rig.rotation.y") - pg.evaluate("B3.view.theta")) < 1e-6, "las luces giran con la vista (sin zonas deslumbradas al girar)")
    pg.click("#board3d [data-b3=reset]")
    pg.click("#board3d [data-b3=light]")
    comprobar(pg.is_visible(".board3d-light") and pg.evaluate("B3.plane.material.clearcoat") < 0.2, "☀ abre los deslizadores de luz y reflejos; por defecto las casillas brillan poco")
    pg.evaluate("for (const [k, v] of [['light', 70], ['gloss', 0]]) { const i = document.querySelector(`.board3d-light [data-b3r=${k}]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }")
    comprobar(pg.evaluate("B3.plane.material.clearcoat === 0 && B3.plane.material.specularIntensity === 0 && Math.abs(B3.renderer.toneMappingExposure - 1.05 * 0.7) < 1e-6 && settings.board3dLight === 70 && settings.board3dGloss === 0"),
              "con los reflejos a 0 las casillas quedan mates, y la luz baja la exposición")
    pg.click(".board3d-light [data-b3=lightReset]")
    comprobar(pg.evaluate("settings.board3dLight === 100 && settings.board3dGloss === 30 && Math.abs(B3.renderer.toneMappingExposure - 1.05) < 1e-6"), "«Restablecer» vuelve a los valores iniciales")
    pg.click("#board3d [data-b3=light]")
    comprobar(not pg.is_visible(".board3d-light"), "y ☀ lo cierra")
    # 1.39: las piezas se arrastran
    def medio(sq):
        return pg.evaluate("""sq => { const [x, z] = b3Pos(Chess.sqIdx(sq)), v = new B3.T.Vector3(x, 0.35, z).project(B3.camera), r = B3.canvas.getBoundingClientRect();
          return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }""", sq)
    giro = pg.evaluate("B3.view.theta")
    o, d = medio("g8"), medio("f6")
    pg.mouse.move(*o); pg.mouse.down(); pg.mouse.move((o[0] + d[0]) / 2, (o[1] + d[1]) / 2, steps=5)
    alzada = pg.evaluate("!!B3.grab && !!B3.grab.mesh && B3.grab.mesh.position.y > 0.3 && ui.selected === Chess.sqIdx('g8')")
    pg.mouse.move(*d, steps=5); pg.mouse.up()
    pg.wait_for_timeout(200)
    comprobar(alzada and pg.evaluate("cur().san") == "Nf6" and pg.evaluate("B3.view.theta") == giro and pg.evaluate("B3.meshes.get(Chess.sqIdx('f6')).position.y") == 0, "arrastrar una pieza propia la mueve (Cf6) sin girar la vista")
    o, d = medio("d2"), medio("d6")
    pg.mouse.move(*o); pg.mouse.down(); pg.mouse.move(*d, steps=6); pg.mouse.up()
    pg.wait_for_timeout(150)
    comprobar(pg.evaluate("cur().san") == "Nf6" and pg.evaluate("(m => m.position.y === 0 && Math.abs(m.position.z - 2.5) < 1e-9)(B3.meshes.get(Chess.sqIdx('d2')))"), "soltarla en una casilla ilegal la devuelve a su sitio")
    pg.evaluate("goBack()")
    # Flechas en 3D con el clic derecho
    def punto(sq):
        return pg.evaluate("""sq => { const [x, z] = b3Pos(Chess.sqIdx(sq)), v = new B3.T.Vector3(x, 0, z).project(B3.camera), r = B3.canvas.getBoundingClientRect();
          return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }""", sq)
    a, b = punto("d4"), punto("d6")
    pg.mouse.move(*a); pg.mouse.down(button="right"); pg.mouse.move(*b, steps=6); pg.mouse.up(button="right")
    comprobar(pg.evaluate("JSON.stringify(cur().shapes)") == '[{"color":"green","from":"d4","to":"d6"}]' and pg.evaluate("cur().san") == "e4", "con el clic derecho se dibuja una flecha en 3D (sin girar ni mover)")
    pg.evaluate("cur().shapes = []; renderShapes()")
    # Pantalla completa con el 3D
    pg.click("#fullBtn")
    pg.wait_for_timeout(300)
    lado = pg.locator("#board3d canvas").bounding_box()
    comprobar(pg.evaluate("document.body.classList.contains('board-full')") and lado["height"] > 800 and pg.evaluate("B3.active"), "a pantalla completa el tablero 3D crece hasta llenar la altura")
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(200)
    comprobar(not pg.evaluate("ui.full"), "y Esc vuelve a la vista normal")
    pg.click("#flipBtn")
    comprobar(pg.evaluate("B3.active && ui.flipped"), "«Girar» sigue en 3D, desde el lado de las negras")
    pg.evaluate("setBlind(true)")
    comprobar(pg.evaluate("[...B3.meshes.values()].every(m => !m.visible)"), "con las piezas ocultas no se ven en 3D")
    pg.evaluate("setBlind(false)")
    pg.click('.tab-btn[data-tab="tools"]')
    pg.click("#toggleEditorModeBtn")
    comprobar(not pg.evaluate("B3.active") and pg.evaluate("getComputedStyle($('board')).visibility") == "visible", "el editor de posición usa el tablero plano")
    pg.evaluate("closeEditor()")
    comprobar(pg.evaluate("B3.active"), "y al cerrarlo vuelve el 3D")
    pg.click("#settingsBtn")
    comprobar(pg.evaluate("'#' + B3.model.matB.color.getHexString()") == "#7b4a28" and pg.evaluate("settings.board3dLook") == "wood", "por defecto, piezas de madera (boj y nogal) sobre casillas blancas y negras")
    revelar(pg, "#setBoard3dLook") or pg.select_option("#setBoard3dLook", "contrast")
    comprobar(pg.evaluate("'#' + B3.model.matW.color.getHexString()") == "#ffffff" and not pg.is_visible("#b3Custom"), "se puede elegir otro aspecto (alto contraste)")
    revelar(pg, "#setBoard3dLook") or pg.select_option("#setBoard3dLook", "custom")
    pg.evaluate("const i = $('b3c_pb'); i.value = '#224488'; i.dispatchEvent(new Event('input'))")
    comprobar(pg.is_visible("#b3Custom") and pg.evaluate("'#' + B3.model.matB.color.getHexString()") == "#224488" and pg.evaluate("settings.board3dColors.pb") == "#224488", "y poner los colores a mano")
    revelar(pg, "#setBoard3dLook") or pg.select_option("#setBoard3dLook", "wood")
    revelar(pg, "#setBoard3d") or pg.uncheck("#setBoard3d")
    pg.keyboard.press("Escape")
    comprobar(not pg.evaluate("B3.active") and pg.is_visible(".square"), "al desactivarlo vuelve el tablero plano")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()
    # Si no llegan las piezas realistas, se usan las sencillas
    ctx = contexto(browser)
    ctx.route("**/three@*/build/three.module.min.js", lambda r: r.fulfill(status=200, body=codigo, headers={"Content-Type": "application/javascript", "Access-Control-Allow-Origin": "*"}))
    ctx.route("**/assets/3d/piezas.bin", lambda r: r.abort())
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("settings.board3d = true; renderBoard()")
    pg.wait_for_function("B3.active && B3.model === null", timeout=20000)
    comprobar(pg.evaluate("B3.meshes.size") == 32 and not pg.evaluate("b3Real()") and "piezas Staunton" in pg.inner_text("#toast"), "si no llegan las piezas Staunton, se avisa y se juega con unas más sencillas")
    ctx.close()
    # Sin conexión (no se puede descargar Three.js): se avisa y sigue el tablero plano
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("settings.board3d = true; renderBoard()")
    pg.wait_for_function("B3.failed", timeout=20000)
    comprobar(not pg.evaluate("B3.active") and pg.is_visible(".square") and "tablero 3D" in pg.inner_text("#toast"), "si no se puede descargar, se avisa y se sigue con el tablero plano")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_lee_el_tablero(browser):
    print("Novedades 1.36: «Lee el tablero», ejercicios de jugadas forzadas y doble ataque, y el error de la partida en los ejercicios")
    ctx = contexto(browser)
    pg, errores = nueva_pagina(ctx)
    pg.evaluate("$('welcomeBox').hidden = true; setGame(Pgn.newGame('2r1r1k1/bb3p1p/p3p2p/P1q3N1/1pN2P2/1P1B1P2/2P4P/Q5RK w - - 0 1'), { noConfirm: true })")
    pg.click("#scanBtn")
    comprobar(pg.is_visible("#scanBox") and "2 puntos por detrás" in pg.inner_text("#scanBox"), "«Lee el tablero» empieza por el material y dice qué buscar")
    pg.click('#scanBox [data-scan="2"]')
    txt = pg.inner_text("#scanBox")
    comprobar("clava" in txt and "Batería" in txt and pg.evaluate("shapeList().some(s => s.color === 'threat')"), "paso 3: las amenazas del rival, con la clavada y las baterías dibujadas")
    pg.click('#scanBox [data-scan="3"]')
    comprobar("descubierta" in pg.inner_text("#scanBox"), "paso 4: tus oportunidades (jaque a la descubierta)")
    pg.click('#scanBox [data-scan="next"]')
    comprobar("Jaques (8)" in pg.inner_text("#scanBox") and "Dh8+" in pg.inner_text("#scanBox"), "paso 5: las jugadas forzadas, entre ellas la solución")
    pg.keyboard.press("l")
    comprobar(not pg.is_visible("#scanBox"), "la tecla L lo abre y lo cierra")
    pg.keyboard.press("l")
    pg.evaluate("playMove(Chess.legal(cur().state)[0])")
    comprobar(not pg.is_visible("#scanBox"), "al cambiar de posición se cierra")
    # En los problemas, cuenta como pista
    entrenar(pg, "puzzles")
    pg.click("#puzzleStartBtn")
    pg.wait_for_function("trainer.active && trainer.puzzle && trainerUserTurn() && !trainer.busy", timeout=10000)
    pg.locator("#trainFeedback [data-pz=scan]").click()
    comprobar(pg.is_visible("#scanBox") and pg.evaluate("trainer.hints") == 1, "en los problemas está el botón y cuenta como pista")
    pg.locator("#trainFeedback [data-pz=end]").click()
    # Ejercicios nuevos de visualización
    entrenar(pg, "blind")
    pg.select_option("#visMode", "forcing")
    pg.click("#visStartBtn")
    u = pg.evaluate("Vis.q.want[0]")
    casilla(pg, u[:2]).click(); casilla(pg, u[2:4]).click()
    comprobar(pg.evaluate("Vis.q.found.length") == 1 and "llevas 1" in pg.inner_text("#visBox"), "⚡ Jaques y capturas: una jugada encontrada se apunta")
    pg.locator("#visBox [data-v=done]").click()
    comprobar(pg.evaluate("Vis.state") == "answered" and ("faltaron" in pg.inner_text("#visBox") or "todas" in pg.inner_text("#visBox")), "al terminar se enseñan las que faltaban")
    pg.locator("#visBox [data-v=end]").click()
    pg.select_option("#visMode", "fork")
    pg.click("#visStartBtn")
    g = pg.evaluate("Vis.q.good[0]")
    pg.locator(f'.square[data-sq="{g}"]').click()
    comprobar("Horquilla" in pg.inner_text("#visBox") and pg.evaluate("Vis.ok") == 1, "🍴 Doble ataque: la casilla de la horquilla")
    pg.locator("#visBox [data-v=end]").click()
    # Ejercicio de un error: la jugada de la partida como flecha y, en el ordenador, el recuadro bajo el tablero
    pg.evaluate("""() => { const r = Pgn.parseGame('1. e4 { [%eval 0.2] } e5 { [%eval 0.3] } 2. Bc4 { [%eval 0.2] } Nc6 { [%eval 0.3] } 3. Qh5 { [%eval 0.0] } Nf6?? { [%eval #1] } 4. Qxf7# 1-0');
      setGame(r.game, { noConfirm: true }); const n = Pgn.mainlineFrom(game.root)[5]; n.parent.eval.best = 'g7g6'; startRetry(-1, [n]); }""")
    comprobar(pg.evaluate("shapeList().some(s => s.color === 'threat' && s.from === Chess.sqIdx('g8') && s.to === Chess.sqIdx('f6'))") and "discontinua" in pg.inner_text("#retryBox"), "el ejercicio dibuja la jugada de la partida (3...Cf6??) como referencia")
    pos = pg.evaluate("(() => { const a = $('board').getBoundingClientRect(), b = $('retryBox').getBoundingClientRect(); return [a.bottom, b.top]; })()")
    comprobar(0 < pos[1] - pos[0] < 120, "en el ordenador el recuadro del ejercicio queda justo debajo del tablero")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()


def prueba_stockfish19(browser):
    sf = os.environ.get("STOCKFISH_DIR")
    if not sf:
        print("Stockfish 19 real: omitida (define STOCKFISH_DIR para probarla)")
        return
    print("Stockfish 19 real")
    carpeta = pathlib.Path(sf)
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    def servir(r):
        f = carpeta / r.request.url.split("/")[-1].split("#")[0]
        if not f.exists():
            return r.abort()
        r.fulfill(body=f.read_bytes(), content_type="application/wasm" if f.suffix == ".wasm" else "application/javascript", headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("**/cdn.jsdelivr.net/**", servir)
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", lambda r: r.abort())
    ctx.route("**/*lichess*/**", lambda r: r.abort())
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("document.getElementById('engineSourceBadge').textContent.includes('Stockfish 19')", timeout=60000)
    pg.wait_for_function("document.querySelectorAll('#engineLines .pv-line').length >= 3", timeout=30000)
    comprobar(True, "arranca Stockfish 19 y muestra 3 líneas")
    pg.fill("#moveInput", "1. e4 e5 2. Ac4 Cc6 3. Dh5 Cf6 4. Dxf7#")
    pg.click("#importBtn")
    pg.click("#autoAnnotateBtn")
    pg.wait_for_function("document.getElementById('reportBox').classList.contains('show')", timeout=120000)
    comprobar(pg.evaluate("Pgn.mainlineFrom(game.root)[5].nag") == "??", "Stockfish 19 marca 3...Cf6?? como error grave")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()
    # Archivo abierto con doble clic: se guarda una copia de Stockfish 19 y después funciona sin conexión
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    ctx.route("**/cdn.jsdelivr.net/**", servir)
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", lambda r: r.abort())
    ctx.route("**/*lichess*/**", lambda r: r.abort())
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("document.getElementById('engineSourceBadge').textContent.includes('Stockfish 19')", timeout=60000)
    pg.wait_for_function("Engine.cache && Engine.cache.wasm.byteLength > 100000", timeout=60000)
    comprobar(True, "con conexión, se guarda una copia de Stockfish 19 en el navegador")
    pg.close()
    ctx.unroute("**/cdn.jsdelivr.net/**")
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", lambda r: r.abort())
    pg, err2 = nueva_pagina(ctx)
    pg.wait_for_function("document.getElementById('engineSourceBadge').textContent.startsWith('⚙')", timeout=60000)
    comprobar(pg.inner_text("#engineSourceBadge").strip() == "⚙ Stockfish 19" and pg.evaluate("Engine.fromCache"), "sin acceso a internet, el archivo arranca Stockfish 19 desde la copia guardada")
    pg.wait_for_function("document.querySelectorAll('#engineLines .pv-line').length >= 1", timeout=30000)
    comprobar(True, "la copia guardada de Stockfish 19 analiza con normalidad")
    pg.click("#settingsBtn")
    comprobar("guardado en este navegador" in pg.inner_text("#engineStatus") and "usando esa copia" in pg.inner_text("#engineStatus"), "Ajustes indica que se usa la copia guardada")
    comprobar(not errores and not err2, "sin errores de JavaScript" + (": " + "; ".join(errores + err2) if errores or err2 else ""))
    ctx.close()
    # jsDelivr bloqueado (bloqueador de anuncios, antivirus, red…): Stockfish 19 se descarga de unpkg
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", servir)
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.route("**/*lichess*/**", lambda r: r.abort())
    pg, errores = nueva_pagina(ctx)
    pg.wait_for_function("document.getElementById('engineSourceBadge').textContent.startsWith('⚙')", timeout=60000)
    comprobar(pg.inner_text("#engineSourceBadge").strip() == "⚙ Stockfish 19" and pg.evaluate("Engine.def.id") == "sf19b", "si jsDelivr está bloqueado, Stockfish 19 se descarga de unpkg")
    pg.click("#settingsBtn")
    comprobar("unpkg" in pg.inner_text("#engineStatus"), "Ajustes explica de dónde se ha cargado el motor")
    comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    ctx.close()
    # Publicada (http/https) y con el service worker ya instalado, como en GitHub Pages a partir de la segunda visita
    class Silencioso(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Silencioso, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    ctx.route("**/cdn.jsdelivr.net/**", servir)
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", lambda r: r.abort())
    ctx.route("**/*lichess*/**", lambda r: r.abort())
    try:
        pg, errores = nueva_pagina(ctx, f"http://127.0.0.1:{srv.server_address[1]}/")
        pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=20000)
        for visita in (2, 3):
            pg.reload()
            pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
            pg.wait_for_function("document.getElementById('engineSourceBadge').textContent.startsWith('⚙')", timeout=45000)
            comprobar(pg.inner_text("#engineSourceBadge").strip() == "⚙ Stockfish 19", f"publicada, en la visita {visita} (con el service worker) también arranca Stockfish 19")
        comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
        ctx.close()
        # Publicada, con jsDelivr bloqueado: el service worker toma Stockfish 19 (y su .wasm) de unpkg
        ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
        ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
        ctx.route("**/unpkg.com/**", servir)
        ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
        ctx.route("**/*lichess*/**", lambda r: r.abort())
        pg, errores = nueva_pagina(ctx, f"http://127.0.0.1:{srv.server_address[1]}/")
        pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=20000)
        for visita in (1, 2):
            if visita == 2:
                pg.reload()
                pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
            pg.wait_for_function("document.getElementById('engineSourceBadge').textContent.startsWith('⚙')", timeout=60000)
            comprobar(pg.inner_text("#engineSourceBadge").strip() == "⚙ Stockfish 19", f"publicada y con jsDelivr bloqueado, en la visita {visita} arranca Stockfish 19 desde unpkg")
        comprobar(not errores, "sin errores de JavaScript" + (": " + "; ".join(errores) if errores else ""))
    finally:
        ctx.close()
        srv.shutdown()


LIMITE_PRUEBA = int(os.environ.get("LIMITE_PRUEBA", "300"))


class PruebaColgada(Exception):
    pass


def _prueba_colgada(signum, frame):
    raise PruebaColgada()


def main():
    # index.html no se guarda en el repositorio: se construye ahora para no probar uno viejo
    import subprocess
    subprocess.run([sys.executable, str(ROOT / "build.py")], check=True)
    with sync_playwright() as p:
        # WebGL por software (SwiftShader) para poder probar el tablero 3D sin tarjeta gráfica
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        for prueba in (prueba_tablero_y_partidas, prueba_editor, prueba_biblioteca, prueba_ayuda_y_movil, prueba_v11, prueba_v12, prueba_v13, prueba_v14, prueba_cursos, prueba_versiones, prueba_guardar_al_salir, prueba_v1591_correcciones, prueba_versiones_partida, prueba_origen_evaluacion, prueba_recorrido_guiado, prueba_descriptiva, prueba_v153_distribucion, prueba_estructuras, prueba_comentar_repertorio, prueba_memoria_entrenador, prueba_v157_actividad_y_ajustes, prueba_vigilancia_ia, prueba_v159_herramientas, prueba_motor_ayuda, prueba_entrenamiento_19, prueba_dia_a_dia, prueba_cpu_adaptativa, prueba_ayuda_contra_cpu, prueba_mis_repertorios, prueba_sorpresas_y_planes, prueba_tactil_y_tema, prueba_rival_humano, prueba_rival_explorador_y_piensa, prueba_reloj_dos_jugadores_y_ventaja, prueba_filtros_avanzados, prueba_importar_curso, prueba_marcadores_y_velocidad, prueba_habla_con_tus_piezas, prueba_paquetes_de_problemas, prueba_sincronizacion, prueba_tu_semana, prueba_geometria_y_ciegas, prueba_salir_del_entrenamiento, prueba_salir_movil, prueba_pantalla_completa, prueba_traer_partidas, prueba_que_hago_ahora, prueba_contrarreloj, prueba_colores_jugadas, prueba_ayudas_profesor, prueba_ollama, prueba_buscador_y_contexto_ia, prueba_propuestas_ia, prueba_aperturas_explicadas, prueba_entrenador_ia, prueba_velocidad_y_ordenes, prueba_notacion_ia, prueba_piezas_ia, prueba_repaso_y_preguntas, prueba_tablero3d, prueba_lee_el_tablero, prueba_fiabilidad, prueba_stockfish19, prueba_sin_conexion):
            # Límite por prueba: si algo se queda esperando para siempre (una promesa que no se resuelve, un
            # navegador bloqueado), se detiene todo en minutos diciendo qué prueba fue, en vez de colgar la CI horas
            t0 = time.time()
            if hasattr(signal, "SIGALRM"):
                signal.signal(signal.SIGALRM, _prueba_colgada)
                signal.alarm(LIMITE_PRUEBA)
            try:
                prueba(browser)
            except PruebaColgada:
                # Tras cortar una espera, la conexión con el navegador ya no es fiable: se termina aquí, diciendo cuál fue
                traceback.print_exc()
                comprobar(False, f"{prueba.__name__} se quedó colgada (más de {LIMITE_PRUEBA} s)")
                print(f"\n{len(fallos)} prueba(s) fallida(s); se detiene la ejecución porque {prueba.__name__} se colgó", flush=True)
                os._exit(1)
            except Exception:
                traceback.print_exc()
                comprobar(False, f"{prueba.__name__} terminó con una excepción")
            finally:
                if hasattr(signal, "SIGALRM"):
                    signal.alarm(0)
            print(f"  ({prueba.__name__}: {time.time() - t0:.0f} s)", flush=True)
        browser.close()
    if fallos:
        print(f"\n{len(fallos)} prueba(s) fallida(s)")
        sys.exit(1)
    print("\nTodas las pruebas de la aplicación superadas.")


if __name__ == "__main__":
    main()
