import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const SW_SOURCE = resolve(__dirname, 'src/sw/service-worker.js')
const PUBLIC_DIR = resolve(__dirname, 'public')

const listFilesRecursively = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    // Skips .DS_Store and friends, which Vite copies verbatim and which have no
    // business being downloaded onto anybody's phone.
    if (entry.startsWith('.')) {
      return []
    }

    const full = join(dir, entry)
    return statSync(full).isDirectory() ? listFilesRecursively(full) : [full]
  })

/**
 * Emits dist/sw.js from src/sw/service-worker.js with its precache list and
 * cache version filled in.
 *
 * The list has to be built here rather than written by hand because the bundle
 * filenames are content-hashed. The cache version is derived from that same
 * list plus the worker's own source, so a build that changes nothing produces
 * the same version — and any build that changes an asset invalidates the old
 * cache exactly once.
 */
const serviceWorkerPlugin = (): Plugin => ({
  name: 'note-trainer-service-worker',
  apply: 'build',
  // Runs after Vite's own plugins so the emitted index.html is in the bundle
  // by the time this reads it.
  enforce: 'post',
  generateBundle(_options, bundle) {
    const bundled = Object.keys(bundle).map((fileName) => `/${fileName}`)
    const publicFiles = listFilesRecursively(PUBLIC_DIR).map(
      (file) => `/${relative(PUBLIC_DIR, file).split(/[\\/]/).join('/')}`,
    )

    // No '/' entry: every navigation, including a cold standalone launch on
    // start_url '/?src=pwa', is served under the '/index.html' key. That entry
    // is named outright rather than left to the bundle — an offline launch has
    // nothing at all to render without it.
    const precache = [...new Set(['/index.html', ...bundled, ...publicFiles])].sort()

    const source = readFileSync(SW_SOURCE, 'utf8')
    const version = createHash('sha256')
      .update(source)
      .update(precache.join('\n'))
      .digest('hex')
      .slice(0, 12)

    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: source
        .replace('__CACHE_VERSION__', version)
        .replace('__PRECACHE_MANIFEST__', JSON.stringify(precache, null, 2)),
    })
  },
})

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  preview: {
    // Lets a Docker-hosted Selenium browser reach the e2e preview server, and
    // any tailnet host reach a branch preview served through `tailscale serve`.
    allowedHosts: ['host.docker.internal', '.ts.net'],
  },
})
