import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import { dayKey, type PracticeHistory } from '../lib/history'
import { usePracticeHistory } from './usePracticeHistory'

const stored = (): PracticeHistory | null => {
  const raw = window.localStorage.getItem(STORAGE_KEYS.practiceLog)

  return raw === null ? null : JSON.parse(raw)
}

const today = () => dayKey(new Date())

const secToday = () => stored()?.days[today()]?.sec

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

const pagehide = () => {
  act(() => {
    window.dispatchEvent(new Event('pagehide'))
  })
}

describe('usePracticeHistory', () => {
  let setItem: ReturnType<typeof vi.spyOn<Storage, 'setItem'>>

  /** Writes of the log itself, so an unchanged flush is visible as a no-op. */
  const logWrites = () =>
    setItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.practiceLog).length

  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
    setItem = vi.spyOn(Storage.prototype, 'setItem')
  })

  afterEach(() => {
    setItem.mockRestore()
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('banks a part-finished flush when the tab goes away', () => {
    const { result } = renderHook(() => usePracticeHistory())

    // Under the ten-second beat, so only the pagehide can write it.
    act(() => {
      result.current.trackElapsed(6_000)
    })
    expect(stored()).toBeNull()

    pagehide()

    expect(secToday()).toBe(6)
    expect(logWrites()).toBe(1)
  })

  it('writes nothing on a second pagehide with nothing left pending', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackElapsed(6_000)
    })
    pagehide()
    pagehide()

    expect(secToday()).toBe(6)
    expect(logWrites()).toBe(1)
  })

  it('banks the pending seconds when the page is hidden', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackElapsed(4_000)
    })
    setVisibility('hidden')

    expect(secToday()).toBe(4)
    expect(logWrites()).toBe(1)
  })

  it('leaves the log alone when the page comes back on screen', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackElapsed(4_000)
    })
    setVisibility('hidden')

    act(() => {
      result.current.trackElapsed(7_000)
    })
    setVisibility('visible')

    // Returning to the tab is not a moment worth writing at.
    expect(secToday()).toBe(4)
    expect(logWrites()).toBe(1)
  })

  it('banks what is pending on unmount', () => {
    const { result, unmount } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackElapsed(3_000)
      result.current.trackNotes(5)
    })
    expect(stored()).toBeNull()

    unmount()

    expect(stored()?.days[today()]).toEqual({ sec: 3, notes: 5 })
    expect(logWrites()).toBe(1)
  })

  it('re-baselines a rewound elapsed time instead of subtracting it', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackElapsed(6_000)
      // The session timer was reset, so the next tick counts from the new zero.
      result.current.trackElapsed(2_000)
      result.current.trackElapsed(5_000)
    })
    pagehide()

    expect(secToday()).toBe(9)
  })
})
