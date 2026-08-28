import { describe, expect, it } from 'vitest'
import {
  CLARITY_THRESHOLD,
  createSilenceGate,
  detectPitch,
  frequencyToPitch,
  SILENCE_ABOVE_FLOOR,
  SILENCE_RMS_MIN,
} from './pitch'

const SAMPLE_RATE = 44100
const FRAME_SIZE = 2048

const fill = (sample: (index: number) => number) => Float32Array.from({ length: FRAME_SIZE }, (_, i) => sample(i))

const sine = (frequency: number, amplitude = 0.5) =>
  fill((index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE))

/** Harmonic-rich on purpose: a string is nothing like a sine. */
const sawtooth = (frequency: number, amplitude = 0.4) =>
  fill((index) => amplitude * (2 * (((index * frequency) / SAMPLE_RATE) % 1) - 1))

/** A note with one partial loud enough to pass for a note of its own. */
const withPartial = (fundamental: number, partial: number, amplitude = 0.5) =>
  fill(
    (index) =>
      amplitude * Math.sin((2 * Math.PI * fundamental * index) / SAMPLE_RATE) +
      amplitude * Math.sin((2 * Math.PI * partial * index) / SAMPLE_RATE),
  )

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

  /**
   * The other half of the same trap, at the top of the range: above ~750 Hz the
   * fundamental's own first-period lobe is already positive at the shortest lag
   * searched, so a detector that treats "positive at minLag" as leftover
   * zero-lag lobe walks straight past the real peak and lands on the 2T
   * subharmonic — an octave low.
   */
  it.each([
    ['G5', 784],
    ['the 24th fret B', 988],
    ['just under the ceiling', 995],
  ])('names a %s sine without dropping it an octave', (_label, frequency) => {
    const reading = detectPitch(sine(frequency), SAMPLE_RATE)

    expect(reading).not.toBeNull()
    // Named first so a failure reads as the octave fold it is, not as a near miss.
    expect(reading!.frequency).toBeGreaterThan(frequency * 0.75)
    expect(reading!.frequency).toBeCloseTo(frequency, 0)
  })

  /**
   * The same trap read the other way round: a low note whose upper partial
   * lands above 750 Hz scores nearly as high at that partial's short lag, and
   * the shortest-tied rule would hand the reading to it — a G2 called as a B5.
   * The partial's score is the giveaway: it has decayed by twice the lag, where
   * a real period's has not.
   */
  it.each([
    ['G2', 98, 980],
    ['D3', 147, 882],
  ])('follows a %s under a partial loud enough to pass for a note', (_label, fundamental, partial) => {
    const reading = detectPitch(withPartial(fundamental, partial), SAMPLE_RATE)

    expect(reading).not.toBeNull()
    expect(reading!.frequency).toBeLessThan(fundamental * 1.5)
    expect(reading!.frequency).toBeCloseTo(fundamental, 0)
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

describe('createSilenceGate', () => {
  // The measured reality this gate exists for: an iPhone's raw microphone put
  // the room at −70 dB and a pluck under −50 dB — both below every absolute
  // floor tried, yet 12 dB apart from each other.
  const ROOM = 0.0003
  const PLUCK = 0.0015

  it('lets a faint pluck clear a fainter room', () => {
    const gate = createSilenceGate()
    // Long enough for the slow drift to settle on the room from below.
    for (let frame = 0; frame < 400; frame += 1) {
      gate.observe(ROOM)
    }

    const cutoff = gate.observe(PLUCK)
    expect(cutoff).toBeLessThan(PLUCK)
    // ...while the room itself never clears its own bar.
    expect(cutoff).toBeGreaterThan(ROOM)
  })

  it('lets the first frame through — a capture must not open deaf', () => {
    const gate = createSilenceGate()
    expect(gate.observe(0.5)).toBeLessThan(0.5)
  })

  it('snaps the floor back down after one quiet frame', () => {
    const gate = createSilenceGate()
    // Sustained sound long enough to drift the floor well above the room...
    for (let frame = 0; frame < 400; frame += 1) {
      gate.observe(PLUCK)
    }
    expect(gate.floor()).toBeGreaterThan(ROOM)

    // ...and one frame of the room between notes takes it straight back.
    gate.observe(ROOM)
    expect(gate.floor()).toBe(ROOM)
  })

  it('drifts up slowly enough that a held note cannot eat the next one', () => {
    const gate = createSilenceGate()
    // A settled room, then two seconds of sustained playing at the poll rate...
    for (let frame = 0; frame < 400; frame += 1) {
      gate.observe(ROOM)
    }
    let cutoff = 0
    for (let frame = 0; frame < 40; frame += 1) {
      cutoff = gate.observe(PLUCK)
    }

    // ...and the same pluck still clears the cutoff.
    expect(cutoff).toBeLessThan(PLUCK)
  })

  it('never reports digital silence as a floor to stand on', () => {
    const gate = createSilenceGate()
    expect(gate.observe(0)).toBe(SILENCE_RMS_MIN * SILENCE_ABOVE_FLOOR)
    expect(gate.floor()).toBe(SILENCE_RMS_MIN)
  })
})

describe('detectPitch with a gate-supplied cutoff', () => {
  it('hears a note an absolute floor would have eaten', () => {
    // The iPhone pluck: −56 dB, clean. The default cutoff calls it silence;
    // the cutoff a gate returns over a −70 dB room does not.
    const faint = sine(196, 0.0022)

    expect(detectPitch(faint, SAMPLE_RATE)).toBeNull()
    const reading = detectPitch(faint, SAMPLE_RATE, 0.0003 * SILENCE_ABOVE_FLOOR)
    expect(reading).not.toBeNull()
    expect(reading!.frequency).toBeCloseTo(196, 0)
  })
})
