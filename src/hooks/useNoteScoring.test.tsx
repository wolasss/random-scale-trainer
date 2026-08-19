import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BeatEvent } from '../lib/playback/machine'
import type { HeardPitch } from './useMicPitch'
import { useNoteScoring, type UseNoteScoringOptions } from './useNoteScoring'

/** A stand-in for useMicPitch: a stable subscribe and a way to push frames. */
const createFakeMic = () => {
  const listeners = new Set<(heard: HeardPitch) => void>()

  return {
    subscribe: (listener: (heard: HeardPitch) => void) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    emit: (pitchClass: number, audioTime: number) => {
      for (const listener of listeners) {
        listener({ pitchClass, cents: 0, clarity: 0.99, audioTime })
      }
    },
  }
}

const createFakeEngine = (cueEnd: number | null = null) => ({
  getCueEndForBeat: vi.fn(() => cueEnd),
})

/** A beat that calls a note. `pc` omitted is a count-in or a mid-span beat. */
const beat = (time: number, pc?: number): BeatEvent => ({
  time,
  accent: pc !== undefined,
  isCountIn: false,
  note:
    pc === undefined
      ? undefined
      : { pc, display: 'X', audioKey: 'X', cycleStart: false, bagSize: 12 },
  nextNote: null,
  beatInSpan: 0,
  positionInCycle: 0,
  completedCycle: false,
})

type Overrides = Partial<Omit<UseNoteScoringOptions, 'engine'>> & {
  engine?: ReturnType<typeof createFakeEngine>
}

const setup = ({ engine = createFakeEngine(), ...overrides }: Overrides = {}) => {
  const mic = createFakeMic()
  const initialProps: UseNoteScoringOptions = {
    engine,
    subscribe: mic.subscribe,
    active: true,
    running: true,
    ...overrides,
  }
  const view = renderHook((props: UseNoteScoringOptions) => useNoteScoring(props), { initialProps })

  return { ...view, mic, engine, initialProps }
}

