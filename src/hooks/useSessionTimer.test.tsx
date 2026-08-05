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
})
