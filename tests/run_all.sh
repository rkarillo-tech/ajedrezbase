#!/usr/bin/env bash
# Ejecuta todas las pruebas: que los ficheros generados estén al día, el núcleo (Node) y la aplicación (Playwright).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 build.py --check
node tests/test_reglas.js
python3 tests/test_app.py
