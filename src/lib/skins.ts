/**
 * Visual skins. Each is a complete identity — palette, type, and treatment —
 * selected by the user and applied via `data-skin` on the document element.
 * Glass is the default and needs no attribute; the CSS for every skin lives in
 * `index.css` under the SKINS section.
 */
export type Skin = 'glass' | 'instrument' | 'editorial' | 'warm'

export const SKINS: readonly Skin[] = ['glass', 'instrument', 'editorial', 'warm']

export const SKIN_LABELS: Record<Skin, string> = {
  glass: 'Atmospheric glass',
  instrument: 'Instrument',
  editorial: 'Editorial',
  warm: 'Warm',
}

export const DEFAULT_SKIN: Skin = 'glass'

export const isSkin = (value: string): value is Skin => (SKINS as readonly string[]).includes(value)

/**
 * The deepest ground each skin paints in each theme — a mirror of `--bg-deep`
 * in `index.css`, kept here because the browser chrome (status bar, title bar,
 * scrollbars) is painted outside the stylesheet and has to be told the colour.
 * Change one of these and you must change the matching `--bg-deep`, and the
 * copy of this table in `index.html`'s pre-paint bootstrap.
 */
export const SKIN_GROUND: Record<Skin, { dark: string; light: string }> = {
  glass: { dark: '#06131a', light: '#f2f8ff' },
  instrument: { dark: '#070809', light: '#d7dade' },
  editorial: { dark: '#141310', light: '#efece2' },
  warm: { dark: '#241a18', light: '#fff6ee' },
}

/**
 * Fonts the base document doesn't already load (Space Grotesk + Fraunces cover
 * glass and editorial). Instrument and warm each pull one extra family, added
 * lazily the first time that skin is chosen so the default never pays for them.
 */
export const SKIN_FONT_HREF: Partial<Record<Skin, string>> = {
  instrument: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap',
  warm: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
}
