/**
 * Monophonic pitch detection, hand-rolled so the app keeps its zero-runtime-
 * dependency promise. Pure functions over a frame of samples: no DOM, no Web
 * Audio, nothing to mock but the numbers.
 *
 * The method is McLeod's normalised square difference function (NSDF) — plain
 * autocorrelation divided by the energy under the two windows it compares, so
 * the peak height is a periodicity score between -1 and 1 rather than a level
 * that shrinks with every extra sample of lag. That score is what the caller
 * gates on: a guitar string reads near 1, a room reads near nothing.
 */

/**
 * The guitar's range with headroom: low E is 82.4 Hz, the 24th fret's B is 988.
 *
 * The floor is a real gate — a rumble slower than this has no period inside the
 * search and reads as nothing. The ceiling only bounds the search: a whistle at
 * 2.5 kHz genuinely repeats every third cycle too, so it can still be named as
 * the subharmonic that lands in range. Nothing on a fretboard sounds like that,
 * which is the only reason that is acceptable.
 */
export const MIN_PITCH_HZ = 70
export const MAX_PITCH_HZ = 1000

/** Below this RMS the frame is room tone, and correlating it only finds noise. */
export const SILENCE_RMS = 0.01

/**
 * How periodic a frame has to be before it is called a note. Deliberately
 * strict: a wrong note in the readout is worse than a missed one, and the
 * whole point of the mic is to be believed.
 */
export const CLARITY_THRESHOLD = 0.9

/**
 * The octave trap. A signal that repeats every T also repeats every 2T, 3T…,
 * and those peaks score just as high — so the tallest peak is as likely to be
 * a subharmonic as the fundamental. Any peak within this fraction of the best
 * is treated as tied with it, and the shortest lag among the tied peaks wins.
 */
const OCTAVE_TIE_FRACTION = 0.9

export type PitchReading = {
  frequency: number
  /** The NSDF peak: 1 is perfectly periodic, 0 is not periodic at all. */
  clarity: number
}

/** Positive-region maxima, ascending by lag — one per lobe, not per wiggle. */
const findKeyMaxima = (nsdf: Float32Array, minLag: number, maxLag: number): number[] => {
  let lag = minLag
  // The lobe around zero lag is the signal correlating with itself; whatever is
  // left of it at minLag is not a period and has to be walked past first.
  while (lag <= maxLag && nsdf[lag] > 0) {
    lag += 1
  }

  const peaks: number[] = []
  while (lag <= maxLag) {
    while (lag <= maxLag && nsdf[lag] <= 0) {
      lag += 1
    }

    if (lag > maxLag) {
      break
    }

    // One maximum per positive lobe: ripples on the flank of a real peak share
    // its lobe, so they can never be mistaken for periods of their own.
    let peak = lag
    while (lag <= maxLag && nsdf[lag] > 0) {
      if (nsdf[lag] > nsdf[peak]) {
        peak = lag
      }

      lag += 1
    }

    peaks.push(peak)
  }

  return peaks
}

/** Sub-sample peak position from the three samples around it — worth ~4 cents. */
const interpolatePeak = (nsdf: Float32Array, lag: number, minLag: number, maxLag: number): number => {
  if (lag <= minLag || lag >= maxLag) {
    return lag
  }

  const before = nsdf[lag - 1]
  const at = nsdf[lag]
  const after = nsdf[lag + 1]
  const curvature = before - 2 * at + after

  return curvature === 0 ? lag : lag + (before - after) / (2 * curvature)
}

/**
 * The pitch of one frame of samples, or null when there isn't one — silence,
 * noise, a chord, or anything else the gates above reject.
 */
export function detectPitch(frame: Float32Array, sampleRate: number): PitchReading | null {
  const size = frame.length

  let sumOfSquares = 0
  for (let index = 0; index < size; index += 1) {
    sumOfSquares += frame[index] * frame[index]
  }

  if (Math.sqrt(sumOfSquares / size) < SILENCE_RMS) {
    return null
  }

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_PITCH_HZ))
  // Half the frame is the longest lag worth trusting: past that the two windows
  // being compared overlap in too few samples to mean anything.
  const maxLag = Math.min(Math.floor(size / 2), Math.ceil(sampleRate / MIN_PITCH_HZ))
  if (maxLag <= minLag + 1) {
    return null
  }

  const nsdf = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0
    let energy = 0
    for (let index = 0; index < size - lag; index += 1) {
      const left = frame[index]
      const right = frame[index + lag]
      correlation += left * right
      energy += left * left + right * right
    }

    nsdf[lag] = energy > 0 ? (2 * correlation) / energy : 0
  }

  const peaks = findKeyMaxima(nsdf, minLag, maxLag)
  if (peaks.length === 0) {
    return null
  }

  let best = peaks[0]
  for (const peak of peaks) {
    if (nsdf[peak] > nsdf[best]) {
      best = peak
    }
  }

  const tieCutoff = nsdf[best] * OCTAVE_TIE_FRACTION
  const chosen = peaks.find((peak) => nsdf[peak] >= tieCutoff) ?? best

  const clarity = Math.min(1, nsdf[chosen])
  if (clarity < CLARITY_THRESHOLD) {
    return null
  }

  const frequency = sampleRate / interpolatePeak(nsdf, chosen, minLag, maxLag)
  if (!Number.isFinite(frequency) || frequency < MIN_PITCH_HZ || frequency > MAX_PITCH_HZ) {
    return null
  }

  return { frequency, clarity }
}

/**
 * A frequency as a pitch class plus how far off it is, in cents. Pitch classes
 * use the same convention as src/lib/notes.ts — 0 is C — which is what lets a
 * heard note be compared with a called one.
 *
 * The octave follows the MIDI convention, so A4 = 440 Hz is octave 4 and the
 * octave turns over at C. It is the octave of the *pitch that was heard*, and
 * `OCTAVE_TIE_FRACTION` above is the reason it can be wrong: the tie rule makes
 * a subharmonic unlikely, not impossible. Anything grading on the octave has to
 * be able to survive a wrong one.
 */
export function frequencyToPitch(frequency: number): { pitchClass: number; cents: number; octave: number } {
  const midi = 69 + 12 * Math.log2(frequency / 440)
  const nearest = Math.round(midi)

  return {
    pitchClass: ((nearest % 12) + 12) % 12,
    cents: (midi - nearest) * 100,
    octave: Math.floor(nearest / 12) - 1,
  }
}
