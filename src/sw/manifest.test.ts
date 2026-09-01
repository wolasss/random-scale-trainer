// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SKIN_GROUND } from '../lib/skins'

/**
 * The manifest never goes through the bundle — vite copies public/ verbatim —
 * so it is read straight off disk here, the same bytes that ship in dist/.
 * A fixed origin stands in for the deployed one, so relative members can be
 * resolved the way a browser resolves them.
 */
const PUBLIC_DIR = fileURLToPath(new URL('../../public', import.meta.url))
const ORIGIN = 'https://callnote.app'

interface WebManifest {
  id: string
  name: string
  short_name: string
  description: string
  lang: string
  dir: string
  start_url: string
  scope: string
  background_color: string
  theme_color: string
  icons: { src: string; sizes: string; type: string; purpose?: string }[]
}

const manifest = JSON.parse(
  readFileSync(resolve(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8'),
) as WebManifest

/** Resolves a manifest member and asserts it stays on our own origin. */
const memberUrl = (member: string) => {
  const url = new URL(member, ORIGIN)
  expect(url.origin).toBe(new URL(ORIGIN).origin)
  return url
}

describe('manifest.webmanifest', () => {
  it('pins the install identity', () => {
    // The id *is* the installed app's identity. It defaults to start_url, so
    // spelling it out freezes the two apart: start_url may move, the id may
    // not — changing it orphans every existing install.
    expect(manifest.id).toBe('/?src=pwa')
    expect(manifest.lang).toBe('en')
    expect(manifest.dir).toBe('ltr')
  })

  it('launches inside its own scope', () => {
    const scope = memberUrl(manifest.scope)
    const startUrl = memberUrl(manifest.start_url)

    const scopePath = scope.pathname.endsWith('/') ? scope.pathname : `${scope.pathname}/`
    expect(
      startUrl.pathname === scope.pathname || startUrl.pathname.startsWith(scopePath),
    ).toBe(true)
  })

  it('ships a maskable icon', () => {
    const maskable = manifest.icons.filter((icon) =>
      icon.purpose?.split(/\s+/).includes('maskable'),
    )

    expect(maskable).not.toHaveLength(0)
    expect(maskable.map((icon) => icon.sizes)).toContain('512x512')
  })

  it('points every icon at a file that exists', () => {
    const missing = manifest.icons
      .filter((icon) => {
        // resolve() collapses any '../', so a src that escapes public/ is
        // caught here rather than being vouched for by a file outside dist/.
        const file = resolve(PUBLIC_DIR, `.${memberUrl(icon.src).pathname}`)
        expect(file.startsWith(PUBLIC_DIR + sep)).toBe(true)
        return !existsSync(file)
      })
      .map((icon) => icon.src)

    expect(missing).toEqual([])
  })

  it('paints the splash from the default skin ground', () => {
    expect(manifest.background_color).toBe(SKIN_GROUND.glass.dark)
    expect(manifest.theme_color).toBe(SKIN_GROUND.glass.dark)
  })

  it('keeps the offline shell on the same ground', () => {
    // The splash screen (this manifest), the browser chrome, and the offline
    // shell below are each painted outside index.css, so the same ground
    // colour is spelled out three times — this pins all three together.
    const serviceWorkerSource = readFileSync(
      fileURLToPath(new URL('./service-worker.js', import.meta.url)),
      'utf8',
    )
    expect(serviceWorkerSource).toContain(`background: ${SKIN_GROUND.glass.dark};`)
  })
})
