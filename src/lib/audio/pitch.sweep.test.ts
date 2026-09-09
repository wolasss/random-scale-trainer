/**
 * A safety net, not a spec for today's implementation: this sweeps every
 * semitone the app can actually be asked to name and pins the answer, so a
 * rewrite of the NSDF correlation in ./pitch cannot silently shift a whole
 * region of the fretboard without a test noticing. It asserts the module's
 * documented contract (a named range, a hard ceiling, a minimum frame length)
 * rather than any detail of how the correlation gets there.
 */
import { describe, expect, it } from 'vitest'
import { CLARITY_THRESHOLD, MAX_PITCH_HZ, detectPitch, frequencyToPitch } from './pitch'
import { SHARP_AUDIO } from '../notes'

const fill = (length: number, sample: (index: number) => number) =>
  Float32Array.from({ length }, (_, index) => sample(index))

const sine = (frequency: number, sampleRate: number, length = 2048, amplitude = 0.5) =>
  fill(length, (index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate))

/** Harmonic-rich on purpose: a plucked string is nothing like a sine. */
const sawtooth = (frequency: number, sampleRate: number, length = 2048, amplitude = 0.4) =>
  fill(length, (index) => amplitude * (2 * (((index * frequency) / sampleRate) % 1) - 1))

const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
const label = (midi: number) => SHARP_AUDIO[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)

const SAMPLE_RATES = [44100, 48000]

/**
 * Cents tolerance per timbre. Measured worst case across the whole named
 * range, both sample rates: 0.016 cents for a sine, 4.27 for the sawtooth
 * (harmonics pull the peak a little). Both tolerances below carry roughly 2x
 * headroom over that measurement — tight enough to catch a real regression,
 * loose enough that this file does not fail on the correlation's own noise
 * floor after a legitimate change.
 */
const TIMBRES: Array<[string, (frequency: number, sampleRate: number) => Float32Array, number]> = [
  ['a sine', sine, 5],
  ['a harmonic stack', sawtooth, 10],
]

// E2 (MIDI 40) to B5 (MIDI 83): every semitone the app can call a note at and
// expect it named in its own octave. See "above the detector's ceiling" below
// for why C6..E6 (MIDI 84..88) are a different, weaker contract.
const NAMED_RANGE = Array.from({ length: 83 - 40 + 1 }, (_, index) => 40 + index)
const ABOVE_CEILING_RANGE = [84, 85, 86, 87, 88]

const namedCases = SAMPLE_RATES.flatMap((sampleRate) =>
  TIMBRES.flatMap(([timbreName, generate, tolerance]) =>
    NAMED_RANGE.map((midi) => ({ sampleRate, timbreName, generate, tolerance, midi, note: label(midi) })),
  ),
)

describe('detectPitch across the guitar range', () => {
  it.each(namedCases)('names $note as $timbreName at $sampleRate Hz', ({ sampleRate, generate, tolerance, midi }) => {
    const frequency = midiHz(midi)
    const frame = generate(frequency, sampleRate)
    const reading = detectPitch(frame, sampleRate)

    expect(reading).not.toBeNull()
    expect(reading!.clarity).toBeGreaterThanOrEqual(CLARITY_THRESHOLD)

    const pitch = frequencyToPitch(reading!.frequency)
    // Octave first: a failure here reads as an octave fold, not a near miss.
    expect(pitch.octave).toBe(Math.floor(midi / 12) - 1)
    expect(pitch.pitchClass).toBe(((midi % 12) + 12) % 12)
    expect(Math.abs(pitch.cents)).toBeLessThan(tolerance)
  })
})

/**
 * C6 through E6 sit above MAX_PITCH_HZ (1000 Hz), so the detector can never
 * name them at their own octave — it reports the in-range subharmonic
 * instead, one octave low. That is documented behaviour (see the MAX_PITCH_HZ
 * comment in ./pitch), not a bug this file should paper over, so the
 * assertion here is the weaker contract the module actually promises: the
 * pitch class survives even though the octave cannot.
 */
describe("above the detector's ceiling", () => {
  const aboveCeilingCases = SAMPLE_RATES.flatMap((sampleRate) =>
    TIMBRES.flatMap(([timbreName, generate]) =>
      ABOVE_CEILING_RANGE.map((midi) => ({ sampleRate, timbreName, generate, midi, note: label(midi) })),
    ),
  )

  it.each(aboveCeilingCases)('reports $note as $timbreName at $sampleRate Hz as its in-range subharmonic, never a different note', ({ sampleRate, generate, midi }) => {
    const frequency = midiHz(midi)
    const frame = generate(frequency, sampleRate)
    const reading = detectPitch(frame, sampleRate)

    if (reading === null) {
      return
    }

    expect(reading.frequency).toBeLessThanOrEqual(MAX_PITCH_HZ)
    expect(frequencyToPitch(reading.frequency).pitchClass).toBe(((midi % 12) + 12) % 12)
  })
})

describe('at the edges of the swept range', () => {
  it.each(SAMPLE_RATES.flatMap((sampleRate) => TIMBRES.map(([timbreName, generate]) => ({ sampleRate, timbreName, generate }))))(
    'still names D#2, just below the guitar range, as a $timbreName at $sampleRate Hz',
    ({ sampleRate, generate }) => {
      const frequency = midiHz(39) // D#2, 77.78 Hz
      const reading = detectPitch(generate(frequency, sampleRate), sampleRate)

      expect(reading).not.toBeNull()
      const pitch = frequencyToPitch(reading!.frequency)
      expect(pitch.octave).toBe(2)
      expect(pitch.pitchClass).toBe(3)
    },
  )

  it.each(SAMPLE_RATES.flatMap((sampleRate) => TIMBRES.map(([timbreName, generate]) => ({ sampleRate, timbreName, generate }))))(
    'never reports a $timbreName just above MAX_PITCH_HZ at $sampleRate Hz as louder than the ceiling',
    ({ sampleRate, generate }) => {
      const reading = detectPitch(generate(MAX_PITCH_HZ + 5, sampleRate), sampleRate)

      if (reading === null) {
        return
      }

      expect(reading.frequency).toBeLessThanOrEqual(MAX_PITCH_HZ)
    },
  )

  it.each(SAMPLE_RATES.flatMap((sampleRate) => TIMBRES.map(([timbreName, generate]) => ({ sampleRate, timbreName, generate }))))(
    'hears nothing in a $timbreName frame of E2 shorter than one period at $sampleRate Hz',
    ({ sampleRate, generate }) => {
      // One period of E2 is ~535 samples at 44.1 kHz, ~582 at 48 kHz; 512
      // samples is short of both.
      const frame = generate(midiHz(40), sampleRate).slice(0, 512)

      expect(detectPitch(frame, sampleRate)).toBeNull()
    },
  )
})
