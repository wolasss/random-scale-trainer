import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebDriver } from 'selenium-webdriver'
import { buildDriver } from '../driver.ts'
import { config } from '../config.ts'

/**
 * The service worker is live in every other spec too — they all drive
 * `vite preview` of a production build, which is what enables registration
 * and serves dist/sw.js — but nothing else asserts it actually installs and
 * takes over the page. src/sw's own tests only exercise a fake caches API;
 * this is the one place the real cache and the real controller are checked.
 *
 * The other thing only true here: over the Docker Selenium path the app is
 * reached at a non-localhost http origin (host.docker.internal), which Chrome
 * would not otherwise treat as a secure context. `buildDriver`'s
 * `secureOrigin` option vouches for it, the same way `fakeMedia` does for
 * getUserMedia elsewhere in the suite, so `navigator.serviceWorker` is
 * available on both paths and this spec always exercises the real thing.
 */
const SW_CACHE_PREFIX = 'callnote-' // mirrors CACHE_PREFIX in src/sw/service-worker.js

describe('offline shell', () => {
  let driver: WebDriver

  before(async () => {
    driver = await buildDriver({ secureOrigin: true })
    await driver.get(config.appBaseUrl)
  })

  after(async () => {
    await driver?.quit()
  })

  it('precaches the shell and takes control of the page', async () => {
    const hasServiceWorker = await driver.executeScript<boolean>("return 'serviceWorker' in navigator")
    assert.equal(hasServiceWorker, true, 'navigator.serviceWorker is undefined even with secureOrigin vouching for the origin')

    const ready = await driver.executeAsyncScript<boolean>(
      `const [timeoutMs, done] = arguments
       Promise.race([
         navigator.serviceWorker.ready.then(() => true),
         new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
       ]).then(done)`,
      20_000,
    )
    assert.equal(ready, true, 'navigator.serviceWorker.ready never resolved')

    const cacheNames = await driver.executeAsyncScript<string[]>(
      `const [done] = arguments
       caches.keys().then(done)`,
    )
    const swCacheNames = cacheNames.filter((name) => name.startsWith(SW_CACHE_PREFIX))
    assert.ok(swCacheNames.length > 0, `expected a cache prefixed "${SW_CACHE_PREFIX}", got: ${cacheNames.join(', ')}`)

    const shellCached = await driver.executeAsyncScript<boolean>(
      `const [cacheName, done] = arguments
       caches.open(cacheName)
         .then((cache) => cache.match('/index.html'))
         .then((response) => done(Boolean(response)))
         .catch(() => done(false))`,
      swCacheNames[0],
    )
    assert.equal(shellCached, true, `expected /index.html to be cached in "${swCacheNames[0]}"`)

    await driver.navigate().refresh()

    const controlled = await driver.executeScript<boolean>(
      'return navigator.serviceWorker.controller !== null',
    )
    assert.equal(controlled, true, 'navigator.serviceWorker.controller was null after a reload')
  })
})
