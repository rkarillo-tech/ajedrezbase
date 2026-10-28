#!/usr/bin/env python3
"""Genera los PNG del icono a partir de assets/icon.svg (requiere Playwright con Chromium).

  python3 tools/gen_icons.py
Produce:
  assets/icon-32.png           pestaña del navegador
  assets/icon-180.png          pantalla de inicio en iOS (a sangre: iOS redondea las esquinas)
  assets/icon-192.png          aplicación instalada (Android, Chrome, Edge)
  assets/icon-512.png          aplicación instalada y pantalla de bienvenida
  assets/icon-maskable-512.png versión con margen para iconos adaptativos de Android
"""
import base64
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
svg = open(os.path.join(ROOT, "assets", "icon.svg"), encoding="utf-8").read()
square = svg.replace('rx="14"', 'rx="0"', 1)
# Maskable: el dibujo se reduce al 80 % sobre fondo completo para respetar la zona segura.
maskable = square.replace('<rect width="64" height="64" rx="0" fill="#0b0e14"/>',
                          '<rect width="64" height="64" fill="#0b0e14"/><g transform="translate(6.4 6.4) scale(.8)">', 1).replace("</svg>", "</g></svg>")
variants = {
    "icon-32.png": (32, svg, True),
    "icon-180.png": (180, square, False),
    "icon-192.png": (192, svg, True),
    "icon-512.png": (512, svg, True),
    "icon-maskable-512.png": (512, maskable, False),
}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, (size, source, transparent) in variants.items():
        page = browser.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
        uri = "data:image/svg+xml;base64," + base64.b64encode(source.encode()).decode()
        page.set_content('<style>html,body{margin:0;background:transparent}</style><img src="%s" width="%d" height="%d">' % (uri, size, size))
        page.wait_for_timeout(50)
        page.screenshot(path=os.path.join(ROOT, "assets", name), omit_background=transparent)
        page.close()
    browser.close()
print("Iconos generados en assets/: " + ", ".join(variants))
