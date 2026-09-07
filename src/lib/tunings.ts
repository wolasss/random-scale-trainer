import { FLAT_DISPLAY } from './notes'

/** The frets drawn on the map: open through the octave. */
export const FRETS = Array.from({ length: 13 }, (_, fret) => fret)

const STRING_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'] as const

export type TuningId = 'standard' | 'eflat' | 'dropD' | 'dadgad' | 'openG'

export type Tuning = {
  id: TuningId
  /** Picker text, e.g. 'E♭ standard'. */
  label: string
  /** Prose form, used mid-sentence in the spoken reading: '… in drop D tuning'. */
  name: string
  /** Open notes as MIDI numbers, 1st string (thinnest) → 6th. */
  midi: readonly number[]
}

export const TUNINGS: readonly Tuning[] = [
  { id: 'standard', label: 'Standard', name: 'standard', midi: [64, 59, 55, 50, 45, 40] },
  { id: 'eflat', label: 'E♭ standard', name: 'E♭ standard', midi: [63, 58, 54, 49, 44, 39] },
  { id: 'dropD', label: 'Drop D', name: 'drop D', midi: [64, 59, 55, 50, 45, 38] },
  { id: 'dadgad', label: 'DADGAD', name: 'DADGAD', midi: [62, 57, 55, 50, 45, 38] },
  { id: 'openG', label: 'Open G', name: 'open G', midi: [62, 59, 55, 50, 43, 38] },
] as const

export const DEFAULT_TUNING_ID: TuningId = 'standard'

export const isTuningId = (value: string): value is TuningId => TUNINGS.some((tuning) => tuning.id === value)

/**
 * The tuning behind an id, falling back to standard so no caller has to handle
 * an absent one: an id that no longer names anything is the same situation as
 * a stored value we never wrote, and both mean the neck everyone starts on.
 */
export const findTuning = (id: TuningId): Tuning =>
  TUNINGS.find((tuning) => tuning.id === id) ?? TUNINGS[0]

/**
 * The name written down the left edge of a row. Derived from the open note
 * rather than listed per tuning — the octave is what guitarists case, so the
 * high strings come out lowercase (standard's `e`, DADGAD's `d`) and the low
 * ones stay capital, without five hand-kept label tables to drift apart.
 */
export const stringLabel = (midi: number) => {
  const display = FLAT_DISPLAY[((midi % 12) + 12) % 12]
  return midi >= 60 ? display.toLowerCase() : display
}

/** One drawn row of the neck: which string it is, and where the note sits on it. */
export type NeckString = {
  midi: number
  /** '1st'…'6th' — glued to the string, so a flipped neck still names it right. */
  ordinal: string
  label: string
  /** Frets in 0–12 that sound the called pitch class; empty when none is called. */
  lit: number[]
}

/**
 * One model of where a pitch class lives, in the order the rows are drawn. The
 * dots and the spoken reading are both taken from the same instance, so the
 * picture and its label cannot drift apart — and a left-handed neck reverses
 * this list once, here, rather than in each of them.
 */
export const neckStrings = (tuningId: TuningId, pc: number | null, leftHanded: boolean): NeckString[] => {
  const strings = findTuning(tuningId).midi.map((midi, index) => ({
    midi,
    ordinal: STRING_ORDINALS[index],
    label: stringLabel(midi),
    lit: pc === null ? [] : FRETS.filter((fret) => (midi + fret) % 12 === pc),
  }))

  return leftHanded ? strings.reverse() : strings
}

/**
 * Reads the lit dots out in the order they are drawn, so someone hearing the
 * label can walk the neck in the same order as someone looking at it. Thirteen
 * frets cover every pitch class on every string, so no row is ever silent, and
 * a string whose open note matches also lights the 12th fret.
 */
export const describePositions = (strings: readonly NeckString[]) =>
  strings
    .map((string) => {
      const spoken = string.lit.map((fret) => (fret === 0 ? 'open' : `fret ${fret}`))

      return `${string.ordinal} string (${string.label}) ${spoken.join(' and ')}`
    })
    .join(', ')

/** What the map is a picture of, for the hint line and the idle reading. */
export const describeNeck = (tuningId: TuningId, leftHanded: boolean) =>
  `all six strings, ${findTuning(tuningId).name} tuning${leftHanded ? ', left-handed' : ''}`
