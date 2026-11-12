#!/usr/bin/env python3
"""Exporta las piezas blancas de «Chess board & pieces» (OpenGameArt, CC0) a GLB, una por fichero.

Necesita Blender 5 como módulo de Python (pip install bpy, versión 5.1 o posterior):
    python3 tools/modelos_3d_exportar.py "wood chess board.blend" carpeta_salida
Después: node tools/modelos_3d.js carpeta_salida   (ver tools/modelos_3d.js)
"""
import os
import sys

import bpy

src, out = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "."
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src)
for name in ["King", "Queen", "Rook", "Bishop", "Knight", "Pawn"]:
    bpy.ops.object.select_all(action="DESELECT")
    obj = bpy.data.objects["White_" + name]
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f"staunton_{name.lower()}.glb"), use_selection=True,
                              export_format="GLB", export_materials="NONE", export_apply=True, export_yup=True)
print("Exportadas las seis piezas en", out)
