/**
 * Rasterizes the PWA's PNG icons from the SVGs that
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
import { readFileSync } from 'node:fs'
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
// full-bleed — the platform clips it to whatever shape the launcher uses.
const TARGETS = [
  { svg: 'brand/callnote-icon-1024-glass.svg', png: 'public/icon-192.png', size: 192 },
  { svg: 'brand/callnote-icon-1024-glass.svg', png: 'public/icon-512.png', size: 512 },
  { svg: 'brand/callnote-icon-maskable-1024-glass.svg', png: 'public/icon-maskable-512.png', size: 512 },
]

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
