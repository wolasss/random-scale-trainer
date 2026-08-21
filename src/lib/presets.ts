import { sortedPcs } from './notes'

/** One of the pools that ships with the app. */
export type ShippedPresetId =
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

/** A pool the user saved from the chips, addressed by the name they gave it. */
export type SavedPresetId = `saved:${string}`

export type PresetId = ShippedPresetId | SavedPresetId

/** The heading a preset sits under in the selector. */
export type PresetFamily = 'Chromatic & naturals' | 'Major keys' | 'Minor keys' | 'Custom' | 'Saved'

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
 * Derives the preset selector value from the pool. First fit wins: C major
 * shares its pitch classes with "Naturals only", which is listed first, and
 * every shipped preset is ahead of every saved one — which is why a saved pool
 * has to be one no other preset already owns.
 */
export const matchPreset = (pool: readonly number[], saved: readonly SavedPreset[] = []): PresetId => {
  const shipped = PRESETS.find((preset) => preset.pcs !== null && sameSet(preset.pcs, pool))
  if (shipped) {
    return shipped.id
  }

  const match = saved.find((preset) => sameSet(preset.pcs, pool))
  return match ? savedPresetId(match.name) : 'custom'
}

/** A pool the user saved from the chips. The name is its identity. */
export type SavedPreset = {
  name: string
  pcs: number[]
}

/** Long enough to name a mode and a key, short enough to sit in the selector. */
export const MAX_PRESET_NAME_LENGTH = 24

const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/gu

/**
 * A name as it will be stored and shown, or null when there is nothing left of
 * it. Both trims earn their place: the first rejects a name made of nothing but
 * an invisible character (a zero-width space is `Cf`), and the second keeps
 * truncation from leaving a trailing space, which would make two names look
 * identical while comparing unequal.
 */
export const normalizePresetName = (raw: string): string | null => {
  const name = raw
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PRESET_NAME_LENGTH)
    .trim()

  return name === '' ? null : name
}

export const savedPresetId = (name: string): SavedPresetId => `saved:${name}`

export const isSavedPresetId = (value: string): value is SavedPresetId => value.startsWith('saved:')

export const findSavedPreset = (saved: readonly SavedPreset[], id: string): SavedPreset | null => {
  if (!isSavedPresetId(id)) {
    return null
  }

  const name = id.slice('saved:'.length)
  return saved.find((preset) => preset.name === name) ?? null
}

const sameName = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()

/**
 * Distinct pitch classes within the octave, ascending — or null when the input
 * holds a duplicate, a non-integer, something out of range, or nothing at all.
 */
const readPcs = (values: readonly unknown[]): number[] | null => {
  const pcs = new Set<number>()

  for (const value of values) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 11 || pcs.has(value)) {
      return null
    }

    pcs.add(value)
  }

  return pcs.size === 0 ? null : sortedPcs([...pcs])
}

/**
 * Why a save was refused. `pool-empty` also covers a pool holding something
 * that isn't a pitch class, which the chips cannot produce.
 */
export type SavePresetFailure = 'name-blank' | 'name-taken' | 'pool-empty' | 'pool-taken'

export type SavePresetResult = { ok: true; saved: SavedPreset[] } | { ok: false; reason: SavePresetFailure }

/**
 * Appends the pool under a name, or says why it can't be.
 *
 * A pool that already matches a preset is refused rather than stored: matching
 * is first-fit, so such an entry could never be selected — or, since the
 * selector is the only way to reach the delete button, ever be removed again.
 */
export const savePreset = (
  saved: readonly SavedPreset[],
  rawName: string,
  pool: readonly number[],
): SavePresetResult => {
  const name = normalizePresetName(rawName)
  if (name === null) {
    return { ok: false, reason: 'name-blank' }
  }

  if (saved.some((preset) => sameName(preset.name, name))) {
    return { ok: false, reason: 'name-taken' }
  }

  const pcs = readPcs([...new Set(pool)])
  if (pcs === null) {
    return { ok: false, reason: 'pool-empty' }
  }

  if (matchPreset(pcs, saved) !== 'custom') {
    return { ok: false, reason: 'pool-taken' }
  }

  return { ok: true, saved: [...saved, { name, pcs }] }
}

/** Drops every entry the name addresses — names are matched case-insensitively. */
export const removeSavedPreset = (saved: readonly SavedPreset[], name: string): SavedPreset[] =>
  saved.filter((preset) => !sameName(preset.name, name))

/**
 * Returns undefined for anything unusable, so an empty list stands in. Entries
 * are judged one at a time against the ones accepted so far, by the same rules
 * the save button obeys: a hand-edited store can no more introduce an entry the
 * selector could never show — an empty pool, a second "Blues", a copy of
 * Naturals — than a save can. First claimant wins.
 */
export const parseSavedPresets = (raw: string): SavedPreset[] | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }

  if (!Array.isArray(parsed)) {
    return undefined
  }

  let accepted: SavedPreset[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const candidate = entry as Record<string, unknown>
    if (typeof candidate.name !== 'string' || !Array.isArray(candidate.pcs)) {
      continue
    }

    const pcs = readPcs(candidate.pcs)
    if (pcs === null) {
      continue
    }

    const result = savePreset(accepted, candidate.name, pcs)
    if (result.ok) {
      accepted = result.saved
    }
  }

  return accepted
}

export const serializeSavedPresets = (saved: readonly SavedPreset[]): string =>
  JSON.stringify(saved.map((preset) => ({ name: preset.name, pcs: preset.pcs })))

/** The selector's groups: saved pools first, then the shipped families. */
export const presetGroups = (
  saved: readonly SavedPreset[],
): readonly { family: PresetFamily; presets: readonly PoolPreset[] }[] => {
  if (saved.length === 0) {
    return PRESET_GROUPS
  }

  const presets: PoolPreset[] = saved.map((preset) => ({
    id: savedPresetId(preset.name),
    label: preset.name,
    family: 'Saved',
    pcs: preset.pcs,
  }))

  return [{ family: 'Saved' as const, presets }, ...PRESET_GROUPS]
}
