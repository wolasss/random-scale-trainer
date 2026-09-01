import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import {
  BUG_REPORT_MAX_BODY_BYTES,
  BUG_REPORT_PREFIX,
  createBugReportHandler,
  createMailgunSender,
  createTurnstileVerifier,
} from './src/server/bug-report.js'
import { clientIdentity, isCrossSitePost } from './src/server/http.js'
import { API_PREFIX, createStore, handleRequest } from './src/server/scoreboard.js'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SW_SOURCE = resolve(ROOT, 'src/sw/service-worker.js')
const PUBLIC_DIR = resolve(ROOT, 'public')

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
 * Works out what dist/sw.js should precache and which cache version to file it
 * under, given the worker's own source and the bundle's file names.
 *
 * The list has to be built here rather than written by hand because the bundle
 * filenames are content-hashed. The version covers the worker source, the list
 * itself, and the *contents* of everything under public/ — those files keep
 * their names when they are edited, so hashing the names alone would leave an
 * edited note clip, icon or manifest invisible to installed clients. Nothing
 * time- or machine-dependent goes into the digest, so a build that changes
 * nothing produces the same version, and any build that changes an asset
 * invalidates the old cache exactly once.
 */
export const deriveServiceWorker = (
  workerSource: string,
  bundledFileNames: string[],
  publicDir: string,
): { precache: string[]; version: string } => {
  const publicFiles = listFilesRecursively(publicDir)
    .map((file) => ({
      url: `/${relative(publicDir, file).split(/[\\/]/).join('/')}`,
      digest: createHash('sha256').update(readFileSync(file)).digest('hex'),
    }))
    // readdirSync order is filesystem-dependent; sorting by URL — bytewise,
    // not by locale — is what keeps the digest reproducible across machines.
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))

  // No '/' entry: every navigation, including a cold standalone launch on
  // start_url '/?src=pwa', is served under the '/index.html' key. That entry
  // is named outright rather than left to the bundle — an offline launch has
  // nothing at all to render without it.
  const precache = [
    ...new Set([
      '/index.html',
      ...bundledFileNames.map((fileName) => `/${fileName}`),
      ...publicFiles.map((file) => file.url),
    ]),
  ].sort()

  const version = createHash('sha256')
    .update(workerSource)
    .update(precache.join('\n'))
    .update(publicFiles.map((file) => `${file.url} ${file.digest}`).join('\n'))
    .digest('hex')
    .slice(0, 12)

  return { precache, version }
}

/**
 * Emits dist/sw.js from src/sw/service-worker.js with its precache list and
 * cache version filled in.
 */
const serviceWorkerPlugin = (): Plugin => ({
  name: 'callnote-service-worker',
  apply: 'build',
  // Runs after Vite's own plugins so the emitted index.html is in the bundle
  // by the time this reads it.
  enforce: 'post',
  generateBundle(_options, bundle) {
    const source = readFileSync(SW_SOURCE, 'utf8')
    const { precache, version } = deriveServiceWorker(source, Object.keys(bundle), PUBLIC_DIR)

    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: source
        .replace('__CACHE_VERSION__', version)
        .replace('__PRECACHE_MANIFEST__', JSON.stringify(precache, null, 2)),
    })
  },
})

/** A claim is a short string and a batch is twenty small objects; see http.js. */
const MAX_BODY_BYTES = 4096

/**
 * Cloudflare's own always-passes test pair, so the widget renders and a report
 * can be sent end to end without anybody holding a real key. The sender is a
 * log line: dev and preview must never put mail on a wire.
 *
 * Set the real Turnstile and Mailgun environment and this fixture steps aside —
 * which is what makes `vite preview` a rehearsal of the container rather than a
 * different program.
 */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

const createDevBugReport = () => {
  const sendMail = createMailgunSender(process.env)
  const verifyCaptcha = createTurnstileVerifier(process.env)

  if (sendMail !== null && verifyCaptcha !== null && (process.env.TURNSTILE_SITE_KEY ?? '') !== '') {
    return createBugReportHandler({ sendMail, verifyCaptcha, siteKey: process.env.TURNSTILE_SITE_KEY ?? '' })
  }

  return createBugReportHandler({
    siteKey: TURNSTILE_TEST_SITE_KEY,
    // The test site key issues a real token; nothing here is a secret to check
    // it against, so the fixture takes any token the widget produced.
    verifyCaptcha: async (token: string) => typeof token === 'string' && token !== '',
    sendMail: async (report) => {
      // The report itself is somebody's words — the length is enough to see
      // that the round trip worked.
      console.log(`[bug-report] dev fixture accepted a report of ${report.description.length} characters`)
      return true
    },
  })
}

/**
 * The scoreboard, for `vite dev` and `vite preview`.
 *
 * In the container nginx proxies /api/ to src/server/main.js. Nothing proxies
 * anything here, so the very same handler is mounted as a middleware instead —
 * which is what lets a challenge be developed, and end-to-end tested against
 * `vite preview`, without a second process to start.
 *
 * The board lives in memory for the life of the server: it is a dev fixture,
 * not a deployment.
 */
const scoreboardApiPlugin = (): Plugin => {
  const store = createStore()
  const bugReport = createDevBugReport()

  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    // The bug-report route sits beside /api/scoreboard/, not inside it.
    const forBugReport = pathname === BUG_REPORT_PREFIX || pathname.startsWith(`${BUG_REPORT_PREFIX}/`)
    if (!forBugReport && !pathname.startsWith(API_PREFIX)) {
      next()
      return
    }

    const cap = forBugReport ? BUG_REPORT_MAX_BODY_BYTES : MAX_BODY_BYTES

    // The same cross-site refusal the container applies, from the same module,
    // so dev and preview behave like production rather than like a copy of it.
    if (isCrossSitePost(request.method, request.headers)) {
      response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ error: 'cross_site' }))
      request.destroy()
      return
    }

    // Bytes, decoded once at the end: a multi-byte character split across two
    // data events survives that and does not survive per-chunk decoding.
    const chunks: Buffer[] = []
    let bytes = 0
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes <= cap) {
        chunks.push(chunk)
      }
    })

    request.on('end', () => {
      void (async () => {
        const client = clientIdentity(request.socket.remoteAddress, request.headers['x-forwarded-for'])
        const body = Buffer.concat(chunks).toString('utf8')
        const answer =
          bytes > cap
            ? { status: 413, json: { error: 'body too large' } }
            : forBugReport
              ? await bugReport({ method: request.method ?? 'GET', pathname, body, client })
              : handleRequest(store, {
                  method: request.method ?? 'GET',
                  pathname,
                  body,
                  // A nickname's ownership token rides here and nowhere else.
                  headers: { authorization: request.headers.authorization },
                  client,
                })

        response.writeHead(answer.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        response.end(JSON.stringify(answer.json))
      })()
    })
  }

  return {
    name: 'callnote-scoreboard-api',
    configureServer: (server) => {
      server.middlewares.use(middleware)
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin(), scoreboardApiPlugin()],
  server: {
    // The dev server is shared the same way the preview server is — through a
    // tailnet proxy — so it takes the same guests.
    allowedHosts: ['.ts.net'],
  },
  preview: {
    // Lets a Docker-hosted Selenium browser reach the e2e preview server, and
    // any tailnet host reach a branch preview served through `tailscale serve`.
    allowedHosts: ['host.docker.internal', '.ts.net'],
  },
})
