/**
 * Microphone fakes: a stream whose tracks report whether they were handed back,
 * an AudioContext whose analyser writes a steady sine, and an installer for
 * `navigator.mediaDevices.getUserMedia`.
 *
 * Everything a mic hook needs is behind `src/lib/audio/mic.ts`, so these three
 * are the whole browser as far as one is concerned.
 */
import { vi } from 'vitest'

export const FAKE_SAMPLE_RATE = 44100

/** A stream whose track records the `stop()` a released microphone owes it. */
export const createFakeStream = () => {
  const track = { stop: vi.fn() }

  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream }
}

/**
 * A context whose analyser always hears one steady frequency. `raw` is the
 * unerased object, for asserting on the nodes the capture asked it for. The
 * rate is a parameter because an attached interface can run at twice the one a
 * laptop picks, and the frame the detector needs grows with it.
 */
export const createFakeMicContext = (frequency: number, sampleRate = FAKE_SAMPLE_RATE) => {
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 1,
    getFloatTimeDomainData: vi.fn((target: Float32Array) => {
      for (let index = 0; index < target.length; index += 1) {
        target[index] = 0.5 * Math.sin((2 * Math.PI * frequency * index) / sampleRate)
      }
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }

  const context = {
    sampleRate,
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createAnalyser: vi.fn(() => analyser),
  }

  return { context: context as unknown as AudioContext, raw: context, analyser }
}

/** Following useWakeLock.test.tsx: install the API, then take it back away. */
export const installGetUserMedia = (getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>) => {
  const spy = vi.fn(getUserMedia)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: spy },
  })

  return spy
}
