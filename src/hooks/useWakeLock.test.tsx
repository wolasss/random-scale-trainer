import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** Stands in for a WakeLockSentinel, including the release the OS does itself. */
const createFakeSentinel = () => {
  const listeners: (() => void)[] = []
  return {
    released: false,
    release: vi.fn(async function (this: { released: boolean }) {
      this.released = true
    }),
    addEventListener: (_type: 'release', listener: () => void) => listeners.push(listener),
    /** What the OS does when the page is backgrounded. */
    dropFromOs: () => listeners.forEach((listener) => listener()),
  }
}

const installWakeLock = () => {
  const sentinels: ReturnType<typeof createFakeSentinel>[] = []
  const request = vi.fn(async () => {
    const sentinel = createFakeSentinel()
    sentinels.push(sentinel)
    return sentinel
  })

  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  })

  return { request, sentinels }
}

/** Same, but every request stays in flight until the test resolves it by hand. */
const installDeferredWakeLock = () => {
  const sentinels: ReturnType<typeof createFakeSentinel>[] = []
  const outstanding: ((sentinel: ReturnType<typeof createFakeSentinel>) => void)[] = []
  const request = vi.fn(
    () =>
      new Promise<ReturnType<typeof createFakeSentinel>>((resolve) => {
        outstanding.push(resolve)
      }),
  )

  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  })

  /** Hands a fresh sentinel to the oldest request still waiting. */
  const resolveNext = async () => {
    const resolve = outstanding.shift()
    if (resolve === undefined) {
      throw new Error('no request is in flight')
    }
    const sentinel = createFakeSentinel()
    sentinels.push(sentinel)
    await act(async () => {
      resolve(sentinel)
    })
  }

  return { request, sentinels, resolveNext }
}

const removeWakeLock = () => {
  Reflect.deleteProperty(navigator, 'wakeLock')
}

describe('useWakeLock', () => {
  beforeEach(() => {
    setVisibility('visible')
  })

  afterEach(() => {
    removeWakeLock()
    setVisibility('visible')
  })

  it('takes the lock when playback starts', async () => {
    const { request } = installWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: false } })

    expect(request).not.toHaveBeenCalled()

    await act(async () => {
      rerender({ active: true })
    })

    expect(request).toHaveBeenCalledWith('screen')
  })

  it('releases it when playback stops', async () => {
    const { sentinels } = installWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } })

    await act(async () => {})
    await act(async () => {
      rerender({ active: false })
    })

    expect(sentinels[0].release).toHaveBeenCalled()
  })

  it('releases it on the way out and takes it again on the way back', async () => {
    const { request, sentinels } = installWakeLock()
    renderHook(() => useWakeLock(true))
    await act(async () => {})

    setVisibility('hidden')
    expect(sentinels[0].release).toHaveBeenCalled()

    setVisibility('visible')
    await act(async () => {})

    // A screen that stays dark after you come back is the same broken
    // metronome as one that never held the lock.
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('takes a fresh lock after the OS drops the one it had', async () => {
    const { request, sentinels } = installWakeLock()
    renderHook(() => useWakeLock(true))
    await act(async () => {})

    // A notification shade or a call banner can take the lock away without the
    // page ever leaving the screen, and nothing else would ask for it back.
    act(() => sentinels[0].dropFromOs())
    await act(async () => {})

    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not re-take a lock dropped while the page is hidden', async () => {
    const { request, sentinels } = installWakeLock()
    renderHook(() => useWakeLock(true))
    await act(async () => {})

    // Backgrounding drops the lock by design; asking for it back there would
    // only be refused.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    act(() => sentinels[0].dropFromOs())
    await act(async () => {})

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('stops re-taking once the cap is reached, and re-arms on the way back', async () => {
    const { request, sentinels } = installWakeLock()
    renderHook(() => useWakeLock(true))

    // A browser that hands back a lock and drops it again immediately must not
    // spin for the rest of the session.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await act(async () => {})
      act(() => sentinels[sentinels.length - 1].dropFromOs())
    }
    await act(async () => {})

    expect(request).toHaveBeenCalledTimes(4)

    setVisibility('hidden')
    setVisibility('visible')
    await act(async () => {})

    expect(request).toHaveBeenCalledTimes(5)
  })

  it('releases the lock when the component goes away', async () => {
    const { sentinels } = installWakeLock()
    const { unmount } = renderHook(() => useWakeLock(true))
    await act(async () => {})

    unmount()
    expect(sentinels[0].release).toHaveBeenCalled()
  })

  it('releases the lock a superseded request resolves with', async () => {
    const { request, sentinels, resolveNext } = installDeferredWakeLock()
    renderHook(() => useWakeLock(true))

    // Background and come back while the first request is still in flight.
    setVisibility('hidden')
    setVisibility('visible')
    expect(request).toHaveBeenCalledTimes(2)

    await resolveNext()
    await resolveNext()

    // The lock nobody is holding on to has to go back, or the screen stays lit.
    expect(sentinels[0].release).toHaveBeenCalled()
    expect(sentinels[1].release).not.toHaveBeenCalled()
    expect(sentinels.filter((sentinel) => sentinel.release.mock.calls.length === 0)).toHaveLength(1)
  })

  it('releases a lock that arrives after playback stops', async () => {
    const { sentinels, resolveNext } = installDeferredWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } })

    await act(async () => {
      rerender({ active: false })
    })
    await resolveNext()

    expect(sentinels[0].release).toHaveBeenCalled()
  })

  it('releases a lock that arrives after unmount', async () => {
    const { sentinels, resolveNext } = installDeferredWakeLock()
    const { unmount } = renderHook(() => useWakeLock(true))

    unmount()
    await resolveNext()

    expect(sentinels[0].release).toHaveBeenCalled()
  })

  it('does nothing where the API is absent', async () => {
    removeWakeLock()

    // No browser is required to support this, and there is nothing useful to
    // say to the user if it does not.
    await expect(
      act(async () => {
        renderHook(() => useWakeLock(true))
      }),
    ).resolves.not.toThrow()
  })

  it('survives a request the browser refuses', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn(async () => Promise.reject(new Error('denied'))) },
    })

    await expect(
      act(async () => {
        renderHook(() => useWakeLock(true))
      }),
    ).resolves.not.toThrow()
  })
})
