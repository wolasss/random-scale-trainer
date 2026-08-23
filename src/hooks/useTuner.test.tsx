import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeMicContext, createFakeStream, installGetUserMedia } from '../test/fakeMic'
import { MIC_POLL_MS } from './useMicPitch'
import { IN_TUNE_CENTS, nearestOpenString, useTuner, type TunerAudio } from './useTuner'

/** The one method the tuner asks the engine for. */
const createFakeAudio = (context: AudioContext | null): TunerAudio => ({
  ensureContext: vi.fn(async () => context),
})

/** A frequency that many cents off the given open string. */
const detuned = (hz: number, cents: number) => hz * 2 ** (cents / 1200)

const flush = async () => {
  await act(async () => {})
}

const tick = async (times = 1) => {
  await act(async () => {
    vi.advanceTimersByTime(MIC_POLL_MS * times)
  })
}

describe('nearestOpenString', () => {
  it('measures against the string, not the nearest semitone', () => {
    // Forty cents flat of the A string is still the A string — rounding it onto
    // its own semitone would report a plainly flat string as in tune.
    const { string, cents } = nearestOpenString(detuned(110, -40))

    expect(string.label).toBe('5th string')
    expect(cents).toBeCloseTo(-40, 1)
  })

  it('picks the string a pitch between two is closest to', () => {
    // Either side of the midpoint between the 5th (110) and the 4th (146.83),
    // which is 127 Hz. Well off both, and it still commits to one.
    expect(nearestOpenString(126).string.label).toBe('5th string')
    expect(nearestOpenString(129).string.label).toBe('4th string')
  })
})

describe('useTuner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'mediaDevices')
  })

  it('never asks for the microphone while the panel is shut', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = installGetUserMedia(async () => stream)
    const audio = createFakeAudio(createFakeMicContext(110).context)

    const { result } = renderHook(() => useTuner({ audio, open: false }))
    await flush()

    expect(getUserMedia).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.reading).toBeNull()
  })

  it('names the string and calls a true A in tune', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const audio = createFakeAudio(createFakeMicContext(110).context)

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()

    expect(result.current.status).toBe('listening')

    await tick()

    expect(result.current.reading?.string.label).toBe('5th string')
    expect(result.current.reading?.string.name).toBe('A')
    expect(result.current.reading?.status).toBe('in-tune')
    expect(Math.abs(result.current.reading!.cents)).toBeLessThan(IN_TUNE_CENTS)
    // The pitch heard, named the way a tuner names one.
    expect(result.current.reading?.note).toBe('A2')
  })

  it('reads a flat string as flat', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const audio = createFakeAudio(createFakeMicContext(detuned(110, -30)).context)

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()
    await tick()

    expect(result.current.reading?.string.label).toBe('5th string')
    expect(result.current.reading?.status).toBe('flat')
    expect(result.current.reading!.cents).toBeLessThan(0)
    expect(result.current.reading!.cents).toBeCloseTo(-30, 0)
  })

  it('reads a sharp string as sharp', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const audio = createFakeAudio(createFakeMicContext(detuned(110, 30)).context)

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()
    await tick()

    expect(result.current.reading?.status).toBe('sharp')
    expect(result.current.reading!.cents).toBeGreaterThan(0)
    expect(result.current.reading!.cents).toBeCloseTo(30, 0)
  })

  it('names the low E when it hears one', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const audio = createFakeAudio(createFakeMicContext(82.41).context)

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()
    await tick()

    expect(result.current.reading?.string.label).toBe('6th string')
    expect(result.current.reading?.string.name).toBe('E')
    expect(result.current.reading?.note).toBe('E2')
    expect(result.current.reading?.status).toBe('in-tune')
  })

  /**
   * A plucked string is under the detector's clarity gate within a second — a
   * needle that swung back to nothing with it would be unreadable.
   */
  it('holds the last reading through the silence after the string', async () => {
    const { stream } = createFakeStream()
    installGetUserMedia(async () => stream)
    const { context, analyser } = createFakeMicContext(110)
    const audio = createFakeAudio(context)

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()
    await tick()

    const reading = result.current.reading
    expect(reading?.string.label).toBe('5th string')

    analyser.getFloatTimeDomainData.mockImplementation((target: Float32Array) => target.fill(0))
    await tick(4)

    expect(result.current.reading).toBe(reading)
  })

  it('says so when the microphone is refused', async () => {
    installGetUserMedia(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    })
    const audio = createFakeAudio(createFakeMicContext(110).context)

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()

    expect(result.current.status).toBe('denied')
    expect(result.current.reading).toBeNull()
  })

  it('says so where the browser has no microphone API at all', async () => {
    const audio = createFakeAudio(createFakeMicContext(110).context)

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()

    expect(result.current.status).toBe('unsupported')
  })

  it('asks for nothing when the browser will not open an audio context', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = installGetUserMedia(async () => stream)
    const audio = createFakeAudio(null)

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()

    expect(result.current.status).toBe('unsupported')
    // No context, no analyser — so the permission prompt is never raised.
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('asks for nothing when opening the audio context throws', async () => {
    const { stream } = createFakeStream()
    const getUserMedia = installGetUserMedia(async () => stream)
    const audio: TunerAudio = {
      ensureContext: vi.fn(() => Promise.reject(new Error('no audio here'))),
    }

    const { result } = renderHook(() => useTuner({ audio, open: true }))
    await flush()

    expect(result.current.status).toBe('unsupported')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('gives the microphone back when the panel closes', async () => {
    const { stream, track } = createFakeStream()
    installGetUserMedia(async () => stream)
    const { context, analyser } = createFakeMicContext(110)
    const audio = createFakeAudio(context)

    const { rerender, result } = renderHook(({ open }) => useTuner({ audio, open }), {
      initialProps: { open: true },
    })
    await flush()
    await tick()

    const framesRead = analyser.getFloatTimeDomainData.mock.calls.length
    await act(async () => {
      rerender({ open: false })
    })

    expect(track.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.reading).toBeNull()

    // The poll has to stop with the stream: a timer still running is a timer
    // still reading a released analyser.
    await tick(4)
    expect(analyser.getFloatTimeDomainData.mock.calls.length).toBe(framesRead)
  })

  it('gives the microphone back when the app goes away', async () => {
    const { stream, track } = createFakeStream()
    installGetUserMedia(async () => stream)
    const audio = createFakeAudio(createFakeMicContext(110).context)

    const { unmount } = renderHook(() => useTuner({ audio, open: true }))
    await flush()

    unmount()
    expect(track.stop).toHaveBeenCalled()
  })

  /**
   * The permission prompt can sit open across a close. The stream that finally
   * arrives belongs to a panel nobody is looking at, and nothing else will ever
   * stop it.
   */
  it('releases a stream that arrives after the panel has already closed', async () => {
    const { stream, track } = createFakeStream()
    const pending: ((stream: MediaStream) => void)[] = []
    installGetUserMedia(() => new Promise<MediaStream>((resolve) => pending.push(resolve)))
    const { context, raw } = createFakeMicContext(110)
    const audio = createFakeAudio(context)

    const { rerender } = renderHook(({ open }) => useTuner({ audio, open }), {
      initialProps: { open: true },
    })
    await flush()

    await act(async () => {
      rerender({ open: false })
    })

    await act(async () => {
      pending[0](stream)
    })

    expect(track.stop).toHaveBeenCalled()
    expect(raw.createAnalyser).not.toHaveBeenCalled()
  })
})
