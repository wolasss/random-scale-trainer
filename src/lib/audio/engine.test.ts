import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioEngine, NOTE_AUDIO_FILES } from './engine'

// Every console.error spy below is scoped to the test that installs it: a spy
// left in place is reused by the next vi.spyOn, so its call count would leak
// into whichever test the shuffled order runs next.
afterEach(() => {
  vi.restoreAllMocks()
})

const createFakeOscillator = () => ({
  type: '',
  frequency: { setValueAtTime: vi.fn() },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  onended: null as (() => void) | null,
})

const createFakeGain = () => ({
  gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  connect: vi.fn(),
})

const createFakeBufferSource = () => ({
  buffer: null as AudioBuffer | null,
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  onended: null as (() => void) | null,
})

const createFakeContext = (state: AudioContextState = 'running') => {
  const context = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running'
    }),
    createOscillator: vi.fn(createFakeOscillator),
    createGain: vi.fn(createFakeGain),
    createBufferSource: vi.fn(createFakeBufferSource),
    decodeAudioData: vi.fn((_data: ArrayBuffer, resolve: (buffer: AudioBuffer) => void) => {
      resolve({ duration: 1 } as AudioBuffer)
    }),
  }
  return context
}

type FakeContext = ReturnType<typeof createFakeContext>

const asAudioContext = (context: FakeContext) => context as unknown as AudioContext

const okFetch = () =>
  vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as unknown as typeof fetch

describe('AudioEngine.ensureContext', () => {
  it('creates the context once and reuses it', async () => {
    const context = createFakeContext()
    const contextFactory = vi.fn(() => asAudioContext(context))
    const engine = new AudioEngine({ contextFactory })

    await expect(engine.ensureContext()).resolves.toBe(context)
    await expect(engine.ensureContext()).resolves.toBe(context)
    expect(contextFactory).toHaveBeenCalledTimes(1)
  })

  it('resumes a suspended context on reuse', async () => {
    const context = createFakeContext()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context) })

    await engine.ensureContext()
    context.state = 'suspended'
    await engine.ensureContext()
    expect(context.resume).toHaveBeenCalledTimes(2)
  })

  it('returns null when no context can be created', async () => {
    const engine = new AudioEngine({ contextFactory: () => null })
    await expect(engine.ensureContext()).resolves.toBeNull()
  })

  it('returns null with the default factory when the browser has no AudioContext', async () => {
    // jsdom ships no AudioContext, so the default factory finds neither variant
    const engine = new AudioEngine()
    await expect(engine.ensureContext()).resolves.toBeNull()
  })

  it('falls back to webkitAudioContext with the default factory', async () => {
    const context = createFakeContext()
    // Must be constructible: the default factory calls `new AudioContextClass()`
    vi.stubGlobal('webkitAudioContext', function () {
      return context
    })
    try {
      const engine = new AudioEngine()
      await expect(engine.ensureContext()).resolves.toBe(context)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('AudioEngine.loadNoteBuffers', () => {
  let context: ReturnType<typeof createFakeContext>

  beforeEach(() => {
    context = createFakeContext()
  })

  it('loads a buffer for every mapped note', async () => {
    const fetchFn = okFetch()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn })

    await engine.ensureContext()
    await engine.loadNoteBuffers()

    expect(fetchFn).toHaveBeenCalledTimes(Object.keys(NOTE_AUDIO_FILES).length)
    expect(engine.hasBuffers()).toBe(true)
  })

  it('tolerates a failing note and keeps the rest', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = vi.fn(async (path: string) => ({
      ok: !String(path).includes('c-sharp'),
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn })

    await engine.ensureContext()
    await engine.loadNoteBuffers()

    expect(engine.hasBuffers()).toBe(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('is idempotent', async () => {
    const fetchFn = okFetch()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn })

    await engine.ensureContext()
    await engine.loadNoteBuffers()
    await engine.loadNoteBuffers()

    expect(fetchFn).toHaveBeenCalledTimes(Object.keys(NOTE_AUDIO_FILES).length)
  })

  it('retries after a pass where every fetch failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let online = false
    const fetchFn = vi.fn(async () => {
      if (!online) throw new Error('offline')
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
    }) as unknown as typeof fetch
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn })

    await engine.ensureContext()
    await engine.loadNoteBuffers()
    expect(engine.hasBuffers()).toBe(false)

    // A session that starts offline must not be stuck without audio forever.
    online = true
    await engine.loadNoteBuffers()
    expect(engine.hasBuffers()).toBe(true)
  })

  it('does nothing before the context exists', async () => {
    const fetchFn = okFetch()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn })

    await engine.loadNoteBuffers()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(engine.hasBuffers()).toBe(false)
  })
})

