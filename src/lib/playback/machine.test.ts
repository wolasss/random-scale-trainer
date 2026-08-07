import { describe, expect, it } from 'vitest'
import {
  createPlaybackMachine,
  type BeatEvent,
  type PlaybackAudioPort,
  type PlaybackSettings,
  type PlaybackSnapshot,
} from './machine'
import { MAX_BPM, PLAYBACK_MESSAGES, SCHEDULE_AHEAD_S } from '../../constants'
import type { SpellingPreference } from '../notes'

/** With j === i at every Fisher–Yates step, bags keep pool order. */
const IDENTITY = 0.99

class FakeAudioPort implements PlaybackAudioPort {
  time = 0
  contextAvailable = true
  buffersAvailable = true
  clicks: { time: number; accent: boolean }[] = []
  notes: { key: string; time: number }[] = []
  chimes: number[] = []
  stopCalls = 0

  async ensureContext() {
    return this.contextAvailable ? {} : null
  }
  async loadNoteBuffers() {}
  hasBuffers() {
    return this.buffersAvailable
  }
  getCurrentTime() {
    return this.time
  }
  playClickAt(time: number, accent: boolean) {
    this.clicks.push({ time, accent })
  }
  playNoteAt(key: string, time: number) {
    this.notes.push({ key, time })
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
}

type HarnessOptions = {
  settings?: Partial<PlaybackSettings>
  pool?: number[]
  spelling?: SpellingPreference
  random?: () => number
}

/**
 * Drives the machine on a fake audio clock: timers fire in due order as the
 * clock advances, and the frame pump runs after every step so visual events
 * pop exactly when the clock reaches them. All assertions are exact
 * arithmetic on beat times — no sleeps, no tolerance windows.
 */
const createHarness = (options: HarnessOptions = {}) => {
  const audio = new FakeAudioPort()
  const settings: PlaybackSettings = { ...DEFAULT_SETTINGS, ...options.settings }
  const state = {
    pool: options.pool ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    spelling: options.spelling ?? ('sharp' as SpellingPreference),
  }

  const snapshots: PlaybackSnapshot[] = []
  const beats: BeatEvent[] = []
  const bpmChanges: number[] = []
  const counters = { sessionStarts: 0, sessionPauses: 0 }

  let nextTimerId = 1
  const pendingTimers = new Map<number, { callback: () => void; dueMs: number }>()

  let frameCallback: (() => void) | null = null
  let nextFrameId = 1

  const pumpFrame = () => {
    const callback = frameCallback
    frameCallback = null
    callback?.()
  }

  const machine = createPlaybackMachine({
    audio,
    getSettings: () => settings,
    getPool: () => state.pool,
    getSpelling: () => state.spelling,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onBeat: (event) => beats.push(event),
    onBpmChange: (bpm) => bpmChanges.push(bpm),
    onSessionStart: () => (counters.sessionStarts += 1),
    onSessionPause: () => (counters.sessionPauses += 1),
    timers: {
      set: (callback, delayMs) => {
        const id = nextTimerId++
        pendingTimers.set(id, { callback, dueMs: audio.time * 1000 + delayMs })
        return id
      },
      clear: (id) => {
        pendingTimers.delete(id)
      },
    },
    frame: {
      request: (callback) => {
        frameCallback = callback
        return nextFrameId++
      },
      cancel: () => {
        frameCallback = null
      },
    },
    random: options.random ?? (() => IDENTITY),
  })

  const advanceTo = (seconds: number) => {
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
  }

  /**
   * Models a backgrounded page: the audio clock runs on for `seconds` while no
   * timer and no frame callback fires at all, and then everything overdue wakes
   * up at once. This is what a phone does when it goes into a pocket, and what
   * a browser does to a throttled background tab.
   */
  const freezeAndWake = (seconds: number) => {
    audio.time += seconds

    const overdue = [...pendingTimers.values()]
    pendingTimers.clear()
    for (const entry of overdue) {
      entry.callback()
    }

    pumpFrame()
  }

  return {
    machine,
    audio,
    settings,
    state,
    snapshots,
    beats,
    bpmChanges,
    counters,
    advanceTo,
    freezeAndWake,
    snapshot: () => machine.getSnapshot(),
  }
}

describe('machine creation', () => {
  it('emits an idle snapshot with the NEXT preview already populated', () => {
    const harness = createHarness()

    expect(harness.snapshots).toHaveLength(1)
    expect(harness.snapshot()).toMatchObject({
      status: 'idle',
      currentNote: null,
      message: PLAYBACK_MESSAGES.idle,
    })
    expect(harness.snapshot().nextNote?.pc).toBe(0) // identity shuffle
  })
})

describe('count-in', () => {
  it('schedules four clicks at the session tempo before the first note', async () => {
    const harness = createHarness({ settings: { countInEnabled: true } })
    await harness.machine.start()

    harness.advanceTo(4.1)

    // Count-in beats at 0.05, 1.05, 2.05, 3.05; the first note lands at 4.05.
    const clickTimes = harness.audio.clicks.map((click) => click.time)
    expect(clickTimes[0]).toBeCloseTo(0.05, 6)
    expect(clickTimes[1]).toBeCloseTo(1.05, 6)
    expect(clickTimes[2]).toBeCloseTo(2.05, 6)
    expect(clickTimes[3]).toBeCloseTo(3.05, 6)
    expect(harness.audio.notes[0].time).toBeCloseTo(4.05, 6)
    expect(harness.audio.notes).toHaveLength(1)
  })

  it('shows the countdown digits and the counting-in caption', async () => {
    const harness = createHarness({ settings: { countInEnabled: true } })
    await harness.machine.start()

    harness.advanceTo(0.1)
    expect(harness.snapshot()).toMatchObject({
      status: 'playing',
      countIn: 4,
      currentNote: null,
      message: PLAYBACK_MESSAGES.countingIn,
    })

    harness.advanceTo(3.1)
    expect(harness.snapshot().countIn).toBe(1)

    harness.advanceTo(4.1)
    expect(harness.snapshot().countIn).toBeNull()
    expect(harness.snapshot().currentNote?.display).toBe('C')
  })

  it('accents only the first count-in click', async () => {
    const harness = createHarness({ settings: { countInEnabled: true } })
    await harness.machine.start()

    harness.advanceTo(3.1)
    expect(harness.audio.clicks.map((click) => click.accent)).toEqual([true, false, false, false])
  })

  it('is skipped when disabled', async () => {
    const harness = createHarness({ settings: { countInEnabled: false } })
    await harness.machine.start()

    harness.advanceTo(0.1)
    expect(harness.audio.notes[0].time).toBeCloseTo(0.05, 6)
    expect(harness.snapshot().currentNote?.display).toBe('C')
  })

  it('counts in again between cycles in continuous mode', async () => {
    const harness = createHarness({
      settings: { countInEnabled: true, continuousMode: true },
      pool: [0, 1],
    })
    await harness.machine.start()

    // Opening count-in at 0.05..3.05; the two-note cycle lands at 4.05 and 5.05.
    harness.advanceTo(6.1)

    // The boundary at 6.05 starts a fresh count-in instead of the next note.
    expect(harness.snapshot()).toMatchObject({
      countIn: 4,
      currentNote: null,
      message: PLAYBACK_MESSAGES.countingIn,
    })

    harness.advanceTo(10.1)

    // The new cycle's first note lands only after the four count-in clicks.
    const noteTimes = harness.audio.notes.map((note) => note.time)
    expect(noteTimes).toHaveLength(3)
    expect(noteTimes[1]).toBeCloseTo(5.05, 6)
    expect(noteTimes[2]).toBeCloseTo(10.05, 6)
    expect(harness.snapshot()).toMatchObject({
      countIn: null,
      cyclesCompleted: 1,
      positionInCycle: 1,
    })
    expect(harness.snapshot().currentNote?.display).toBe('C')
  })

  it('starts the session timer at the first note, not during the count-in', async () => {
    const harness = createHarness({ settings: { countInEnabled: true } })
    await harness.machine.start()

    harness.advanceTo(3.5)
    expect(harness.counters.sessionStarts).toBe(0)

    harness.advanceTo(4.1)
    expect(harness.counters.sessionStarts).toBe(1)
  })
})

describe('look-ahead scheduling', () => {
  it('never schedules beyond the look-ahead horizon', async () => {
    const harness = createHarness({ settings: { bpm: 240 } })
    await harness.machine.start()

    // Beats are 0.25s apart at 240 BPM; only 0.05 fits inside the horizon.
    expect(harness.audio.clicks).toHaveLength(1)

    harness.advanceTo(1)
    for (const click of harness.audio.clicks) {
      // Every click was scheduled at most one horizon ahead of the clock.
      expect(click.time).toBeLessThanOrEqual(1 + SCHEDULE_AHEAD_S + 1e-6)
    }
    expect(harness.audio.clicks.length).toBeGreaterThanOrEqual(4)
  })

  it('reads the live BPM for every beat it schedules', async () => {
    const harness = createHarness()
    await harness.machine.start()

    harness.advanceTo(1)
    harness.settings.bpm = 120
    harness.advanceTo(3)

    const times = harness.audio.clicks.map((click) => click.time)
    expect(times[1] - times[0]).toBeCloseTo(1, 6) // 60 BPM
    const lastDelta = times[times.length - 1] - times[times.length - 2]
    expect(lastDelta).toBeCloseTo(0.5, 6) // 120 BPM
  })
})

describe('note spans', () => {
  it('calls a new note only on the first beat of each span, with an accent', async () => {
    const harness = createHarness({ settings: { beatsPerNote: 4 } })
    await harness.machine.start()

    harness.advanceTo(4.1)

    expect(harness.audio.notes).toHaveLength(2) // beats 0.05 and 4.05
    expect(harness.audio.notes[1].time).toBeCloseTo(4.05, 6)
    expect(harness.audio.clicks.slice(0, 5).map((click) => click.accent)).toEqual([
      true,
      false,
      false,
      false,
      true,
    ])
  })

  it('tracks the beat within the span for the beat dots', async () => {
    const harness = createHarness({ settings: { beatsPerNote: 4 } })
    await harness.machine.start()

    harness.advanceTo(3.1)
    expect(harness.snapshot().beatInSpan).toBe(3)
    expect(harness.snapshot().currentNote?.display).toBe('C')

    harness.advanceTo(4.1)
    expect(harness.snapshot().beatInSpan).toBe(0)
    expect(harness.snapshot().currentNote?.display).toBe('C♯')
  })

  it('honours the speak switch per span start', async () => {
    const silent = createHarness({ settings: { speakNotes: false } })
    await silent.machine.start()
    silent.advanceTo(1.1)

    expect(silent.audio.notes).toHaveLength(0)
    expect(silent.audio.clicks.length).toBeGreaterThan(0)
  })

  it('spells spoken audio and display from the same call', async () => {
    const harness = createHarness({ spelling: 'flat' })
    await harness.machine.start()

    harness.advanceTo(1.1)
    expect(harness.snapshot().currentNote).toMatchObject({ display: 'D♭', audioKey: 'Db' })
    expect(harness.audio.notes[1].key).toBe('Db')
  })

  it('previews the true successor in every beat event', async () => {
    const harness = createHarness()
    await harness.machine.start()

    harness.advanceTo(0.1)
    expect(harness.snapshot().currentNote?.pc).toBe(0)
    expect(harness.snapshot().nextNote?.pc).toBe(1)
    expect(harness.snapshot().positionInCycle).toBe(1)
    expect(harness.snapshot().cycleLength).toBe(12)

    harness.advanceTo(1.1)
    expect(harness.snapshot().currentNote?.pc).toBe(1)
    expect(harness.snapshot().nextNote?.pc).toBe(2)
    expect(harness.snapshot().positionInCycle).toBe(2)
  })
})

describe('speed ramp', () => {
  it('bumps the tempo once per completed cycle and uses it before React commits', async () => {
    const harness = createHarness({ pool: [0, 1], settings: { speedRampMode: true } })
    await harness.machine.start()

    harness.advanceTo(3.2)

    expect(harness.bpmChanges).toEqual([62])
    const times = harness.audio.clicks.map((click) => click.time)
    // The boundary note itself lands on the old grid; the beat after it is
    // spaced by the ramped tempo even though settings.bpm still reads 60.
    expect(times[2]).toBeCloseTo(2.05, 6)
    expect(times[3] - times[2]).toBeCloseTo(60 / 62, 6)
  })

  /**
   * The ceiling is the whole point of the ramp: without one every session ends
   * on the first tempo the player could not hold. Reaching it must stop the
   * climb and nothing else — playback carries on at the tempo they reached.
   */
  it('climbs to the target and then holds there, still playing', async () => {
    const harness = createHarness({ pool: [0, 1], settings: { speedRampMode: true, rampTargetBpm: 64 } })
    await harness.machine.start()

    harness.advanceTo(7)

    expect(harness.bpmChanges).toEqual([62, 64])
    expect(harness.snapshot().status).toBe('playing')
    expect(harness.snapshot().message).toBe(PLAYBACK_MESSAGES.rampHolding(64))
  })

  it('lands exactly on a target the step would otherwise stride past', async () => {
    const harness = createHarness({ pool: [0, 1], settings: { speedRampMode: true, rampTargetBpm: 61 } })
    await harness.machine.start()

    harness.advanceTo(5)
    expect(harness.bpmChanges).toEqual([61])
  })

  it('names the tempo it is heading for while it is still below it', async () => {
    const harness = createHarness({ pool: [0, 1], settings: { speedRampMode: true, rampTargetBpm: 120 } })
    await harness.machine.start()

    harness.advanceTo(0.1)
    expect(harness.snapshot().message).toBe(PLAYBACK_MESSAGES.rampClimbing(120))
  })

  it('does not write back when already clamped at the maximum', async () => {
    const harness = createHarness({ pool: [0, 1], settings: { bpm: 240, speedRampMode: true } })
    await harness.machine.start()

    harness.advanceTo(2)
    expect(harness.bpmChanges).toEqual([])
  })

  it('lets a user tempo change win over a pending ramp write-back', async () => {
    const harness = createHarness({ pool: [0, 1], settings: { speedRampMode: true } })
    await harness.machine.start()

    harness.advanceTo(2.5)
    expect(harness.bpmChanges).toEqual([62])

    harness.settings.bpm = 100 // user drags the slider before the ramp lands
    harness.advanceTo(3.7)

    // Beat 3 was already spaced by the pending ramp (60/62); beat 4 is the
    // first one scheduled after the user change and uses 100 BPM. The next
    // boundary then ramps on top of the user's value: 100 → 102.
    const times = harness.audio.clicks.map((click) => click.time)
    expect(times[4] - times[3]).toBeCloseTo(0.6, 6)
    expect(harness.bpmChanges).toEqual([62, 102])
  })

  it('counts completed cycles', async () => {
    const harness = createHarness({ pool: [0, 1] })
    await harness.machine.start()

    harness.advanceTo(4.5)
    expect(harness.snapshot().cyclesCompleted).toBe(2)
    expect(harness.snapshot().notesCalled).toBe(5)
  })
})

describe('end of cycle without looping', () => {
  it('schedules the chime at the boundary and stops cleanly after the last beat', async () => {
    const harness = createHarness({ pool: [0, 1], settings: { continuousMode: false } })
    await harness.machine.start()

    harness.advanceTo(3)

    expect(harness.audio.clicks).toHaveLength(2) // no click on the boundary itself
    expect(harness.audio.chimes).toHaveLength(1)
    expect(harness.audio.chimes[0]).toBeCloseTo(2.05, 6)
    expect(harness.snapshot()).toMatchObject({
      status: 'idle',
      currentNote: null,
      message: PLAYBACK_MESSAGES.finished(2),
      notesCalled: 2,
      cyclesCompleted: 1,
    })
  })

  it('skips the chime when the end sound is disabled', async () => {
    const harness = createHarness({
      pool: [0, 1],
      settings: { continuousMode: false, endSoundEnabled: false },
    })
    await harness.machine.start()

    harness.advanceTo(3)
    expect(harness.audio.chimes).toHaveLength(0)
    expect(harness.snapshot().message).toBe(PLAYBACK_MESSAGES.finished(2))
  })
})

describe('pause and resume', () => {
  it('silences the look-ahead window and freezes the current note', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(1.1)

    const clicksBefore = harness.audio.clicks.length
    harness.machine.pause()

    expect(harness.audio.stopCalls).toBeGreaterThanOrEqual(1)
    expect(harness.counters.sessionPauses).toBe(1)
    expect(harness.snapshot()).toMatchObject({
      status: 'paused',
      countIn: null,
      message: PLAYBACK_MESSAGES.paused,
    })
    expect(harness.snapshot().currentNote?.pc).toBe(1)

    harness.advanceTo(5)
    expect(harness.audio.clicks.length).toBe(clicksBefore)
  })

  it('resumes with a half-beat pickup and no count-in', async () => {
    const harness = createHarness({ settings: { countInEnabled: true } })
    await harness.machine.start()
    harness.advanceTo(5.1) // past the count-in, into the notes
    harness.machine.pause()
    harness.advanceTo(8)

    const beatsBefore = harness.beats.length
    const clicksBefore = harness.audio.clicks.length
    await harness.machine.start()

    expect(harness.counters.sessionStarts).toBe(2)
    harness.advanceTo(9)
    expect(harness.audio.clicks[clicksBefore].time).toBeCloseTo(8.5, 6)
    expect(harness.beats.slice(beatsBefore).every((beat) => !beat.isCountIn)).toBe(true)
  })

  it('resumes a paused count-in where it left off', async () => {
    const harness = createHarness({ settings: { countInEnabled: true } })
    await harness.machine.start()
    harness.advanceTo(1.5) // digits 4 and 3 have popped
    harness.machine.pause()
    await harness.machine.start()

    expect(harness.snapshot().message).toBe(PLAYBACK_MESSAGES.countingIn)
    harness.advanceTo(6)

    const countInBeats = harness.beats.filter((beat) => beat.isCountIn)
    expect(countInBeats.map((beat) => beat.countInValue)).toEqual([4, 3, 2, 1])
  })
})

