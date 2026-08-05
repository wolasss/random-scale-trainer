import { describe, expect, it, vi } from 'vitest'
import {
  createPlaybackMachine,
  type PlaybackAudioPort,
  type PlaybackSettings,
  type PlaybackSnapshot,
  type PlaybackTimers,
} from './machine'

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const createFakeAudio = (overrides: Partial<Record<keyof PlaybackAudioPort, unknown>> = {}) =>
  ({
    ensureContext: vi.fn(async () => ({})),
    loadNoteBuffers: vi.fn(async () => {}),
    hasBuffers: vi.fn(() => true),
    playClick: vi.fn(),
    playSessionEndChime: vi.fn(),
    playNote: vi.fn(),
    ...overrides,
  }) as PlaybackAudioPort & Record<keyof PlaybackAudioPort, ReturnType<typeof vi.fn>>

const createFakeTimers = () => {
  let nextId = 1
  const pending = new Map<number, { callback: () => void; delayMs: number }>()

  const timers: PlaybackTimers = {
    set: (callback, delayMs) => {
      const id = nextId++
      pending.set(id, { callback, delayMs })
      return id
    },
    clear: (id) => {
      pending.delete(id)
    },
  }

  /** Fire the single queued step and let its async work settle. */
  const fire = async () => {
    const entries = [...pending.entries()]
    expect(entries, 'expected exactly one queued step').toHaveLength(1)
    const [id, entry] = entries[0]
    pending.delete(id)
    entry.callback()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const pendingDelays = () => [...pending.values()].map((entry) => entry.delayMs)

  return { timers, fire, pendingDelays }
}

type HarnessOverrides = {
  settings?: Partial<PlaybackSettings>
  audio?: ReturnType<typeof createFakeAudio>
  generateNotes?: () => string[]
}

const createHarness = (overrides: HarnessOverrides = {}) => {
  const settings: PlaybackSettings = {
    bpm: 100,
    continuousMode: false,
    speedRampMode: false,
    endSoundEnabled: true,
    ...overrides.settings,
  }
  const audio = overrides.audio ?? createFakeAudio()
  const { timers, fire, pendingDelays } = createFakeTimers()
  const snapshots: PlaybackSnapshot[] = []
  const generateNotes = vi.fn(overrides.generateNotes ?? (() => [...NOTES]))
  const onBpmChange = vi.fn((bpm: number) => {
    settings.bpm = bpm
  })
  const onSessionStart = vi.fn()
  const onSessionPause = vi.fn()

  const machine = createPlaybackMachine({
    audio,
    getSettings: () => ({ ...settings }),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onBpmChange,
    onSessionStart,
    onSessionPause,
    generateNotes,
    timers,
  })

  const last = () => snapshots[snapshots.length - 1]

  /** start() and run through the 3-beat count-in so the next fire plays note 0. */
  const startPastCountIn = async () => {
    await machine.start()
    await fire() // count-in 3
    await fire() // count-in 2
    await fire() // count-in 1
  }

  return {
    machine,
    settings,
    audio,
    fire,
    pendingDelays,
    snapshots,
    last,
    generateNotes,
    onBpmChange,
    onSessionStart,
    onSessionPause,
    startPastCountIn,
  }
}

describe('start and count-in', () => {
  it('loads audio, then counts down 3-2-1 at 650ms per beat with a click each', async () => {
    const h = createHarness()

    await h.machine.start()
    expect(h.snapshots[0]).toEqual({ status: 'playing', note: 'A♭', message: 'Loading audio...' })
    expect(h.last()).toEqual({ status: 'playing', note: '3', message: 'Get ready...' })
    expect(h.pendingDelays()).toEqual([0])

    await h.fire()
    expect(h.last()).toEqual({ status: 'playing', note: '3', message: 'Starting in 3...' })
    expect(h.pendingDelays()).toEqual([650])

    await h.fire()
    expect(h.last()).toEqual({ status: 'playing', note: '2', message: 'Starting in 2...' })

    await h.fire()
    expect(h.last()).toEqual({ status: 'playing', note: '1', message: 'Starting in 1...' })

    expect(h.audio.playClick).toHaveBeenCalledTimes(3)
    expect(h.audio.playNote).not.toHaveBeenCalled()
    expect(h.onSessionStart).not.toHaveBeenCalled()
  })

  it('stops with a message when the browser has no audio support', async () => {
    const h = createHarness({ audio: createFakeAudio({ ensureContext: vi.fn(async () => null) }) })

    await h.machine.start()
    expect(h.last()).toEqual({
      status: 'idle',
      note: 'A♭',
      message: 'Audio playback is unsupported in this browser.',
    })
  })

  it('stops with a message when no note buffer loaded', async () => {
    const h = createHarness({ audio: createFakeAudio({ hasBuffers: vi.fn(() => false) }) })

    await h.machine.start()
    expect(h.last()).toEqual({
      status: 'idle',
      note: 'A♭',
      message: 'Failed to load audio. Please reload the page.',
    })
  })

  it('stops when there are no notes to play', async () => {
    const h = createHarness({ generateNotes: () => [] })

    await h.machine.start()
    await h.fire()
    expect(h.last()).toEqual({ status: 'idle', note: 'A♭', message: 'No notes available.' })
  })
})

describe('note stepping', () => {
  it('plays each note on the beat with click + sample, at round(60000/bpm)', async () => {
    const h = createHarness({ settings: { bpm: 90 } })
    await h.startPastCountIn()

    await h.fire()
    expect(h.last()).toEqual({ status: 'playing', note: 'C', message: '' })
    expect(h.audio.playNote).toHaveBeenCalledWith('C')
    expect(h.pendingDelays()).toEqual([Math.round(60000 / 90)])
  })

  it('starts the session on the first real note only', async () => {
    const h = createHarness()
    await h.startPastCountIn()
    expect(h.onSessionStart).not.toHaveBeenCalled()

    await h.fire()
    expect(h.onSessionStart).toHaveBeenCalledTimes(1)

    await h.fire()
    expect(h.onSessionStart).toHaveBeenCalledTimes(1)
  })

  it('reads BPM fresh each step so live changes affect the next beat', async () => {
    const h = createHarness({ settings: { bpm: 100 } })
    await h.startPastCountIn()

    await h.fire()
    expect(h.pendingDelays()).toEqual([600])

    h.settings.bpm = 50
    await h.fire()
    expect(h.pendingDelays()).toEqual([1200])
  })

  it('walks through all 12 notes in order', async () => {
    const h = createHarness()
    await h.startPastCountIn()

    for (const note of NOTES) {
      await h.fire()
      expect(h.last().note).toBe(note)
    }
    expect(h.audio.playNote).toHaveBeenCalledTimes(12)
  })
})

describe('end of cycle (continuous off)', () => {
  const finishCycle = async (h: ReturnType<typeof createHarness>) => {
    await h.startPastCountIn()
    for (let i = 0; i < NOTES.length; i++) {
      await h.fire()
    }
    await h.fire() // end-of-cycle step
  }

  it('chimes and stops after the 12th note', async () => {
    const h = createHarness()
    await finishCycle(h)

    expect(h.audio.playSessionEndChime).toHaveBeenCalledTimes(1)
    expect(h.last()).toEqual({ status: 'idle', note: 'A♭', message: 'Finished all 12 notes.' })
    expect(h.onSessionPause).toHaveBeenCalled()
    expect(h.pendingDelays()).toEqual([])
  })

  it('skips the chime when the end sound is disabled', async () => {
    const h = createHarness({ settings: { endSoundEnabled: false } })
    await finishCycle(h)

    expect(h.audio.playSessionEndChime).not.toHaveBeenCalled()
    expect(h.last().message).toBe('Finished all 12 notes.')
  })

  it('does not ramp the BPM when continuous mode is off', async () => {
    const h = createHarness({ settings: { speedRampMode: true } })
    await finishCycle(h)

    expect(h.onBpmChange).not.toHaveBeenCalled()
  })
})

describe('continuous loop and speed ramp', () => {
  const finishFirstCycle = async (h: ReturnType<typeof createHarness>) => {
    await h.startPastCountIn()
    for (let i = 0; i < NOTES.length; i++) {
      await h.fire()
    }
    await h.fire() // end-of-cycle → reshuffle + new count-in
  }

  it('reshuffles and restarts with a count-in instead of stopping', async () => {
    const h = createHarness({ settings: { continuousMode: true } })
    await finishFirstCycle(h)

    expect(h.audio.playSessionEndChime).not.toHaveBeenCalled()
    expect(h.generateNotes).toHaveBeenCalledTimes(3) // creation + start + reshuffle
    expect(h.last()).toEqual({ status: 'playing', note: '3', message: 'Get ready...' })
    expect(h.pendingDelays()).toEqual([0])
  })

  it('ramps +2 BPM per completed cycle', async () => {
    const h = createHarness({ settings: { continuousMode: true, speedRampMode: true, bpm: 96 } })
    await finishFirstCycle(h)

    expect(h.onBpmChange).toHaveBeenCalledWith(98)
    expect(h.settings.bpm).toBe(98)
  })

  it('clamps the ramp at 100 BPM without a redundant write', async () => {
    const h = createHarness({ settings: { continuousMode: true, speedRampMode: true, bpm: 100 } })
    await finishFirstCycle(h)

    expect(h.onBpmChange).not.toHaveBeenCalled()
  })

  it('reports the ramped BPM when a ramped session ends non-continuously', async () => {
    const h = createHarness({ settings: { continuousMode: true, speedRampMode: true, bpm: 96 } })
    await h.startPastCountIn()
    for (let i = 0; i < NOTES.length; i++) {
      await h.fire()
    }
    // User turns off looping right before the cycle boundary
    h.settings.continuousMode = false
    await h.fire()

    expect(h.last().message).toBe('Finished all 12 notes. BPM set to 96.')
    expect(h.last().status).toBe('idle')
  })
})

describe('pause, resume, stop, reset', () => {
  it('pauses with a frozen note and cleared timer', async () => {
    const h = createHarness()
    await h.startPastCountIn()
    await h.fire()

    h.machine.pause()
    expect(h.last()).toEqual({ status: 'paused', note: 'C', message: 'Paused' })
    expect(h.onSessionPause).toHaveBeenCalledTimes(1)
    expect(h.pendingDelays()).toEqual([])
  })

  it('ignores pause while not playing', () => {
    const h = createHarness()
    h.machine.pause()
    expect(h.snapshots).toHaveLength(0)
  })

  it('resumes at the next note without reloading audio', async () => {
    const h = createHarness()
    await h.startPastCountIn()
    await h.fire() // C
    h.machine.pause()

    const loadCalls = h.audio.loadNoteBuffers.mock.calls.length
    await h.machine.start()
    expect(h.last()).toEqual({ status: 'playing', note: 'C', message: 'Resuming...' })
    expect(h.onSessionStart).toHaveBeenCalledTimes(2) // first note + resume

    await h.fire()
    expect(h.last()).toEqual({ status: 'playing', note: 'C#', message: '' })
    expect(h.audio.loadNoteBuffers.mock.calls.length).toBe(loadCalls)
  })

  it('stop returns to the idle snapshot', async () => {
    const h = createHarness()
    await h.startPastCountIn()
    h.machine.stop()

    expect(h.last()).toEqual({ status: 'idle', note: 'A♭', message: 'Press play to start.' })
    expect(h.pendingDelays()).toEqual([])
  })

  it('reset during playback stops and reshuffles', async () => {
    const h = createHarness()
    await h.startPastCountIn()
    await h.fire()

    h.machine.reset()
    expect(h.last()).toEqual({ status: 'idle', note: 'A♭', message: 'Press play to start.' })
    expect(h.pendingDelays()).toEqual([])
  })

  it('reset while idle keeps the last message on screen', async () => {
    const h = createHarness()
    await h.startPastCountIn()
    for (let i = 0; i < NOTES.length; i++) {
      await h.fire()
    }
    await h.fire() // finishes: 'Finished all 12 notes.'

    h.machine.reset()
    expect(h.last()).toEqual({ status: 'idle', note: 'A♭', message: 'Finished all 12 notes.' })
  })

  it('dispose clears the queued step but stays restartable', async () => {
    const h = createHarness()
    await h.startPastCountIn()
    h.machine.dispose()
    expect(h.pendingDelays()).toEqual([])

    await h.machine.start()
    expect(h.last()).toEqual({ status: 'playing', note: '3', message: 'Get ready...' })
  })
})
