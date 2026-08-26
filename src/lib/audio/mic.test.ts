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

/** A track that remembers its 'ended' listeners, so a test can fire them. */
const createFakeTrack = () => {
  const listeners = new Set<() => void>()
  return {
    stop: vi.fn(),
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
  return { tracks, stream: { getTracks: () => tracks } as unknown as MediaStream }
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
    resume: vi.fn(async () => {
      context.state = 'running'
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
