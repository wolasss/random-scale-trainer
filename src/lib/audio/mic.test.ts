import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMicCapture,
  isMicSupported,
  MIC_FRAME_SIZE,
  onMicStreamEnded,
  primeMicPermission,
  releaseMicStream,
  requestMicStream,
} from './mic'

const FAKE_TRACK_SETTINGS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  sampleRate: 48000,
}

/** A track that remembers its 'ended' listeners, so a test can fire them. */
const createFakeTrack = () => {
  const listeners = new Set<() => void>()
  return {
    stop: vi.fn(),
    getSettings: () => FAKE_TRACK_SETTINGS,
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    fireEnded: () => {
      for (const listener of [...listeners]) {
        listener()
      }
    },
  }
}

const createFakeStream = () => {
  const tracks = [createFakeTrack(), createFakeTrack()]
  return {
    tracks,
    settings: FAKE_TRACK_SETTINGS,
    stream: { getTracks: () => tracks, getAudioTracks: () => tracks } as unknown as MediaStream,
  }
}

const createFakeContext = (state = 'running') => {
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 1,
    getFloatTimeDomainData: vi.fn((target: Float32Array) => target.fill(0.25)),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  const listeners = new Set<() => void>()
  const context = {
    state,
    sampleRate: 44100,
    resume: vi.fn(async () => {
      context.state = 'running'
    }),
    close: vi.fn(async () => {
      context.state = 'closed'
    }),
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    destination: {},
  }
  /** What a browser does when the context's state flips: set it, then notify. */
  const changeState = (next: string) => {
    context.state = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  return { context: context as unknown as AudioContext, source, analyser, raw: context, changeState }
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('isMicSupported', () => {
  it('is false where the browser has no mediaDevices', () => {
    expect(isMicSupported()).toBe(false)
  })

  it('is true once getUserMedia is there', () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    })

    expect(isMicSupported()).toBe(true)
  })
})

describe('requestMicStream', () => {
  it('asks for raw audio, with every voice-call nicety switched off', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = vi.fn(async () => stream)

    await expect(requestMicStream(getUserMedia)).resolves.toBe(stream)
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
  })

  it('lets a refusal through to the caller', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    })

    await expect(requestMicStream(getUserMedia)).rejects.toThrow('Permission denied')
  })
})

describe('primeMicPermission', () => {
  const supportMic = () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    })
  }

  it('hands the microphone straight back, so no indicator is left lit', async () => {
    supportMic()
    const { stream, tracks } = createFakeStream()
    const getUserMedia = vi.fn(async () => stream)

    await expect(primeMicPermission(getUserMedia)).resolves.toBe(true)

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1)
    }
  })

  it('reports a refusal rather than throwing — asking again for real is what reports it', async () => {
    supportMic()
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    })

    await expect(primeMicPermission(getUserMedia)).resolves.toBe(false)
  })

  it('asks for nothing at all where the browser has no microphone API', async () => {
    const getUserMedia = vi.fn(async () => createFakeStream().stream)

    await expect(primeMicPermission(getUserMedia)).resolves.toBe(false)
    expect(getUserMedia).not.toHaveBeenCalled()
  })
})

describe('createMicCapture', () => {
  it('reads frames off an analyser on the app’s own context', () => {
    const { context, analyser, source } = createFakeContext()
    const { stream } = createFakeStream()

    const capture = createMicCapture(context, stream)
    const frame = new Float32Array(MIC_FRAME_SIZE)
    capture.readFrame(frame)

    expect(analyser.fftSize).toBe(MIC_FRAME_SIZE)
    expect(source.connect).toHaveBeenCalledWith(analyser)
    expect(analyser.getFloatTimeDomainData).toHaveBeenCalledWith(frame)
    expect(frame[0]).toBe(0.25)
  })

  it('never routes the microphone back to the speakers', () => {
    const { context, analyser, raw } = createFakeContext()
    const { stream } = createFakeStream()

    createMicCapture(context, stream)

    expect(analyser.connect).not.toHaveBeenCalled()
    expect(raw.destination).toBeDefined()
  })

  it('resumes a context that iOS interrupted while the permission prompt was up', () => {
    // Safari's nonstandard state for an audio-session change — the very thing
    // opening the microphone causes on iOS.
    const { context, raw } = createFakeContext('interrupted')
    const { stream } = createFakeStream()

    createMicCapture(context, stream)

    expect(raw.resume).toHaveBeenCalledTimes(1)
  })

  it('leaves a running context alone but answers a later interruption', () => {
    const { context, raw, changeState } = createFakeContext()
    const { stream } = createFakeStream()

    createMicCapture(context, stream)
    expect(raw.resume).not.toHaveBeenCalled()

    changeState('interrupted')
    expect(raw.resume).toHaveBeenCalledTimes(1)
  })

  it('never tries to resume a closed context — resume() cannot help it', () => {
    const { context, raw, changeState } = createFakeContext()
    const { stream } = createFakeStream()

    createMicCapture(context, stream)
    changeState('closed')

    expect(raw.resume).not.toHaveBeenCalled()
  })

  it('re-nudges a context stuck parked without ever firing a statechange', () => {
    const { context, raw } = createFakeContext()
    const { stream } = createFakeStream()

    const capture = createMicCapture(context, stream)
    // Parked silently: the state moved but no event fired — iOS refusing the
    // first resume of a context created mid-session-flip looks exactly so.
    raw.state = 'suspended'

    capture.keepAlive()
    expect(raw.resume).toHaveBeenCalledTimes(1)
  })

  it('reports the applied track settings and both contexts', () => {
    const { context, raw } = createFakeContext()
    const { stream, settings } = createFakeStream()

    const report = createMicCapture(context, stream).diagnostics()

    expect(report.trackSettings).toEqual(settings)
    expect(report.appContextRate).toBe(raw.sampleRate)
    expect(report.captureContextState).toBe('running')
    expect(report.ownContext).toBe(false)
  })

  it('stops watching the context once released', () => {
    const { context, raw, changeState } = createFakeContext()
    const { stream } = createFakeStream()

    createMicCapture(context, stream).release()
    changeState('interrupted')

    expect(raw.resume).not.toHaveBeenCalled()
  })

  it('stops the tracks on release, not just the nodes', () => {
    const { context, analyser, source } = createFakeContext()
    const { stream, tracks } = createFakeStream()

    createMicCapture(context, stream).release()

    // Disconnecting the graph leaves the browser's recording indicator lit; the
    // tracks are what actually hand the microphone back.
    expect(source.disconnect).toHaveBeenCalled()
    expect(analyser.disconnect).toHaveBeenCalled()
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalled()
    }
  })
})

