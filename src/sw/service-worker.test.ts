// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

/**
 * The worker never goes through the bundle, so there is nothing to import: the
 * source is read, given the same two substitutions vite.config.ts makes at
 * build time, and evaluated against hand-rolled globals. That leaves every
 * registered handler callable directly, with no build and no browser.
 */
const PRECACHE_URLS = ['/index.html', '/assets/app.js', '/icon.png']
const CACHE_NAME = 'callnote-testver'
const ORIGIN = 'https://callnote.app'

const source = readFileSync(fileURLToPath(new URL('./service-worker.js', import.meta.url)), 'utf8')
  .replace('__CACHE_VERSION__', 'testver')
  .replace('__PRECACHE_MANIFEST__', JSON.stringify(PRECACHE_URLS))

interface FakeRequest {
  method: string
  url: string
  mode?: string
}

interface FakeResponse {
  body: string
  ok: boolean
  status: number
  type: string
  /** Set on the copy clone() hands back, so a test can tell the two apart. */
  cloned?: boolean
  clone: () => FakeResponse
}

type CacheKey = string | FakeRequest

interface FakeEvent {
  request?: FakeRequest
  waitUntil: (promise: Promise<unknown>) => void
  respondWith: (promise: Promise<unknown>) => void
}

interface FakeCache {
  /** Every URL install tried, whether or not the add went through. */
  attempted: string[]
  entries: Map<string, FakeResponse>
  add: (url: string) => Promise<void>
  match: (key: CacheKey) => Promise<FakeResponse | undefined>
  put: (key: CacheKey, response: FakeResponse) => Promise<void>
}

const makeResponse = (body: string, overrides: Partial<FakeResponse> = {}): FakeResponse => {
  const response: FakeResponse = {
    body,
    ok: true,
    status: 200,
    type: 'basic',
    clone: () => ({ ...response, cloned: true }),
    ...overrides,
  }
  return response
}

const keyOf = (key: CacheKey) => (typeof key === 'string' ? key : key.url)

const makeCache = (failingAdd?: string): FakeCache => {
  const entries = new Map<string, FakeResponse>()
  const attempted: string[] = []

  return {
    attempted,
    entries,
    add: async (url) => {
      attempted.push(url)
      if (url === failingAdd) {
        throw new Error(`failed to fetch ${url}`)
      }
      entries.set(url, makeResponse(`precached ${url}`))
    },
    match: async (key) => entries.get(keyOf(key)),
    // Stores before resolving, so the entry is visible to a test that only has
    // the response the handler already returned.
    put: vi.fn((key: CacheKey, response: FakeResponse) => {
      entries.set(keyOf(key), response)
      return Promise.resolve()
    }),
  }
}

const makeWorker = ({
  cacheNames = [],
  failingAdd,
}: { cacheNames?: string[]; failingAdd?: string } = {}) => {
  const caches = new Map<string, FakeCache>()
  for (const name of cacheNames) {
    caches.set(name, makeCache(failingAdd))
  }

  const handlers = new Map<string, (event: FakeEvent) => void>()
  const skipWaiting = vi.fn(() => Promise.resolve())
  const claim = vi.fn(() => Promise.resolve())
  const fetch = vi.fn<(request: FakeRequest) => Promise<FakeResponse>>()

  const fakeSelf = {
    addEventListener: (type: string, handler: (event: FakeEvent) => void) => {
      handlers.set(type, handler)
    },
    location: { origin: ORIGIN },
    skipWaiting,
    clients: { claim },
  }

  const fakeCaches = {
    open: async (name: string) => {
      const existing = caches.get(name)
      if (existing) {
        return existing
      }

      const created = makeCache(failingAdd)
      caches.set(name, created)
      return created
    },
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
  }

  new Function('self', 'caches', 'fetch', source)(fakeSelf, fakeCaches, fetch)

  const dispatch = (type: string, request?: FakeRequest) => {
    const captured: { waited?: Promise<unknown>; responded?: Promise<unknown> } = {}
    const handler = handlers.get(type)
    if (!handler) {
      throw new Error(`no ${type} handler registered`)
    }

    handler({
      request,
      waitUntil: (promise) => {
        captured.waited = promise
      },
      respondWith: (promise) => {
        captured.responded = promise
      },
    })
    return captured
  }

  return { caches, claim, dispatch, fetch, skipWaiting }
}

