import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHiddenTimeout } from './useHiddenTimeout'

const DELAY = 60_000

/** jsdom's visibilityState is a getter, so it is replaced rather than assigned. */
const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('useHiddenTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('does not fire while the page is on screen', () => {
    const onExpire = vi.fn()
    renderHook(() => useHiddenTimeout(true, DELAY, onExpire))

    act(() => {
      vi.advanceTimersByTime(DELAY * 3)
    })

    expect(onExpire).not.toHaveBeenCalled()
  })

  it('fires once the page has been hidden for the full delay', () => {
    const onExpire = vi.fn()
    renderHook(() => useHiddenTimeout(true, DELAY, onExpire))

    setVisibility('hidden')
    act(() => {
      vi.advanceTimersByTime(DELAY)
    })

    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('leaves a short trip away alone', () => {
    const onExpire = vi.fn()
    renderHook(() => useHiddenTimeout(true, DELAY, onExpire))

    setVisibility('hidden')
    act(() => {
      vi.advanceTimersByTime(DELAY / 2)
    })
    setVisibility('visible')
    act(() => {
      vi.advanceTimersByTime(DELAY * 2)
    })

    // Answering a message and coming straight back is not a session that ended.
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('catches up when the page was frozen and the timer never ran', () => {
    const onExpire = vi.fn()
    renderHook(() => useHiddenTimeout(true, DELAY, onExpire))

    setVisibility('hidden')
    // A phone that suspends the page entirely: wall-clock time passes, but no
    // callback of ours fires while it is away.
    vi.setSystemTime(Date.now() + DELAY * 2)
    setVisibility('visible')

    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all while playback is stopped', () => {
    const onExpire = vi.fn()
    renderHook(() => useHiddenTimeout(false, DELAY, onExpire))

    setVisibility('hidden')
    act(() => {
      vi.advanceTimersByTime(DELAY * 3)
    })

    expect(onExpire).not.toHaveBeenCalled()
  })

  it('stops counting when playback stops before the delay is up', () => {
    const onExpire = vi.fn()
    const { rerender } = renderHook(({ active }) => useHiddenTimeout(active, DELAY, onExpire), {
      initialProps: { active: true },
    })

    setVisibility('hidden')
    act(() => {
      vi.advanceTimersByTime(DELAY / 2)
    })

    rerender({ active: false })
    act(() => {
      vi.advanceTimersByTime(DELAY * 2)
    })

    expect(onExpire).not.toHaveBeenCalled()
  })

  it('fires only once for a single stretch off screen', () => {
    const onExpire = vi.fn()
    renderHook(() => useHiddenTimeout(true, DELAY, onExpire))

    setVisibility('hidden')
    act(() => {
      vi.advanceTimersByTime(DELAY * 4)
    })

    expect(onExpire).toHaveBeenCalledTimes(1)
  })
})
