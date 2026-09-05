import { describe, expect, it } from 'vitest'
import { autocorrelate, fftInPlace } from './fft'

/** Seeded so nothing here can flake. */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const noise = (length: number, seed: number) => {
  const random = mulberry32(seed)
  return Float32Array.from({ length }, () => random() * 2 - 1)
}

const sine = (length: number, frequency: number, sampleRate = 44100) =>
  Float32Array.from({ length }, (_, index) => 0.5 * Math.sin((2 * Math.PI * frequency * index) / sampleRate))

/** The textbook definition, straight from the sum — the thing under test is the fast way to the same numbers. */
const naiveDft = (values: number[]) =>
  values.map((_, bin) => {
    let re = 0
    let im = 0
    for (let index = 0; index < values.length; index += 1) {
      const angle = (-2 * Math.PI * bin * index) / values.length
      re += values[index] * Math.cos(angle)
      im += values[index] * Math.sin(angle)
    }

    return { re, im }
  })

/** The double loop the FFT replaces. */
const naiveAutocorrelation = (frame: Float32Array, lag: number) => {
  let sum = 0
  for (let index = 0; index < frame.length - lag; index += 1) {
    sum += frame[index] * frame[index + lag]
  }

  return sum
}

describe('fftInPlace', () => {
  it.each([2, 8, 16, 64])('matches a direct DFT of length %i', (length) => {
    const random = mulberry32(20260905 + length)
    const samples = Array.from({ length }, () => random() * 2 - 1)
    const expected = naiveDft(samples)

    const re = Float64Array.from(samples)
    const im = new Float64Array(length)
    fftInPlace(re, im)

    for (let bin = 0; bin < length; bin += 1) {
      expect(re[bin]).toBeCloseTo(expected[bin].re, 9)
      expect(im[bin]).toBeCloseTo(expected[bin].im, 9)
    }
  })

  it('leaves a single sample alone', () => {
    const re = Float64Array.from([3])
    const im = Float64Array.from([-1])
    fftInPlace(re, im)

    expect(Array.from(re)).toEqual([3])
    expect(Array.from(im)).toEqual([-1])
  })

  it('refuses a length that is not a power of two', () => {
    expect(() => fftInPlace(new Float64Array(6), new Float64Array(6))).toThrow(/power of two/)
  })

  it('refuses mismatched real and imaginary parts', () => {
    expect(() => fftInPlace(new Float64Array(8), new Float64Array(4))).toThrow(/same length/)
  })
})

describe('autocorrelate', () => {
  it('matches the direct sum at every lag of a noise frame', () => {
    const frame = noise(2048, 20260905)
    const maxLag = 630
    const correlation = autocorrelate(frame, maxLag)

    // Scaled against lag 0, which is the frame's own energy: an absolute
    // tolerance would mean nothing without knowing how loud the frame is.
    const scale = naiveAutocorrelation(frame, 0)
    for (let lag = 0; lag <= maxLag; lag += 1) {
      expect(Math.abs(correlation[lag] - naiveAutocorrelation(frame, lag)) / scale).toBeLessThan(1e-6)
    }
  })

  it('matches the direct sum at every lag of a sine', () => {
    const frame = sine(2048, 110)
    const maxLag = 630
    const correlation = autocorrelate(frame, maxLag)

    const scale = naiveAutocorrelation(frame, 0)
    for (let lag = 0; lag <= maxLag; lag += 1) {
      expect(Math.abs(correlation[lag] - naiveAutocorrelation(frame, lag)) / scale).toBeLessThan(1e-6)
    }
  })

  it('pads a frame whose length is not a power of two', () => {
    const frame = noise(1500, 424242)
    const maxLag = 500
    const correlation = autocorrelate(frame, maxLag)

    const scale = naiveAutocorrelation(frame, 0)
    for (let lag = 0; lag <= maxLag; lag += 1) {
      expect(Math.abs(correlation[lag] - naiveAutocorrelation(frame, lag)) / scale).toBeLessThan(1e-6)
    }
  })

  it('keeps the longest lag free of the wrap-around the transform would otherwise fold in', () => {
    // maxLag is over half the frame, so a transform padded only to the frame's
    // own length would alias the tail of the correlation onto its own head.
    const frame = noise(1024, 7)
    const maxLag = 900
    const correlation = autocorrelate(frame, maxLag)

    const scale = naiveAutocorrelation(frame, 0)
    expect(Math.abs(correlation[maxLag] - naiveAutocorrelation(frame, maxLag)) / scale).toBeLessThan(1e-6)
  })
})
