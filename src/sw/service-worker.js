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

const isOwnCache = (name) =>
  name.startsWith(CACHE_PREFIX) || LEGACY_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix))
const PRECACHE_URLS = __PRECACHE_MANIFEST__

/** The webfont, the one thing the app fetches cross-origin. Cached on first use. */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // Deliberately not cache.addAll: that rejects as a unit, so one asset
      // failing would leave the app with no offline shell at all. Each URL is
      // added on its own and a miss is simply re-fetched later.
      await Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => isOwnCache(name) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

/**
 * Cache-first, with a background revalidate that refreshes the entry for next
 * time. The revalidate is handed to waitUntil so it survives the response.
 */
const cacheFirst = async (event, request, cacheKey) => {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(cacheKey)

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

  // Offline and never cached. Nothing here is a network error the user should
  // see — the app is expected to render without whatever this was.
  return new Response('', { status: 504, statusText: 'Offline' })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  const isSameOrigin = url.origin === self.location.origin
  if (!isSameOrigin && !FONT_HOSTS.includes(url.hostname)) {
    return
  }

  // Every navigation is the same shell — there are no server-side routes, and
  // start_url carries a query string the cache must not key on.
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirst(event, request, '/index.html'))
    return
  }

  event.respondWith(cacheFirst(event, request, request))
})
