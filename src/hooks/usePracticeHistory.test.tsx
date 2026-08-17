import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import { dayKey, HISTORY_FLUSH_MS, type PracticeHistory, readHistory } from '../lib/history'
import { withBlockedStorage } from '../test/blockedStorage'
import { usePracticeHistory } from './usePracticeHistory'

const stored = (): PracticeHistory | null => {
  const raw = window.localStorage.getItem(STORAGE_KEYS.practiceLog)

  return raw === null ? null : JSON.parse(raw)
}

const today = () => dayKey(new Date())

const secToday = () => stored()?.days[today()]?.sec

/** What the app itself would read back, rather than the raw stored blob. */
const logged = () => readHistory()

const secOn = (key: string) => logged().days[key]?.sec

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
    // Mid-day local time, so advancing the clock mid-test never crosses midnight.
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))
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

  it('banks nothing until ten seconds have piled up, then writes whole seconds only', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackElapsed(HISTORY_FLUSH_MS - 1_000)
    })

    expect(Object.keys(logged().days)).toEqual([])
    expect(logWrites()).toBe(0)

    act(() => {
      result.current.trackElapsed(10_500)
    })

    // The odd 500ms is not rounded up into the day.
    expect(secOn(today())).toBe(10)
    expect(logWrites()).toBe(1)
  })

  it('carries the sub-second remainder forward instead of dropping it', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackElapsed(10_500)
    })
    pagehide()

    // 500ms left pending floors to nothing, so there is nothing to write.
    expect(secOn(today())).toBe(10)
    expect(logWrites()).toBe(1)

    act(() => {
      result.current.trackElapsed(11_500)
    })
    pagehide()

    // The carried 500ms plus the new 1000ms makes the whole second.
    expect(secOn(today())).toBe(11)
  })

  it('loses no time over a long run of uneven ticks', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      // The timer reports its cumulative elapsed time, 1.5s at a time.
      for (let tick = 1; tick <= 20; tick += 1) {
        result.current.trackElapsed(tick * 1_500)
      }
    })
    pagehide()

    expect(secOn(today())).toBe(30)
  })

  it('accumulates note deltas and re-baselines a rewind instead of subtracting', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackNotes(4)
      result.current.trackNotes(9)
      // The session was reset, so the count starts again from a new baseline.
      result.current.trackNotes(2)
      result.current.trackNotes(6)
    })

    // Notes alone never trip the ten-second beat.
    expect(Object.keys(logged().days)).toEqual([])

    pagehide()

    expect(logged().days[today()]).toEqual({ sec: 0, notes: 13 })
  })

  it('writes nothing when a commit finds nothing pending', () => {
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.commit()
    })

    expect(logWrites()).toBe(0)
    expect(Object.keys(logged().days)).toEqual([])

    act(() => {
      result.current.trackElapsed(400)
      result.current.commit()
    })

    // Under a second is still pending, not yet worth a write.
    expect(logWrites()).toBe(0)
    expect(Object.keys(logged().days)).toEqual([])

    act(() => {
      result.current.trackElapsed(1_200)
      result.current.commit()
    })

    expect(logWrites()).toBe(1)
    expect(secOn(today())).toBe(1)
  })

  it('reports a flush the store refused, and keeps counting anyway', () => {
    const { result } = renderHook(() => usePracticeHistory())

    expect(result.current.persisted).toBe(true)

    const restore = withBlockedStorage()
    try {
      act(() => {
        result.current.trackElapsed(HISTORY_FLUSH_MS + 1_000)
      })

      expect(result.current.persisted).toBe(false)
      // The session in front of the user is still counted — only the store lost it.
      expect(result.current.history.days[today()]?.sec).toBe(11)
    } finally {
      restore()
    }

    act(() => {
      result.current.trackElapsed(HISTORY_FLUSH_MS * 3)
    })

    // Storage came back — so does the log, and so does the silence about it.
    expect(result.current.persisted).toBe(true)
    expect(secOn(today())).toBe(30)
  })

  it('credits seconds banked after midnight to the new day', () => {
    vi.setSystemTime(new Date('2026-06-15T23:59:40'))
    const { result } = renderHook(() => usePracticeHistory())

    act(() => {
      result.current.trackElapsed(12_000)
    })

    expect(secOn('2026-06-15')).toBe(12)

    vi.setSystemTime(new Date('2026-06-16T00:00:05'))
    act(() => {
      result.current.trackElapsed(22_000)
    })

    // Yesterday keeps what it earned; the new seconds land on today.
    expect(secOn('2026-06-15')).toBe(12)
    expect(secOn('2026-06-16')).toBe(10)
  })
})
