import { describe, expect, it } from 'vitest'
import { getChromaticScale } from './music'

describe('getChromaticScale', () => {
  it('returns 12 sharp-spelled notes', () => {
    const notes = getChromaticScale('sharp')
    expect(notes).toHaveLength(12)
    expect(notes).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])
  })

  it('returns 12 flat-spelled notes', () => {
    const notes = getChromaticScale('flat')
    expect(notes).toHaveLength(12)
    expect(notes).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'])
  })

  it('spells the same pitch classes in both preferences', () => {
    const sharp = getChromaticScale('sharp')
    const flat = getChromaticScale('flat')
    const naturals = [0, 2, 4, 5, 7, 9, 11]
    for (const index of naturals) {
      expect(sharp[index]).toEqual(flat[index])
    }
  })
})
