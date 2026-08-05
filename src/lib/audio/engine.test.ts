import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioEngine, NOTE_AUDIO_FILES } from './engine'

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
    errorSpy.mockRestore()
  })

  it('is idempotent', async () => {
    const fetchFn = okFetch()
    const engine = new AudioEngine({ contextFactory: () => asAudioContext(context), fetchFn })

    await engine.ensureContext()
    await engine.loadNoteBuffers()
    await engine.loadNoteBuffers()

    expect(fetchFn).toHaveBeenCalledTimes(Object.keys(NOTE_AUDIO_FILES).length)
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

  it('playNoteAt starts the buffer at the passed time', async () => {
    const engine = await readyEngine()

    engine.playNoteAt('Db', 4)

    const source = context.createBufferSource.mock.results[0].value
    expect(source.start).toHaveBeenCalledWith(4)
  })

  it('playReferencePitchAt sounds the pitch class in the C4–B4 octave', async () => {
    const engine = await readyEngine()

    engine.playReferencePitchAt(9, 1) // A → A4 = 440 Hz
    engine.playReferencePitchAt(0, 2) // C → C4 ≈ 261.63 Hz

    const [first, second] = context.createOscillator.mock.results.map((result) => result.value)
    expect(first.frequency.setValueAtTime).toHaveBeenCalledWith(440, 1)
    const [frequency] = second.frequency.setValueAtTime.mock.calls[0]
    expect(frequency).toBeCloseTo(261.63, 2)
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

  it('prunes finished nodes via onended so they are not re-stopped', async () => {
    const engine = await readyEngine()

    engine.playClickAt(1, false)
    const oscillator = context.createOscillator.mock.results[0].value
    oscillator.onended?.()

    engine.stopScheduledSounds()
    expect(oscillator.stop).toHaveBeenCalledTimes(1) // only the scheduled stop
  })
})
