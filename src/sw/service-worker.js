/**
 * Service worker source. Not shipped as-is: the Vite plugin in vite.config.ts
 * substitutes the two placeholders below at build time and emits the result as
 * dist/sw.js. It is plain JS on purpose — it never goes through the app bundle.
 *
 * The app is one page with no server and no network dependency, so cache-first
 * is both correct and trivially safe: there is no data that can go stale, only
 * a build that can be superseded. A superseded build is handled by versioning
 * the cache name, never by interrupting the user.
 */

const CACHE_PREFIX = 'callnote-'
const CACHE_NAME = CACHE_PREFIX + '__CACHE_VERSION__'

/**
 * Prefixes this worker used before the rebrand. Activate reclaims caches by
 * prefix, so without this list every already-installed client would keep its
 * pre-rebrand precache forever: never served, never collected. Safe to drop
 * once no client can still be running a build that old.
 */
const LEGACY_CACHE_PREFIXES = ['note-trainer-']

const isOwnCache = (/** @type {string} */ name) =>
  name.startsWith(CACHE_PREFIX) || LEGACY_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix))
const PRECACHE_URLS = __PRECACHE_MANIFEST__
const PRECACHE_SET = new Set(PRECACHE_URLS)

/**
 * The webfont, the one cross-origin fetch this worker caches, on first use. The
 * captcha on the bug-report form is cross-origin too and is deliberately not
 * here: it is a live challenge, and the fetch handler below lets it straight
 * through to the network.
 */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', /** @type {EventListener} */ ((/** @type {ExtendableEvent} */ event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // Deliberately not cache.addAll: that rejects as a unit, so one asset
      // failing would leave the app with no offline shell at all. Each URL is
      // added on its own and a miss is simply re-fetched later. cache: 'reload'
      // forces the network so a new build cannot re-precache a week-old copy
      // from the HTTP cache (nginx serves un-hashed public assets with a 7-day
      // expiry).
      await Promise.all(
        PRECACHE_URLS.map((/** @type {string} */ url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      )
      await /** @type {ServiceWorkerGlobalScope & typeof globalThis} */ (self).skipWaiting()
    })(),
  )
}))

self.addEventListener('activate', /** @type {EventListener} */ ((/** @type {ExtendableEvent} */ event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => isOwnCache(name) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
      await /** @type {ServiceWorkerGlobalScope & typeof globalThis} */ (self).clients.claim()
    })(),
  )
}))

/**
 * A navigation is the one request whose failure the user sees directly, so it
 * cannot fall back to an empty body: the window would render nothing and say
 * nothing. This document is entirely self-contained — no fonts, no icons, no
 * stylesheet — because those are exactly the things that may also be missing.
 * The colour mirrors background_color in public/manifest.webmanifest, which is
 * --bg-deep in src/index.css, so the placeholder matches the splash screen the
 * launch just faded out of.
 */
const OFFLINE_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>callnote — not downloaded yet</title>
<style>
  :root { color-scheme: dark }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.5rem;
    box-sizing: border-box;
    background: #06131a;
    color: #e6f0f6;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    text-align: center;
  }
  h1 { margin: 0; font-size: 1.25rem; font-weight: 600 }
  p { margin: 0; max-width: 28rem; line-height: 1.5; color: #9fb4c0 }
</style>
</head>
<body>
<h1>callnote has not finished downloading</h1>
<p>Connect to the internet and open the app once. After that it works offline.</p>
</body>
</html>
`

/**
 * Offline and never cached. Nothing here is a network error the user should
 * see — the app is expected to render without whatever this was.
 */
const offlineSubresource = () => new Response('', { status: 504, statusText: 'Offline' })

/**
 * The same miss for a navigation. Still a 504 — a navigation renders its body
 * whatever the status, and a 200 would claim the app loaded. no-store keeps the
 * HTTP cache from pinning this placeholder over the real shell once install
 * repairs itself.
 */
const offlineShell = () =>
  new Response(OFFLINE_SHELL_HTML, {
    status: 504,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })

/**
 * Cache-first. Runtime entries — the webfont, anything not in the manifest —
 * get a background revalidate that refreshes the entry for next time, handed
 * to waitUntil so it survives the response.
 *
 * Precached entries are served from the cache and nothing else
 * (revalidateOnHit false). They are already versioned by the cache name, so a
 * revalidate can never freshen them, only spoil them: once a newer build is
 * being served over the network, it would write that build's index.html — which
 * names hashed bundles this cache does not hold — over this build's shell, and
 * the next offline launch would render a blank page. A miss still goes to the
 * network, so an asset whose install-time cache.add failed repairs itself.
 */
const cacheFirst = async (
  /** @type {ExtendableEvent} */ event,
  /** @type {RequestInfo} */ request,
  /** @type {RequestInfo} */ cacheKey,
  /** @type {boolean} */ revalidateOnHit,
  /** @type {() => Response} */ offlineFallback,
) => {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(cacheKey)

  if (cached && !revalidateOnHit) {
    return cached
  }

  const fromNetwork = fetch(request)
    .then((response) => {
      // Opaque (no-cors font) responses have status 0 but are still usable.
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(cacheKey, response.clone()).catch(() => undefined)
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    event.waitUntil(fromNetwork)
    return cached
  }

  const fresh = await fromNetwork
  if (fresh) {
    return fresh
  }

  return offlineFallback()
}

self.addEventListener('fetch', /** @type {EventListener} */ ((/** @type {FetchEvent} */ event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  const isSameOrigin = url.origin === self.location.origin
  if (!isSameOrigin && !FONT_HOSTS.includes(url.hostname)) {
    return
  }

  // The scoreboard is the one thing this app serves that can go stale: a board
  // read out of a cache is a board that stopped moving, and revalidating it in
  // the background would show yesterday's first. Left entirely to the network,
  // which also means it simply fails offline — as a shared board should.
  if (isSameOrigin && url.pathname.startsWith('/api/')) {
    return
  }

  // Every navigation is the same shell — there are no server-side routes, and
  // start_url carries a query string the cache must not key on.
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirst(event, request, '/index.html', false, offlineShell))
    return
  }

  // Manifest entries carry no query string, so a query-bearing URL — a cache
  // key of its own — counts as a runtime entry and keeps revalidating.
  const isPrecached = isSameOrigin && PRECACHE_SET.has(url.pathname + url.search)
  event.respondWith(cacheFirst(event, request, request, !isPrecached, offlineSubresource))
}))
