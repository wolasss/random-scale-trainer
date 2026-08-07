import { describe, expect, it } from 'vitest'
import {
  FLAT_AUDIO,
  FLAT_DISPLAY,
  isNaturalPitchClass,
  PITCH_CLASSES,
  SHARP_AUDIO,
  SHARP_DISPLAY,
  spellNote,
} from './notes'
import { NOTE_AUDIO_FILES } from './audio/engine'

describe('name tables', () => {
  it('cover all 12 pitch classes', () => {
    expect(FLAT_DISPLAY).toHaveLength(12)
    expect(SHARP_DISPLAY).toHaveLength(12)
    expect(FLAT_AUDIO).toHaveLength(12)
    expect(SHARP_AUDIO).toHaveLength(12)
    expect(PITCH_CLASSES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('uses the proper Unicode accidental glyphs, never ASCII', () => {
    expect(FLAT_DISPLAY[1]).toBe('D♭')
    expect(SHARP_DISPLAY[1]).toBe('C♯')

    for (const name of [...FLAT_DISPLAY, ...SHARP_DISPLAY]) {
      expect(name).not.toMatch(/[#b]/)
    }
  })

  it('maps every audio key to a real entry in NOTE_AUDIO_FILES', () => {
    for (const key of [...FLAT_AUDIO, ...SHARP_AUDIO]) {
      expect(NOTE_AUDIO_FILES, `missing audio for ${key}`).toHaveProperty([key])
    }
  })

  it('spells the 7 naturals identically in both tables', () => {
    const naturals = PITCH_CLASSES.filter(isNaturalPitchClass)

    expect(naturals).toEqual([0, 2, 4, 5, 7, 9, 11])
    for (const pc of naturals) {
      expect(FLAT_DISPLAY[pc]).toBe(SHARP_DISPLAY[pc])
      expect(FLAT_AUDIO[pc]).toBe(SHARP_AUDIO[pc])
    }
  })
})

describe('spellNote', () => {
  it('spells flats and sharps deterministically', () => {
    expect(spellNote(8, 'flat')).toEqual({ display: 'A♭', audioKey: 'Ab' })
    expect(spellNote(8, 'sharp')).toEqual({ display: 'G♯', audioKey: 'G#' })
  })

  it('ignores the preference for naturals', () => {
    for (const preference of ['flat', 'sharp', 'mixed'] as const) {
      expect(spellNote(0, preference)).toEqual({ display: 'C', audioKey: 'C' })
    }
  })

  it('never consults the RNG outside mixed mode', () => {
    const explode = () => {
      throw new Error('random should not be called')
    }

    expect(() => spellNote(1, 'flat', explode)).not.toThrow()
    expect(() => spellNote(1, 'sharp', explode)).not.toThrow()
    expect(() => spellNote(0, 'mixed', explode)).not.toThrow()
  })

  it('flips a coin per call in mixed mode', () => {
    expect(spellNote(1, 'mixed', () => 0)).toEqual({ display: 'C♯', audioKey: 'C#' })
    expect(spellNote(1, 'mixed', () => 0.9)).toEqual({ display: 'D♭', audioKey: 'Db' })
  })
})
