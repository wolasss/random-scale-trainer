// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CAPO_OPTIONS,
  DEFAULT_TUNING_ID,
  FRET_SPAN,
  findTuning,
  hasInlay,
  isCapo,
  isTuningId,
  neckModel,
  TUNINGS,
} from './tuning'

const litOf = (id: string, capo: number, pc: number) =>
  neckModel(findTuning(id), capo, pc).strings.map((string) => string.lit)

describe('tunings', () => {
  it('names a string for every open note', () => {
    for (const tuning of TUNINGS) {
      expect(tuning.labels).toHaveLength(tuning.openMidi.length)
    }
  })

  it('falls back to standard for an id it does not know', () => {
    expect(findTuning('banjo').id).toBe(DEFAULT_TUNING_ID)
    expect(findTuning('drop-d').id).toBe('drop-d')
  })

  it('rejects values that are not a tuning or a capo', () => {
    expect(isTuningId('drop-d')).toBe(true)
    expect(isTuningId('banjo')).toBe(false)
    expect(isTuningId(2)).toBe(false)
    expect(isCapo(0)).toBe(true)
    expect(isCapo(CAPO_OPTIONS[CAPO_OPTIONS.length - 1])).toBe(true)
    expect(isCapo(99)).toBe(false)
    expect(isCapo(1.5)).toBe(false)
    expect(isCapo('2')).toBe(false)
  })
})

describe('neckModel', () => {
  it('lights every C on a standard neck', () => {
    expect(litOf('standard', 0, 0)).toEqual([[8], [1], [5], [10], [3], [8]])
  })

  it('draws a window of thirteen frets from the nut', () => {
    const neck = neckModel(findTuning('standard'), 0, null)

    expect(neck.frets).toHaveLength(FRET_SPAN)
    expect(neck.frets[0]).toBe(0)
    expect(neck.frets[FRET_SPAN - 1]).toBe(12)
    expect(neck.strings.every((string) => string.lit.length === 0)).toBe(true)
    expect(neck.reading).toBe('')
    expect(neck.summary).toBe('all six strings, standard tuning')
  })

  it('moves only the dropped string when the 6th is tuned down', () => {
    const standard = litOf('standard', 0, 0)
    const dropD = litOf('drop-d', 0, 0)

    expect(dropD.slice(0, 5)).toEqual(standard.slice(0, 5))
    expect(dropD[5]).toEqual([10])
    expect(neckModel(findTuning('drop-d'), 0, 0).strings[5].label).toBe('D')
  })

  it('treats a capo as a moving nut rather than a transposition', () => {
    // Every string but the B keeps the fret it had open: those frets are still
    // inside the window. The B string's fret 1 is behind the capo, so the same
    // note reappears an octave up at 13.
    expect(litOf('standard', 2, 0)).toEqual([[8], [13], [5], [10], [3], [8]])

    const neck = neckModel(findTuning('standard'), 2, 0)
    expect(neck.frets[0]).toBe(2)
    expect(neck.frets[FRET_SPAN - 1]).toBe(14)
    expect(neck.summary).toBe('all six strings, standard tuning, capo 2')
  })

  it('calls a string fretted at the capo open', () => {
    // With a capo on 2, the 5th string sounds B — open, as far as the hand is
    // concerned — and its octave sits twelve frets further up.
    const neck = neckModel(findTuning('standard'), 2, 11)

    expect(neck.strings[4].lit).toEqual([2, 14])
    expect(neck.reading).toContain('5th string (A) open and fret 14')
  })

  it('renders a four-string bass with four ordinals', () => {
    const neck = neckModel(findTuning('bass-standard'), 3, 0)

    expect(neck.strings).toHaveLength(4)
    expect(neck.strings.map((string) => string.ordinal)).toEqual(['1st', '2nd', '3rd', '4th'])
    expect(neck.strings.map((string) => string.label)).toEqual(['G', 'D', 'A', 'E'])
    expect(neck.summary).toBe('all four strings, bass standard tuning, capo 3')
  })

  it('reads the lit positions out in the order they are drawn', () => {
    expect(neckModel(findTuning('standard'), 0, 4).reading).toBe(
      '1st string (e) open and fret 12, 2nd string (B) fret 5, 3rd string (G) fret 9, ' +
        '4th string (D) fret 2, 5th string (A) fret 7, 6th string (E) open and fret 12',
    )
  })
})

describe('hasInlay', () => {
  it('keeps the singles on the middle boundary and pairs the octave', () => {
    expect(hasInlay(6, 2, 5)).toBe(true)
    expect(hasInlay(6, 1, 5)).toBe(false)
    expect(hasInlay(6, 1, 12)).toBe(true)
    expect(hasInlay(6, 3, 12)).toBe(true)
    expect(hasInlay(6, 2, 12)).toBe(false)
    // A four-string neck has its centre line one row higher.
    expect(hasInlay(4, 1, 7)).toBe(true)
    expect(hasInlay(4, 2, 7)).toBe(false)
    expect(hasInlay(4, 0, 12)).toBe(true)
    expect(hasInlay(4, 2, 12)).toBe(true)
  })

  it('leaves the markers where they were cut when a capo is clamped on', () => {
    // Fret 3 is under the capo, so no marker is drawn in its cell; fret 5 is
    // still fret 5, and fret 15 comes into the window with its own.
    expect(hasInlay(6, 2, 3, 3)).toBe(false)
    expect(hasInlay(6, 2, 5, 3)).toBe(true)
    expect(hasInlay(6, 2, 15, 3)).toBe(true)
    expect(hasInlay(6, 1, 24, 3)).toBe(true)
  })
})
