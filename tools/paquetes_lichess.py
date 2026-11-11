#!/usr/bin/env python3
"""Genera los paquetes de problemas descargables (problemas/*.json) a partir de la base de problemas de Lichess (CC0).

  curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | python3 tools/paquetes_lichess.py
  (necesita:  python3 -m pip install zstandard)

De los millones de problemas de Lichess se quedan los mejor valorados y más jugados, repartidos en cinco
paquetes por nivel y, dentro de cada uno, equilibrados por temas. Los temas se limitan a los que la
aplicación sabe nombrar (PUZZLE_THEMES en src/app/70-entrenar.js). El formato es el de cursos/problemas.json:
la primera jugada de «moves» es la del rival y las siguientes, la solución.
La selección es reproducible: con la misma base y la misma semilla salen los mismos paquetes.
"""
import csv
import io
import json
import random
import sys
from pathlib import Path

import zstandard

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "problemas"
SEMILLA = 2026
POR_PAQUETE = 1500
POR_TEMA = 220          # tamaño de la reserva de cada tema antes de recortar el paquete
PAQUETES = [
    ("iniciacion", "Iniciación", 600, 1000),
    ("basico", "Básico", 1000, 1400),
    ("intermedio", "Intermedio", 1400, 1800),
    ("avanzado", "Avanzado", 1800, 2200),
    ("experto", "Experto", 2200, 2800),
]
# Temas de Lichess que se conservan (→ nombre que usa la aplicación)
TEMAS = {t: t for t in (
    "mateIn1 mateIn2 mateIn3 mateIn4 mateIn5 fork pin skewer discoveredAttack doubleCheck hangingPiece sacrifice "
    "backRankMate smotheredMate promotion endgame deflection attraction trappedPiece zugzwang quietMove defensiveMove "
    "intermezzo clearance interference capturingDefender").split()}
TEMAS["oneMove"] = "short"   # en la aplicación «short» es «una sola jugada»


def main():
    rnd = random.Random(SEMILLA)
    # reservas[paquete][tema] = lista de (clave aleatoria, problema): muestreo de reserva por tema
    reservas = [dict() for _ in PAQUETES]
    vistos = 0
    texto = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(sys.stdin.buffer), encoding="utf-8", newline="")
    for fila in csv.DictReader(texto):
        vistos += 1
        try:
            nivel, desv, pop, veces = int(fila["Rating"]), int(fila["RatingDeviation"]), int(fila["Popularity"]), int(fila["NbPlays"])
        except ValueError:
            continue
        jugadas = fila["Moves"].split()
        if pop < 90 or veces < 1000 or desv > 80 or not (2 <= len(jugadas) <= 10) or len(jugadas) % 2:
            continue
        i = next((k for k, (_, _, a, b) in enumerate(PAQUETES) if a <= nivel < b), None)
        if i is None:
            continue
        temas = sorted({TEMAS[t] for t in fila["Themes"].split() if t in TEMAS})
        if not [t for t in temas if t not in ("endgame", "short")]:
            continue   # sin un tema táctico reconocible no aporta nada al filtro por temas
        prob = {"id": "L" + fila["PuzzleId"], "fen": fila["FEN"], "moves": jugadas, "themes": temas, "rating": nivel}
        for t in temas:
            if t in ("endgame", "short"):
                continue
            res = reservas[i].setdefault(t, [])
            clave = rnd.random()
            if len(res) < POR_TEMA:
                res.append((clave, prob))
            else:
                peor = max(range(len(res)), key=lambda k: res[k][0])
                if clave < res[peor][0]:
                    res[peor] = (clave, prob)
    print(f"{vistos} problemas leídos", file=sys.stderr)

    OUT.mkdir(exist_ok=True)
    indice = []
    for (pid, nombre, a, b), res in zip(PAQUETES, reservas):
        elegidos = {}
        # Por turnos entre los temas (del más escaso al más abundante) hasta llenar el paquete
        colas = sorted((sorted(v) for v in res.values()), key=len)
        while len(elegidos) < POR_PAQUETE and any(colas):
            for cola in colas:
                while cola:
                    _, p = cola.pop(0)
                    if p["id"] not in elegidos:
                        elegidos[p["id"]] = p
                        break
                if len(elegidos) >= POR_PAQUETE:
                    break
        probs = sorted(elegidos.values(), key=lambda p: (p["rating"], p["id"]))
        datos = json.dumps({"id": pid, "name": nombre, "puzzles": probs}, ensure_ascii=False, separators=(",", ":"))
        (OUT / f"{pid}.json").write_text(datos + "\n", encoding="utf-8")
        indice.append({"id": pid, "name": nombre, "min": a, "max": b, "count": len(probs), "kb": round(len(datos.encode()) / 1024)})
        print(f"{pid}: {len(probs)} problemas, {indice[-1]['kb']} KB", file=sys.stderr)
    (OUT / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
