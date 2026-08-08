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

## 3. Theme tokens

The mark reads its colors from the active skin.

| Token | Editorial | Warm | Atmospheric glass | Instrument |
| --- | --- | --- | --- | --- |
| `--brand-ink` | `#e9e2d6` | `#f3e6d8` | `#dfe9ec` | `#e7e4db` |
| `--brand-ink-muted` (.app) | `#8a7f74` | `#a08d7b` | `#6e8b95` | `#8b877c` |
| `--brand-accent` (call dot) | `#e0786a` | `#ee8d55` | `#3fe0c0` | `#ffb020` |
| `--brand-accent-glow` (45% α) | `rgba(224,120,106,.45)` | `rgba(238,141,85,.5)` | `rgba(63,224,192,.45)` | `rgba(255,176,32,.45)` |
| `--brand-dot-muted` | `#4a423b` | `#5d4c3d` | `#2b4652` | `#34383f` |
| `--brand-border` | `#3a332c` | `#5d4c3d` | `#2b4652` | `#262a30` |
| `--brand-tile-hi` | `#2a2420` | `#46372c` | `#16303d` | `#101418` |
| `--brand-tile-lo` | `#1a1714` | `#32271f` | `#0c1a23` | `#070809` |
| Ground (context) | `#1c1917` | `#362a22` | `#0d1b24` | `#070809` |

New skins: `--brand-ink` = the skin's text color; `--brand-accent` = the skin's primary action
color; glow = accent at 45% alpha; muted dot/border = the skin's subtle border tone.

## 4. Rules

- The call dot always uses the theme's primary accent — the same color as the Resume button and
  note chips. Never introduce a color the theme doesn't have.
- Glow belongs to the dot only, never to text.
- Clear space around the lockup: 1× dot-column width (0.22em) on all sides minimum.
- Light-ground fallback (marketing): invert — ink `#1c1917`-range dark, accent unchanged, drop
  glows.
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
from its mark, because the mark has no colour of its own. It also means the table above is
descriptive — the app's tokens are the source of truth, and the four skins × two themes are all
covered by one component.

The exported assets in this folder, and the PWA's PNG icons, come from
`scripts/generate-brand-assets.py` (geometry + the token table) and
`scripts/rasterize-icons.mjs` (SVG → PNG). Edit those, not the SVGs.