describe('AudioEngine playback', () => {
  it('playNote is a no-op without a context', () => {
    const engine = new AudioEngine({ contextFactory: () => null })
    expect(() => engine.playNote('C')).not.toThrow()
  })

  it('playNote is a no-op for a note without a buffer', async () => {
    const context = createFakeContext()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context) })

    await engine.ensureContext()
    engine.playNote('C')
    expect(context.createBufferSource).not.toHaveBeenCalled()
  })

  it('playNote plays the decoded buffer', async () => {
    const context = createFakeContext()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn: okFetch() })

    await engine.ensureContext()
    await engine.loadNoteBuffers()
    engine.playNote('C')

    expect(context.createBufferSource).toHaveBeenCalledTimes(1)
    const source = context.createBufferSource.mock.results[0].value
    expect(source.start).toHaveBeenCalled()
  })

  it('playClick synthesizes a started and stopped oscillator', async () => {
    const context = createFakeContext()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context) })

    await engine.ensureContext()
    engine.playClick()

    expect(context.createOscillator).toHaveBeenCalledTimes(1)
    expect(context.createGain).toHaveBeenCalledTimes(1)
    const oscillator = context.createOscillator.mock.results[0].value
    expect(oscillator.start).toHaveBeenCalled()
    expect(oscillator.stop).toHaveBeenCalled()
  })

  it('playClick is a no-op without a context', () => {
    const engine = new AudioEngine({ contextFactory: () => null })
    expect(() => engine.playClick()).not.toThrow()
  })

  it('playSessionEndChime layers two two-oscillator tones', async () => {
    const context = createFakeContext()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context) })

    await engine.ensureContext()
    engine.playSessionEndChime()

    expect(context.createOscillator).toHaveBeenCalledTimes(4)
    expect(context.createGain).toHaveBeenCalledTimes(4)
    for (const result of context.createOscillator.mock.results) {
      expect(result.value.start).toHaveBeenCalled()
      expect(result.value.stop).toHaveBeenCalled()
    }
  })
})

