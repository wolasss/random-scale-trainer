import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionTimer } from './useSessionTimer'

describe('useSessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at zero and not running', () => {
    const { result } = renderHook(() => useSessionTimer())
    expect(result.current.elapsedMs).toBe(0)
    expect(result.current.isRunning).toBe(false)
  })

  it('accumulates elapsed time while running', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(result.current.isRunning).toBe(true)
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(800)
    expect(result.current.elapsedMs).toBeLessThanOrEqual(1_200)
  })

  it('freezes on pause and resumes accumulation', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    act(() => {
      result.current.pause()
    })

    const frozen = result.current.elapsedMs
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current.elapsedMs).toBe(frozen)

    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(frozen + 800)
  })

  it('ignores start while already running', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1_000)
  })

  it('reset zeroes everything', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    act(() => {
      result.current.reset()
    })

    expect(result.current.elapsedMs).toBe(0)
    expect(result.current.isRunning).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.elapsedMs).toBe(0)
  })

  it('only ticks while running', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current.elapsedMs).toBe(0)
  })

  it('does not bank a frozen stretch when paused before any tick fires', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    // Phone goes in the pocket: the clock runs on, the page fires nothing.
    act(() => {
      vi.setSystemTime(Date.now() + 3 * 60 * 60 * 1_000)
    })
    act(() => {
      result.current.pause()
    })

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(800)
    expect(result.current.elapsedMs).toBeLessThanOrEqual(1_200)

    const frozen = result.current.elapsedMs
    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(frozen + 800)
    expect(result.current.elapsedMs).toBeLessThanOrEqual(frozen + 1_200)
  })

  it('does not bank a frozen stretch on the first tick after thawing', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    act(() => {
      vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1_000)
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1_000)
    expect(result.current.elapsedMs).toBeLessThanOrEqual(1_400)
  })

  it('ignores a clock that jumps backwards', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    const beforeJump = result.current.elapsedMs
    act(() => {
      vi.setSystemTime(Date.now() - 60_000)
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    act(() => {
      result.current.pause()
    })

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(beforeJump)
    expect(result.current.elapsedMs).toBeLessThanOrEqual(1_400)
  })

  it('still accrues while a live background tab ticks slowly', () => {
    const { result } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start()
    })
    // Throttled to roughly one tick a second — real time, still practising.
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        vi.setSystemTime(Date.now() + 1_000)
      })
      act(() => {
        vi.advanceTimersByTime(200)
      })
    }

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(3_600)
  })
})
