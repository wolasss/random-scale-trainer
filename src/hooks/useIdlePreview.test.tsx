import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdlePreview } from './useIdlePreview'
import { IDLE_PREVIEW_MS } from '../constants'

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useIdlePreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deals immediately and cycles on its own clock, never repeating back to back', () => {
    const pool = [0, 4, 7] // C, E, G
    const { result } = renderHook(() => useIdlePreview(pool, 'sharp', true))

    expect(result.current).not.toBeNull()
    const seen = [result.current!]

    for (let round = 0; round < 6; round++) {
      advance(IDLE_PREVIEW_MS)
      seen.push(result.current!)
    }

    // One deal per interval, each a fresh render key...
    expect(seen.map((note) => note.tick)).toEqual([1, 2, 3, 4, 5, 6, 7])
    // ...every name from the configured pool...
    for (const note of seen) {
      expect(['C', 'E', 'G']).toContain(note.display)
    }
    // ...and no note held across two deals — a repeat reads as a stall.
    for (let index = 1; index < seen.length; index++) {
      expect(seen[index].display).not.toBe(seen[index - 1].display)
    }
  })

  it('spells the ghost by the active preference', () => {
    // pc 1 alone: the flat preference must render D♭, not C♯.
    const { result } = renderHook(() => useIdlePreview([1], 'flat', true))

    expect(result.current!.display).toBe('D♭')
  })

  it('shows nothing and runs no timers while disabled', () => {
    const { result } = renderHook(() => useIdlePreview([0, 4, 7], 'sharp', false))

    expect(result.current).toBeNull()
    advance(IDLE_PREVIEW_MS * 3)
    expect(result.current).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops the moment playback starts, and resumes on the return to idle', () => {
    const { result, rerender } = renderHook(({ enabled }) => useIdlePreview([0, 4, 7], 'sharp', enabled), {
      initialProps: { enabled: true },
    })

    expect(result.current).not.toBeNull()

    // start() pressed — including the count-in, which is already 'playing'.
    rerender({ enabled: false })
    expect(result.current).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    // stop/reset/finish — back to idle, and the cycle picks itself back up.
    rerender({ enabled: true })
    expect(result.current).not.toBeNull()
    const tickOnResume = result.current!.tick
    advance(IDLE_PREVIEW_MS)
    expect(result.current!.tick).toBe(tickOnResume + 1)
  })
})
