import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdlePreview } from './useIdlePreview'
import { IDLE_PREVIEW_MS } from '../constants'
import { installMatchMedia } from '../test/matchMedia'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

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

describe('useIdlePreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    setVisibility('visible')
    Reflect.deleteProperty(window, 'matchMedia')
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

  it('deals exactly one note and holds it under prefers-reduced-motion', () => {
    installMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    const { result } = renderHook(() => useIdlePreview([0, 4, 7], 'sharp', true))

    expect(result.current).not.toBeNull()
    expect(result.current!.tick).toBe(1)
    const held = result.current

    advance(IDLE_PREVIEW_MS * 3)

    expect(result.current).toEqual(held)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns null and starts no timer for an empty pool', () => {
    const { result } = renderHook(() => useIdlePreview([], 'sharp', true))

    expect(result.current).toBeNull()
    advance(IDLE_PREVIEW_MS * 3)
    expect(result.current).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('parks the cycle while the tab is hidden and resumes on the return to visible', () => {
    const { result } = renderHook(() => useIdlePreview([0, 4, 7], 'sharp', true))

    advance(IDLE_PREVIEW_MS)
    const tickBeforeHidden = result.current!.tick

    setVisibility('hidden')
    expect(vi.getTimerCount()).toBe(0)

    advance(IDLE_PREVIEW_MS * 3)
    expect(result.current!.tick).toBe(tickBeforeHidden)

    setVisibility('visible')
    advance(IDLE_PREVIEW_MS)
    expect(result.current!.tick).toBe(tickBeforeHidden + 1)
  })

  it('does not restart or re-deal when re-rendered with a fresh array of the same pitch classes', () => {
    const { result, rerender } = renderHook(({ pool }) => useIdlePreview(pool, 'sharp', true), {
      initialProps: { pool: [0, 4, 7] },
    })

    expect(result.current!.tick).toBe(1)

    advance(IDLE_PREVIEW_MS / 2)
    rerender({ pool: [0, 4, 7] })

    expect(result.current!.tick).toBe(1)
    expect(vi.getTimerCount()).toBe(1)

    advance(IDLE_PREVIEW_MS / 2)
    expect(result.current!.tick).toBe(2)
  })
})