describe('AudioEngine scheduled playback', () => {
  let context: FakeContext

  const readyEngine = async () => {
    context = createFakeContext()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn: okFetch() })
    await engine.ensureContext()
    await engine.loadNoteBuffers()
    return engine
  }

  it('getCurrentTime reads the context clock, defaulting to 0', async () => {
    const engine = new AudioEngine({ contextFactory: () => null })
    expect(engine.getCurrentTime()).toBe(0)

    const ready = await readyEngine()
    context.currentTime = 3.5
    expect(ready.getCurrentTime()).toBe(3.5)
  })

  it('playClickAt schedules at the passed time, not the current time', async () => {
    const engine = await readyEngine()
    context.currentTime = 1

    engine.playClickAt(5, false)

    const oscillator = context.createOscillator.mock.results[0].value
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 5)
    expect(oscillator.start).toHaveBeenCalledWith(5)
    expect(oscillator.stop).toHaveBeenCalledWith(5 + 0.14)
  })

  it('accented clicks use a higher pitch and peak', async () => {
    const engine = await readyEngine()

    engine.playClickAt(2, true)

    const oscillator = context.createOscillator.mock.results[0].value
    const gain = context.createGain.mock.results[0].value
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(1320, 2)
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.12, expect.closeTo(2.01, 5))
  })

  /**
   * The two envelope tests below pin every scheduled value exactly — `toEqual`
   * over the recorded calls, with each expectation written as the same
   * arithmetic the engine evaluates. They are the safety net for anything that
   * moves the tone scheduling around: a click or a chime whose ramp or stop
   * lands a float bit away from where it used to is a change in the sound.
   */
  it('a click schedules one exact envelope', async () => {
    const engine = await readyEngine()

    engine.playClickAt(2, true)

    const oscillator = context.createOscillator.mock.results[0].value
    const gain = context.createGain.mock.results[0].value
    expect(oscillator.type).toBe('triangle')
    expect(oscillator.frequency.setValueAtTime.mock.calls).toEqual([[1320, 2]])
    expect(gain.gain.setValueAtTime.mock.calls).toEqual([[0.0001, 2]])
    expect(gain.gain.exponentialRampToValueAtTime.mock.calls).toEqual([
      [0.12, 2 + 0.01],
      [0.0001, 2 + 0.12],
    ])
    expect(oscillator.connect.mock.calls).toEqual([[gain]])
    expect(gain.connect.mock.calls).toEqual([[context.destination]])
    expect(oscillator.start.mock.calls).toEqual([[2]])
    expect(oscillator.stop.mock.calls).toEqual([[2 + 0.14]])
  })

  it('the end chime schedules four exact envelopes', async () => {
    const engine = await readyEngine()
    const t1 = 1 + 0
    const t2 = 1 + 0.19

    engine.playSessionEndChime(1)

    const oscillators = context.createOscillator.mock.results.map((result) => result.value)
    const gains = context.createGain.mock.results.map((result) => result.value)
    const tones = [
      { type: 'triangle', frequency: 783.99, start: t1, peak: 0.11, attack: t1 + 0.012, decayEnd: t1 + 0.24, stop: t1 + 0.24 + 0.03 },
      { type: 'sine', frequency: 783.99 * 2, start: t1, peak: 0.11 * 0.42, attack: t1 + 0.01, decayEnd: t1 + 0.24 * 0.88, stop: t1 + 0.24 * 0.9 + 0.03 },
      { type: 'triangle', frequency: 523.25, start: t2, peak: 0.13, attack: t2 + 0.012, decayEnd: t2 + 0.34, stop: t2 + 0.34 + 0.03 },
      { type: 'sine', frequency: 523.25 * 2, start: t2, peak: 0.13 * 0.42, attack: t2 + 0.01, decayEnd: t2 + 0.34 * 0.88, stop: t2 + 0.34 * 0.9 + 0.03 },
    ]

    expect(oscillators).toHaveLength(4)
    expect(gains).toHaveLength(4)
    tones.forEach((tone, index) => {
      const oscillator = oscillators[index]
      const gain = gains[index]
      expect(oscillator.type).toBe(tone.type)
      expect(oscillator.frequency.setValueAtTime.mock.calls).toEqual([[tone.frequency, tone.start]])
      expect(gain.gain.setValueAtTime.mock.calls).toEqual([[0.0001, tone.start]])
      expect(gain.gain.exponentialRampToValueAtTime.mock.calls).toEqual([
        [tone.peak, tone.attack],
        [0.0001, tone.decayEnd],
      ])
      expect(oscillator.connect.mock.calls).toEqual([[gain]])
      expect(gain.connect.mock.calls).toEqual([[context.destination]])
      expect(oscillator.start.mock.calls).toEqual([[tone.start]])
      expect(oscillator.stop.mock.calls).toEqual([[tone.stop]])
    })

    // All four belong to the chime, not the transport, so the stop that spares
    // the chime leaves each of them with only its own scheduled stop.
    engine.stopScheduledSounds(true)
    for (const oscillator of oscillators) {
      expect(oscillator.stop).toHaveBeenCalledTimes(1)
    }
  })

  it('playNoteAt starts the buffer at the passed time', async () => {
    const engine = await readyEngine()

    engine.playNoteAt('Db', 4)

    const source = context.createBufferSource.mock.results[0].value
    expect(source.start).toHaveBeenCalledWith(4)
  })

  it('stopScheduledSounds stops every outstanding node and clears tracking', async () => {
    const engine = await readyEngine()

    engine.playClickAt(5, false)
    engine.playClickAt(5.5, true)
    engine.playNoteAt('C', 5)

    engine.stopScheduledSounds()

    const oscillators = context.createOscillator.mock.results.map((result) => result.value)
    const source = context.createBufferSource.mock.results[0].value
    for (const oscillator of oscillators) {
      expect(oscillator.stop).toHaveBeenCalledTimes(2) // scheduled stop + cancel
    }
    expect(source.stop).toHaveBeenCalledTimes(1)

    // A second call finds nothing left to stop.
    engine.stopScheduledSounds()
    expect(source.stop).toHaveBeenCalledTimes(1)
  })

  it('stopScheduledSounds silences a chime scheduled ahead of the clock', async () => {
    const engine = await readyEngine()
    context.currentTime = 1

    // The transport schedules the chime a look-ahead window early, so a stop
    // landing before it sounds has to cancel it like any other queued node.
    engine.playSessionEndChime(5)
    engine.stopScheduledSounds()

    expect(context.createOscillator).toHaveBeenCalledTimes(4)
    for (const result of context.createOscillator.mock.results) {
      expect(result.value.stop).toHaveBeenCalledTimes(2) // scheduled stop + cancel
    }
  })

  it('spares the chime when asked, while still silencing the transport', async () => {
    const engine = await readyEngine()
    context.currentTime = 1

    // The session that ends on its own tears down exactly when the chime is
    // due, so that teardown has to leave the chime scheduled.
    engine.playClickAt(5, true)
    engine.playSessionEndChime(5)
    engine.stopScheduledSounds(true)

    const [click, ...chime] = context.createOscillator.mock.results.map((result) => result.value)
    expect(click.stop).toHaveBeenCalledTimes(2) // scheduled stop + cancel
    for (const oscillator of chime) {
      expect(oscillator.stop).toHaveBeenCalledTimes(1) // its own scheduled stop only
    }

    // A later stop — the player pressing it — still cancels the chime.
    engine.stopScheduledSounds()
    for (const oscillator of chime) {
      expect(oscillator.stop).toHaveBeenCalledTimes(2)
    }
  })

  it('prunes finished nodes via onended so they are not re-stopped', async () => {
    const engine = await readyEngine()

    engine.playClickAt(1, false)
    const oscillator = context.createOscillator.mock.results[0].value
    oscillator.onended?.()

    engine.stopScheduledSounds()
    expect(oscillator.stop).toHaveBeenCalledTimes(1) // only the scheduled stop
  })
})

