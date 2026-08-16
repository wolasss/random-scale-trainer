import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useServiceWorker } from './useServiceWorker'

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** Stands in for navigator.serviceWorker, which jsdom does not implement. */
const installContainer = (initiallyControlled: boolean, update = vi.fn(async () => undefined)) => {
  const listeners: (() => void)[] = []
  const registration = { update }
  const container = {
    controller: initiallyControlled ? {} : null,
    register: vi.fn(async () => registration),
    addEventListener: (_type: 'controllerchange', listener: () => void) => listeners.push(listener),
    removeEventListener: (_type: 'controllerchange', listener: () => void) => {
      const index = listeners.indexOf(listener)
      if (index >= 0) {
        listeners.splice(index, 1)
      }
    },
  }

  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })

  return {
    container,
    registration,
    /** A worker calling clients.claim() over this page. */
    claim: () => {
      container.controller = {}
      act(() => listeners.forEach((listener) => listener()))
    },
    listenerCount: () => listeners.length,
  }
}

describe('useServiceWorker', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(navigator, 'serviceWorker')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })

  it('registers the worker', () => {
    const { container } = installContainer(false)
    renderHook(() => useServiceWorker())

    expect(container.register).toHaveBeenCalledWith('/sw.js')
  })

  it('offers no update on a first visit', () => {
    const worker = installContainer(false)
    const { result } = renderHook(() => useServiceWorker())

    // The page is claimed by the build it is already running.
    worker.claim()

    expect(result.current.updateReady).toBe(false)
  })

  it('offers the update when a new build takes over', () => {
    const worker = installContainer(true)
    const { result } = renderHook(() => useServiceWorker())

    worker.claim()

    expect(result.current.updateReady).toBe(true)
  })

  it('still catches an update on a page that started uncontrolled', () => {
    const worker = installContainer(false)
    const { result } = renderHook(() => useServiceWorker())

    // Loaded while the previous worker was still activating, so the first
    // change is only this build claiming the page...
    worker.claim()
    expect(result.current.updateReady).toBe(false)

    // ...and hours later a real deploy lands in the same open tab.
    worker.claim()
    expect(result.current.updateReady).toBe(true)
  })

  it('can be dismissed', () => {
    const worker = installContainer(true)
    const { result } = renderHook(() => useServiceWorker())

    worker.claim()
    act(() => result.current.dismissUpdate())

    expect(result.current.updateReady).toBe(false)
  })

  it('stops listening when it goes away', () => {
    const worker = installContainer(true)
    const { unmount } = renderHook(() => useServiceWorker())

    expect(worker.listenerCount()).toBe(1)
    unmount()
    expect(worker.listenerCount()).toBe(0)
  })

  it('registers nothing in development', () => {
    vi.stubEnv('PROD', false)
    const { container } = installContainer(false)
    renderHook(() => useServiceWorker())

    // A worker caching the dev server's modules would be its own bug report.
    expect(container.register).not.toHaveBeenCalled()
  })

  it('does nothing where service workers are unsupported', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker')

    expect(() => renderHook(() => useServiceWorker())).not.toThrow()
  })

  describe('update checks', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('asks the browser for a new build when the app comes back', async () => {
      const worker = installContainer(true)
      renderHook(() => useServiceWorker())
      // Let the registration resolve; there is nothing to update before it has.
      await act(async () => {})

      setVisibility('hidden')
      setVisibility('visible')

      expect(worker.registration.update).toHaveBeenCalledTimes(1)
    })

    it('does not check again until the throttle window has passed', async () => {
      const worker = installContainer(true)
      renderHook(() => useServiceWorker())
      await act(async () => {})

      setVisibility('hidden')
      setVisibility('visible')
      expect(worker.registration.update).toHaveBeenCalledTimes(1)

      // Flicking away and back again is not a reason to re-fetch /sw.js...
      setVisibility('hidden')
      setVisibility('visible')
      expect(worker.registration.update).toHaveBeenCalledTimes(1)

      // ...but coming back after a while is.
      vi.setSystemTime(Date.now() + 6 * 60 * 1_000)
      setVisibility('hidden')
      setVisibility('visible')
      expect(worker.registration.update).toHaveBeenCalledTimes(2)
    })

    it('stops checking once it goes away', async () => {
      const worker = installContainer(true)
      const { unmount } = renderHook(() => useServiceWorker())
      await act(async () => {})

      unmount()
      setVisibility('hidden')
      setVisibility('visible')

      expect(worker.registration.update).not.toHaveBeenCalled()
    })

    it('says nothing when the check fails', async () => {
      const worker = installContainer(
        true,
        vi.fn(async () => {
          // Offline: the everyday state of an installed app.
          throw new Error('offline')
        }),
      )
      const { result } = renderHook(() => useServiceWorker())
      await act(async () => {})

      setVisibility('hidden')
      setVisibility('visible')
      // A rejection left floating here would fail the test run.
      await act(async () => {})

      expect(worker.registration.update).toHaveBeenCalledTimes(1)
      expect(result.current.updateReady).toBe(false)
    })
  })
})
