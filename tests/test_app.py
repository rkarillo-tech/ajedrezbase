#!/usr/bin/env python3
"""Pruebas de extremo a extremo de AjedrezBase con Playwright.

Uso:
    python3 -m pip install playwright
    python3 -m playwright install chromium
    python3 tests/test_app.py

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
import sys
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


def nueva_pagina(ctx, url=URL):
    pg = ctx.new_page()
    errores = []
    pg.on("pageerror", lambda e: errores.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(url)
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    return pg, errores


def contexto(browser, **kw):
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000}, **kw)
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
    ctx.route("**/unpkg.com/**", lambda r: r.abort())
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    ctx.route("**/*lichess*/**", lambda r: r.abort())
    return ctx


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
    pg.click('.tab-btn[data-tab="tools"]')
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
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("document.documentElement.scrollWidth") <= 390, "sin desplazamiento horizontal en el móvil")
    pg.click('.tab-btn[data-tab="tools"]')
    comprobar(pg.evaluate("document.documentElement.scrollWidth") <= 390, "sin desplazamiento horizontal en el móvil en la pestaña Entrenar")
    pg.click('.tab-btn[data-tab="study"]')
    comprobar(not pg.is_visible("#pieceStyleSelect") and pg.is_visible("#menuBtn"), "en el móvil la cabecera es compacta (piezas, notación y colores en ☰)")
    pg.click("#menuBtn")
    comprobar(pg.is_visible("#pieceStyleSelect") and pg.is_visible("#themeSelect"), "☰ muestra las opciones de la cabecera")
    pg.click("#menuBtn")
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
    pg.click('.tab-btn[data-tab="tools"]')
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
    pg.click('.tab-btn[data-tab="tools"]')
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
    comprobar(pg.locator("#courseList details.course").count() == 7 and "0 de 74" in pg.inner_text("#courseProgress"), "la pestaña Cursos muestra los siete cursos y el progreso")
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
    comprobar("2 de 74" in pg.inner_text("#courseProgress"), "el progreso de los cursos se conserva al recargar")
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
    comprobar(pg.locator('details[data-course="repertorios"] .lesson-row').count() == 5, "el curso de repertorios tiene cinco repertorios")
    pg.locator('details[data-course="repertorios"] .lesson-row', has_text="Caro-Kann").click()
    comprobar(pg.evaluate("ui.flipped") and "Entrenar repertorio" in pg.inner_text("#lessonBox"), "un repertorio con negras se abre con las negras abajo y se entrena con 🎯")
    pg.locator("#lessonBox [data-l=practice]").click()
    jugar_lo_que_toca(pg)
    pg.wait_for_function("document.getElementById('trainFeedback').textContent.includes('Próximo repaso')", timeout=10000)
    comprobar("Línea perfecta" in pg.inner_text("#trainFeedback") and pg.evaluate("Object.values(LS.get('ajedrezRepasos', {}))[0].box") == 1, "al terminar una línea se programa el repaso del repertorio")
    pg.click('.tab-btn[data-tab="courses"]')
    comprobar("mañana" in pg.locator('details[data-course="repertorios"] .lesson-row', has_text="Caro-Kann").inner_text(), "la lista de cursos dice cuándo toca repasar cada repertorio")
    # Problemas de táctica
    pg.click('.tab-btn[data-tab="tools"]')
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
    pg.click('.tab-btn[data-tab="tools"]')
    pg.click("#repCompareBtn")
    txt = pg.inner_text("#repCompareOut")
    comprobar("2 partidas" in txt and "Te saliste en 1...e5" in txt and "1...c6" in txt and "2.c4" in txt and "2.Af4" in txt, "compara tus partidas con tu repertorio y dice dónde te saliste")
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
    pg.click('.tab-btn[data-tab="tools"]')
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
    pg.click('.tab-btn[data-tab="tools"]')
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
    pg.click('.tab-btn[data-tab="tools"]')
    pg.click("#repCompareBtn")
    cmp_txt = pg.inner_text("#repCompareOut")
    comprobar("El rival se salió en 1...d5" in cmp_txt and "Blancas: 1.e4" in cmp_txt and pg.locator("#repCompareOut [data-add]").count() == 1, "la comparación usa tus repertorios y ofrece preparar la línea nueva del rival")
    pg.locator("#repCompareOut [data-add]").first.click()
    comprobar(pg.evaluate("cur().san === 'd5' && cur().parent.san === 'e4' && Lib.games.get(ui.libId).title === 'Blancas: 1.e4'"), "preparar la línea nueva abre tu repertorio con la jugada del rival")
    pg.click('.tab-btn[data-tab="tools"]')
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
    pg.locator("#setBoardSize").fill("70")
    comprobar(abs(ancho() - antes * 0.7) < antes * 0.06 and "70 %" in pg.inner_text("#boardSizeVal"), "en Ajustes se puede hacer el tablero más pequeño")
    pg.click("#boardSizeReset")
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
    comprobar(not pg.is_visible("#drawToggle"), "en el ordenador (con ratón) no aparece el botón de dibujar: se dibuja con el clic derecho")
    pg.click("#settingsBtn")
    pg.select_option("#setUiTheme", "light")
    fondo = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    comprobar(pg.evaluate("document.documentElement.dataset.ui") == "light" and fondo == "rgb(242, 244, 247)", "en Ajustes se puede elegir el tema claro")
    pg.reload()
    pg.wait_for_function("typeof Lib !== 'undefined' && Lib.ready", timeout=20000)
    comprobar(pg.evaluate("document.documentElement.dataset.ui") == "light" and pg.evaluate("document.getElementById('setUiTheme').value") == "light", "el tema claro se recuerda al volver a abrir")
    pg.click("#settingsBtn")
    pg.select_option("#setUiTheme", "dark")
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
    comprobar(not errores and not err2, "sin errores de JavaScript" + (": " + "; ".join(errores + err2) if errores or err2 else ""))
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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for prueba in (prueba_tablero_y_partidas, prueba_editor, prueba_biblioteca, prueba_ayuda_y_movil, prueba_v11, prueba_v12, prueba_v13, prueba_v14, prueba_cursos, prueba_versiones, prueba_motor_ayuda, prueba_entrenamiento_19, prueba_dia_a_dia, prueba_cpu_adaptativa, prueba_mis_repertorios, prueba_sorpresas_y_planes, prueba_tactil_y_tema, prueba_rival_humano, prueba_rival_explorador_y_piensa, prueba_reloj_dos_jugadores_y_ventaja, prueba_fiabilidad, prueba_stockfish19, prueba_sin_conexion):
            try:
                prueba(browser)
            except Exception:
                traceback.print_exc()
                comprobar(False, f"{prueba.__name__} terminó con una excepción")
        browser.close()
    if fallos:
        print(f"\n{len(fallos)} prueba(s) fallida(s)")
        sys.exit(1)
    print("\nTodas las pruebas de la aplicación superadas.")


if __name__ == "__main__":
    main()
