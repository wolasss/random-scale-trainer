import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
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
  metronomeEnabled: true,
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

const renderPlayback = (initial: Partial<PlaybackProps> = {}, options: { strict?: boolean } = {}) => {
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
      const hookOptions: UsePlaybackOptions = {
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

      return usePlayback(hookOptions)
    },
    { initialProps, ...(options.strict ? { wrapper: StrictMode } : {}) },
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

  it('survives StrictMode dev-time unmount/remount and stays restartable', async () => {
    const { result, audio, advanceTo } = renderPlayback({}, { strict: true })

    // The remount already happened by the time renderHook returns; the
    // machine's preview survived it.
    expect(result.current.snapshot.status).toBe('idle')
    expect(result.current.snapshot.nextNote).not.toBeNull()

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.snapshot.status).toBe('playing')

    advanceTo(2.1)
    // Clicks at 0.05, 1.05 and 2.05 — scheduling still runs after the remount.
    expect(audio.clicks.length).toBeGreaterThanOrEqual(3)
  })

  it('reschedules the next clicks at a new tempo without recreating the machine', async () => {
    const { result, rerender, initialProps, audio, advanceTo } = renderPlayback({
      settings: { ...DEFAULT_SETTINGS, bpm: 60 },
    })

    await act(async () => {
      await result.current.start()
    })
    // First beat at 0.05 landed; the next isn't scheduled yet (look-ahead is 0.25s).
    advanceTo(0.1)

    rerender({ ...initialProps, settings: { ...DEFAULT_SETTINGS, bpm: 120 } })

    const clicksBefore = audio.clicks.length
    advanceTo(2.2)

    const post = audio.clicks.slice(clicksBefore)
    // 1.05 was already queued at the old spacing; 1.55 and 2.05 land at the new one.
    expect(post.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < post.length; i += 1) {
      expect(post[i] - post[i - 1]).toBeCloseTo(0.5)
    }

    expect(audio.stopCalls).toBe(0)
    expect(result.current.snapshot.status).toBe('playing')
  })

  it('deals the edited pool into the next note, not the one already sounding', async () => {
    const { result, rerender, initialProps, advanceTo } = renderPlayback({ pool: [0] })

    await act(async () => {
      await result.current.start()
    })
    advanceTo(0.1)
    expect(result.current.snapshot.currentNote?.display).toBe('C')

    rerender({ ...initialProps, pool: [4] })

    expect(result.current.snapshot.currentNote?.display).toBe('C')
    expect(result.current.snapshot.nextNote?.display).toBe('E')

    advanceTo(1.1)
    expect(result.current.snapshot.currentNote?.display).toBe('E')
  })

  it('keeps handleVisible and advanceEarly identity across rerenders', () => {
    const { result, rerender, initialProps } = renderPlayback()

    const handleVisible = result.current.handleVisible
    const advanceEarly = result.current.advanceEarly

    rerender({ ...initialProps, pool: [4] })

    expect(result.current.handleVisible).toBe(handleVisible)
    expect(result.current.advanceEarly).toBe(advanceEarly)
  })
})
