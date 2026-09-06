import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePlayback, type UsePlaybackOptions } from './usePlayback'
import { MAX_BPM, RAMP_BPM_STEP } from '../constants'
import type { PlaybackAudioPort, PlaybackSettings } from '../lib/playback/machine'
import type { SpellingPreference } from '../lib/notes'

/** With j === i at every Fisher–Yates step, bags keep pool order. */
const IDENTITY = 0.99

class FakeAudioPort implements PlaybackAudioPort {
  time = 0
  clicks: number[] = []
  notes: string[] = []
  chimes: number[] = []
  stopCalls = 0

  async ensureContext() {
    return {}
  }
  async loadNoteBuffers() {}
  hasBuffers() {
    return true
  }
  getCurrentTime() {
    return this.time
  }
  getContextState() {
    return 'running'
  }
  watchContextState() {
    return () => {}
  }
  playClickAt(time: number) {
    this.clicks.push(time)
  }
  playNoteAt(key: string) {
    this.notes.push(key)
  }
  playSessionEndChime(at?: number) {
    this.chimes.push(at ?? this.time)
  }
  stopScheduledSounds() {
    this.stopCalls += 1
  }
}

const DEFAULT_SETTINGS: PlaybackSettings = {
  bpm: 60,
  beatsPerNote: 1,
  countInEnabled: false,
  continuousMode: true,
  speedRampMode: false,
  // Out of the way by default, so a test that cares about the ceiling sets one.
  rampTargetBpm: MAX_BPM,
  speakNotes: true,
  endSoundEnabled: true,
  showFretboard: true,
}

/**
 * The ports the hook already accepts, on a fake audio clock: timers fire in due
 * order as the clock advances and the frame pump runs after every step, so beat
 * times are exact arithmetic rather than sleeps. Every advance is wrapped in
 * `act` because the machine emits snapshots straight into React state.
 */
const createPorts = () => {
  const audio = new FakeAudioPort()

  let nextTimerId = 1
  const pendingTimers = new Map<number, { callback: () => void; dueMs: number }>()

  let frameCallback: (() => void) | null = null
  let nextFrameId = 1

  const pumpFrame = () => {
    const callback = frameCallback
    frameCallback = null
    callback?.()
  }

  const timers = {
    set: (callback: () => void, delayMs: number) => {
      const id = nextTimerId++
      pendingTimers.set(id, { callback, dueMs: audio.time * 1000 + delayMs })
      return id
    },
    clear: (id: number) => {
      pendingTimers.delete(id)
    },
  }

  const frame = {
    request: (callback: () => void) => {
      frameCallback = callback
      return nextFrameId++
    },
    cancel: () => {
      frameCallback = null
    },
  }

  const advanceTo = (seconds: number) => {
    act(() => {
      const targetMs = seconds * 1000
      for (;;) {
        let earliestId: number | null = null
        let earliestDue = Infinity
        for (const [id, entry] of pendingTimers) {
          if (entry.dueMs < earliestDue) {
            earliestDue = entry.dueMs
            earliestId = id
          }
        }

        if (earliestId === null || earliestDue > targetMs + 1e-6) {
          break
        }

        audio.time = Math.max(audio.time, earliestDue / 1000)
        const entry = pendingTimers.get(earliestId)!
        pendingTimers.delete(earliestId)
        entry.callback()
        pumpFrame()
      }

      audio.time = Math.max(audio.time, seconds)
      pumpFrame()
    })
  }

  return { audio, timers, frame, advanceTo }
}

/** The bits of the hook's options a test varies between renders. */
type PlaybackProps = {
  settings: PlaybackSettings
  pool: number[]
  spelling: SpellingPreference
  onBpmChange: (bpm: number) => void
}

const renderPlayback = (initial: Partial<PlaybackProps> = {}) => {
  const ports = createPorts()
  const onSessionStart = vi.fn()
  const onSessionPause = vi.fn()

  const initialProps: PlaybackProps = {
    settings: DEFAULT_SETTINGS,
    pool: [0],
    spelling: 'sharp',
    onBpmChange: vi.fn(),
    ...initial,
  }

  const view = renderHook(
    (props: PlaybackProps) => {
      const options: UsePlaybackOptions = {
        settings: props.settings,
        pool: props.pool,
        spelling: props.spelling,
        onBpmChange: props.onBpmChange,
        onSessionStart,
        onSessionPause,
        audio: ports.audio,
        timers: ports.timers,
        frame: ports.frame,
        random: () => IDENTITY,
      }

      return usePlayback(options)
    },
    { initialProps },
  )

  return { ...view, ...ports, initialProps, onSessionStart, onSessionPause }
}

describe('usePlayback', () => {
  it('builds the machine on mount, so the NEXT preview is there before the first start', () => {
    const { result } = renderPlayback({ pool: [4], spelling: 'sharp' })

    // Nothing has been pressed: the transport is idle and silent...
    expect(result.current.snapshot.status).toBe('idle')
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.isPaused).toBe(false)
    // ...and the preview chip already has a note to show.
    expect(result.current.snapshot.nextNote?.display).toBe('E')
  })

  it('deals the preview from the edited pool', () => {
    const { result, rerender, initialProps } = renderPlayback({ pool: [0] })

    expect(result.current.snapshot.nextNote?.display).toBe('C')

    rerender({ ...initialProps, pool: [4] })

    expect(result.current.snapshot.nextNote?.display).toBe('E')
  })

  it('respells the preview when the spelling preference changes', () => {
    const { result, rerender, initialProps } = renderPlayback({ pool: [1], spelling: 'sharp' })

    expect(result.current.snapshot.nextNote?.display).toBe('C♯')

    rerender({ ...initialProps, spelling: 'flat' })

    expect(result.current.snapshot.nextNote?.display).toBe('D♭')
  })

  it('disposes the machine on unmount, so nothing is left scheduled', async () => {
    const { result, unmount, audio, advanceTo } = renderPlayback()

    await act(async () => {
      await result.current.start()
    })
    advanceTo(1.1)

    const clicksBefore = audio.clicks.length
    const stopsBefore = audio.stopCalls
    expect(clicksBefore).toBeGreaterThan(0)

    unmount()

    // The look-ahead window was already in the audio graph — it has to be cut.
    expect(audio.stopCalls).toBeGreaterThan(stopsBefore)

    advanceTo(5)
    expect(audio.clicks.length).toBe(clicksBefore)
  })

  it('calls the latest render of a callback, not the one the machine was built with', async () => {
    const first = vi.fn()
    const latest = vi.fn()
    const { result, rerender, initialProps, advanceTo } = renderPlayback({
      // Every note is a one-note cycle, so the second beat is a cycle boundary.
      pool: [0],
      settings: { ...DEFAULT_SETTINGS, speedRampMode: true, rampTargetBpm: 120 },
      onBpmChange: first,
    })

    rerender({ ...initialProps, onBpmChange: latest })

    await act(async () => {
      await result.current.start()
    })
    // Notes at 0.05 and 1.05; the second is scheduled a look-ahead early.
    advanceTo(1.2)

    expect(latest).toHaveBeenCalledWith(DEFAULT_SETTINGS.bpm + RAMP_BPM_STEP)
    expect(first).not.toHaveBeenCalled()
  })
})