describe('pool edits while playing', () => {
  it('invalidateDeck keeps the current note but refreshes the preview', async () => {
    const harness = createHarness({ pool: [0, 1, 2] })
    await harness.machine.start()
    harness.advanceTo(0.1)

    harness.state.pool = [7]
    harness.machine.invalidateDeck()

    expect(harness.snapshot().currentNote?.pc).toBe(0)
    expect(harness.snapshot().nextNote?.pc).toBe(7)
  })

  it('a truncated cycle neither ends playback nor counts as completed', async () => {
    const harness = createHarness({ pool: [0, 1, 2], settings: { continuousMode: false } })
    await harness.machine.start()
    harness.advanceTo(0.1)

    harness.state.pool = [5, 6]
    harness.machine.invalidateDeck()
    harness.advanceTo(1.1)

    // The new bag's head is a cycle start, but the old bag was cut short.
    expect(harness.snapshot().status).toBe('playing')
    expect(harness.snapshot().currentNote?.pc).toBe(5)
    expect(harness.snapshot().cyclesCompleted).toBe(0)

    harness.advanceTo(4)
    expect(harness.snapshot()).toMatchObject({
      status: 'idle',
      message: PLAYBACK_MESSAGES.finished(2),
      cyclesCompleted: 1,
    })
  })
})

