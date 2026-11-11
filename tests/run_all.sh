#!/usr/bin/env bash
# Ejecuta todas las pruebas: construye la aplicación (index.html no se guarda en el repositorio), comprueba
# que GUIA.md esté al día, y prueba el núcleo y la lógica (Node, segundos) y la aplicación (Playwright, minutos).
#   tests/run_all.sh          todas
#   tests/run_all.sh rapidas  sólo las de Node
set -euo pipefail
cd "$(dirname "$0")/.."
python3 build.py --check
python3 build.py
node tests/test_reglas.js
node tests/test_logica.js
if [ "${1:-}" != "rapidas" ]; then python3 tests/test_app.py; fi
