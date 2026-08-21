import { describe, expect, it } from 'vitest'
import {
  FAMILY_ORDER,
  findSavedPreset,
  isSavedPresetId,
  matchPreset,
  MAX_PRESET_NAME_LENGTH,
  normalizePresetName,
  parseSavedPresets,
  PRESET_GROUPS,
  PRESETS,
  presetGroups,
  removeSavedPreset,
  savePreset,
  savedPresetId,
  serializeSavedPresets,
  type SavedPreset,
} from './presets'

/** The saved list after a save that is expected to succeed. */
const save = (saved: readonly SavedPreset[], name: string, pool: readonly number[]): SavedPreset[] => {
  const result = savePreset(saved, name, pool)
  if (!result.ok) {
    throw new Error(`expected the save to succeed, got ${result.reason}`)
  }

  return result.saved
}

const failure = (saved: readonly SavedPreset[], name: string, pool: readonly number[]) => {
  const result = savePreset(saved, name, pool)
  return result.ok ? null : result.reason
}

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

  it('reads back a saved pool by name, whatever order the chips are in', () => {
    const saved = save([], 'Two-string drill', [0, 1, 2])

    expect(matchPreset([2, 0, 1], saved)).toBe('saved:Two-string drill')
  })

  it('keeps every shipped preset ahead of a saved one', () => {
    const saved: SavedPreset[] = [{ name: 'Mine', pcs: [0, 2, 4, 5, 7, 9, 11] }]

    expect(matchPreset([0, 2, 4, 5, 7, 9, 11], saved)).toBe('naturals')
  })

  it('goes back to custom once the saved pool is gone', () => {
    const saved = save([], 'Two-string drill', [0, 1, 2])

    expect(matchPreset([0, 1, 2], removeSavedPreset(saved, 'Two-string drill'))).toBe('custom')
  })
})

describe('normalizePresetName', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizePresetName('  Low   strings  ')).toBe('Low strings')
  })

  it('rejects a name with nothing visible in it', () => {
    expect(normalizePresetName('')).toBeNull()
    expect(normalizePresetName('   ')).toBeNull()
    // U+200B is a format character, not whitespace — the control-character pass
    // is what turns it into a space the trim can take away.
    expect(normalizePresetName('\u200b')).toBeNull()
    expect(normalizePresetName('\u0007')).toBeNull()
  })

  it('truncates without leaving a trailing space', () => {
    const name = normalizePresetName(`${'a'.repeat(MAX_PRESET_NAME_LENGTH - 1)} bcd`)

    expect(name).toBe('a'.repeat(MAX_PRESET_NAME_LENGTH - 1))
  })

  it('caps the name at the maximum length', () => {
    expect(normalizePresetName('b'.repeat(MAX_PRESET_NAME_LENGTH + 10))).toHaveLength(MAX_PRESET_NAME_LENGTH)
  })
})

describe('savePreset', () => {
  it('stores the pool sorted, deduped and under the cleaned-up name', () => {
    expect(save([], '  Drop   D  ', [7, 2, 2, 0])).toEqual([{ name: 'Drop D', pcs: [0, 2, 7] }])
  })

  it('refuses a name with nothing in it', () => {
    expect(failure([], '   ', [0, 1, 2])).toBe('name-blank')
  })

  it('refuses a name already taken, whatever its case', () => {
    const saved = save([], 'Blues', [0, 1, 2])

    expect(failure(saved, 'blues', [0, 1, 3])).toBe('name-taken')
  })

  it('refuses an empty pool', () => {
    expect(failure([], 'Nothing', [])).toBe('pool-empty')
  })

  it('refuses a pool a shipped preset already owns', () => {
    expect(failure([], 'My naturals', [0, 2, 4, 5, 7, 9, 11])).toBe('pool-taken')
  })

  it('refuses a pool an earlier saved preset already owns', () => {
    const saved = save([], 'First', [0, 1, 2])

    expect(failure(saved, 'Second', [2, 1, 0])).toBe('pool-taken')
  })

  it('leaves the list it was given alone', () => {
    const saved = save([], 'First', [0, 1, 2])
    save(saved, 'Second', [0, 1, 3])

    expect(saved).toHaveLength(1)
  })
})

describe('removeSavedPreset', () => {
  it('drops the entry the name addresses, whatever its case', () => {
    const saved = save(save([], 'First', [0, 1, 2]), 'Second', [0, 1, 3])

    expect(removeSavedPreset(saved, 'FIRST')).toEqual([{ name: 'Second', pcs: [0, 1, 3] }])
  })

  it('leaves the list alone when nothing matches', () => {
    const saved = save([], 'First', [0, 1, 2])

    expect(removeSavedPreset(saved, 'Third')).toEqual(saved)
  })
})

describe('savedPresetId', () => {
  it('round-trips a name through the selector value', () => {
    const saved = save([], 'Drop D', [0, 2, 7])
    const id = savedPresetId('Drop D')

    expect(isSavedPresetId(id)).toBe(true)
    expect(findSavedPreset(saved, id)).toEqual({ name: 'Drop D', pcs: [0, 2, 7] })
  })

  it('tells a shipped id apart from a saved one', () => {
    expect(isSavedPresetId('naturals')).toBe(false)
    expect(findSavedPreset([], 'naturals')).toBeNull()
    expect(findSavedPreset(save([], 'Drop D', [0, 2, 7]), 'saved:Nope')).toBeNull()
  })
})

describe('parseSavedPresets', () => {
  it('rejects a value that is not a JSON array', () => {
    expect(parseSavedPresets('nonsense')).toBeUndefined()
    expect(parseSavedPresets('{"name":"Drop D"}')).toBeUndefined()
    expect(parseSavedPresets('7')).toBeUndefined()
  })

  it('round-trips what was serialized', () => {
    const saved = save(save([], 'First', [0, 1, 2]), 'Second', [0, 1, 3])

    expect(parseSavedPresets(serializeSavedPresets(saved))).toEqual(saved)
  })

  it('reads an empty array as no presets', () => {
    expect(parseSavedPresets('[]')).toEqual([])
  })

  it('drops the entries it cannot use and keeps the rest', () => {
    const stored = JSON.stringify([
      null,
      'Drop D',
      { name: 'No pcs' },
      { name: 'Empty', pcs: [] },
      { name: 'Too high', pcs: [0, 12] },
      { name: 'Negative', pcs: [-1, 3] },
      { name: 'Fractional', pcs: [1.5, 3] },
      { name: 'Strings', pcs: ['3', 5] },
      { name: 'Repeated', pcs: [3, 3] },
      { name: '   ', pcs: [0, 1, 2] },
      { name: 'Keeper', pcs: [2, 0, 1] },
      { name: 'KEEPER', pcs: [0, 1, 3] },
      { name: 'Same notes', pcs: [1, 0, 2] },
      { name: 'Naturals again', pcs: [0, 2, 4, 5, 7, 9, 11] },
    ])

    expect(parseSavedPresets(stored)).toEqual([{ name: 'Keeper', pcs: [0, 1, 2] }])
  })
})

describe('presetGroups', () => {
  it('is the shipped grouping when nothing has been saved', () => {
    expect(presetGroups([])).toEqual(PRESET_GROUPS)
  })

  it('puts the saved pools in their own group, first', () => {
    const saved = save([], 'Drop D', [0, 2, 7])
    const groups = presetGroups(saved)

    expect(groups.map((group) => group.family)).toEqual(['Saved', ...FAMILY_ORDER])
    expect(groups[0].presets).toEqual([{ id: 'saved:Drop D', label: 'Drop D', family: 'Saved', pcs: [0, 2, 7] }])
  })
})
