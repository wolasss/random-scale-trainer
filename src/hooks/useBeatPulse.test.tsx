import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBeatPulse } from './useBeatPulse'
import type { BeatEvent } from '../lib/playback/machine'

const beat = (accent = false): BeatEvent => ({
  time: 0,
  accent,
  isCountIn: false,
  nextNote: null,
  beatInSpan: 0,
  positionInCycle: null,
  completedCycle: false,
})

describe('useBeatPulse', () => {
  it('restarts the pulse animation when a beat lands while the class is already set', () => {
    const { result } = renderHook(() => useBeatPulse())
    const ring = document.createElement('div')
    result.current.ringRef.current = ring

    act(() => {
      result.current.handleBeat(beat())
    })
    expect(ring.classList.contains('pulse')).toBe(true)

    const calls: string[] = []
    vi.spyOn(ring.classList, 'remove').mockImplementation((...tokens: string[]) => {
      calls.push(`remove(${tokens.join(',')})`)
      DOMTokenList.prototype.remove.apply(ring.classList, tokens)
    })
    vi.spyOn(ring.classList, 'add').mockImplementation((...tokens: string[]) => {
      calls.push(`add(${tokens.join(',')})`)
      DOMTokenList.prototype.add.apply(ring.classList, tokens)
    })
    Object.defineProperty(ring, 'offsetWidth', {
      configurable: true,
      get: () => {
        calls.push('offsetWidth')
        return 0
      },
    })

    act(() => {
      result.current.handleBeat(beat())
    })

    expect(ring.classList.contains('pulse')).toBe(true)
    expect(calls).toEqual(['remove(pulse,downbeat)', 'offsetWidth', 'add(pulse)'])
  })

  it('adds downbeat only for accented beats and strips it on the next unaccented beat', () => {
    const { result } = renderHook(() => useBeatPulse())
    const ring = document.createElement('div')
    result.current.ringRef.current = ring

    act(() => {
      result.current.handleBeat(beat(true))
    })
    expect(ring.classList.contains('pulse')).toBe(true)
    expect(ring.classList.contains('downbeat')).toBe(true)

    act(() => {
      result.current.handleBeat(beat(false))
    })
    expect(ring.classList.contains('pulse')).toBe(true)
    expect(ring.classList.contains('downbeat')).toBe(false)
  })

  it('is a safe no-op with no ring attached', () => {
    const { result } = renderHook(() => useBeatPulse())

    expect(() => {
      act(() => {
        result.current.handleBeat(beat(true))
      })
    }).not.toThrow()
  })
})
