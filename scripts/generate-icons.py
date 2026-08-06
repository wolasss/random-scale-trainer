#!/usr/bin/env python3
"""Generates the PWA icons from the app's own display serif.

The home-screen icon is the hero glyph: a Fraunces 'A' in teal on the near-black
background, matching .hero-note in src/index.css. Fraunces is a variable font and
its default instance is the 9pt text cut, so the axes are pinned to the 144pt
display cut the hero actually renders at. The glyph is baked into the SVG as an
outline, so nothing here depends on a font being installed at render time.

Requires:  pip install fonttools    and    brew install librsvg
Fraunces:  https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf

Output: public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png
"""

from __future__ import annotations

import subprocess
import sys
import urllib.request
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
FONT_URL = (
    "https://github.com/google/fonts/raw/main/ofl/fraunces/"
    "Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
)
FONT_CACHE = Path(__file__).resolve().parent / ".fraunces-cache.ttf"

# The display cut the hero renders at: 144pt optical size, bold, wonky.
AXES = {"opsz": 144, "wght": 700, "SOFT": 0, "WONK": 1}

BG = "#061014"      # manifest background_color / theme_color
GLYPH = "#26d2bd"   # --primary
GLOW = "#26d2bd"    # the hero note's teal text-shadow


def load_glyph_path() -> tuple[str, tuple[float, float, float, float]]:
    """Returns the 'A' outline as an SVG path plus its tight bounding box."""
    if not FONT_CACHE.exists():
        print(f"Downloading Fraunces -> {FONT_CACHE.name}")
        urllib.request.urlretrieve(FONT_URL, FONT_CACHE)

    font = instantiateVariableFont(TTFont(FONT_CACHE), AXES)
    glyph_set = font.getGlyphSet()
    name = font.getBestCmap()[ord("A")]

    pen = SVGPathPen(glyph_set)
    glyph_set[name].draw(pen)

    glyf = font["glyf"][name]
    return pen.getCommands(), (glyf.xMin, glyf.yMin, glyf.xMax, glyf.yMax)


def build_svg(size: int, coverage: float, path_data: str, bounds: tuple[float, float, float, float]) -> str:
    """Lays the glyph out centred, scaled so its height is `coverage` of the canvas.

    `coverage` is what keeps the maskable variant inside its safe zone: at 0.6
    the glyph clears Android's circle mask with 20% padding to spare.
    """
    x_min, y_min, x_max, y_max = bounds
    glyph_w, glyph_h = x_max - x_min, y_max - y_min

    scale = (size * coverage) / glyph_h
    # Font units are y-up, SVG is y-down: flip, then centre what remains.
    tx = (size - glyph_w * scale) / 2 - x_min * scale
    ty = (size + glyph_h * scale) / 2 + y_min * scale

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{GLOW}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="{GLOW}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{size}" height="{size}" fill="{BG}"/>
  <rect width="{size}" height="{size}" fill="url(#glow)"/>
  <path transform="translate({tx:.3f} {ty:.3f}) scale({scale:.6f} {-scale:.6f})" d="{path_data}" fill="{GLYPH}"/>
</svg>
"""


def render(svg: str, out: Path, size: int) -> None:
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(out)],
        input=svg.encode(), check=True,
    )
    print(f"Generated: {out.relative_to(ROOT)}  ({out.stat().st_size} bytes)")


def main() -> int:
    path_data, bounds = load_glyph_path()
    PUBLIC.mkdir(parents=True, exist_ok=True)

    # 0.58 fills the tile; 0.60 of the maskable canvas keeps the 20% padding the
    # circle mask needs on Android.
    for name, size, coverage in [
        ("icon-192.png", 192, 0.58),
        ("icon-512.png", 512, 0.58),
        ("icon-maskable-512.png", 512, 0.42),
    ]:
        render(build_svg(size, coverage, path_data, bounds), PUBLIC / name, size)

    return 0


if __name__ == "__main__":
    sys.exit(main())