describe('AudioEngine media-session unlock', () => {
  const createFakeElement = () => ({ play: vi.fn(async () => undefined) })

  it('plays a media element once, on the first gesture', async () => {
    const element = createFakeElement()
    const mediaElementFactory = vi.fn(() => element as unknown as HTMLAudioElement)
    const engine = new AudioEngine({
      contextFactory: () => asAudioContext(createFakeContext()),
      mediaElementFactory,
    })

    await engine.ensureContext()
    await engine.ensureContext()
    await engine.ensureContext()

    // iOS only needs telling once which audio session the page is on.
    expect(mediaElementFactory).toHaveBeenCalledTimes(1)
    expect(element.play).toHaveBeenCalledTimes(1)
  })

  it('still returns the context when the element refuses to play', async () => {
    const context = createFakeContext()
    const engine = new AudioEngine({
      contextFactory: () => asAudioContext(context),
      mediaElementFactory: () =>
        ({
          play: () => {
            throw new Error('gesture required')
          },
        }) as unknown as HTMLAudioElement,
    })

    // The unlock is a bonus; Web Audio is the real output and must survive it.
    await expect(engine.ensureContext()).resolves.toBe(context)
  })

  it('tolerates a browser with no media element at all', async () => {
    const context = createFakeContext()
    const engine = new AudioEngine({
      contextFactory: () => asAudioContext(context),
      mediaElementFactory: () => null,
    })

    await expect(engine.ensureContext()).resolves.toBe(context)
  })
})

