# callnote.app — brand guide (theme-adaptive mark)

The brand is a **call sign**: two stacked dots (the call and its response) beside the lowercase
wordmark. The mark's geometry never changes; only its ink and the lit dot re-tune to the app's
active skin. One mark, every skin.

## 1. Wordmark

- Text: `callnote` lowercase, followed by `.app` as a muted suffix (drop `.app` when space is
  tight; never at icon size).
- Font: **Gabarito 800** (Google Fonts) for `callnote`; `.app` at weight 600 in the theme's muted
  ink. Letter-spacing `-0.015em`.
- Left of the text: two stacked dots, vertically centered against the x-height.
  - Dot size: `0.22em` each (em of the wordmark font size), circular.
  - Vertical gap between dots: `0.14em`. Gap between dots and text: `0.22em`.
  - Top dot = **the call**: theme accent, with glow `box-shadow: 0 0 12px 2px <accent at 45% alpha>`.
  - Bottom dot = **the response**: theme's subtle border tone (or ink at 30%).

### Reference markup

```html
<link href="https://fonts.googleapis.com/css2?family=Gabarito:wght@600;800&display=swap" rel="stylesheet">

<div style="font-family:'Gabarito',sans-serif;font-weight:800;font-size:46px;
            letter-spacing:-0.015em;color:var(--brand-ink);
            display:flex;align-items:center;gap:0.22em;">
  <span style="display:inline-flex;flex-direction:column;gap:0.14em;">
    <span style="width:.22em;height:.22em;border-radius:50%;background:var(--brand-accent);
                 box-shadow:0 0 12px 2px var(--brand-accent-glow);"></span>
    <span style="width:.22em;height:.22em;border-radius:50%;background:var(--brand-dot-muted);"></span>
  </span>
  <span>callnote<span style="font-weight:600;color:var(--brand-ink-muted);">.app</span></span>
</div>
```

Note: `.app` sits inside the same `<span>` as `callnote` — it must NOT be a separate flex child or
it picks up the 0.22em gap.

## 2. App icon — the "c•" monogram

Rounded-square tile, subtle diagonal gradient of the theme's surface tones, 1px border in the
theme's border tone. Inside: Gabarito 800 lowercase `c` in theme ink + one accent dot after it
(the called note), with glow at large sizes.

- Tile radius: ~23% of tile size (20px at 88px, 10px at 44px).
- Glyph: `c` at ~57% of tile height; dot at ~12.5% of tile size, gap ~7% of tile, dot aligned to
  the c's x-height center.
- Drop the glow below 48pt; drop the border below 24pt.
- `.app` and the second dot never appear in the icon.

```html
<div style="width:88px;height:88px;border-radius:20px;
            background:linear-gradient(160deg,var(--brand-tile-hi),var(--brand-tile-lo));
            border:1px solid var(--brand-border);
            display:flex;align-items:center;justify-content:center;">
  <div style="font-family:'Gabarito',sans-serif;font-weight:800;font-size:50px;
              color:var(--brand-ink);line-height:1;display:flex;align-items:center;">
    c<span style="width:11px;height:11px;border-radius:50%;background:var(--brand-accent);
           display:inline-block;margin-left:6px;
           box-shadow:0 0 16px 3px var(--brand-accent-glow);"></span>
  </div>
</div>
```

## 3. Exported-asset palette

The mark reads its colors from the active skin. The table below is **not** those live tokens: it is
the literal `THEMES` table in `scripts/generate-brand-assets.py`, which is separately hand-tuned and
drives every SVG in this folder plus `public/favicon.svg` (the PWA's PNGs are rasterized from the
glass SVGs by `scripts/rasterize-icons.mjs`). The in-app lockup takes its colours from
`src/index.css` instead, and the two are allowed to differ — see §5. The `Light` column is an export
row only; the app's light theme is handled by tokens.

| Token | Editorial | Warm | Atmospheric glass | Instrument | Light¹ |
| --- | --- | --- | --- | --- | --- |
| `ink` (wordmark) | `#e9e2d6` | `#f3e6d8` | `#dfe9ec` | `#e7e4db` | `#1c1917` |
| `ink_muted` (.app) | `#8a7f74` | `#a08d7b` | `#6e8b95` | `#8b877c` | `#8a7f74` |
| `accent` (call dot) | `#e0786a` | `#ee8d55` | `#3fe0c0` | `#ffb020` | `#d1543f` |
| `dot_muted` (response dot) | `#4a423b` | `#5d4c3d` | `#2b4652` | `#34383f` | `#c3bbaf` |
| `border` | `#3a332c` | `#5d4c3d` | `#2b4652` | `#262a30` | `#c3bbaf` |
| `tile_hi` | `#2a2420` | `#46372c` | `#16303d` | `#101418` | `#1c1917` |
| `tile_lo` | `#1a1714` | `#32271f` | `#0c1a23` | `#070809` | `#1c1917` |
| `ground` (context) | `#1c1917` | `#362a22` | `#0d1b24` | `#070809` | `#f4f0e9` |

