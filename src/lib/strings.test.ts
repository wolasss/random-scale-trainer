import { describe, expect, it } from 'vitest'
import {
  carriesPitch,
  describeString,
  fretsForPc,
  heardMidi,
  litFrets,
  MAX_FRET,
  midisForPc,
  shuffleStrings,
  STRING_COUNT,
  STRING_MIDI,
} from './strings'

const PITCH_CLASSES = Array.from({ length: 12 }, (_, pc) => pc)
const STRINGS = Array.from({ length: STRING_COUNT }, (_, stringIndex) => stringIndex)

describe('fretsForPc', () => {
  it('finds every pitch class on every string within the first twelve frets', () => {
    for (const stringIndex of STRINGS) {
      for (const pc of PITCH_CLASSES) {
        const frets = fretsForPc(stringIndex, pc)
        expect(frets.length).toBeGreaterThan(0)
        expect(frets.every((fret) => fret >= 0 && fret <= MAX_FRET)).toBe(true)
      }
    }
  })

  it('lights the 12th fret too when the open string carries the note', () => {
    // 6th string, open E.
    expect(fretsForPc(5, 4)).toEqual([0, 12])
    expect(fretsForPc(5, 5)).toEqual([1])
  })

  it('litFrets reads the same neck, high e first', () => {
    expect(litFrets(0)).toEqual(STRINGS.map((stringIndex) => fretsForPc(stringIndex, 0)))
    expect(litFrets(0)[4]).toEqual([3]) // C at the 5th string, 3rd fret
  })
})

describe('midisForPc', () => {
  it('is the open string plus each lit fret', () => {
    for (const stringIndex of STRINGS) {
      for (const pc of PITCH_CLASSES) {
        expect(midisForPc(stringIndex, pc)).toEqual(
          fretsForPc(stringIndex, pc).map((fret) => STRING_MIDI[stringIndex] + fret),
        )
      }
    }
  })
})

describe('heardMidi', () => {
  it('reads the mic octave the way MIDI numbers it', () => {
    expect(heardMidi({ pitchClass: 9, octave: 4 })).toBe(69) // A440
    expect(heardMidi({ pitchClass: 4, octave: 2 })).toBe(40) // low E string, open
  })
})

describe('carriesPitch', () => {
  it('agrees with the pitches that string can actually sound', () => {
    // C at the 5th string's 3rd fret is C3 (MIDI 48).
    expect(carriesPitch(4, { pitchClass: 0, octave: 3 })).toBe(true)
    // The same note name an octave up is not on that string below fret 12.
    expect(carriesPitch(4, { pitchClass: 0, octave: 4 })).toBe(false)
    // ...but it is on the 2nd string, fret 1.
    expect(carriesPitch(1, { pitchClass: 0, octave: 4 })).toBe(true)
  })

  it('holds for every string and pitch class it lists', () => {
    for (const stringIndex of STRINGS) {
      for (const pc of PITCH_CLASSES) {
        for (const midi of midisForPc(stringIndex, pc)) {
          const octave = Math.floor(midi / 12) - 1
          expect(carriesPitch(stringIndex, { pitchClass: pc, octave })).toBe(true)
        }
      }
    }
  })
})

describe('describeString', () => {
  it('names a string the way it is spoken', () => {
    expect(describeString(0)).toBe('1st string (e)')
    expect(describeString(4)).toBe('5th string (A)')
  })
})

describe('shuffleStrings', () => {
  it('returns a permutation of every string', () => {
    let seed = 0
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }

    for (let round = 0; round < 20; round++) {
      const bag = shuffleStrings(random)
      expect([...bag].sort((left, right) => left - right)).toEqual(STRINGS)
    }
  })
})
