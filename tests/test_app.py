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
import pathlib
import sys
import threading
import traceback

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
    pg.fill("#helpSearch", "token")
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("!document.getElementById('help-aperturas').hidden && document.getElementById('help-cpu').hidden"), "el buscador de la ayuda filtra apartados")
    pg.keyboard.press("Escape")
    pg.click("#licBtn")
    comprobar("MIT" in pg.inner_text("#licModal") and "Stockfish" in pg.inner_text("#licModal"), "licencia MIT y créditos de terceros visibles")
    pg.keyboard.press("Escape")
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    comprobar(pg.evaluate("document.documentElement.scrollWidth") <= 390, "sin desplazamiento horizontal en el móvil")
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


def prueba_fiabilidad(browser):
    print("Fiabilidad: Lichess, varias pestañas")
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
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
    # Publicada (http/https) y con el service worker ya instalado, como en GitHub Pages a partir de la segunda visita
    class Silencioso(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Silencioso, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    ctx.route("**/cdn.jsdelivr.net/**", servir)
    ctx.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())
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
    finally:
        ctx.close()
        srv.shutdown()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for prueba in (prueba_tablero_y_partidas, prueba_editor, prueba_biblioteca, prueba_ayuda_y_movil, prueba_v11, prueba_v12, prueba_v13, prueba_fiabilidad, prueba_stockfish19, prueba_sin_conexion):
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
