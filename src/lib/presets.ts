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
  | 'a-minor-pentatonic'
  | 'e-minor-pentatonic'
  | 'd-minor-pentatonic'
  | 'a-minor-blues'
  | 'custom'

export type PoolPreset = {
  id: PresetId
  label: string
  /** Pitch classes in the pool; null for 'custom' (whatever the chips say). */
  pcs: readonly number[] | null
}

export const PRESETS: readonly PoolPreset[] = [
  { id: 'all', label: 'All 12 chromatic', pcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'naturals', label: 'Naturals only (7)', pcs: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'accidentals', label: 'Accidentals only (5)', pcs: [1, 3, 6, 8, 10] },
  { id: 'c-major', label: 'Key of C major', pcs: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'g-major', label: 'Key of G major', pcs: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'd-major', label: 'Key of D major', pcs: [1, 2, 4, 6, 7, 9, 11] },
  { id: 'a-major', label: 'Key of A major', pcs: [1, 2, 4, 6, 8, 9, 11] },
  { id: 'e-major', label: 'Key of E major', pcs: [1, 3, 4, 6, 8, 9, 11] },
  { id: 'f-major', label: 'Key of F major', pcs: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'a-minor-pentatonic', label: 'Key of A minor (pentatonic)', pcs: [0, 2, 4, 7, 9] },
  { id: 'e-minor-pentatonic', label: 'Key of E minor (pentatonic)', pcs: [2, 4, 7, 9, 11] },
  { id: 'd-minor-pentatonic', label: 'Key of D minor (pentatonic)', pcs: [0, 2, 5, 7, 9] },
  { id: 'a-minor-blues', label: 'Key of A minor (blues)', pcs: [0, 2, 3, 4, 7, 9] },
  { id: 'custom', label: 'Custom', pcs: null },
]

const sameSet = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((pc) => right.includes(pc))

/**
 * Derives the preset selector value from the pool. C major shares its pitch
 * classes with "Naturals only", which is listed first and therefore wins.
 */
export const matchPreset = (pool: readonly number[]): PresetId =>
  PRESETS.find((preset) => preset.pcs !== null && sameSet(preset.pcs, pool))?.id ?? 'custom'
