#!/usr/bin/env python3
"""Construye AjedrezBase a partir de src/ (sin dependencias, sólo Python 3).

  python3 build.py            genera index.html, sw.js, sf-worker.js y GUIA.md
  python3 build.py --check    comprueba que esos ficheros están al día con src/ (para la CI)

index.html es la aplicación completa en un único archivo: se puede abrir con doble clic
o publicar tal cual. sw.js y sf-worker.js sólo se usan cuando se sirve por http(s)
(GitHub Pages) para instalarla y usarla sin conexión.
"""
import base64
import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"


def read(p):
    return (SRC / p).read_text(encoding="utf-8")


def data_uri(path, mime):
    return f"data:{mime};base64," + base64.b64encode((ROOT / path).read_bytes()).decode()


# ---------------------------------------------------------------- GUIA.md desde la ayuda
class HelpToMarkdown(HTMLParser):
    """Convierte la ayuda (src/help.html) en Markdown para GUIA.md."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.buf, self.lists, self.skip = [], "", [], 0
        self.href, self.in_summary, self.quote, self.table, self.row = None, False, False, None, None

    def flush(self, prefix=""):
        text = re.sub(r"[ \t]*\n[ \t]*", "\n", self.buf).strip()
        text = re.sub(r"[ \t]+", " ", text)
        if text:
            if self.quote:
                text = "\n".join("> " + ln for ln in text.split("\n"))
            self.out.append(prefix + text)
        self.buf = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")
        if self.skip or (tag == "div" and cls in ("help-tools",)) or a.get("id") == "helpNoResults" or tag in ("input", "button"):
            if tag not in ("input",):
                self.skip += 1
            return
        if tag == "summary":
            self.flush(); self.in_summary = True
        elif tag in ("p", "dl"):
            self.flush()
        elif tag == "div" and cls in ("example", "steps"):
            self.flush(); self.quote = True
        elif tag == "p" and "warn-note" in cls:
            self.flush()
        elif tag in ("ul", "ol"):
            self.flush(self.list_prefix())
            self.lists.append([tag, 0])
        elif tag == "li":
            self.flush(self.list_prefix())
            if self.lists:
                self.lists[-1][1] += 1
            self.pending_li = True
        elif tag == "dt":
            self.flush(); self.buf += "**"
        elif tag == "dd":
            self.flush()
        elif tag == "table":
            self.flush(); self.table = []
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.buf = ""
        elif tag == "br":
            self.buf += "\n"
        elif tag in ("b", "strong"):
            self.buf += "**"
        elif tag == "i":
            self.buf += "*"
        elif tag in ("code", "kbd"):
            self.buf += "`"
        elif tag == "a":
            self.href = a.get("href"); self.buf += "["

    def list_prefix(self):
        if not self.lists:
            return ""
        kind, n = self.lists[-1]
        ind = "  " * (len(self.lists) - 1)
        return ind + ("- " if kind == "ul" else f"{max(n, 1)}. ")

    def handle_endtag(self, tag):
        if self.skip:
            if tag not in ("input",):
                self.skip -= 1
            return
        if tag == "summary":
            t = self.buf.strip(); self.buf = ""; self.in_summary = False
            self.out.append("## " + t)
        elif tag == "li":
            self.flush(self.list_prefix())
        elif tag in ("ul", "ol"):
            self.flush(self.list_prefix())
            if self.lists:
                self.lists.pop()
            if not self.lists:
                self.out.append("")
        elif tag in ("p", "dd", "details"):
            self.flush(); self.out.append("")
        elif tag == "div" and self.quote:
            self.flush(); self.quote = False; self.out.append("")
        elif tag == "dt":
            self.buf += "**"; self.flush(); self.out.append("")
        elif tag in ("td", "th"):
            self.row.append(re.sub(r"\s+", " ", self.buf).strip()); self.buf = ""
        elif tag == "tr":
            self.table.append(self.row)
        elif tag == "table":
            if self.table:
                self.out.append("| Tecla | Acción |\n| --- | --- |\n" + "\n".join("| " + " | ".join(r) + " |" for r in self.table))
                self.out.append("")
            self.table = None
        elif tag in ("b", "strong"):
            self.buf += "**"
        elif tag == "i":
            self.buf += "*"
        elif tag in ("code", "kbd"):
            self.buf += "`"
        elif tag == "a":
            self.buf += f"]({self.href})"; self.href = None

    def handle_data(self, data):
        if not self.skip:
            self.buf += data


def build_guide(help_html):
    p = HelpToMarkdown()
    p.feed(help_html)
    p.flush()
    body = "\n".join(p.out)
    body = re.sub(r"\*\*\s+\*\*", " ", body)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    body = body.replace("❓ Guía de AjedrezBase\n", "").replace("❓ Guía de AjedrezBase", "")
    head = ("# Guía de uso de AjedrezBase\n\n"
            "Esta guía es la misma que aparece en la aplicación con el botón **❓ Ayuda** (o la tecla `?`).\n"
            "Se genera automáticamente a partir de `src/help.html` con `python3 build.py`.\n\n"
            "[▶️ Abrir AjedrezBase](https://rkarillo-tech.github.io/ajedrezbase/) · [Volver al README](README.md)\n\n")
    return head + body + "\n"


# ---------------------------------------------------------------- construcción
def build():
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    mit = (ROOT / "LICENSE").read_text(encoding="utf-8").strip()
    pieces = 'const glyphUnicode = { K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘", P:"♙", k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟" };\n' + read("pieces.js")
    app = read("app.js").replace("/*__PIECES__*/", pieces)
    parts = {"CORE": read("core.js"), "PGN": read("pgn.js"), "ECO": read("eco.js"), "APP": app}
    for name, code in parts.items():
        if "</script" in code.lower():
            raise SystemExit(f"src: {name} contiene «</script», que rompería el HTML")
    page = read("template.html")
    page = page.replace("{{HELP}}", read("help.html").rstrip())
    for name, code in parts.items():
        page = page.replace("{{%s}}" % name, code)
    page = page.replace("{{MIT}}", html.escape(mit))
    page = page.replace("{{ICON_SVG}}", data_uri("assets/icon.svg", "image/svg+xml"))
    page = page.replace("{{ICON_PNG32}}", data_uri("assets/icon-32.png", "image/png"))
    page = page.replace("{{VERSION}}", version)
    left = re.findall(r"\{\{[A-Z_0-9]+\}\}", page)
    if left:
        raise SystemExit("Marcadores sin sustituir: " + ", ".join(sorted(set(left))))
    return {
        "index.html": page,
        "sw.js": read("sw.js").replace("{{VERSION}}", version),
        "sf-worker.js": read("sf-worker.js"),
        "GUIA.md": build_guide(read("help.html")),
    }


def main():
    files = build()
    if "--check" in sys.argv:
        stale = [n for n, c in files.items() if not (ROOT / n).exists() or (ROOT / n).read_text(encoding="utf-8") != c]
        if stale:
            print("No están al día con src/: " + ", ".join(stale) + ". Ejecuta: python3 build.py")
            sys.exit(1)
        print("Todo al día.")
        return
    for name, content in files.items():
        (ROOT / name).write_text(content, encoding="utf-8")
    print(f"AjedrezBase {(ROOT / 'VERSION').read_text().strip()}: " + ", ".join(f"{n} ({len(c.encode()) // 1024} KB)" for n, c in files.items()))


if __name__ == "__main__":
    main()