¹ The light row also carries `tile_ink` `#f4f0e9` and `tile_accent` `#e0786a`, which the icon builder
prefers over `ink`/`accent`: with `tile_hi` = `tile_lo` the tile is flat, dark and unbordered even
under a light lockup, because a home-screen tile is a shape on someone else's wallpaper, not a page
on paper.

Glow is not a table row — the generator blooms the call dot from that row's own `accent`, at opacity
0.55 in lockups and 0.6 in icons. It is dropped for the transparent and compact lockups, for icons
below 48px, for the favicon, and for the whole `light` row (`"glow": "off"`).

Adding an **export theme** is a row in `THEMES` and nothing else: `ink` = the skin's text colour,
`accent` = its primary action colour (the call dot), `dot_muted`/`border` = its subtle border tone.
Adding an **app skin** is more than that — it also needs its palette in the SKINS block of
`src/index.css` (the dark block *and* its `[data-theme='light']` block) and registration in
`src/lib/skins.ts` (the `Skin` union and `SKINS`). What the `--brand-*` aliases save you is the
brand-specific work, not the skin itself.

## 4. Rules

- The call dot always uses the theme's primary accent — the same color as the Resume button and
  note chips. Never introduce a color the theme doesn't have.
- Glow belongs to the dot only, never to text.
- Clear space around the lockup: 1× dot-column width (0.22em) on all sides minimum.
- Light-ground fallback (marketing): the shipped `light` export row inverts the ink to `#1c1917` on
  a `#f4f0e9` ground, drops every glow, and re-tunes rather than reusing a dark accent — the call
  dot becomes `#d1543f` and the response dot `#c3bbaf`, while the icon tile deliberately stays dark.
  It ships as six files: `callnote-lockup-light.svg`, `callnote-lockup-light-transparent.svg`,
  `callnote-lockup-compact-light.svg`, and `callnote-icon-{48,180,1024}-light.svg`. The maskable
  icon and the favicon are glass-only.
- Don't bold `.app`, don't uppercase anything, don't outline the dots, don't replace the dots with
  musical glyphs.
- **Motto: "Fretboard fluency, one beat at a time."** The official line — use it verbatim, with
  that capitalisation and that full stop, wherever the app needs a tagline (header lede, `<title>`,
  manifest description, store copy). Don't paraphrase it and don't write a second one.
- Voice: playful, energetic, musician-native. Short imperative copy ("Find it before the next one
  lands").

## 5. How this repo implements it

The in-app lockup is **live text, not an image** — `src/components/BrandLockup.tsx` plus the BRAND
block in `src/index.css`. It reads `--brand-*` custom properties that are themselves aliases of the
app's own tokens:

```css
--brand-accent: var(--primary);          /* the Resume button's colour, by construction */
--brand-dot-muted: color-mix(in srgb, var(--ink) 30%, transparent);
```

That alias is what enforces rule 1 mechanically rather than by discipline: a new skin cannot drift
from its mark, because the mark has no colour of its own. It also means **`src/index.css` is the
source of truth for the in-app mark** — the four skins × two themes are all covered by one
component, and §3's table is the generator's own hand-tuned palette, which may differ from what the
app resolves. Where each `--brand-accent` / `--brand-ink` actually lands today:

| Skin | In-app (dark) | Export row (§3) | In-app accent (light theme) |
| --- | --- | --- | --- |
| Atmospheric glass | `#26d2bd` / `#ecf7ff` | `#3fe0c0` / `#dfe9ec` | `#0a7d6d` |
| Instrument | `#ffb020` / `#e7e4db` | `#ffb020` / `#e7e4db` | `#a86a00` |
| Editorial | `#d66a5f` / `#ece7d8` | `#e0786a` / `#e9e2d6` | `#9e2b25` |
| Warm | `#ff8a5f` / `#f3e6dd` | `#ee8d55` / `#f3e6d8` | `#ff7a4d` |

Only instrument matches its export row exactly. Every skin has a `[data-theme='light']` block with
its own accent, and `:root[data-theme='light']` sets `--brand-accent-glow: transparent`, so the live
light theme is covered by tokens independently of the generator's `light` export row.

The exported assets in this folder, and the PWA's PNG icons, come from
`scripts/generate-brand-assets.py` (geometry + the token table) and
`scripts/rasterize-icons.mjs` (SVG → PNG). Edit those, not the SVGs.