describe('failure paths', () => {
  it('reports an unsupported browser', async () => {
    const harness = createHarness()
    harness.audio.contextAvailable = false

    await harness.machine.start()
    expect(harness.snapshot()).toMatchObject({
      status: 'idle',
      message: PLAYBACK_MESSAGES.audioUnsupported,
    })
  })

  it('reports failed audio loading', async () => {
    const harness = createHarness()
    harness.audio.buffersAvailable = false

    await harness.machine.start()
    expect(harness.snapshot()).toMatchObject({
      status: 'idle',
      message: PLAYBACK_MESSAGES.audioLoadFailed,
    })
  })
})

describe('reset and dispose', () => {
  it('reset zeroes the session and returns to the idle caption', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(2.1)
    harness.machine.pause()

    harness.machine.reset()

    expect(harness.snapshot()).toMatchObject({
      status: 'idle',
      currentNote: null,
      countIn: null,
      positionInCycle: null,
      notesCalled: 0,
      cyclesCompleted: 0,
      message: PLAYBACK_MESSAGES.idle,
    })
    expect(harness.snapshot().nextNote).not.toBeNull()
  })

  it('dispose silences everything but stays restartable', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(1.1)

    harness.machine.dispose()
    const clicksBefore = harness.audio.clicks.length
    expect(harness.audio.stopCalls).toBeGreaterThanOrEqual(1)

    harness.advanceTo(3)
    expect(harness.audio.clicks.length).toBe(clicksBefore)

    await harness.machine.start()
    harness.advanceTo(4)
    expect(harness.audio.clicks.length).toBeGreaterThan(clicksBefore)
  })
})

