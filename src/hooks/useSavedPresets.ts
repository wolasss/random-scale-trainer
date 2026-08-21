import type { Dispatch, SetStateAction } from 'react'
import { STORAGE_KEYS } from '../constants'
import { parseSavedPresets, serializeSavedPresets, type SavedPreset } from '../lib/presets'
import { usePersistentState } from './usePersistentState'

/**
 * The note pool's own presets, kept above the card that edits them.
 *
 * On the installed layout that card lives inside the practice sheet and is
 * unmounted the moment the sheet closes. When a write has been refused the list
 * only exists in memory, and the card promises it will last until the tab does —
 * so the state has to belong to something that outlives the sheet.
 */
export function useSavedPresets(): [SavedPreset[], Dispatch<SetStateAction<SavedPreset[]>>, boolean] {
  return usePersistentState<SavedPreset[]>(STORAGE_KEYS.savedPresets, {
    defaultValue: [],
    deserialize: parseSavedPresets,
    serialize: serializeSavedPresets,
  })
}
