/**
 * How a called note may be spelled. A list rather than a bare union because the
 * shared board's server has to hold the same three — it is plain JS and cannot
 * import this file, so session-scoring.test.ts checks its copy against this one.
 */
export const SPELLING_OPTIONS = ['flat', 'sharp', 'mixed'] as const

export type SpellingPreference = (typeof SPELLING_OPTIONS)[number]

/** A single announced note: pitch class plus the spelling chosen for this call. */
export type NoteCall = {
  pc: number
  /** User-facing name with Unicode accidentals (♭ U+266D / ♯ U+266F). */
  display: string
  /** ASCII key into NOTE_AUDIO_FILES, e.g. 'Db' / 'C#'. */
  audioKey: string
  /** True for the first note drawn from a fresh shuffle bag. */
  cycleStart: boolean
  /** Size of the bag this note was dealt from — the "of 12" in "note 7 of 12".
   * Lets cycle completion be detected even after the pool changes mid-cycle. */
  bagSize: number
  /** The string this call asks for (0 = high e), when string calls are on.
   * Undefined means the note may be played anywhere on the neck. */
  stringIndex?: number
}

export const FLAT_DISPLAY = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const
export const SHARP_DISPLAY = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
export const FLAT_AUDIO = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const
export const SHARP_AUDIO = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export const PITCH_CLASSES = Array.from({ length: 12 }, (_, pc) => pc)

/** Copy of a pitch-class pool, sorted ascending. */
export const sortedPcs = (pcs: readonly number[]) => [...pcs].sort((left, right) => left - right)

export const isNaturalPitchClass = (pc: number) => FLAT_DISPLAY[pc] === SHARP_DISPLAY[pc]

/**
 * Spelling for one announced note. 'mixed' flips a coin per call — the choice
 * is made once, when the note enters the deck, so the hero glyph, NEXT chip,
 * fretboard hint, and spoken audio all agree on the same name.
 */
export const spellNote = (
  pc: number,
  preference: SpellingPreference,
  random: () => number = Math.random,
): { display: string; audioKey: string } => {
  const useSharp = preference === 'sharp' || (preference === 'mixed' && !isNaturalPitchClass(pc) && random() < 0.5)

  return useSharp
    ? { display: SHARP_DISPLAY[pc], audioKey: SHARP_AUDIO[pc] }
    : { display: FLAT_DISPLAY[pc], audioKey: FLAT_AUDIO[pc] }
}
