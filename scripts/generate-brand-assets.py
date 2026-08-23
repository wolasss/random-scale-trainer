#!/usr/bin/env python3
"""Generates every callnote.app brand asset from one geometry and one token table.

The brand is a call sign: two stacked dots — the call and its response — beside
the lowercase wordmark. The geometry never changes; only the ink re-tunes per
theme. That is the whole reason this is a generator rather than a folder of
hand-drawn variants: adding a theme is a row in THEMES, not a new drawing. Four
of those rows are the app skins from `src/lib/skins.ts`; `light` is the
light-ground fallback, exported for light surfaces with no app skin behind it.

The letterforms are Gabarito 800, baked to outlines here so nothing depends on a
font being installed at render time. `PATH_C` is the same outline the wordmark's
first glyph uses — the app icon is literally the wordmark's `c` plus its dot.

Outputs (all pure stdlib, no dependencies):
  brand/callnote-lockup-<skin>.svg              full lockup on the skin's ground
  brand/callnote-lockup-<skin>-transparent.svg  same, no ground — for overlays
  brand/callnote-lockup-compact-<skin>.svg      wordmark without the .app suffix
  brand/callnote-icon-<size>-<skin>.svg         app icon at 48 / 180 / 1024
  brand/callnote-icon-maskable-1024-glass.svg   PWA maskable icon, full-bleed
  public/favicon.svg                            the default skin's icon, tab-sized

The PWA's PNG icons are rasterized from the emitted SVGs; this script does not
shell out to a rasterizer so that it stays dependency-free. Regenerate them with
either of:

    rsvg-convert -w 192 -h 192 brand/callnote-icon-1024-glass.svg -o public/icon-192.png
    node scripts/rasterize-icons.mjs      # headless Chromium, needs playwright

See brand/callnote-brand-guide.md for the rules these values encode.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
PUBLIC = ROOT / "public"

# The skin whose icon ships as the installable app icon and the favicon.
DEFAULT_SKIN = "glass"

# --- Tokens -------------------------------------------------------------------
# One row per skin. `ink`/`accent`/`dot_muted` mirror the app's own --ink,
# --primary and border tone, so the call dot is always the same colour as the
# Resume button. A new skin is added here and nowhere else:
#   ink        = the skin's text colour
#   accent     = the skin's primary action colour (the call dot)
#   ink_muted  = the muted ink the `.app` suffix is set in
#   dot_muted  = the skin's subtle border tone (the response dot)
#   tile_hi/lo = the icon tile's gradient, darkest corner last
#   ground     = the surface the lockup sits on, for the non-transparent export
THEMES: dict[str, dict[str, str]] = {
    "editorial": {
        "ink": "#e9e2d6",
        "ink_muted": "#8a7f74",
        "accent": "#e0786a",
        "dot_muted": "#4a423b",
        "border": "#3a332c",
        "tile_hi": "#2a2420",
        "tile_lo": "#1a1714",
        "ground": "#1c1917",
    },
    "warm": {
        "ink": "#f3e6d8",
        "ink_muted": "#a08d7b",
        "accent": "#ee8d55",
        "dot_muted": "#5d4c3d",
        "border": "#5d4c3d",
        "tile_hi": "#46372c",
        "tile_lo": "#32271f",
        "ground": "#362a22",
    },
    "glass": {
        "ink": "#dfe9ec",
        "ink_muted": "#6e8b95",
        "accent": "#3fe0c0",
        "dot_muted": "#2b4652",
        "border": "#2b4652",
        "tile_hi": "#16303d",
        "tile_lo": "#0c1a23",
        "ground": "#0d1b24",
    },
    # Derived by the guide's "New themes" rule from the instrument skin's own
    # tokens: ink = --ink, accent = --primary (amber), muted = --panel-border.
    "instrument": {
        "ink": "#e7e4db",
        "ink_muted": "#8b877c",
        "accent": "#ffb020",
        "dot_muted": "#34383f",
        "border": "#262a30",
        "tile_hi": "#101418",
        "tile_lo": "#070809",
        "ground": "#070809",
    },
    # The light-ground fallback: ink and ground invert, the accent holds, and
    # every glow is dropped — a glow on paper only reads as a smudge.
    "light": {
        "ink": "#1c1917",
        "ink_muted": "#8a7f74",
        "accent": "#d1543f",
        "dot_muted": "#c3bbaf",
        "border": "#c3bbaf",
        # The icon tile stays dark even in the light lockup: a home-screen tile
        # is a shape on someone else's wallpaper, not a page on paper.
        "tile_hi": "#1c1917",
        "tile_lo": "#1c1917",
        "tile_ink": "#f4f0e9",
        "tile_accent": "#e0786a",
        "ground": "#f4f0e9",
        "glow": "off",
    },
}

# --- Geometry -----------------------------------------------------------------
# Icon metrics as fractions of the tile, so every size is one multiplication.
ICON_RADIUS = 0.227000     # rounded-square corner, ~23% of the tile
ICON_GLYPH_X = 0.250109    # the c's origin
ICON_GLYPH_Y = 0.647000    # its baseline
ICON_GLYPH_SCALE = 0.00299805
ICON_DOT_CX = 0.687392
ICON_DOT_R = 0.062500
ICON_GLOW_BLUR = 0.050000

# Lockup metrics, in the export's own units. The wordmark is one outline set at
# 0.23 scale; `.app` is a second outline shifted to sit right after it.
LOCKUP_H = 78.2
LOCKUP_W_FULL = 319.8
LOCKUP_W_COMPACT = 232.2
LOCKUP_DOT_CX = 28.06
LOCKUP_DOT_CALL_CY = 30.82
LOCKUP_DOT_RESPONSE_CY = 47.38
LOCKUP_DOT_R = 5.06
LOCKUP_TEXT_X = 43.24
LOCKUP_TEXT_Y = 54.51
LOCKUP_TEXT_SCALE = 0.23
LOCKUP_SUFFIX_DX = 721.56
LOCKUP_GLOW_BLUR = 4.14

# The lowercase c, as used in the icon.
PATH_C = (
    "M45 -101.5L44 -100.5L40 -100.5L34 -98.5L26 -94.5L17 -87.5L10.5 -79L6.5 -71L4.5 -65L4.5 -61"
    "L3.5 -60L3.5 -51L2.5 -50L3.5 -49L4.5 -35L7.5 -26L13.5 -16L22 -7.5L28 -3.5L38 0.5L50 1.5"
    "L51 2.5L70 0.5L81 -4.5L88 -9.5L97.5 -21L100.5 -27L100.5 -29L91 -33.5L89 -33.5L82 -37.5"
    "L80 -37.5L73 -41.5L71 -41.5L68.5 -37L62 -31.5L59 -30.5L49 -30.5L42 -34.5L37.5 -41L36.5 -44"
    "L36.5 -56L37.5 -59L44 -66.5L51 -69.5L58 -69.5L63 -67.5L68.5 -62L70.5 -58L72 -57.5L100 -70.5"
    "L100.5 -72L94.5 -83L82 -94.5L74 -98.5L64 -100.5L63 -101.5L45 -101.5Z"
)

# "callnote", set in Gabarito 800.
PATH_WORDMARK = (
    "M213 -137.5L212.5 -24L213.5 -23L213.5 -20L217.5 -11L224 -4.5L236 0.5L254 0.5L254.5 -31"
    "L248 -33.5L246.5 -35L246.5 -38L245.5 -39L245.5 -137L213 -137.5ZM269 -137.5L268.5 -23"
    "L269.5 -22L269.5 -19L272.5 -12L283 -2.5L292 0.5L309 0.5L310.5 -1L310.5 -31L305 -32.5"
    "L301.5 -37L301.5 -136L300 -137.5L269 -137.5ZM560 -123.5L557.5 -120L557.5 -117L555.5 -113"
    "L552.5 -100L551 -98.5L537.5 -98L537.5 -69L552.5 -68L552.5 -26L553.5 -25L554.5 -18"
    "L557.5 -12L564 -5.5L574 -0.5L583 0.5L584 1.5L597 1.5L598 0.5L606 -0.5L607.5 -2L607.5 -32"
    "L602 -31.5L601 -30.5L594 -30.5L590 -32.5L586.5 -36L586.5 -39L585.5 -40L585.5 -68"
    "L607.5 -69L607.5 -98L585.5 -99L585 -123.5L560 -123.5Z"
    "M45 -101.5L44 -100.5L40 -100.5L34 -98.5L26 -94.5L17 -87.5L10.5 -79L6.5 -71L4.5 -65"
    "L4.5 -61L3.5 -60L3.5 -51L2.5 -50L3.5 -49L4.5 -35L7.5 -26L13.5 -16L22 -7.5L28 -3.5L38 0.5"
    "L50 1.5L51 2.5L70 0.5L81 -4.5L88 -9.5L97.5 -21L100.5 -27L100.5 -29L91 -33.5L89 -33.5"
    "L82 -37.5L80 -37.5L73 -41.5L71 -41.5L68.5 -37L62 -31.5L59 -30.5L49 -30.5L42 -34.5"
    "L37.5 -41L36.5 -44L36.5 -56L37.5 -59L44 -66.5L51 -69.5L58 -69.5L63 -67.5L68.5 -62"
    "L70.5 -58L72 -57.5L100 -70.5L100.5 -72L94.5 -83L82 -94.5L74 -98.5L64 -100.5L63 -101.5"
    "L45 -101.5ZM143 -101.5L142 -100.5L137 -100.5L123 -96.5L112.5 -91L113.5 -86L115.5 -83"
    "L119.5 -71L122 -67.5L127 -70.5L137 -73.5L152 -74.5L158 -72.5L161.5 -69L163.5 -64"
    "L163.5 -60L161 -59.5L155 -62.5L151 -62.5L150 -63.5L132 -63.5L125 -61.5L115 -55.5"
    "L107.5 -46L105.5 -41L105.5 -36L104.5 -35L105.5 -21L108.5 -14L110.5 -11L120 -2.5L130 1.5"
    "L136 1.5L137 2.5L152 1.5L158 -0.5L166 -5.5L167.5 -5L167.5 -2L169 -0.5L196 -0.5L196.5 -67"
    "L195.5 -68L194.5 -77L190.5 -85L184 -92.5L174 -98.5L164 -100.5L163 -101.5L143 -101.5Z"
    "M378 -101.5L368 -98.5L353 -89.5L351.5 -90L349.5 -97L348 -98.5L323.5 -98L324 -0.5"
    "L356.5 -1L356.5 -60L363 -65.5L374 -69.5L380 -68.5L384.5 -63L384.5 -1L417.5 -1L417.5 -71"
    "L416.5 -72L415.5 -82L411.5 -90L404 -97.5L394 -101.5L378 -101.5ZM471 -101.5L470 -100.5"
    "L460 -98.5L450 -93.5L438.5 -83L434.5 -77L431.5 -71L429.5 -65L429.5 -60L428.5 -59"
    "L428.5 -40L429.5 -39L429.5 -34L433.5 -26L433.5 -24L440.5 -14L449 -6.5L454 -3.5L468 1.5"
    "L477 1.5L478 2.5L493 1.5L507 -3.5L513 -7.5L525.5 -21L529.5 -29L529.5 -32L532.5 -41"
    "L532.5 -59L531.5 -60L531.5 -64L529.5 -70L523.5 -81L516 -89.5L509 -94.5L501 -98.5"
    "L498 -98.5L489 -101.5L471 -101.5ZM660 -101.5L659 -100.5L655 -100.5L651 -98.5L648 -98.5"
    "L642 -95.5L634 -89.5L625.5 -79L621.5 -71L621.5 -68L618.5 -59L618.5 -40L619.5 -39"
    "L619.5 -35L621.5 -28L627.5 -17L640 -5.5L648 -1.5L654 0.5L659 0.5L660 1.5L676 1.5L677 0.5"
    "L682 0.5L691 -2.5L703 -9.5L710.5 -17L714.5 -24L694 -35.5L692 -35.5L687 -29.5L681 -25.5"
    "L674 -23.5L662 -24.5L656 -27.5L650.5 -33L648.5 -39L716 -39.5L717.5 -41L717.5 -59"
    "L716.5 -60L716.5 -64L713.5 -73L708.5 -82L695 -94.5L688 -98.5L685 -98.5L677 -101.5"
    "L660 -101.5ZM661.5 -75L674 -75.5L677 -74.5L681 -72.5L684.5 -69L687.5 -63L650 -62.5"
    "L649.5 -65L650.5 -67L657 -73.5L661.5 -75ZM476.5 -69L484 -69.5L491 -66.5L496.5 -61"
    "L498.5 -56L498.5 -51L499.5 -50L498.5 -48L498.5 -43L494.5 -36L486 -30.5L475 -30.5"
    "L472 -31.5L465.5 -37L461.5 -46L461.5 -54L464.5 -61L471 -67.5L476.5 -69ZM148.5 -41"
    "L154 -41.5L159 -39.5L162.5 -36L163.5 -33L163.5 -28L162.5 -26L159 -22.5L155 -20.5"
    "L145 -21.5L139.5 -28L139.5 -34L140.5 -36L144 -39.5L148.5 -41Z"
)

# ".app", set one weight down and in muted ink.
PATH_SUFFIX = (
    "M100 -101.5L99 -100.5L91 -100.5L90 -99.5L81 -98.5L66 -92.5L65.5 -90L73 -72.5L84 -76.5"
    "L95 -77.5L96 -78.5L103 -78.5L110 -76.5L115.5 -70L116.5 -67L116.5 -59L112 -61.5L106 -63.5"
    "L102 -63.5L101 -64.5L88 -64.5L87 -63.5L79 -62.5L71 -58.5L62.5 -50L58.5 -42L58.5 -38"
    "L57.5 -37L57.5 -25L58.5 -24L58.5 -20L62.5 -12L67 -6.5L71 -3.5L82 1.5L88 1.5L89 2.5"
    "L105 1.5L113 -1.5L120 -6.5L122 -0.5L143 -0.5L143.5 -70L142.5 -71L142.5 -75L140.5 -81"
    "L134.5 -90L126 -96.5L115 -100.5L100 -101.5ZM213 -101.5L212 -100.5L207 -100.5L198 -97.5"
    "L193 -94.5L188 -89.5L186.5 -90L185.5 -96L184 -98.5L165 -98.5L163.5 -97L163.5 36L165 37.5"
    "L190.5 37L191 -5.5L198 -1.5L208 1.5L226 1.5L233 -0.5L241 -4.5L250.5 -13L255.5 -20"
    "L259.5 -29L260.5 -36L261.5 -37L261.5 -44L262.5 -45L262.5 -54L261.5 -55L260.5 -67"
    "L255.5 -79L251.5 -85L244 -92.5L238 -96.5L227 -100.5L213 -101.5ZM326 -101.5L325 -100.5"
    "L320 -100.5L314 -98.5L305 -93.5L301 -89.5L299.5 -90L299.5 -93L297 -98.5L277.5 -98"
    "L278 37.5L303.5 37L304 -5.5L314 -0.5L321 1.5L339 1.5L340 0.5L343 0.5L357 -6.5L364.5 -14"
    "L371.5 -26L374.5 -36L374.5 -42L375.5 -43L375.5 -56L374.5 -57L373.5 -67L367.5 -81"
    "L357 -92.5L347 -98.5L340 -100.5L335 -100.5L334 -101.5L326 -101.5ZM208.5 -76L215 -76.5"
    "L225 -72.5L231.5 -65L234.5 -56L234.5 -43L230.5 -33L223 -25.5L218 -23.5L206 -23.5"
    "L200 -26.5L192.5 -35L189.5 -44L189.5 -55L193.5 -66L201 -73.5L208.5 -76ZM321.5 -76"
    "L328 -76.5L338 -72.5L344.5 -65L347.5 -57L347.5 -42L345.5 -36L339 -27.5L331 -23.5"
    "L319 -23.5L313 -26.5L306.5 -34L302.5 -45L302.5 -55L305.5 -64L314 -73.5L321.5 -76Z"
    "M94.5 -43L106 -43.5L111 -41.5L115.5 -37L116.5 -28L114.5 -24L111 -20.5L105 -18.5"
    "L97 -18.5L91 -20.5L86.5 -25L85.5 -35L91 -41.5L94.5 -43ZM26 -37.5L19 -35.5L10.5 -28"
    "L8.5 -24L8.5 -12L10.5 -8L20 0.5L31 1.5L39 -2.5L44.5 -9L46.5 -14L46.5 -22L44.5 -27"
    "L41 -31.5L33 -36.5L26 -37.5Z"
)


def num(value: float) -> str:
    """Trims a coordinate without leaving a trailing '.0'.

    Four decimals rather than two because the glyph scale at small sizes is
    itself a fraction — rounding 0.1439 to 0.14 would shrink the c by 4%.
    """
    return f"{round(value, 4):g}"


def glow_filter(ref: str, color: str, blur: float, opacity: float) -> str:
    """A coloured bloom behind the source graphic. Belongs to the dot, never text."""
    return (
        f'<filter id="{ref}" x="-300%" y="-300%" width="700%" height="700%">'
        f'<feGaussianBlur stdDeviation="{num(blur)}" result="b"></feGaussianBlur>'
        f'<feFlood flood-color="{color}" flood-opacity="{opacity}"></feFlood>'
        f'<feComposite in2="b" operator="in"></feComposite>'
        f"<feMerge><feMergeNode></feMergeNode>"
        f'<feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>'
    )


def build_icon(
    skin: str,
    size: int,
    *,
    maskable: bool = False,
    glow: bool | None = None,
    border: bool | None = None,
) -> str:
    """The c• monogram on its tile.

    Below 48px the glow is dropped and below 24px the border goes too — both
    turn to mud at those sizes. `glow`/`border` override that when the export's
    viewBox is not the size it will be seen at, as with a favicon. A maskable
    tile is full-bleed and unbordered instead: the platform supplies the shape,
    and the mark already sits well inside the 80% safe circle.
    """
    theme = THEMES[skin]
    ink = theme.get("tile_ink", theme["ink"])
    accent = theme.get("tile_accent", theme["accent"])
    flat = theme["tile_hi"] == theme["tile_lo"]

    with_glow = (size >= 48 if glow is None else glow) and theme.get("glow") != "off"
    with_border = (size >= 24 if border is None else border) and not maskable and not flat

    # Element ids are document-global once an SVG is inlined into a page, so a
    # bare id="bg" would have every mark on that page painted in whichever skin
    # happened to load first. The skin and size make them unique.
    scope = f"{skin}-{size}{'-maskable' if maskable else ''}"

    defs = []
    if not flat:
        defs.append(
            f'<linearGradient id="bg-{scope}" x1="0" y1="0" x2="0.6" y2="1">'
            f'<stop offset="0" stop-color="{theme["tile_hi"]}"></stop>'
            f'<stop offset="1" stop-color="{theme["tile_lo"]}"></stop></linearGradient>'
        )
    if with_glow:
        defs.append(glow_filter(f"glow-{scope}", accent, ICON_GLOW_BLUR * size, 0.6))

    fill = theme["tile_hi"] if flat else f"url(#bg-{scope})"
    radius = "" if maskable else f' rx="{num(ICON_RADIUS * size)}"'
    body = [f'<rect width="{size}" height="{size}"{radius} fill="{fill}"></rect>']

    if with_border:
        body.append(
            f'<rect x="0.5" y="0.5" width="{size - 1}" height="{size - 1}"'
            f'{radius} fill="none" stroke="{theme["border"]}"></rect>'
        )

    body.append(
        f'<g transform="translate({num(ICON_GLYPH_X * size)},{num(ICON_GLYPH_Y * size)}) '
        f'scale({num(ICON_GLYPH_SCALE * size)})" fill-rule="evenodd">'
        f'<path d="{PATH_C}" fill="{ink}"></path></g>'
    )
    body.append(
        f'<circle cx="{num(ICON_DOT_CX * size)}" cy="{num(size / 2)}" '
        f'r="{num(ICON_DOT_R * size)}" fill="{accent}"'
        f'{f" filter=\"url(#glow-{scope})\"" if with_glow else ""}></circle>'
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}">\n'
        f"<defs>{''.join(defs)}</defs>\n" + "\n".join(body) + "\n</svg>\n"
    )


def build_lockup(skin: str, *, ground: bool = True, compact: bool = False) -> str:
    """The full call sign: dot column, wordmark, and the muted .app suffix.

    `compact` drops the suffix for tight placements. The suffix is part of the
    wordmark's own outline group, never a sibling of the dot column — as a
    sibling it would pick up the column's gap and float away from the 'e'.
    """
    theme = THEMES[skin]
    width = LOCKUP_W_COMPACT if compact else LOCKUP_W_FULL
    # A glow needs something to bloom against; the compact export is used at
    # sizes where it would only fatten the dot.
    with_glow = ground and not compact and theme.get("glow") != "off"

    scope = f"lockup-{skin}"
    defs = glow_filter(f"glow-{scope}", theme["accent"], LOCKUP_GLOW_BLUR, 0.55) if with_glow else ""
    body = []
    if ground:
        body.append(f'<rect width="{num(width)}" height="{LOCKUP_H}" fill="{theme["ground"]}"></rect>')

    body.append(
        f'<circle cx="{LOCKUP_DOT_CX}" cy="{LOCKUP_DOT_CALL_CY}" r="{LOCKUP_DOT_R}" '
        f'fill="{theme["accent"]}"{f" filter=\"url(#glow-{scope})\"" if with_glow else ""}></circle>'
    )
    body.append(
        f'<circle cx="{LOCKUP_DOT_CX}" cy="{LOCKUP_DOT_RESPONSE_CY}" r="{LOCKUP_DOT_R}" '
        f'fill="{theme["dot_muted"]}"></circle>'
    )

    glyphs = [f'<path d="{PATH_WORDMARK}" fill="{theme["ink"]}"></path>']
    if not compact:
        glyphs.append(
            f'<path d="{PATH_SUFFIX}" fill="{theme["ink_muted"]}" '
            f'transform="translate({LOCKUP_SUFFIX_DX},0)"></path>'
        )

    body.append(
        f'<g transform="translate({LOCKUP_TEXT_X},{LOCKUP_TEXT_Y}) '
        f'scale({LOCKUP_TEXT_SCALE})" fill-rule="evenodd">\n' + "\n".join(glyphs) + "\n</g>"
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{num(width)}" height="{LOCKUP_H}" '
        f'viewBox="0 0 {num(width)} {LOCKUP_H}">\n'
        f"<defs>{defs}</defs>\n" + "\n".join(body) + "\n</svg>\n"
    )


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"  {path.relative_to(ROOT)}  ({len(content.encode()):,} bytes)")


def main() -> int:
    print("Lockups:")
    for skin in THEMES:
        write(BRAND / f"callnote-lockup-{skin}.svg", build_lockup(skin))
        write(BRAND / f"callnote-lockup-{skin}-transparent.svg", build_lockup(skin, ground=False))
        write(BRAND / f"callnote-lockup-compact-{skin}.svg", build_lockup(skin, compact=True))

    print("Icons:")
    for skin in THEMES:
        for size in (48, 180, 1024):
            write(BRAND / f"callnote-icon-{size}-{skin}.svg", build_icon(skin, size))
    write(BRAND / "callnote-icon-maskable-1024-glass.svg", build_icon(DEFAULT_SKIN, 1024, maskable=True))

    print("App:")
    # A favicon is drawn at 16–32px however large its viewBox is, so it is built
    # at 64 for coordinate precision but stripped of the glow and the border.
    write(PUBLIC / "favicon.svg", build_icon(DEFAULT_SKIN, 64, glow=False, border=False))

    print("\nPNG icons are rasterized separately — see this file's docstring.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
