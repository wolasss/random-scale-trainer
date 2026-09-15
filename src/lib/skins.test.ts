// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import { DEFAULT_SKIN, SKIN_FONT_HREF, SKIN_GROUND, SKINS } from './skins'

/**
 * index.html's pre-paint bootstrap and src/index.css's --bg-deep tokens are
 * hand-written mirrors of SKIN_GROUND (and friends) that no build step
 * checks — see the comments in skins.ts and index.html. Reading the shipped
 * bytes here, instead of importing anything, is the only honest way to catch
 * the three drifting apart.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
const css = readFileSync(resolve(ROOT, 'src/index.css'), 'utf8')

const bgDeep = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css)
  if (!block) throw new Error(`no CSS block found for selector ${selector}`)
  const value = /--bg-deep:\s*(#[0-9a-fA-F]{6})/.exec(block[1])
  if (!value) throw new Error(`no --bg-deep declared in ${selector}`)
  return value[1].toLowerCase()
}

const groundSelectors = (skin: string): { dark: string; light: string } =>
  skin === DEFAULT_SKIN
    ? { dark: ':root', light: `:root[data-theme='light']` }
    : { dark: `:root[data-skin='${skin}']`, light: `:root[data-skin='${skin}'][data-theme='light']` }

const bootstrapScript = /<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/i.exec(html)
if (!bootstrapScript) throw new Error('no bootstrap <script> block found in index.html')
const script = bootstrapScript[1]

const groundsMatch = /var grounds = \{([\s\S]*?)\n\s*\}\n/.exec(script)
if (!groundsMatch) throw new Error('no `grounds` table found in the bootstrap script')
const grounds: Record<string, { dark: string; light: string }> = {}
for (const m of groundsMatch[1].matchAll(
  /([A-Za-z]+):\s*\{\s*dark:\s*'(#[0-9a-fA-F]{6})',\s*light:\s*'(#[0-9a-fA-F]{6})'\s*\}/g,
)) {
  grounds[m[1]] = { dark: m[2], light: m[3] }
}

const skinsMatch = /var skins = \[([^\]]*)\]/.exec(script)
if (!skinsMatch) throw new Error('no allowed-skins list found in the bootstrap script')
const allowedSkins = [...skinsMatch[1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1])

const fontsMatch = /var fonts = \{([\s\S]*?)\n\s*\}/.exec(script)
if (!fontsMatch) throw new Error('no font table found in the bootstrap script')
const fonts: Record<string, string> = {}
for (const m of fontsMatch[1].matchAll(/([A-Za-z]+):\s*\n?\s*'([^']+)'/g)) {
  fonts[m[1]] = m[2]
}

const storedThemeMatch = /var storedTheme = localStorage\.getItem\('([^']*)'\)/.exec(script)
if (!storedThemeMatch) throw new Error('no `storedTheme` localStorage read found in the bootstrap script')
const storedThemeKey = storedThemeMatch[1]

const storedSkinMatch = /var storedSkin = localStorage\.getItem\('([^']*)'\)/.exec(script)
if (!storedSkinMatch) throw new Error('no `storedSkin` localStorage read found in the bootstrap script')
const storedSkinKey = storedSkinMatch[1]

const themeColorMatch = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/.exec(html)
if (!themeColorMatch) throw new Error('no static theme-color meta found in index.html')
const staticThemeColor = themeColorMatch[1]

describe('skins mirrored in index.html and index.css', () => {
  it.each(SKINS)('%s: --bg-deep and the bootstrap grounds match SKIN_GROUND', (skin) => {
    const selectors = groundSelectors(skin)
    expect(bgDeep(selectors.dark)).toBe(SKIN_GROUND[skin].dark)
    expect(bgDeep(selectors.light)).toBe(SKIN_GROUND[skin].light)
    expect(grounds[skin]).toEqual(SKIN_GROUND[skin])
  })

  it('the bootstrap grounds table lists exactly SKINS', () => {
    expect(Object.keys(grounds).sort()).toEqual([...SKINS].sort())
  })

  it('the bootstrap allowed-skins list lists exactly SKINS', () => {
    expect(allowedSkins.sort()).toEqual([...SKINS].sort())
  })

  it('the bootstrap font table matches SKIN_FONT_HREF', () => {
    expect(fonts).toEqual(SKIN_FONT_HREF)
  })

  it('the bootstrap reads the theme and skin storage keys correctly', () => {
    expect(storedThemeKey).toBe(STORAGE_KEYS.theme)
    expect(storedSkinKey).toBe(STORAGE_KEYS.skin)
  })

  it('the static theme-color meta matches the default skin dark ground', () => {
    expect(staticThemeColor.toLowerCase()).toBe(SKIN_GROUND[DEFAULT_SKIN].dark)
  })
})

/**
 * The allowlist check above only proves the bootstrap's source text names the
 * right skins — it doesn't prove a value that merely happens to be an
 * inherited Object property (`__proto__`, `constructor`, `toString`,
 * `valueOf`) is actually turned away at run time. This runs the shipped bytes
 * in a real DOM to check that.
 */
const renderShell = (storedSkin: string | null): Document => {
  const dom = new JSDOM(html, {
    url: 'https://callnote.app/',
    runScripts: 'dangerously',
    beforeParse(window) {
      if (storedSkin !== null) {
        window.localStorage.setItem(STORAGE_KEYS.skin, storedSkin)
      }
    },
  })
  return dom.window.document
}

describe('the bootstrap rejects a stored skin that is only a prototype key', () => {
  it.each(['__proto__', 'constructor', 'toString', 'valueOf'])('%s', (storedSkin) => {
    const document = renderShell(storedSkin)

    expect(document.documentElement.hasAttribute('data-skin')).toBe(false)
    expect(document.querySelector('link[data-skin-font]')).toBeNull()
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      SKIN_GROUND[DEFAULT_SKIN].dark,
    )
  })

  it('still applies a real stored skin, proving the harness executes the bootstrap', () => {
    const document = renderShell('instrument')

    expect(document.documentElement.getAttribute('data-skin')).toBe('instrument')
    const link = document.querySelector('link[data-skin-font="instrument"]')
    expect(link?.getAttribute('href')).toBe(SKIN_FONT_HREF.instrument)
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      SKIN_GROUND.instrument.dark,
    )
  })
})
