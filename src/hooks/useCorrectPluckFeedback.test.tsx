import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HeardPitch, MicSampleListener } from './useMicPitch'
import { useCorrectPluckFeedback } from './useCorrectPluckFeedback'

const createSource = () => {
  const listeners = new Set<MicSampleListener>()
  const hitListeners = new Set<() => void>()
  return {
    subscribe: (listener: MicSampleListener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit: (pitchClass: number | null, audioTime: number, level: number) => {
      const heard: HeardPitch | null =
        pitchClass === null ? null : { pitchClass, audioTime, level, cents: 0, octave: 3, clarity: 0.99 }
      act(() => {
        for (const listener of listeners) {
          listener({ heard, audioTime, level })
        }
      })
    },
    subscribeConfirmedHit: (listener: () => void) => {
      hitListeners.add(listener)
      return () => hitListeners.delete(listener)
    },
    confirmHit: () => {
      act(() => {
        for (const listener of hitListeners) {
          listener()
        }
      })
    },
  }
}

type Props = { callId: number | null; pitchClass: number | null }

const renderFeedback = (source: ReturnType<typeof createSource>, initialProps: Props = {
  callId: 1,
  pitchClass: 3,
}) =>
  renderHook(
    (props: Props) =>
      useCorrectPluckFeedback({
        subscribe: source.subscribe,
        subscribeConfirmedHit: source.subscribeConfirmedHit,
        active: true,
        ...props,
      }),
    { initialProps },
  )

describe('useCorrectPluckFeedback', () => {
  it('waits for the scorer before publishing the first bubble', () => {
    const source = createSource()
    const { result } = renderFeedback(source)

    source.emit(3, 10, 0.2)
    expect(result.current).toBe(0)

    source.confirmHit()
    expect(result.current).toBe(1)

    source.emit(3, 10.05, 0.19)
    source.emit(3, 10.1, 0.18)
    expect(result.current).toBe(1)
  })

  it('never celebrates a transient matching frame that scoring rejects', () => {
    const source = createSource()
    const { result } = renderFeedback(source)

    source.emit(3, 10, 0.08)
    source.emit(null, 10.05, 0)
    expect(result.current).toBe(0)
  })

  it('publishes one second bubble for a new level attack after a confirmed hit', () => {
    const source = createSource()
    const { result } = renderFeedback(source)

    source.emit(3, 10, 0.2)
    source.emit(3, 10.05, 0.19)
    source.confirmHit()
    expect(result.current).toBe(1)

    source.emit(3, 10.1, 0.17)
    source.emit(3, 10.15, 0.16)
    source.emit(3, 10.25, 0.18)
    expect(result.current).toBe(2)

    source.emit(3, 10.3, 0.12)
    source.emit(3, 10.4, 0.22)
    expect(result.current).toBe(2)
  })

  it('recognizes a quieter second pluck from the local trough of the decay', () => {
    const source = createSource()
    const { result } = renderFeedback(source)

    source.emit(3, 10, 0.2)
    source.confirmHit()
    expect(result.current).toBe(1)

    source.emit(3, 10.2, 0.08)
    source.emit(3, 10.3, 0.12)
    expect(result.current).toBe(2)
  })

  it('publishes a second bubble when real silence separates the plucks', () => {
    const source = createSource()
    const { result } = renderFeedback(source)

    source.emit(3, 10, 0.2)
    source.confirmHit()
    source.emit(null, 10.3, 0)
    source.emit(3, 10.4, 0.08)

    expect(result.current).toBe(2)
  })

  it('does not mistake detector dropouts during one sustain for another pluck', () => {
    const source = createSource()
    const { result } = renderFeedback(source)

    source.emit(3, 10, 0.2)
    source.confirmHit()
    source.emit(null, 10.2, 0.18)
    source.emit(3, 10.4, 0.16)

    expect(result.current).toBe(1)
  })

  it('allows a fresh confirmed first bubble on the next call and after reset', () => {
    const source = createSource()
    const { rerender, result } = renderFeedback(source)

    source.emit(3, 10, 0.2)
    source.confirmHit()
    expect(result.current).toBe(1)

    rerender({ callId: 2, pitchClass: 3 })
    source.confirmHit()
    expect(result.current).toBe(2)

    rerender({ callId: null, pitchClass: null })
    rerender({ callId: 1, pitchClass: 3 })
    source.confirmHit()
    expect(result.current).toBe(3)
  })

  it('resets the attack envelope for a quieter repeat in a one-note pool', () => {
    const source = createSource()
    const { rerender, result } = renderFeedback(source)

    source.emit(3, 10, 0.3)
    source.confirmHit()
    expect(result.current).toBe(1)

    rerender({ callId: 2, pitchClass: 3 })
    source.emit(3, 11, 0.1)
    source.confirmHit()
    expect(result.current).toBe(2)

    source.emit(3, 11.15, 0.08)
    source.emit(3, 11.25, 0.1)
    expect(result.current).toBe(3)
  })

  it('ignores wrong notes unless the scorer confirms a hit', () => {
    const source = createSource()
    const { result } = renderFeedback(source)

    source.emit(5, 10, 0.2)
    source.emit(5, 10.05, 0.2)
    expect(result.current).toBe(0)
  })
})
