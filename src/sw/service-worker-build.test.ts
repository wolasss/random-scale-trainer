// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveServiceWorker } from '../../vite.config'

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

describe('deriveServiceWorker', () => {
  it('gives an unchanged build an unchanged version', () => {
    const dir = makePublicDir(FILES)

    expect(deriveServiceWorker(SOURCE, BUNDLED, dir)).toEqual(
      deriveServiceWorker(SOURCE, BUNDLED, dir),
    )
  })

  it('changes the version when a public file is edited under the same name', () => {
    const before = deriveServiceWorker(SOURCE, BUNDLED, makePublicDir(FILES))
    const after = deriveServiceWorker(
      SOURCE,
      BUNDLED,
      makePublicDir({ ...FILES, 'icon-192.png': 'redrawn icon bytes' }),
    )

    // The names are identical — only the bytes moved — so this is precisely the
    // case a name-only digest would serve stale from the versioned cache.
    expect(after.precache).toEqual(before.precache)
    expect(after.version).not.toBe(before.version)
  })

  it('ignores the order the public files happen to be listed in', () => {
    const forwards = makePublicDir({ 'a.png': 'a', 'b.png': 'b' })
    const backwards = makePublicDir({ 'b.png': 'b', 'a.png': 'a' })

    expect(deriveServiceWorker(SOURCE, BUNDLED, backwards).version).toBe(
      deriveServiceWorker(SOURCE, BUNDLED, forwards).version,
    )
  })

  it('changes the version when the worker source changes', () => {
    const dir = makePublicDir(FILES)

    expect(deriveServiceWorker(`${SOURCE}\n// tweak`, BUNDLED, dir).version).not.toBe(
      deriveServiceWorker(SOURCE, BUNDLED, dir).version,
    )
  })

  it('changes the version when a bundled file name changes', () => {
    const dir = makePublicDir(FILES)

    expect(
      deriveServiceWorker(SOURCE, ['index.html', 'assets/index-def456.js'], dir).version,
    ).not.toBe(deriveServiceWorker(SOURCE, BUNDLED, dir).version)
  })

  it('precaches index.html, the bundle and every public file, sorted', () => {
    const dir = makePublicDir({ ...FILES, 'audio/notes/a.mp3': 'a natural' })

    const { precache } = deriveServiceWorker(SOURCE, BUNDLED, dir)

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

    expect(deriveServiceWorker(SOURCE, BUNDLED, withDotfile)).toEqual(
      deriveServiceWorker(SOURCE, BUNDLED, without),
    )
  })
})
