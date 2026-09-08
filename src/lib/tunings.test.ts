// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PITCH_CLASSES } from './notes'
import {
  describeNeck,
  describePositions,
  findTuning,
  isTuningId,
  neckStrings,
  TUNINGS,
  type TuningId,
} from './tunings'

const labelsOf = (id: TuningId) =>
  neckStrings(id, null, false)
    .map((string) => string.label)
    .join(' ')

describe('string labels', () => {
  it.each([
    ['standard', 'e B G D A E'],
    ['eflat', 'e♭ B♭ G♭ D♭ A♭ E♭'],
    ['dropD', 'e B G D A D'],
    ['dadgad', 'd A G D A D'],
    ['openG', 'd B G D G D'],
  ] as const)('writes %s as %s, high string first', (id, expected) => {
    expect(labelsOf(id)).toBe(expected)
  })
})

describe('neckStrings', () => {
  it('keeps the ordinals glued to their strings, high string first', () => {
    expect(neckStrings('standard', null, false).map((string) => string.ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
    ])
  })

  it('lights nothing while no note is called', () => {
    expect(neckStrings('standard', null, false).every((string) => string.lit.length === 0)).toBe(true)
  })

  it('moves the dropped 6th string two frets up', () => {
    const standard = neckStrings('standard', 0, false)
    const dropped = neckStrings('dropD', 0, false)

    // C sits at fret 8 on a low E and fret 10 once that string is down to D.
    expect(standard[5].lit).toEqual([8])
    expect(dropped[5].lit).toEqual([10])
    // Nothing else about the neck moved.
    expect(dropped.slice(0, 5)).toEqual(standard.slice(0, 5))
  })

  it('lights the open string and its octave together', () => {
    expect(neckStrings('standard', 4, false)[0].lit).toEqual([0, 12])
  })

  it('reverses the drawn order when the neck is left-handed, ordinals and all', () => {
    const flipped = neckStrings('dadgad', 2, true)

    expect(flipped.map((string) => string.ordinal)).toEqual(['6th', '5th', '4th', '3rd', '2nd', '1st'])
    expect(flipped.map((string) => string.label)).toEqual(['D', 'A', 'D', 'G', 'A', 'd'])
    expect(flipped.map((string) => string.lit)).toEqual(neckStrings('dadgad', 2, false).map((s) => s.lit).reverse())
  })

  it('carries every pitch class somewhere on every string of every tuning', () => {
    for (const tuning of TUNINGS) {
      for (const pc of PITCH_CLASSES) {
        for (const string of neckStrings(tuning.id, pc, false)) {
          expect(string.lit.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('describePositions', () => {
  it('reads the neck out in the order it is drawn', () => {
    expect(describePositions(neckStrings('standard', 0, false))).toBe(
      '1st string (e) fret 8, 2nd string (B) fret 1, 3rd string (G) fret 5, ' +
        '4th string (D) fret 10, 5th string (A) fret 3, 6th string (E) fret 8',
    )
  })

  it('starts at the 6th string once the neck is flipped', () => {
    expect(describePositions(neckStrings('standard', 0, true))).toBe(
      '6th string (E) fret 8, 5th string (A) fret 3, 4th string (D) fret 10, ' +
        '3rd string (G) fret 5, 2nd string (B) fret 1, 1st string (e) fret 8',
    )
  })

  it('names an open string as open rather than as fret 0', () => {
    expect(describePositions(neckStrings('standard', 4, false))).toContain('1st string (e) open and fret 12')
  })
})

describe('describeNeck', () => {
  it('names the tuning mid-sentence', () => {
    expect(describeNeck('dropD', false)).toBe('all six strings, drop D tuning')
  })

  it('says when the neck is flipped', () => {
    expect(describeNeck('openG', true)).toBe('all six strings, open G tuning, left-handed')
  })
})

describe('tuning ids', () => {
  it('accepts the ids it ships and rejects anything else', () => {
    expect(isTuningId('dadgad')).toBe(true)
    expect(isTuningId('DADGAD')).toBe(false)
    expect(isTuningId('')).toBe(false)
    expect(isTuningId('drop-c')).toBe(false)
  })

  it('falls back to standard rather than handing back nothing', () => {
    expect(findTuning('openG').label).toBe('Open G')
    expect(findTuning('drop-c' as TuningId).id).toBe('standard')
  })
})