const currentCache = (worker: ReturnType<typeof makeWorker>) => {
  const cache = worker.caches.get(CACHE_NAME)
  if (!cache) {
    throw new Error(`${CACHE_NAME} was never opened`)
  }
  return cache
}

describe('install', () => {
  it('precaches every URL in the manifest and takes over immediately', async () => {
    const worker = makeWorker()

    await worker.dispatch('install').waited

    const cache = currentCache(worker)
    expect(cache.attempted).toEqual(PRECACHE_URLS)
    expect([...cache.entries.keys()]).toEqual(PRECACHE_URLS)
    expect(worker.skipWaiting).toHaveBeenCalled()
  })

  it('adds each URL on its own, so one bad asset cannot sink the shell', async () => {
    const worker = makeWorker({ failingAdd: '/assets/app.js' })

    await expect(worker.dispatch('install').waited).resolves.toBeUndefined()

    const cache = currentCache(worker)
    // The failure is attempted like the rest, and the rest still land.
    expect(cache.attempted).toEqual(PRECACHE_URLS)
    expect([...cache.entries.keys()]).toEqual(['/index.html', '/icon.png'])
    expect(worker.skipWaiting).toHaveBeenCalled()
  })
})

describe('activate', () => {
  it('reclaims stale caches of its own, current and foreign ones alike', async () => {
    const worker = makeWorker({
      cacheNames: [CACHE_NAME, 'callnote-oldver', 'note-trainer-abc', 'other-app'],
    })

    await worker.dispatch('activate').waited

    // The legacy prefix goes too, or a pre-rebrand client keeps it forever.
    expect([...worker.caches.keys()]).toEqual([CACHE_NAME, 'other-app'])
    expect(worker.claim).toHaveBeenCalled()
  })
})

describe('fetch', () => {
  it("serves a navigation from the '/index.html' entry whatever the query string", async () => {
    const worker = makeWorker({ cacheNames: [CACHE_NAME] })
    const cache = currentCache(worker)
    const shell = makeResponse('cached shell')
    cache.entries.set('/index.html', shell)
    worker.fetch.mockResolvedValue(makeResponse('fresh shell'))

    const captured = worker.dispatch('fetch', {
      method: 'GET',
      mode: 'navigate',
      url: `${ORIGIN}/?src=pwa`,
    })

    expect(await captured.responded).toBe(shell)

    // The revalidate is handed to waitUntil, and refreshes the same key — the
    // start_url query string never becomes a cache entry of its own.
    await captured.waited
    expect(cache.put).toHaveBeenCalledWith('/index.html', expect.objectContaining({ cloned: true }))
    expect(cache.entries.get('/index.html')?.body).toBe('fresh shell')
    expect([...cache.entries.keys()]).toEqual(['/index.html'])
  })

  it('leaves non-GET requests to the network', () => {
    const worker = makeWorker()

    const captured = worker.dispatch('fetch', { method: 'POST', url: `${ORIGIN}/api` })

    expect(captured.responded).toBeUndefined()
    expect(worker.fetch).not.toHaveBeenCalled()
  })

  it('leaves cross-origin requests other than the webfont alone', () => {
    const worker = makeWorker()

    const captured = worker.dispatch('fetch', { method: 'GET', url: 'https://example.com/x' })

    expect(captured.responded).toBeUndefined()
    expect(worker.fetch).not.toHaveBeenCalled()
  })

  it('caches an opaque font response despite its status 0', async () => {
    const worker = makeWorker({ cacheNames: [CACHE_NAME] })
    const request = { method: 'GET', url: 'https://fonts.gstatic.com/f.woff2' }
    const opaque = makeResponse('font', { ok: false, status: 0, type: 'opaque' })
    worker.fetch.mockResolvedValue(opaque)

    const captured = worker.dispatch('fetch', request)

    expect(await captured.responded).toBe(opaque)
    const cache = currentCache(worker)
    expect(cache.put).toHaveBeenCalledWith(request, expect.objectContaining({ cloned: true }))
    expect(cache.entries.get(request.url)?.body).toBe('font')
  })

  it('answers an uncached request with a 504 when the network is gone', async () => {
    const worker = makeWorker({ cacheNames: [CACHE_NAME] })
    worker.fetch.mockRejectedValue(new Error('offline'))

    const captured = worker.dispatch('fetch', { method: 'GET', url: `${ORIGIN}/assets/app.js` })

    const response = (await captured.responded) as Response
    expect(response.status).toBe(504)
    expect(currentCache(worker).put).not.toHaveBeenCalled()
  })
})
