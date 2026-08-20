import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMicCapture,
  isMicSupported,
  MIC_FRAME_SIZE,
  primeMicPermission,
  releaseMicStream,
  requestMicStream,
} from './mic'

const createFakeStream = () => {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  return { tracks, stream: { getTracks: () => tracks } as unknown as MediaStream }
}

const createFakeContext = () => {
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 1,
    getFloatTimeDomainData: vi.fn((target: Float32Array) => target.fill(0.25)),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  const context = {
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    destination: {},
  }

  return { context: context as unknown as AudioContext, source, analyser, raw: context }
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
  it('asks for audio with the speaker bleed turned down', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = vi.fn(async () => stream)

    await expect(requestMicStream(getUserMedia)).resolves.toBe(stream)
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true },
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