describe('AudioEngine speech fallback', () => {
  const failingFetch = (failingPath: string) =>
    vi.fn(async (input: string) =>
      input === failingPath
        ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
        : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) },
    ) as unknown as typeof fetch

  it('speaks a note whose clip failed to download', async () => {
    const speak = vi.fn()
    const engine = new AudioEngine({
      contextFactory: () => asAudioContext(createFakeContext()),
      fetchFn: failingFetch(NOTE_AUDIO_FILES['F#']),
      mediaElementFactory: () => null,
      speech: { speak },
    })

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await engine.ensureContext()
    await engine.loadNoteBuffers()

    engine.playNoteAt('F#', 1)
    expect(speak).toHaveBeenCalledWith('F sharp')
  })

  it('reads a flat as a flat, not as a letter', async () => {
    const speak = vi.fn()
    const engine = new AudioEngine({
      contextFactory: () => asAudioContext(createFakeContext()),
      fetchFn: failingFetch(NOTE_AUDIO_FILES['Bb']),
      mediaElementFactory: () => null,
      speech: { speak },
    })

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await engine.ensureContext()
    await engine.loadNoteBuffers()

    engine.playNoteAt('Bb', 1)
    expect(speak).toHaveBeenCalledWith('B flat')
  })

  it('never speaks a note that has a clip', async () => {
    const speak = vi.fn()
    const context = createFakeContext()
    const engine = new AudioEngine({
      contextFactory: () => asAudioContext(context),
      fetchFn: okFetch(),
      mediaElementFactory: () => null,
      speech: { speak },
    })

    await engine.ensureContext()
    await engine.loadNoteBuffers()

    engine.playNoteAt('C', 1)
    // Speech is the last resort, never the path a working clip takes: its
    // timing is exactly what the pre-rendered clips exist to avoid.
    expect(speak).not.toHaveBeenCalled()
    expect(context.createBufferSource).toHaveBeenCalled()
  })

  it('stays silent when the browser has no speech either', async () => {
    const engine = new AudioEngine({
      contextFactory: () => asAudioContext(createFakeContext()),
      fetchFn: failingFetch(NOTE_AUDIO_FILES['C']),
      mediaElementFactory: () => null,
      speech: null,
    })

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await engine.ensureContext()
    await engine.loadNoteBuffers()

    expect(() => engine.playNoteAt('C', 1)).not.toThrow()
  })
})

describe('AudioEngine.getContext', () => {
  it('is null until the first gesture opens the context, and the context after', async () => {
    const context = createFakeContext()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context) })

    expect(engine.getContext()).toBeNull()

    await engine.ensureContext()
    expect(engine.getContext()).toBe(context)
  })

  it('stays null where the browser has no AudioContext at all', async () => {
    const engine = new AudioEngine({ contextFactory: () => null })

    await engine.ensureContext()
    expect(engine.getContext()).toBeNull()
  })
})

