import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CUE_DECAY_MARGIN_S, MIC_POLL_MS, useMicPitch, type HeardPitch, type MicEngine } from './useMicPitch'

const SAMPLE_RATE = 44100

/** A stream whose tracks report whether the microphone was handed back. */
const createFakeStream = () => {
  const track = { stop: vi.fn() }
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream }
}

/** An analyser that always hears a steady A — pitch class 9. */
const createFakeContext = (frequency = 220) => {
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 1,
    getFloatTimeDomainData: vi.fn((target: Float32Array) => {
      for (let index = 0; index < target.length; index += 1) {
        target[index] = 0.5 * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE)
      }
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  const context = {
    sampleRate: SAMPLE_RATE,
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createAnalyser: vi.fn(() => analyser),
  }

  return { context: context as unknown as AudioContext, raw: context, analyser }
}

type FakeEngine = MicEngine & { now: number }

const createFakeEngine = (context: AudioContext | null): FakeEngine => {
  const engine: FakeEngine = {
    now: 12,
    getContext: vi.fn(() => context),
    getCurrentTime: vi.fn(() => engine.now),
    isWithinCue: vi.fn(() => false),
  }

  return engine
}

/** Following useWakeLock.test.tsx: install the API, then take it back away. */
const installGetUserMedia = (getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>) => {
  const spy = vi.fn(getUserMedia)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: spy },
  })

  return spy
}

const flush = async () => {
  await act(async () => {})
}

const tick = async (times = 1) => {
  await act(async () => {
    vi.advanceTimersByTime(MIC_POLL_MS * times)
  })
}

