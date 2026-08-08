/**
 * Rasterizes the PWA's PNG icons and the favicon fallbacks from the SVGs that
 * `scripts/generate-brand-assets.py` emits into `brand/`.
 *
 * Kept out of package.json's dependencies: this runs perhaps once a rebrand,
 * and the app itself never rasterizes anything. A Playwright installed either
 * locally or globally will do — the import below finds both.
 *
 *     python3 scripts/generate-brand-assets.py
 *     node scripts/rasterize-icons.mjs
 *
 * `rsvg-convert` produces the same result if you would rather not have a
 * browser involved:
 *
 *     rsvg-convert -w 192 -h 192 brand/callnote-icon-1024-glass.svg -o public/icon-192.png
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * ESM resolution walks up from this file, so it only ever finds a local
 * install. NODE_PATH does not apply to ESM either — a global Playwright has to
 * be located and imported by absolute path.
 */
const loadPlaywright = async () => {
  const imported = await import('playwright').catch(async () => {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    return import(pathToFileURL(join(globalRoot, 'playwright', 'index.js')).href)
  })
  // Playwright ships CommonJS, so importing it by path lands the exports under
  // `default` rather than as named bindings.
  return imported.chromium ? imported : imported.default
}

const { chromium } = await loadPlaywright()

// The installable icon wears the default skin. The maskable variant is
// full-bleed — the platform clips it to whatever shape the launcher uses. The
// favicon PNGs come from favicon.svg rather than the app icon, because that one
// is already built without the glow and border that only muddy a 16px tile.
const TARGETS = [
  { svg: 'brand/callnote-icon-1024-glass.svg', png: 'public/icon-192.png', size: 192 },
  { svg: 'brand/callnote-icon-1024-glass.svg', png: 'public/icon-512.png', size: 512 },
  { svg: 'brand/callnote-icon-maskable-1024-glass.svg', png: 'public/icon-maskable-512.png', size: 512 },
  { svg: 'public/favicon.svg', png: 'public/favicon-32.png', size: 32 },
  { svg: 'public/favicon.svg', png: 'public/favicon-16.png', size: 16 },
]

// The .ico bundles these two. Anything that asks for /favicon.ico is old enough
// that it wants small sizes anyway.
const ICO_SOURCES = ['public/favicon-32.png', 'public/favicon-16.png']

const browser = await chromium.launch()

for (const { svg, png, size } of TARGETS) {
  const markup = readFileSync(join(ROOT, svg), 'utf8')
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  })

  // A transparent page: the tile draws its own ground, and the maskable variant
  // must not pick up a white rim from the page behind it.
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
  )
  await page.screenshot({ path: join(ROOT, png), omitBackground: true })
  await page.close()

  console.log(`${png}  ${size}x${size}`)
}

await browser.close()

/**
 * Packs PNGs into an .ico. The container is a 6-byte directory header, one
 * 16-byte entry per image, then the payloads — which may be PNG rather than BMP
 * on anything newer than Windows Vista, so the screenshots go in untouched.
 */
const buildIco = (pngs) => {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(pngs.length, 4)

  let offset = 6 + pngs.length * 16
  const entries = pngs.map(({ data, size }) => {
    const entry = Buffer.alloc(16)
    // 256px is written as 0 — the field is a single byte.
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // palette size: 0 for truecolour
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)])
}

const ico = buildIco(
  ICO_SOURCES.map((png) => ({
    data: readFileSync(join(ROOT, png)),
    size: Number(png.match(/(\d+)\.png$/)[1]),
  })),
)
writeFileSync(join(ROOT, 'public/favicon.ico'), ico)
console.log(`public/favicon.ico  ${ICO_SOURCES.length} sizes, ${ico.length} bytes`)