describe('coming back from a backgrounded page', () => {
  it('does not fire the beats it slept through', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(2.1)

    const clicksBefore = harness.audio.clicks.length
    // Thirty seconds in a pocket: at 60bpm that is thirty missed beats.
    harness.freezeAndWake(30)

    const scheduledOnWake = harness.audio.clicks.length - clicksBefore
    // Only the look-ahead window's worth, never one per missed beat.
    expect(scheduledOnWake).toBeLessThanOrEqual(3)
  })

  it('schedules the beats it does fire in the future, not the past', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(2.1)

    const clicksBefore = harness.audio.clicks.length
    harness.freezeAndWake(30)

    const afterWake = harness.audio.clicks.slice(clicksBefore)
    expect(afterWake.length).toBeGreaterThan(0)
    // A click scheduled at a time already gone plays the instant it is
    // scheduled — which is the burst this exists to prevent.
    for (const click of afterWake) {
      expect(click.time).toBeGreaterThanOrEqual(harness.audio.time)
    }
  })

  it('drops the notes that were never heard rather than flashing them through', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(2.1)

    const notesBefore = harness.snapshot().notesCalled
    harness.freezeAndWake(30)

    // Thirty seconds of silence must not land as thirty notes on the counter.
    expect(harness.snapshot().notesCalled - notesBefore).toBeLessThanOrEqual(1)
  })

  it('keeps the beat running once it has caught up', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(2.1)
    harness.freezeAndWake(30)

    const clicksAfterWake = harness.audio.clicks.length
    const notesAfterWake = harness.snapshot().notesCalled

    harness.advanceTo(harness.audio.time + 3.1)

    expect(harness.audio.clicks.length).toBeGreaterThan(clicksAfterWake)
    expect(harness.snapshot().notesCalled).toBeGreaterThan(notesAfterWake)
    expect(harness.snapshot().status).toBe('playing')
  })

  it('leaves a normally-running scheduler alone', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(4.1)

    // Four seconds at 60bpm: the beats all landed, nothing was re-anchored.
    expect(harness.audio.clicks.length).toBeGreaterThanOrEqual(4)
    expect(harness.snapshot().notesCalled).toBeGreaterThanOrEqual(4)
  })
})

describe('handleVisible', () => {
  it('resumes a context the OS suspended while playing', async () => {
    const harness = createHarness()
    await harness.machine.start()
    harness.advanceTo(1.1)

    let resumes = 0
    harness.audio.ensureContext = async () => {
      resumes += 1
      return {}
    }

    harness.machine.handleVisible()
    expect(resumes).toBe(1)
  })

  it('does nothing when the transport is stopped', () => {
    const harness = createHarness()

    let resumes = 0
    harness.audio.ensureContext = async () => {
      resumes += 1
      return {}
    }

    harness.machine.handleVisible()
    expect(resumes).toBe(0)
  })
})