describe('AudioEngine cue bookkeeping', () => {
  let context: FakeContext

  const readyEngine = async () => {
    context = createFakeContext()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn: okFetch() })
    await engine.ensureContext()
    await engine.loadNoteBuffers()
    return engine
  }

  it('records the click for exactly as long as it sounds', async () => {
    const engine = await readyEngine()

    engine.playClickAt(2, false)

    expect(engine.isWithinCue(2)).toBe(true)
    expect(engine.isWithinCue(2.13)).toBe(true)
    expect(engine.isWithinCue(1.99)).toBe(false)
    expect(engine.getCueEndForBeat(2)).toBeCloseTo(2.14, 5)
  })

  it('records a spoken note for the length of its clip', async () => {
    const engine = await readyEngine()

    // The fake decoder yields a one-second buffer for every note.
    engine.playNoteAt('C', 3)

    expect(engine.isWithinCue(3.9)).toBe(true)
    expect(engine.isWithinCue(4.3)).toBe(false)
    expect(engine.getCueEndForBeat(3)).toBeCloseTo(4, 5)
  })

  it('records a generous interval for the speech fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing = createFakeContext()
    const engine = new AudioEngine({
      contextFactory: () => asAudioContext(failing),
      fetchFn: vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) })) as unknown as typeof fetch,
      mediaElementFactory: () => null,
      speech: { speak: vi.fn() },
    })

    await engine.ensureContext()
    await engine.loadNoteBuffers()
    failing.currentTime = 1.8
    engine.playNoteAt('C', 2)

    // Speech begins when it is asked to rather than on the beat, so the cue
    // covers from the request all the way past a comfortably long note name.
    expect(engine.isWithinCue(1.85)).toBe(true)
    expect(engine.isWithinCue(3.1)).toBe(true)
    expect(engine.isWithinCue(3.4)).toBe(false)
  })

  /**
   * Beats are a quarter of a second apart at 240 BPM, the top of the range the
   * tempo control offers. If a click suppressed the microphone for as long as a
   * spoken note leaves the room ringing, the next click would arrive before the
   * last one let go and a fast session would never hear the player at all.
   */
  it('lets go of a click before the next beat can land on it', async () => {
    const engine = await readyEngine()
    const fastestBeatS = 60 / 240

    engine.playClickAt(2, false)

    expect(engine.isWithinCue(2 + fastestBeatS - 0.001)).toBe(false)
    // A note is a different matter: its tail is generous on purpose.
    engine.playNoteAt('C', 5)
    expect(engine.isWithinCue(6.1)).toBe(true)
  })

  it('answers per interval rather than for the last thing scheduled', async () => {
    const engine = await readyEngine()

    // What the look-ahead scheduler actually does: beat B is queued while beat
    // A is still the one being heard.
    engine.playClickAt(1, true)
    engine.playNoteAt('C', 1)
    engine.playClickAt(1.25, false)

    expect(engine.getCueEndForBeat(1)).toBeCloseTo(2, 5)
    expect(engine.isWithinCue(1.2)).toBe(true)
    expect(engine.isWithinCue(1.3)).toBe(true)
    // A gap between two cues is a gap, however recently something was queued.
    engine.stopScheduledSounds()
    expect(engine.isWithinCue(5)).toBe(false)
  })

  it('forgets a cue that was cancelled before it sounded', async () => {
    const engine = await readyEngine()
    context.currentTime = 1

    engine.playClickAt(1, false)
    engine.playNoteAt('C', 3)
    engine.stopScheduledSounds()

    // The click is already out of the speaker; the note never left it.
    expect(engine.isWithinCue(1.05)).toBe(true)
    expect(engine.isWithinCue(3.5)).toBe(false)
    expect(engine.getCueEndForBeat(3)).toBeNull()
  })

  it('keeps the tail of the previous note in view over the next beat', async () => {
    const engine = await readyEngine()

    // A one-second clip at a fast tempo is still ringing when the next note is
    // called, and the app's voice is the app's voice whichever beat rang it.
    engine.playNoteAt('C', 1)
    engine.playClickAt(1.5, false)

    expect(engine.getCueEndForBeat(1.5)).toBeCloseTo(2, 5)
  })

  it('forgets cues that have long since faded', async () => {
    const engine = await readyEngine()

    engine.playClickAt(1, false)
    context.currentTime = 30
    engine.playClickAt(30, false)

    expect(engine.isWithinCue(1.05)).toBe(false)
    expect(engine.getCueEndForBeat(1)).toBeNull()
    expect(engine.isWithinCue(30.05)).toBe(true)
  })

  it('has nothing to report before anything has been played', async () => {
    const engine = await readyEngine()

    expect(engine.isWithinCue(1)).toBe(false)
    expect(engine.getCueEndForBeat(1)).toBeNull()
  })
})
