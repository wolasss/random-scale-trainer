/**
 * Everything the neck is drawn from: which strings are open to what, what they
 * are called, where the inlays are cut, and which frets sound a pitch class.
 *
 * The card renders one model per (tuning, capo, pitch class), so the picture
 * and its spoken label are always the same instance and cannot drift apart.
 */

/** Frets drawn per row, nut cell included. The `.fret-row` grid in index.css
 *  is authored to this same count — a capo moves the window, not its width. */
export const FRET_SPAN = 13

const FRET_OFFSETS = Array.from({ length: FRET_SPAN }, (_, offset) => offset)

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'] as const
const COUNT_WORDS: Record<number, string> = { 4: 'four', 5: 'five', 6: 'six' }

export type TuningId = 'standard' | 'drop-d' | 'eb-standard' | 'dadgad' | 'open-g' | 'bass-standard'

export type Tuning = {
  id: TuningId
  /** The picker's text. */
  label: string
  /** The prose name read out in the accessible label. */
  reading: string
  /** Open strings, highest-sounding first, by MIDI note number. */
  openMidi: readonly number[]
  /** String names in that same order; case carries the octave, as guitarists write them. */
  labels: readonly string[]
}

export const TUNINGS: readonly Tuning[] = [
  {
    id: 'standard',
    label: 'Standard',
    reading: 'standard tuning',
    openMidi: [64, 59, 55, 50, 45, 40],
    labels: ['e', 'B', 'G', 'D', 'A', 'E'],
  },
  {
    id: 'drop-d',
    label: 'Drop D',
    reading: 'Drop D',
    openMidi: [64, 59, 55, 50, 45, 38],
    labels: ['e', 'B', 'G', 'D', 'A', 'D'],
  },
  {
    id: 'eb-standard',
    label: 'E♭ standard',
    reading: 'E♭ standard',
    openMidi: [63, 58, 54, 49, 44, 39],
    labels: ['e♭', 'B♭', 'G♭', 'D♭', 'A♭', 'E♭'],
  },
  {
    id: 'dadgad',
    label: 'DADGAD',
    reading: 'DADGAD',
    openMidi: [62, 57, 55, 50, 45, 38],
    labels: ['d', 'A', 'G', 'D', 'A', 'D'],
  },
  {
    id: 'open-g',
    label: 'Open G',
    reading: 'Open G',
    openMidi: [62, 59, 55, 50, 43, 38],
    labels: ['d', 'B', 'G', 'D', 'G', 'D'],
  },
  {
    id: 'bass-standard',
    label: 'Bass (4-string)',
    reading: 'bass standard tuning',
    openMidi: [43, 38, 33, 28],
    labels: ['G', 'D', 'A', 'E'],
  },
]

export const DEFAULT_TUNING_ID: TuningId = 'standard'

/** How far up the neck a capo may be clamped, as offered by the picker. */
export const CAPO_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const

export const isTuningId = (value: unknown): value is TuningId =>
  TUNINGS.some((tuning) => tuning.id === value)

export const isCapo = (value: unknown): boolean =>
  typeof value === 'number' && (CAPO_OPTIONS as readonly number[]).includes(value)

/** Unknown ids resolve to standard, so a stale choice still draws a neck. */
export const findTuning = (id: string): Tuning =>
  TUNINGS.find((tuning) => tuning.id === id) ?? TUNINGS[0]

/**
 * Classic inlay markers, drawn on the string boundary below the middle row so
 * singles sit on the neck's center line and the octave gets a symmetric pair.
 *
 * They are cut into the wood, so they key off the absolute fret and never move
 * with a capo — but a fret at or behind the capo is hidden under it, and a
 * marker drawn in the nut cell would read as part of the capo instead.
 */
export function hasInlay(stringCount: number, stringIndex: number, fret: number, capo = 0) {
  if (fret <= capo) return false

  const middle = Math.floor((stringCount - 1) / 2)
  if (fret === 12 || fret === 24) return stringIndex === middle - 1 || stringIndex === middle + 1

  return stringIndex === middle && [3, 5, 7, 9, 15, 17, 19, 21].includes(fret)
}

export type NeckString = {
  label: string
  ordinal: string
  /** Absolute fret numbers in the drawn window that sound the pitch class. */
  lit: number[]
}

export type NeckModel = {
  /** The drawn window, `capo … capo + 12`; the first entry is the nut cell. */
  frets: number[]
  strings: NeckString[]
  /** How the neck itself reads — "all six strings, standard tuning, capo 3". */
  summary: string
  /** The lit positions read out in the order they are drawn; '' when idle. */
  reading: string
}

/**
 * One model of where a pitch class lives on a given neck.
 *
 * A capo is a moving nut, not a transposition: a note stays at the fret it
 * always sat at, but only frets above the capo are reachable, so the window
 * starts at the capo and a position behind it reappears an octave higher.
 */
export function neckModel(tuning: Tuning, capo: number, pc: number | null): NeckModel {
  const frets = FRET_OFFSETS.map((offset) => capo + offset)

  const strings: NeckString[] = tuning.openMidi.map((midi, stringIndex) => ({
    label: tuning.labels[stringIndex],
    ordinal: ORDINALS[stringIndex],
    lit: pc === null ? [] : frets.filter((fret) => (midi + fret) % 12 === pc),
  }))

  const count = COUNT_WORDS[strings.length] ?? String(strings.length)
  const summary = `all ${count} strings, ${tuning.reading}${capo > 0 ? `, capo ${capo}` : ''}`

  // Read out high string first, so someone hearing the label walks the neck in
  // the same order as someone looking at it. A string fretted at the capo is
  // sounding open, capo or not, and is called that.
  const reading =
    pc === null
      ? ''
      : strings
          .map((string) => {
            const spoken = string.lit.map((fret) => (fret === capo ? 'open' : `fret ${fret}`))

            return `${string.ordinal} string (${string.label}) ${spoken.join(' and ')}`
          })
          .join(', ')

  return { frets, strings, summary, reading }
}
