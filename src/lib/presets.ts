export type PresetId =
  | 'all'
  | 'naturals'
  | 'accidentals'
  | 'c-major'
  | 'g-major'
  | 'd-major'
  | 'a-major'
  | 'e-major'
  | 'f-major'
  | 'b-flat-major'
  | 'e-flat-major'
  | 'a-minor-pentatonic'
  | 'e-minor-pentatonic'
  | 'd-minor-pentatonic'
  | 'a-minor-blues'
  | 'custom'

/** The heading a preset sits under in the selector. */
export type PresetFamily = 'Chromatic & naturals' | 'Major keys' | 'Minor keys' | 'Custom'

export type PoolPreset = {
  id: PresetId
  label: string
  family: PresetFamily
  /** Pitch classes in the pool; null for 'custom' (whatever the chips say). */
  pcs: readonly number[] | null
}

/**
 * Order matters: `matchPreset` returns the first set that fits, so "Naturals
 * only" has to stay ahead of "Key of C major". Grouping for display is derived
 * from `family` (see PRESET_GROUPS) rather than by shuffling this array.
 */
export const PRESETS: readonly PoolPreset[] = [
  { id: 'all', label: 'All 12 chromatic', family: 'Chromatic & naturals', pcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'naturals', label: 'Naturals only (7)', family: 'Chromatic & naturals', pcs: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'accidentals', label: 'Accidentals only (5)', family: 'Chromatic & naturals', pcs: [1, 3, 6, 8, 10] },
  { id: 'c-major', label: 'Key of C major', family: 'Major keys', pcs: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'g-major', label: 'Key of G major', family: 'Major keys', pcs: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'd-major', label: 'Key of D major', family: 'Major keys', pcs: [1, 2, 4, 6, 7, 9, 11] },
  { id: 'a-major', label: 'Key of A major', family: 'Major keys', pcs: [1, 2, 4, 6, 8, 9, 11] },
  { id: 'e-major', label: 'Key of E major', family: 'Major keys', pcs: [1, 3, 4, 6, 8, 9, 11] },
  { id: 'f-major', label: 'Key of F major', family: 'Major keys', pcs: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'b-flat-major', label: 'Key of B♭ major', family: 'Major keys', pcs: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'e-flat-major', label: 'Key of E♭ major', family: 'Major keys', pcs: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'a-minor-pentatonic', label: 'Key of A minor (pentatonic)', family: 'Minor keys', pcs: [0, 2, 4, 7, 9] },
  { id: 'e-minor-pentatonic', label: 'Key of E minor (pentatonic)', family: 'Minor keys', pcs: [2, 4, 7, 9, 11] },
  { id: 'd-minor-pentatonic', label: 'Key of D minor (pentatonic)', family: 'Minor keys', pcs: [0, 2, 5, 7, 9] },
  { id: 'a-minor-blues', label: 'Key of A minor (blues)', family: 'Minor keys', pcs: [0, 2, 3, 4, 7, 9] },
  { id: 'custom', label: 'Custom', family: 'Custom', pcs: null },
]

export const FAMILY_ORDER: readonly PresetFamily[] = ['Chromatic & naturals', 'Major keys', 'Minor keys', 'Custom']

/** The presets as the selector shows them: one group per family, each in list order. */
export const PRESET_GROUPS: readonly { family: PresetFamily; presets: readonly PoolPreset[] }[] = FAMILY_ORDER.map(
  (family) => ({ family, presets: PRESETS.filter((preset) => preset.family === family) }),
).filter((group) => group.presets.length > 0)

const sameSet = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((pc) => right.includes(pc))

/**
 * Derives the preset selector value from the pool. C major shares its pitch
 * classes with "Naturals only", which is listed first and therefore wins.
 */
export const matchPreset = (pool: readonly number[]): PresetId =>
  PRESETS.find((preset) => preset.pcs !== null && sameSet(preset.pcs, pool))?.id ?? 'custom'
