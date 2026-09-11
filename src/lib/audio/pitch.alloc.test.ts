/**
 * The detector's scratch buffers, from two angles.
 *
 * `detectPitch` runs on a 50 ms poll for as long as the mic is open, so every
 * array it allocates per frame is garbage the main thread has to collect while
 * the user is playing. The buffers are reused across calls; reuse is only safe
 * if a call cannot see anything the previous one left behind, so the second
 * test here re-runs deliberately mixed frame shapes and pins that every one of
 * them keeps reading exactly what it read on its own first, clean call.
 *
 * The first test is a stopwatch, not a gate: it prints ms/frame so a change to
 * the correlation can be measured, and asserts nothing about the number. The
 * per-frame budget already has an owner — the `detectPitch performance` test in
 * ./pitch.test.ts — and a second wall-clock assertion would only add another
 * way for a busy CI host to fail a run that changed nothing.
 */
import { describe, expect, it } from 'vitest'
import { detectPitch } from './pitch'

const fill = (length: number, sample: (index: number) => number) =>
  Float32Array.from({ length }, (_, index) => sample(index))

const sine = (frequency: number, sampleRate: number, length = 2048, amplitude = 0.5) =>
  fill(length, (index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate))

/** Harmonic-rich on purpose: a plucked string is nothing like a sine. */
const sawtooth = (frequency: number, sampleRate: number, length = 2048, amplitude = 0.4) =>
  fill(length, (index) => amplitude * (2 * (((index * frequency) / sampleRate) % 1) - 1))

const SAMPLE_RATE = 48000

describe('detectPitch allocation', () => {
  it('reports the cost of a mic frame', () => {
    // The real workload: 2048-sample frames at 48 kHz that all clear the gates,
    // so every call pays for the full correlation rather than bailing early.
    // Distinct frames so nothing can be memoised away.
    const frames = [82.41, 110, 146.83, 196].flatMap((frequency) => [
      sine(frequency, SAMPLE_RATE),
      sawtooth(frequency, SAMPLE_RATE),
    ])

    for (let index = 0; index < 20; index += 1) {
      detectPitch(frames[index % frames.length], SAMPLE_RATE)
    }

    const runs = 1000
    const started = performance.now()
    let read = 0
    for (let index = 0; index < runs; index += 1) {
      if (detectPitch(frames[index % frames.length], SAMPLE_RATE)) {
        read += 1
      }
    }
    const msPerFrame = (performance.now() - started) / runs

    console.info(`detectPitch: ${msPerFrame.toFixed(4)} ms/frame over ${runs} frames`)
    expect(read).toBe(runs)
  })

  it('reads the same frame the same way whatever ran before it', () => {
    // Deliberately mixed shapes: different lengths mean different transform
    // sizes and different tails to zero, different sample rates mean different
    // lag ranges. A scratch buffer left dirty by the call before shows up here
    // and nowhere else.
    const cases = [
      { name: '2048 @ 48k', frame: sawtooth(110, 48000, 2048), sampleRate: 48000 },
      { name: '2048 @ 44.1k', frame: sine(196, 44100, 2048), sampleRate: 44100 },
      { name: '1024 @ 44.1k', frame: sawtooth(246.94, 44100, 1024), sampleRate: 44100 },
      { name: '4096 @ 48k', frame: sine(82.41, 48000, 4096), sampleRate: 48000 },
      { name: 'silence', frame: new Float32Array(2048), sampleRate: 48000 },
    ]

    // Each one's own reading, taken in order before anything repeats.
    const first = cases.map(({ frame, sampleRate }) => detectPitch(frame, sampleRate))
    expect(first[4]).toBeNull()
    expect(first.slice(0, 4).every((reading) => reading !== null)).toBe(true)

    // Now the same frames round-robin in a different order, hundreds of times.
    const order = [3, 0, 4, 2, 1, 3, 2, 0]
    for (let index = 0; index < 400; index += 1) {
      const which = order[index % order.length]
      const { name, frame, sampleRate } = cases[which]
      expect(detectPitch(frame, sampleRate), name).toEqual(first[which])
    }
  })
})
