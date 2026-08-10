import { describe, expect, it } from 'vitest'
import { matchPreset, PRESETS } from './presets'

describe('PRESETS', () => {
  it('defines the exact pitch-class sets from the product brief', () => {
    const byId = Object.fromEntries(PRESETS.map((preset) => [preset.id, preset.pcs]))

    expect(byId['all']).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(byId['naturals']).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(byId['accidentals']).toEqual([1, 3, 6, 8, 10])
    expect(byId['c-major']).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(byId['g-major']).toEqual([0, 2, 4, 6, 7, 9, 11])
    expect(byId['d-major']).toEqual([1, 2, 4, 6, 7, 9, 11])
    expect(byId['a-major']).toEqual([1, 2, 4, 6, 8, 9, 11])
    expect(byId['e-major']).toEqual([1, 3, 4, 6, 8, 9, 11])
    expect(byId['f-major']).toEqual([0, 2, 4, 5, 7, 9, 10])
    expect(byId['a-minor-pentatonic']).toEqual([0, 2, 4, 7, 9])
    expect(byId['e-minor-pentatonic']).toEqual([2, 4, 7, 9, 11])
    expect(byId['d-minor-pentatonic']).toEqual([0, 2, 5, 7, 9])
    expect(byId['a-minor-blues']).toEqual([0, 2, 3, 4, 7, 9])
    expect(byId['custom']).toBeNull()
  })

  it('gives every minor preset a pitch-class set no other preset already has', () => {
    const setKey = (pcs: readonly number[]) => JSON.stringify([...pcs].sort((a, b) => a - b))
    const minorIds = ['a-minor-pentatonic', 'e-minor-pentatonic', 'd-minor-pentatonic', 'a-minor-blues']

    for (const minor of PRESETS) {
      if (minor.pcs === null || !minorIds.includes(minor.id)) {
        continue
      }

      const minorKey = setKey(minor.pcs)
      const clashes = PRESETS.filter(
        (other) => other.id !== minor.id && other.pcs !== null && setKey(other.pcs) === minorKey,
      )

      expect(clashes.map((other) => other.id)).toEqual([])
    }
  })
})

describe('matchPreset', () => {
  it('round-trips every concrete preset, first listed set winning ties', () => {
    for (const preset of PRESETS) {
      if (preset.pcs === null) {
        continue
      }

      // C major shares its pitch classes with "Naturals only", which is listed first.
      const expected = preset.id === 'c-major' ? 'naturals' : preset.id
      expect(matchPreset(preset.pcs)).toBe(expected)
    }
  })

  it('matches regardless of pool ordering', () => {
    expect(matchPreset([9, 7, 4, 2, 0])).toBe('a-minor-pentatonic')
  })

  it('falls back to custom for any other pool', () => {
    expect(matchPreset([0])).toBe('custom')
    expect(matchPreset([0, 1, 2])).toBe('custom')
    expect(matchPreset([])).toBe('custom')
  })
})