describe('useMicPitch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'mediaDevices')
  })

  it('never asks for the microphone while the setting is off', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = installGetUserMedia(async () => stream)
    const engine = createFakeEngine(createFakeContext().context)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: false, running: true }))
    await flush()

    expect(getUserMedia).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('never asks for the microphone before playback starts', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = installGetUserMedia(async () => stream)
    const engine = createFakeEngine(createFakeContext().context)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: true, running: false }))
    await flush()

    expect(getUserMedia).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('opens the microphone and reports what it hears on the engine clock', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const { context } = createFakeContext()
    const engine = createFakeEngine(context)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: true, running: true }))
    await flush()

    expect(result.current.status).toBe('listening')

    const events: HeardPitch[] = []
    act(() => {
      result.current.subscribe((event) => events.push(event))
    })

    engine.now = 40.5
    await tick()

    expect(events).toHaveLength(1)
    expect(events[0].pitchClass).toBe(9)
    expect(events[0].audioTime).toBe(40.5)
    expect(events[0].clarity).toBeGreaterThan(0.9)
    expect(result.current.heard?.pitchClass).toBe(9)
  })

  it('unsubscribes cleanly', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const engine = createFakeEngine(createFakeContext().context)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: true, running: true }))
    await flush()

    const events: HeardPitch[] = []
    let unsubscribe = () => {}
    act(() => {
      unsubscribe = result.current.subscribe((event) => events.push(event))
    })

    await tick()
    act(() => unsubscribe())
    await tick()

    expect(events).toHaveLength(1)
  })

  /**
   * The hardware gate in miniature: the app calls the note out of the same
   * speaker the microphone is pointed at, so a detection landing inside a cue
   * is the app hearing itself and must reach neither the readout nor a
   * subscriber. Clarity cannot tell them apart — the clip is a clean note.
   */
  it('drops what it hears while the app is the one making the sound', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const engine = createFakeEngine(createFakeContext().context)
    const isWithinCue = vi.mocked(engine.isWithinCue)
    isWithinCue.mockReturnValue(true)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: true, running: true }))
    await flush()

    const events: HeardPitch[] = []
    act(() => {
      result.current.subscribe((event) => events.push(event))
    })

    engine.now = 7.25
    await tick()

    expect(events).toHaveLength(0)
    expect(result.current.heard).toBeNull()
    expect(isWithinCue).toHaveBeenCalledWith(7.25, CUE_DECAY_MARGIN_S)

    // The very same frame gets through once the cue has decayed.
    isWithinCue.mockReturnValue(false)
    await tick()

    expect(events).toHaveLength(1)
    expect(events[0].pitchClass).toBe(9)
  })

  it('reads silence as no pitch and clears the readout', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const { context, analyser } = createFakeContext()
    const engine = createFakeEngine(context)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: true, running: true }))
    await flush()
    await tick()
    expect(result.current.heard).not.toBeNull()

    analyser.getFloatTimeDomainData.mockImplementation((target: Float32Array) => target.fill(0))
    await tick()

    expect(result.current.heard).toBeNull()
  })

  it('says so when the microphone is refused', async () => {
    installGetUserMedia(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    })
    const engine = createFakeEngine(createFakeContext().context)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: true, running: true }))
    await flush()

    expect(result.current.status).toBe('denied')
    expect(result.current.heard).toBeNull()
  })

  it('says so where the browser has no microphone API at all', async () => {
    const engine = createFakeEngine(createFakeContext().context)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: true, running: true }))
    await flush()

    expect(result.current.status).toBe('unsupported')
  })

  it('hands the stream straight back when playback has not opened a context', async () => {
    const { stream, track } = createFakeStream()
    installGetUserMedia(async () => stream)
    const engine = createFakeEngine(null)

    const { result } = renderHook(() => useMicPitch({ engine, enabled: true, running: true }))
    await flush()

    expect(track.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('gives the microphone back when playback stops', async () => {
    const { stream, track } = createFakeStream()
    installGetUserMedia(async () => stream)
    const { context, analyser } = createFakeContext()
    const engine = createFakeEngine(context)

    const { rerender, result } = renderHook(({ running }) => useMicPitch({ engine, enabled: true, running }), {
      initialProps: { running: true },
    })
    await flush()
    await tick()

    const framesRead = analyser.getFloatTimeDomainData.mock.calls.length
    await act(async () => {
      rerender({ running: false })
    })

    expect(track.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')

    // The poll has to stop with the stream: a timer still running is a timer
    // still reading a released analyser.
    await tick(4)
    expect(analyser.getFloatTimeDomainData.mock.calls.length).toBe(framesRead)
  })

  it('gives the microphone back when the app goes away', async () => {
    const { stream, track } = createFakeStream()
    installGetUserMedia(async () => stream)
    const engine = createFakeEngine(createFakeContext().context)

    const { unmount } = renderHook(() => useMicPitch({ engine, enabled: true, running: true }))
    await flush()

    unmount()
    expect(track.stop).toHaveBeenCalled()
  })

  /**
   * The permission prompt can sit open across a pause and a restart. The stream
   * that finally arrives belongs to a request nobody is waiting for any more,
   * and nothing else will ever stop it.
   */
  it('releases a stream that arrives after a newer request has taken over', async () => {
    const streams = [createFakeStream(), createFakeStream()]
    const pending: ((stream: MediaStream) => void)[] = []
    installGetUserMedia(() => new Promise<MediaStream>((resolve) => pending.push(resolve)))
    const { context, raw } = createFakeContext()
    const engine = createFakeEngine(context)

    const { rerender, result } = renderHook(({ running }) => useMicPitch({ engine, enabled: true, running }), {
      initialProps: { running: true },
    })

    await act(async () => {
      rerender({ running: false })
    })
    await act(async () => {
      rerender({ running: true })
    })

    expect(pending).toHaveLength(2)

    await act(async () => {
      pending[0](streams[0].stream)
    })

    expect(streams[0].track.stop).toHaveBeenCalled()
    expect(raw.createAnalyser).not.toHaveBeenCalled()

    await act(async () => {
      pending[1](streams[1].stream)
    })

    expect(result.current.status).toBe('listening')
    expect(raw.createAnalyser).toHaveBeenCalledTimes(1)
    expect(streams[1].track.stop).not.toHaveBeenCalled()
  })
})
