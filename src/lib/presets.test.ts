import { describe, expect, it } from 'vitest'
import { FAMILY_ORDER, matchPreset, PRESET_GROUPS, PRESETS } from './presets'

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
    // B♭ C D E♭ F G A
    expect(byId['b-flat-major']).toEqual([0, 2, 3, 5, 7, 9, 10])
    // E♭ F G A♭ B♭ C D
    expect(byId['e-flat-major']).toEqual([0, 2, 3, 5, 7, 8, 10])
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

describe('PRESET_GROUPS', () => {
  it('lists the families in display order', () => {
    expect(PRESET_GROUPS.map((group) => group.family)).toEqual(FAMILY_ORDER)
  })

  it('covers every preset exactly once, in list order', () => {
    const flattened = PRESET_GROUPS.flatMap((group) => group.presets)

    expect(flattened.map((preset) => preset.id)).toEqual(PRESETS.map((preset) => preset.id))
  })

  it('puts both flat major keys under the major-keys group', () => {
    const majors = PRESET_GROUPS.find((group) => group.family === 'Major keys')

    expect(majors?.presets.map((preset) => preset.label)).toContain('Key of B♭ major')
    expect(majors?.presets.map((preset) => preset.label)).toContain('Key of E♭ major')
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

  it('keeps "Naturals only" ahead of "Key of C major"', () => {
    expect(matchPreset([0, 2, 4, 5, 7, 9, 11])).toBe('naturals')
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
