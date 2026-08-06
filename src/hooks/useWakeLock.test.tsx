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

    act(() => sentinels[0].dropFromOs())

    setVisibility('hidden')
    setVisibility('visible')
    await act(async () => {})

    expect(request).toHaveBeenCalledTimes(2)
  })

  it('releases the lock when the component goes away', async () => {
    const { sentinels } = installWakeLock()
    const { unmount } = renderHook(() => useWakeLock(true))
    await act(async () => {})

    unmount()
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
