// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveServiceWorker, deriveShellRevision } from '../../vite.config'

/**
 * The build-time half of the worker: what dist/sw.js gets precached with, and
 * which cache version it lands under. Driven against throwaway public/ trees so
 * a case can edit an asset's bytes without touching the real ones.
 */
const publicDirs: string[] = []

const makePublicDir = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'callnote-'))
  publicDirs.push(dir)

  for (const [name, contents] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }

  return dir
}

afterEach(() => {
  for (const dir of publicDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const SOURCE = 'const CACHE_VERSION = "__CACHE_VERSION__"'
const BUNDLED = ['index.html', 'assets/index-abc123.js']
const FILES = { 'icon-192.png': 'icon bytes', 'manifest.webmanifest': '{}' }
const HTML = '<!doctype html><title>callnote</title>'
const CONF = `server {\n  gzip on;\n  add_header Content-Security-Policy "default-src 'self'" always;\n}\n`
const SHELL = deriveShellRevision(HTML, CONF)

describe('deriveServiceWorker', () => {
  it('gives an unchanged build an unchanged version', () => {
    const dir = makePublicDir(FILES)

    expect(deriveServiceWorker(SOURCE, BUNDLED, dir, SHELL)).toEqual(
      deriveServiceWorker(SOURCE, BUNDLED, dir, SHELL),
    )
  })

  it('changes the version when a public file is edited under the same name', () => {
    const before = deriveServiceWorker(SOURCE, BUNDLED, makePublicDir(FILES), SHELL)
    const after = deriveServiceWorker(
      SOURCE,
      BUNDLED,
      makePublicDir({ ...FILES, 'icon-192.png': 'redrawn icon bytes' }),
      SHELL,
    )

    // The names are identical — only the bytes moved — so this is precisely the
    // case a name-only digest would serve stale from the versioned cache.
    expect(after.precache).toEqual(before.precache)
    expect(after.version).not.toBe(before.version)
  })

  it('ignores the order the public files happen to be listed in', () => {
    const forwards = makePublicDir({ 'a.png': 'a', 'b.png': 'b' })
    const backwards = makePublicDir({ 'b.png': 'b', 'a.png': 'a' })

    expect(deriveServiceWorker(SOURCE, BUNDLED, backwards, SHELL).version).toBe(
      deriveServiceWorker(SOURCE, BUNDLED, forwards, SHELL).version,
    )
  })

  it('changes the version when the worker source changes', () => {
    const dir = makePublicDir(FILES)

    expect(deriveServiceWorker(`${SOURCE}\n// tweak`, BUNDLED, dir, SHELL).version).not.toBe(
      deriveServiceWorker(SOURCE, BUNDLED, dir, SHELL).version,
    )
  })

  it('changes the version when a bundled file name changes', () => {
    const dir = makePublicDir(FILES)

    expect(
      deriveServiceWorker(SOURCE, ['index.html', 'assets/index-def456.js'], dir, SHELL).version,
    ).not.toBe(deriveServiceWorker(SOURCE, BUNDLED, dir, SHELL).version)
  })

  it('precaches index.html, the bundle and every public file, sorted', () => {
    const dir = makePublicDir({ ...FILES, 'audio/notes/a.mp3': 'a natural' })

    const { precache } = deriveServiceWorker(SOURCE, BUNDLED, dir, SHELL)

    expect(precache).toEqual([
      '/assets/index-abc123.js',
      '/audio/notes/a.mp3',
      '/icon-192.png',
      '/index.html',
      '/manifest.webmanifest',
    ])
  })

  it('leaves dotfiles out of the precache list and the version', () => {
    const withDotfile = makePublicDir({ ...FILES, '.DS_Store': 'junk' })
    const without = makePublicDir(FILES)

    expect(deriveServiceWorker(SOURCE, BUNDLED, withDotfile, SHELL)).toEqual(
      deriveServiceWorker(SOURCE, BUNDLED, without, SHELL),
    )
  })

  it('changes the version when the shell revision changes', () => {
    const dir = makePublicDir(FILES)

    // The precache list is identical — only the shell moved — so this is the
    // case a filename-only digest would keep serving from the old cache.
    expect(deriveServiceWorker(SOURCE, BUNDLED, dir, `${SHELL}x`).version).not.toBe(
      deriveServiceWorker(SOURCE, BUNDLED, dir, SHELL).version,
    )
  })
})

/**
 * A precached navigation is answered out of the cache and nowhere else, and the
 * Cache API stores whole Responses — so an installed client keeps whatever
 * shell and whatever headers it installed with until the cache name moves.
 * Neither one shows up in a bundle filename, which is why they are hashed here.
 */
describe('deriveShellRevision', () => {
  it('changes when the shell itself changes', () => {
    expect(deriveShellRevision(`${HTML}<meta name="robots" content="noindex">`, CONF)).not.toBe(SHELL)
  })

  it('changes when a response header changes', () => {
    const tightened = CONF.replace("default-src 'self'", "default-src 'none'")

    expect(deriveShellRevision(HTML, tightened)).not.toBe(SHELL)
  })

  it('ignores nginx.conf lines that never reach the client', () => {
    // Re-downloading the whole precache — note clips included — is the cost of
    // a new cache name, and a proxy or timeout edit has not earned it.
    expect(deriveShellRevision(HTML, CONF.replace('gzip on;', 'gzip off;\n  client_body_timeout 10s;'))).toBe(SHELL)
  })
})
