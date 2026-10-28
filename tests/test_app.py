#!/usr/bin/env python3
"""Pruebas de extremo a extremo de AjedrezBase con Playwright.

Uso:
    python3 -m pip install playwright
    python3 -m playwright install chromium
    python3 tests/test_app.py

Las conexiones a Lichess y al CDN de Stockfish se bloquean para que las pruebas no dependan
de la red: se usa el motor interno, que es el respaldo sin conexión.
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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for prueba in (prueba_tablero_y_partidas, prueba_editor, prueba_biblioteca, prueba_ayuda_y_movil, prueba_sin_conexion):
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
