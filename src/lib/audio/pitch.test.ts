import { describe, expect, it } from 'vitest'
import { CLARITY_THRESHOLD, detectPitch, frequencyToPitch } from './pitch'

const SAMPLE_RATE = 44100
const FRAME_SIZE = 2048

const fill = (sample: (index: number) => number) => Float32Array.from({ length: FRAME_SIZE }, (_, i) => sample(i))

const sine = (frequency: number, amplitude = 0.5) =>
  fill((index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE))

/** Harmonic-rich on purpose: a string is nothing like a sine. */
const sawtooth = (frequency: number, amplitude = 0.4) =>
  fill((index) => amplitude * (2 * (((index * frequency) / SAMPLE_RATE) % 1) - 1))

/** Seeded so the "noise is not a note" case can never flake. */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

describe('detectPitch', () => {
  it.each([
    ['low E', 82.41, 4],
    ['A2', 110, 9],
    ['G3', 196, 7],
    ['A4', 440, 9],
  ])('names a %s sine', (_label, frequency, pitchClass) => {
    const reading = detectPitch(sine(frequency), SAMPLE_RATE)

    expect(reading).not.toBeNull()
    expect(reading!.clarity).toBeGreaterThanOrEqual(CLARITY_THRESHOLD)
    expect(reading!.frequency).toBeCloseTo(frequency, 0)

    const pitch = frequencyToPitch(reading!.frequency)
    expect(pitch.pitchClass).toBe(pitchClass)
    expect(Math.abs(pitch.cents)).toBeLessThan(15)
  })

  it('follows the fundamental of a harmonic-rich tone, not one of its harmonics', () => {
    const reading = detectPitch(sawtooth(146.83), SAMPLE_RATE)

    expect(reading).not.toBeNull()
    expect(reading!.frequency).toBeCloseTo(146.83, 0)
    expect(frequencyToPitch(reading!.frequency).pitchClass).toBe(2)
  })

  /**
   * The trap the octave rule exists for: a signal that repeats every T also
   * repeats every 2T, so a detector that simply takes the tallest peak reports
   * an A2 for an A3 about half the time.
   */
  it('does not report a note an octave below the one played', () => {
    const reading = detectPitch(sine(220), SAMPLE_RATE)

    expect(reading).not.toBeNull()
    expect(reading!.frequency).toBeGreaterThan(200)
    expect(reading!.frequency).toBeLessThan(240)
  })

  it('hears nothing in silence', () => {
    expect(detectPitch(new Float32Array(FRAME_SIZE), SAMPLE_RATE)).toBeNull()
  })

  it('hears nothing in a frame too quiet to be a note', () => {
    expect(detectPitch(sine(196, 0.001), SAMPLE_RATE)).toBeNull()
  })

  it('hears nothing in noise', () => {
    const random = mulberry32(20260817)
    expect(detectPitch(fill(() => random() - 0.5), SAMPLE_RATE)).toBeNull()
  })

  it('hears nothing below the guitar range', () => {
    // A rumble is a real periodic signal — it is just not anything the player
    // can have fretted.
    expect(detectPitch(sine(45), SAMPLE_RATE)).toBeNull()
    expect(detectPitch(sine(30), SAMPLE_RATE)).toBeNull()
  })

  it('hears nothing in a frame too short to hold a period', () => {
    expect(detectPitch(sine(196).slice(0, 32), SAMPLE_RATE)).toBeNull()
  })
})

describe('frequencyToPitch', () => {
  it('is exact at concert A', () => {
    expect(frequencyToPitch(440)).toEqual({ pitchClass: 9, cents: 0, octave: 4 })
  })

  it('names middle C', () => {
    expect(frequencyToPitch(261.63).pitchClass).toBe(0)
  })

  it('separates the same note in two octaves', () => {
    // Low E and the E an octave above it: one pitch class, two octaves, which
    // is the whole of what the octaves bonus grades on.
    expect(frequencyToPitch(82.41)).toMatchObject({ pitchClass: 4, octave: 2 })
    expect(frequencyToPitch(164.81)).toMatchObject({ pitchClass: 4, octave: 3 })
  })

  it('turns the octave over at C, not at A', () => {
    // The MIDI convention: B3 and the C above it are a semitone and an octave
    // apart, so a B and the C over it must never read as the same octave.
    expect(frequencyToPitch(246.94)).toMatchObject({ pitchClass: 11, octave: 3 })
    expect(frequencyToPitch(261.63)).toMatchObject({ pitchClass: 0, octave: 4 })
  })

  it('reports how flat a detuned string is', () => {
    // A quarter-tone below A4 — still an A, and visibly under it.
    const pitch = frequencyToPitch(440 * Math.pow(2, -25 / 1200))

    expect(pitch.pitchClass).toBe(9)
    expect(pitch.cents).toBeCloseTo(-25, 1)
  })

  it('rounds to the nearer semitone rather than the lower one', () => {
    // 60 cents above A4 is a B♭, sixty cents under it.
    const pitch = frequencyToPitch(440 * Math.pow(2, 60 / 1200))

    expect(pitch.pitchClass).toBe(10)
    expect(pitch.cents).toBeCloseTo(-40, 1)
  })
})