/** Runs the deferred flush the way a real turn of the event loop would. */
const settle = async () => {
  await act(async () => {})
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

/** Makes React warn about any update that escapes an act() call. */
const withActWarnings = () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

describe('useNoteScoring', () => {
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined
    vi.restoreAllMocks()
  })

  /**
   * The contract at usePlayback.ts: onBeat fires from inside the scheduler's
   * animation frame, so anything it touches must be a ref. A React update
   * reachable synchronously from here re-enters React from that frame.
   */
  it('never updates React synchronously from a beat', async () => {
    // Testing Library only flags un-acted updates inside its own act() calls;
    // switched on for the length of this test, React complains about any of
    // them, which is precisely what a beat must not cause.
    withActWarnings()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })

    const before = result.current.tally

    // Bare, outside act(): exactly how the machine calls it.
    result.current.handleBeat(beat(20, 5))

    expect(result.current.tally).toBe(before)
    expect(result.current.lastVerdict).toBeNull()
    // An update escaping the callback would have React complaining about act().
    expect(consoleError).not.toHaveBeenCalled()

    await settle()

    expect(result.current.tally).toEqual({ scored: 1, hits: 0, responseTimesMs: [] })
    expect(result.current.lastVerdict).toEqual({ hit: false, responseMs: null })
  })

  it('publishes a hit and its tally while the note is still on screen', async () => {
    const { result, mic } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })

    await act(async () => {
      mic.emit(3, 10.2)
      mic.emit(3, 10.25)
    })

    // No next beat has landed: the note being scored is the one on screen.
    expect(result.current.lastVerdict?.hit).toBe(true)
    expect(result.current.lastVerdict?.responseMs).toBeCloseTo(200, 3)
    expect(result.current.tally.hits).toBe(1)
    expect(result.current.tally.scored).toBe(1)
    expect(result.current.tally.responseTimesMs).toHaveLength(1)
  })

  it('scores a miss when the next note is called over an unanswered one', async () => {
    const { result } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })
    await act(async () => {
      result.current.handleBeat(beat(20, 5))
    })

    expect(result.current.lastVerdict).toEqual({ hit: false, responseMs: null })
    expect(result.current.tally).toEqual({ scored: 1, hits: 0, responseTimesMs: [] })
  })

  it('counts a hit once, however many frames follow it', async () => {
    const { result, mic } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })
    await act(async () => {
      mic.emit(3, 10.2)
      mic.emit(3, 10.25)
      mic.emit(3, 10.3)
      mic.emit(3, 10.35)
    })

    // ...and closing a window that was already hit adds nothing either.
    await act(async () => {
      result.current.handleBeat(beat(20, 5))
    })

    expect(result.current.tally).toMatchObject({ scored: 1, hits: 1 })
  })

  /** The anti-self-scoring rule, through the hook: the app's own voice is not playing. */
  it('discards what it hears while the app is still sounding', async () => {
    const engine = createFakeEngine(10.4)
    const { result, mic } = setup({ engine })

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })

    expect(engine.getCueEndForBeat).toHaveBeenCalledWith(10)

    await act(async () => {
      mic.emit(3, 10.1)
      mic.emit(3, 10.15)
    })

    expect(result.current.lastVerdict).toBeNull()
    expect(result.current.tally.scored).toBe(0)

    // The same pair, once the room has gone quiet.
    await act(async () => {
      mic.emit(3, 10.6)
      mic.emit(3, 10.65)
    })

    expect(result.current.lastVerdict?.hit).toBe(true)
    // Still timed from the beat, not from when the window opened.
    expect(result.current.lastVerdict?.responseMs).toBeCloseTo(600, 3)
  })

  it('does not score a single stray frame', async () => {
    const { result, mic } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })
    await act(async () => {
      mic.emit(3, 10.2)
    })

    expect(result.current.lastVerdict).toBeNull()
    expect(result.current.tally.scored).toBe(0)
  })

  it('drops the open note on a pause rather than scoring it', async () => {
    const { result, rerender, mic, initialProps } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })

    rerender({ ...initialProps, running: false })
    await settle()

    expect(result.current.tally).toEqual({ scored: 0, hits: 0, responseTimesMs: [] })

    // And nothing heard through the pause belongs to a note anymore.
    await act(async () => {
      mic.emit(3, 10.6)
      mic.emit(3, 10.65)
    })

    expect(result.current.lastVerdict).toBeNull()
    expect(result.current.tally.scored).toBe(0)
  })

  it('keeps the tally after a stop so the session can be read', async () => {
    const { result, rerender, mic, initialProps } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })
    await act(async () => {
      mic.emit(3, 10.2)
      mic.emit(3, 10.25)
    })

    rerender({ ...initialProps, running: false })
    await settle()

    expect(result.current.tally).toMatchObject({ scored: 1, hits: 1 })
    expect(result.current.lastVerdict?.hit).toBe(true)
  })

  it('scores nothing at all with the microphone off', async () => {
    const { result, mic, engine } = setup({ active: false })

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })
    await act(async () => {
      mic.emit(3, 10.6)
      mic.emit(3, 10.65)
    })
    await act(async () => {
      result.current.handleBeat(beat(20, 5))
    })

    expect(engine.getCueEndForBeat).not.toHaveBeenCalled()
    expect(result.current.tally).toEqual({ scored: 0, hits: 0, responseTimesMs: [] })
    expect(result.current.lastVerdict).toBeNull()
  })

  it('ignores the beats that call no note', async () => {
    const { result } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
      result.current.handleBeat(beat(11))
      result.current.handleBeat(beat(12))
    })

    // Three beats, one call: the count-in and the rest of the span score nothing.
    expect(result.current.tally.scored).toBe(0)
    expect(result.current.lastVerdict).toBeNull()
  })

  it('goes back to nothing on reset', async () => {
    const { result, mic } = setup()

    await act(async () => {
      result.current.handleBeat(beat(10, 3))
    })
    await act(async () => {
      mic.emit(3, 10.2)
      mic.emit(3, 10.25)
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.tally).toEqual({ scored: 0, hits: 0, responseTimesMs: [] })
    expect(result.current.lastVerdict).toBeNull()

    // ...and the note that was open is gone with it.
    await act(async () => {
      mic.emit(3, 10.4)
      mic.emit(3, 10.45)
    })

    expect(result.current.tally.scored).toBe(0)
  })
})
