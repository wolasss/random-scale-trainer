/**
 * The neck, as one model. The fretboard picture, the string a note is called
 * on, and the mic's reading of what a string can sound all read from here, so
 * the drawing and its label cannot drift apart.
 */

/** Standard tuning, high e → low E, by MIDI note number. */
export const STRING_MIDI = [64, 59, 55, 50, 45, 40]
export const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']
export const STRING_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th']
export const STRING_COUNT = STRING_MIDI.length

/** The neck this app draws and calls: open position up to the octave. */
export const MAX_FRET = 12

export const FRETS = Array.from({ length: MAX_FRET + 1 }, (_, fret) => fret)

/** Where a pitch class lives on one string, in 0–MAX_FRET, low fret first. */
export const fretsForPc = (stringIndex: number, pc: number) =>
  FRETS.filter((fret) => (STRING_MIDI[stringIndex] + fret) % 12 === pc)

/** Every string's frets for a pitch class, high e first — the dots on screen. */
export const litFrets = (pc: number) => STRING_MIDI.map((_, stringIndex) => fretsForPc(stringIndex, pc))

/** The actual pitches one string can sound for a pitch class, as MIDI numbers. */
export const midisForPc = (stringIndex: number, pc: number) =>
  fretsForPc(stringIndex, pc).map((fret) => STRING_MIDI[stringIndex] + fret)

/** MIDI number for a detected pitch, in the scientific octave the mic reports. */
export const heardMidi = (heard: { pitchClass: number; octave: number }) =>
  (heard.octave + 1) * 12 + heard.pitchClass

/**
 * Whether the given string can sound that exact pitch anywhere in 0–MAX_FRET.
 * This is a question about pitch and nothing else: a microphone cannot say
 * which string was struck, only what came out of it.
 */
export const carriesPitch = (stringIndex: number, heard: { pitchClass: number; octave: number }) =>
  midisForPc(stringIndex, heard.pitchClass).includes(heardMidi(heard))

/** How a string is named out loud: "5th string (A)". */
export const describeString = (stringIndex: number) =>
  `${STRING_ORDINALS[stringIndex]} string (${STRING_LABELS[stringIndex]})`

/** A fresh shuffled bag of all six string indices — every string comes up. */
export const shuffleStrings = (random: () => number) => {
  const bag = STRING_MIDI.map((_, stringIndex) => stringIndex)
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }

  return bag
}
