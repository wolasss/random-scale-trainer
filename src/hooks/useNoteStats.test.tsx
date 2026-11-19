import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BeatEvent } from '../lib/playback/machine'
import { EMPTY_NOTE_STATS, readNoteStats } from '../lib/noteStats'
import { SCORE_DECAY_MARGIN_S } from '../lib/scoring'
import { FakeAudioEngine } from '../test/fakeAudioEngine'
import { FAKE_CLOCKS } from '../test/fakeTimers'
import type { HeardPitch } from './useMicPitch'
import { useNoteStats, type UseNoteStatsOptions } from './useNoteStats'

/**
 * The shared fake engine plus the one method scoring reads off it: when the
 * app itself stopped sounding over a beat. Null is the fixture's own answer for
 * "no cue to measure", which puts a window's open at the beat plus the margin.
 */
class StatsEngine extends FakeAudioEngine {
  getCueEndForBeat(): number | null {
    return null
  }
}

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
    emit: (pitchClass: number, audioTime: number, octave = 3) => {
      for (const listener of listeners) {
        listener({ pitchClass, cents: 0, octave, clarity: 0.99, audioTime })
      }
    },
  }
}

/** A beat that calls a note; `pc` omitted is a mid-span beat calling nothing. */
const beat = (time: number, pc?: number): BeatEvent => ({
  time,
  accent: pc !== undefined,
  isCountIn: false,
  note: pc === undefined ? undefined : { pc, display: 'X', audioKey: 'X', cycleStart: false, bagSize: 12 },
  nextNote: null,
  beatInSpan: 0,
  positionInCycle: 0,
  completedCycle: false,
})

const countIn = (time: number, value: number): BeatEvent => ({
  ...beat(time),
  accent: true,
  isCountIn: true,
  countInValue: value,
})

const setup = (overrides: Partial<UseNoteStatsOptions> = {}) => {
  const mic = createFakeMic()
  const initialProps: UseNoteStatsOptions = {
    engine: new StatsEngine(),
    subscribe: mic.subscribe,
    active: true,
    running: true,
    ...overrides,
  }
  const view = renderHook((props: UseNoteStatsOptions) => useNoteStats(props), { initialProps })

  return { ...view, mic, initialProps }
}

/** Runs the deferred flush the way a real turn of the event loop would. */
const settle = async () => {
  await act(async () => {})
}

/** Two frames close enough together to be one held note — see judgeDetection. */
const sustain = (mic: ReturnType<typeof createFakeMic>, pc: number, from: number) => {
  mic.emit(pc, from)
  mic.emit(pc, from + 0.05)
}

