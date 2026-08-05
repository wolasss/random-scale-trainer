import { describe, expect, it } from 'vitest'
import {
  chooseNotePreference,
  generateScale,
  generateShuffledNotes,
  getChromaticScale,
  noteNameFromPitchClass,
  parseIntervals,
  shuffleArray,
} from './music'

describe('getChromaticScale', () => {
  it('returns 12 sharp-spelled notes', () => {
    expect(getChromaticScale('sharp')).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])
  })

  it('returns 12 flat-spelled notes', () => {
    expect(getChromaticScale('flat')).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'])
  })

  it('spells naturals identically in both preferences', () => {
    const sharp = getChromaticScale('sharp')
    const flat = getChromaticScale('flat')
    for (const index of [0, 2, 4, 5, 7, 9, 11]) {
      expect(sharp[index]).toEqual(flat[index])
    }
  })
})

describe('shuffleArray', () => {
  it('returns a permutation of the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = shuffleArray(input)
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input)
  })

  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c']
    shuffleArray(input)
    expect(input).toEqual(['a', 'b', 'c'])
  })

  it('is deterministic under an injected random source', () => {
    const random = () => 0
    // random() === 0 always swaps with index 0
    expect(shuffleArray([1, 2, 3, 4], random)).toEqual(shuffleArray([1, 2, 3, 4], random))
  })
})

describe('generateShuffledNotes', () => {
  it('produces exactly one spelling per pitch class', () => {
    const notes = generateShuffledNotes()
    expect(notes).toHaveLength(12)

    const sharp = getChromaticScale('sharp')
    const flat = getChromaticScale('flat')
    const pitchClasses = notes.map((note) => {
      const index = sharp.indexOf(note)
      return index !== -1 ? index : flat.indexOf(note)
    })
    expect([...pitchClasses].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('spells every accidental sharp when random stays below 0.5', () => {
    const notes = generateShuffledNotes(() => 0)
    for (const accidental of ['C#', 'D#', 'F#', 'G#', 'A#']) {
      expect(notes).toContain(accidental)
    }
  })

  it('spells every accidental flat when random stays at or above 0.5', () => {
    const notes = generateShuffledNotes(() => 0.9)
    for (const accidental of ['Db', 'Eb', 'Gb', 'Ab', 'Bb']) {
      expect(notes).toContain(accidental)
    }
  })

  it('never respells natural notes', () => {
    const notes = generateShuffledNotes()
    for (const natural of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      expect(notes).toContain(natural)
    }
  })
})

describe('parseIntervals', () => {
  it('parses comma-separated semitones', () => {
    expect(parseIntervals('0, 2, 4')).toEqual([0, 2, 4])
  })

  it('dedupes, sorts, and drops invalid entries', () => {
    expect(parseIntervals('4, 0, 4, -1, x, 2.5, 7')).toEqual([0, 4, 7])
  })

  it('treats empty input as a lone root (Number("") === 0)', () => {
    expect(parseIntervals('')).toEqual([0])
  })
})

describe('chooseNotePreference', () => {
  it('always prefers sharp for unambiguous roots', () => {
    for (const pitchClass of [0, 2, 4, 5, 7, 9, 11]) {
      expect(chooseNotePreference(pitchClass, 0.99)).toBe('sharp')
    }
  })

  it('flips on the random value for ambiguous roots', () => {
    for (const pitchClass of [1, 3, 6, 8, 10]) {
      expect(chooseNotePreference(pitchClass, 0.2)).toBe('sharp')
      expect(chooseNotePreference(pitchClass, 0.8)).toBe('flat')
    }
  })
})

describe('noteNameFromPitchClass', () => {
  it('maps pitch classes to names', () => {
    expect(noteNameFromPitchClass(0, 'sharp')).toBe('C')
    expect(noteNameFromPitchClass(1, 'sharp')).toBe('C#')
    expect(noteNameFromPitchClass(1, 'flat')).toBe('Db')
  })

  it('wraps values outside 0-11 in both directions', () => {
    expect(noteNameFromPitchClass(12, 'sharp')).toBe('C')
    expect(noteNameFromPitchClass(14, 'sharp')).toBe('D')
    expect(noteNameFromPitchClass(-1, 'sharp')).toBe('B')
  })
})

describe('generateScale', () => {
  const major = { id: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] }

  it('builds notes from intervals relative to the root', () => {
    const scale = generateScale(major, 0, 'sharp')
    expect(scale.notes).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
    expect(scale.root).toBe('C')
    expect(scale.label).toBe('C Major')
    expect(scale.scaleName).toBe('Major')
  })

  it('respects the flat preference for accidentals', () => {
    const scale = generateScale(major, 3, 'flat')
    expect(scale.root).toBe('Eb')
    expect(scale.notes).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'])
  })

  it('encodes definition, root, and preference in the id', () => {
    expect(generateScale(major, 3, 'flat').id).toBe('major-3-flat')
  })
})
