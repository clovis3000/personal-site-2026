#!/usr/bin/env python3
"""Subset the source faces in tools/fonts-src into site/fonts/*.woff2.

Every face gets the same fixed Latin set. A character outside it (an
accented name, a new symbol in the copy) falls back to a system face
silently: widen LATIN and re-run.

The source TTFs aren't committed; missing ones are fetched from google/fonts.

Usage: python3 tools/fonts.py
"""
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "fonts-src"
OUT = ROOT / "site" / "fonts"

LATIN = "U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+2116,U+2190-2194,U+2212,U+00D7"

# Axes pinned before subsetting. Every serif on the page is weight 400 and
# every sans is at normal width, so those axes are dead weight in each load.
# Asking for Newsreader at another weight, or Archivo at another
# font-stretch, now synthesises silently: unpin the axis here first.
FACES = [
    ("archivo", "Archivo[wdth,wght].ttf", "archivo.woff2", {"wdth": 100}),
    ("newsreader", "Newsreader[opsz,wght].ttf", "newsreader.woff2", {"wght": 400}),
    ("newsreader", "Newsreader-Italic[opsz,wght].ttf", "newsreader-italic.woff2", {"wght": 400}),
]
GOOGLE = "https://github.com/google/fonts/raw/main/ofl/{family}/{file}"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    tmp = OUT / ".pinned.ttf"
    for family, src, dst, pin in FACES:
        if not (SRC / src).exists():
            url = GOOGLE.format(family=family, file=urllib.parse.quote(src))
            print(f"fetching {url}")
            urllib.request.urlretrieve(url, SRC / src)
        instancer.instantiateVariableFont(TTFont(SRC / src), pin).save(tmp)
        subprocess.run(["pyftsubset", str(tmp), f"--output-file={OUT / dst}",
                        "--flavor=woff2", "--layout-features=*", "--no-hinting",
                        "--desubroutinize", f"--unicodes={LATIN}"], check=True)
        print(f"{dst:28s} {(OUT / dst).stat().st_size / 1024:6.1f} KB")
    tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