/** A window opened by a beat at `time` starts listening here. */
const opensAt = (time: number) => time + SCORE_DECAY_MARGIN_S

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe('useNoteStats', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS)
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  /**
   * The contract at usePlayback.ts: onBeat fires from inside the scheduler's
   * animation frame, so anything it touches must be a ref. A React update
   * reachable synchronously from here re-enters React from that frame.
   */
  it('never updates React synchronously from a beat', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const { result, mic } = setup()

    // A note called, answered, then closed unanswered: everything the record
    // can record, all of it reached from a beat callback.
    result.current.handleBeat(beat(0, 5))
    await settle()
    sustain(mic, 5, opensAt(0))
    await settle()
    result.current.handleBeat(beat(1, 7))
    result.current.handleBeat(beat(2, 9))
    await settle()

    expect(result.current.stats[5].hits).toBe(1)
    expect(result.current.stats[7].scored).toBe(1)
  })

  it('records a hit against the note that was called', async () => {
    const { result, mic } = setup()

    result.current.handleBeat(beat(0, 3))
    await settle()

    sustain(mic, 3, opensAt(0) + 0.4)
    await settle()

    expect(result.current.stats[3]).toEqual({ scored: 1, hits: 1, responseMsTotal: 550 })
    expect(result.current.stats.filter((stat) => stat.scored > 0)).toHaveLength(1)
  })

  it('records a miss against the note that went unanswered, not the one that closed it', async () => {
    const { result } = setup()

    result.current.handleBeat(beat(0, 3))
    result.current.handleBeat(beat(1, 8))
    await settle()

    expect(result.current.stats[3]).toEqual({ scored: 1, hits: 0, responseMsTotal: 0 })
    expect(result.current.stats[8].scored).toBe(0)
  })

  it('records nothing for a pause between the call and the answer', async () => {
    const { result, mic } = setup()

    result.current.handleBeat(beat(0, 3))
    await settle()

    // Two matching frames a whole second apart are two plucks, not one held
    // note, so neither confirms the other.
    mic.emit(3, opensAt(0))
    mic.emit(3, opensAt(0) + 1)
    await settle()

    expect(result.current.stats[3]).toEqual({ scored: 0, hits: 0, responseMsTotal: 0 })
  })

  it('ignores frames from before the window opened', async () => {
    const { result, mic } = setup()

    result.current.handleBeat(beat(0, 3))
    await settle()

    // The app is still speaking the answer out of the same speaker the mic is
    // pointed at, so these are the app hearing itself.
    sustain(mic, 3, 0)
    await settle()

    expect(result.current.stats[3].scored).toBe(0)
  })

  it('records the note once however long it goes on sounding', async () => {
    const { result, mic } = setup()

    result.current.handleBeat(beat(0, 3))
    await settle()
    sustain(mic, 3, opensAt(0))
    sustain(mic, 3, opensAt(0) + 0.1)
    mic.emit(3, opensAt(0) + 0.3, 4)
    mic.emit(3, opensAt(0) + 0.35, 4)
    await settle()

    expect(result.current.stats[3]).toEqual({ scored: 1, hits: 1, responseMsTotal: 150 })
  })

  it('judges nothing under a count-in, which calls no note', async () => {
    const { result, mic } = setup()

    result.current.handleBeat(countIn(0, 4))
    result.current.handleBeat(countIn(1, 3))
    await settle()
    sustain(mic, 3, 1.5)
    await settle()

    expect(result.current.stats).toEqual(EMPTY_NOTE_STATS)
  })

  it('drops an open note when playback pauses rather than counting it against you', async () => {
    const { result, rerender, initialProps } = setup()

    result.current.handleBeat(beat(0, 3))
    await settle()

    rerender({ ...initialProps, running: false })
    await settle()

    // ...and the beat that would have closed it lands after the pause.
    result.current.handleBeat(beat(1, 8))
    await settle()

    expect(result.current.stats).toEqual(EMPTY_NOTE_STATS)
  })

  it('records nothing at all with the microphone off', async () => {
    const { result } = setup({ active: false })

    result.current.handleBeat(beat(0, 3))
    result.current.handleBeat(beat(1, 8))
    await settle()

    expect(result.current.stats).toEqual(EMPTY_NOTE_STATS)
  })

  it('names the weakest notes, worst first', async () => {
    const { result, mic } = setup()

    // C hit, D missed, E missed.
    result.current.handleBeat(beat(0, 0))
    await settle()
    sustain(mic, 0, opensAt(0))
    await settle()

    result.current.handleBeat(beat(1, 2))
    result.current.handleBeat(beat(2, 4))
    result.current.handleBeat(beat(3, 0))
    await settle()

    expect(result.current.weakest).toEqual([2, 4, 0])
  })

  it('keeps the record across a remount', async () => {
    const { result, mic, unmount } = setup()

    result.current.handleBeat(beat(0, 3))
    await settle()
    sustain(mic, 3, opensAt(0))
    await settle()

    expect(readNoteStats()[3].hits).toBe(1)

    unmount()
    const second = setup()
    expect(second.result.current.stats[3]).toEqual(result.current.stats[3])
  })

  it('empties the record in state and in storage on reset', async () => {
    const { result, mic } = setup()

    result.current.handleBeat(beat(0, 3))
    await settle()
    sustain(mic, 3, opensAt(0))
    await settle()

    act(() => {
      result.current.reset()
    })

    expect(result.current.stats).toEqual(EMPTY_NOTE_STATS)
    expect(result.current.weakest).toEqual([])
    expect(readNoteStats()).toEqual(EMPTY_NOTE_STATS)
  })

  it('starts from what was stored', () => {
    window.localStorage.setItem(
      'fretboard-note-stats',
      JSON.stringify(Array.from({ length: 12 }, (_, pc) => (pc === 6 ? [4, 1, 800] : [0, 0, 0]))),
    )

    const { result } = setup()

    expect(result.current.stats[6]).toEqual({ scored: 4, hits: 1, responseMsTotal: 800 })
    expect(result.current.weakest).toEqual([6])
  })
})