describe('createMicCapture with a context of its own', () => {
  /**
   * Stands in for a browser where `new AudioContext()` works — the fakes above
   * cover the fallback, since jsdom has no constructor at all. The instance
   * reuses the fake-context shape so the same assertions read off it.
   */
  const stubAudioContext = () => {
    const created: ReturnType<typeof createFakeContext>[] = []
    vi.stubGlobal(
      'AudioContext',
      function (this: unknown) {
        const own = createFakeContext()
        own.raw.sampleRate = 48000
        created.push(own)
        return own.context
      },
    )

    return created
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('analyses on its own context, born under the record route', () => {
    const created = stubAudioContext()
    const { context: appContext, raw: appRaw } = createFakeContext()
    const { stream } = createFakeStream()

    const capture = createMicCapture(appContext, stream)

    expect(created).toHaveLength(1)
    const own = created[0]
    // The graph hangs off the capture's context; the app's is left alone.
    expect(own.raw.createMediaStreamSource).toHaveBeenCalledWith(stream)
    expect(appRaw.createMediaStreamSource).not.toHaveBeenCalled()
    // ...and the detector must be told the rate the frames actually carry.
    expect(capture.sampleRate).toBe(48000)
  })

  it('watches both contexts — the cues must survive the session flip too', () => {
    const created = stubAudioContext()
    const { context: appContext, raw: appRaw, changeState } = createFakeContext()
    const { stream } = createFakeStream()

    createMicCapture(appContext, stream)

    changeState('interrupted')
    expect(appRaw.resume).toHaveBeenCalledTimes(1)

    created[0].changeState('interrupted')
    expect(created[0].raw.resume).toHaveBeenCalledTimes(1)
  })

  it('closes its own context on release and leaves the app’s open', () => {
    const created = stubAudioContext()
    const { context: appContext, raw: appRaw, changeState } = createFakeContext()
    const { stream, tracks } = createFakeStream()

    createMicCapture(appContext, stream).release()

    expect(created[0].raw.close).toHaveBeenCalledTimes(1)
    expect(appRaw.close).not.toHaveBeenCalled()
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalled()
    }

    // Released means unwatched, on both.
    changeState('interrupted')
    created[0].changeState('interrupted')
    expect(appRaw.resume).not.toHaveBeenCalled()
    expect(created[0].raw.resume).not.toHaveBeenCalled()
  })

  it('falls back to the app’s context when the constructor throws', () => {
    vi.stubGlobal('AudioContext', function () {
      throw new Error('context limit')
    })
    const { context: appContext, raw: appRaw } = createFakeContext()
    const { stream } = createFakeStream()

    const capture = createMicCapture(appContext, stream)

    expect(appRaw.createMediaStreamSource).toHaveBeenCalledWith(stream)
    expect(capture.sampleRate).toBe(44100)
  })
})

describe('releaseMicStream', () => {
  it('stops every track', () => {
    const { stream, tracks } = createFakeStream()

    releaseMicStream(stream)

    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1)
    }
  })
})

describe('onMicStreamEnded', () => {
  it('fires when any track on the stream ends', () => {
    const { stream, tracks } = createFakeStream()
    const onEnded = vi.fn()

    onMicStreamEnded(stream, onEnded)
    tracks[0].fireEnded()

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('stops listening on every track once unsubscribed', () => {
    const { stream, tracks } = createFakeStream()
    const onEnded = vi.fn()

    const unsubscribe = onMicStreamEnded(stream, onEnded)
    unsubscribe()
    for (const track of tracks) {
      track.fireEnded()
    }

    expect(onEnded).not.toHaveBeenCalled()
  })
})
