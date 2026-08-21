import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import {
  FLAT_DISPLAY,
  isNaturalPitchClass,
  PITCH_CLASSES,
  SHARP_DISPLAY,
  type SpellingPreference,
} from '../lib/notes'
import {
  findSavedPreset,
  isSavedPresetId,
  matchPreset,
  MAX_PRESET_NAME_LENGTH,
  presetGroups,
  removeSavedPreset,
  savePreset,
  type PresetId,
  type SavedPreset,
  type SavePresetFailure,
} from '../lib/presets'
import { SegmentedControl } from './ui/SegmentedControl'

type NotePoolCardProps = {
  pool: number[]
  spelling: SpellingPreference
  onTogglePc: (pc: number) => void
  onPreset: (preset: PresetId) => void
  onPool: (pool: readonly number[]) => void
  onSpelling: (value: SpellingPreference) => void
  /** Owned above the card — see useSavedPresets. */
  saved: SavedPreset[]
  onSaved: (presets: SavedPreset[]) => void
  savedPersisted: boolean
}

const SPELLING_OPTIONS = [
  { value: 'flat', label: '♭ flats' },
  { value: 'sharp', label: '♯ sharps' },
  { value: 'mixed', label: 'mixed' },
] as const

const SAVE_ERRORS: Record<SavePresetFailure, string> = {
  'name-blank': 'Give this set of notes a name first.',
  'name-taken': 'You already have a saved preset by that name.',
  'pool-empty': 'Pick at least one note before saving.',
  'pool-taken': 'These notes are already a preset.',
}

export function NotePoolCard({
  pool,
  spelling,
  onTogglePc,
  onPreset,
  onPool,
  onSpelling,
  saved,
  onSaved,
  savedPersisted,
}: NotePoolCardProps) {
  const [draftName, setDraftName] = useState<string | null>(null)
  const [saveOffered, setSaveOffered] = useState(false)
  const [error, setError] = useState<SavePresetFailure | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const isNaming = draftName !== null

  useEffect(() => {
    if (isNaming) {
      nameInputRef.current?.focus()
    }
  }, [isNaming])

  // Mixed varies per call, so accidental chips carry both names.
  const chipLabel = (pc: number) => {
    if (spelling === 'sharp' || isNaturalPitchClass(pc)) return SHARP_DISPLAY[pc]
    if (spelling === 'flat') return FLAT_DISPLAY[pc]
    return `${FLAT_DISPLAY[pc]}/${SHARP_DISPLAY[pc]}`
  }
  const count = pool.length
  const selected = matchPreset(pool, saved)
  // Saving is offered exactly when the selector would otherwise read Custom —
  // any other value means these notes already have a name.
  const savable = selected === 'custom'
  const selectedSaved = findSavedPreset(saved, selected)

  const closeForm = () => {
    setDraftName(null)
    setError(null)
  }

  const submitSave = () => {
    if (draftName === null) {
      return
    }

    const result = savePreset(saved, draftName, pool)
    if (!result.ok) {
      setError(result.reason)
      return
    }

    onSaved(result.saved)
    closeForm()
  }

  return (
    <section className="panel note-pool-card">
      <div className="panel-heading note-pool-heading">
        <div>
          <h2>Which notes</h2>
          <p data-testid="pool-guarantee">Shuffled — you get all {count} before any repeats.</p>
        </div>
        <select
          className="preset-select"
          data-testid="preset-select"
          aria-label="Which notes preset"
          value={selected}
          onChange={(event) => {
            const value = event.target.value
            if (isSavedPresetId(value)) {
              // The list the options came from is the list this reads back, so
              // a missing entry is impossible — but it costs one check to say so.
              const preset = findSavedPreset(saved, value)
              if (preset) {
                onPool(preset.pcs)
              }
              return
            }

            onPreset(value as PresetId)
          }}
        >
          {presetGroups(saved).map((group) => (
            <optgroup key={group.family} label={group.family}>
              {group.presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="note-chip-grid">
        {PITCH_CLASSES.map((pc) => (
          <button
            key={pc}
            type="button"
            className={`note-chip ${spelling === 'mixed' && !isNaturalPitchClass(pc) ? 'dual' : ''}`}
            data-testid={`note-chip-${pc}`}
            aria-pressed={pool.includes(pc)}
            onClick={() => onTogglePc(pc)}
          >
            {chipLabel(pc)}
          </button>
        ))}
      </div>

      {isNaming ? (
        <form
          className="preset-save-form"
          data-testid="preset-save-form"
          onSubmit={(event) => {
            event.preventDefault()
            submitSave()
          }}
        >
          <input
            ref={nameInputRef}
            type="text"
            className="preset-name-input"
            data-testid="preset-name-input"
            aria-label="Preset name"
            maxLength={MAX_PRESET_NAME_LENGTH}
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                // The practice sheet listens for Escape on the window; the
                // innermost thing that can be dismissed is the one that should
                // go, so this press stops here rather than closing all of setup.
                event.stopPropagation()
                closeForm()
              }
            }}
          />
          <button type="submit" className="primary-button preset-save-confirm" data-testid="preset-save-confirm">
            Save
          </button>
          <button type="button" className="ghost-button" onClick={closeForm}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="preset-actions">
          <button
            type="button"
            className="ghost-button"
            data-testid="preset-save"
            disabled={!savable}
            onClick={() => {
              setDraftName('')
              setSaveOffered(true)
            }}
          >
            <FontAwesomeIcon icon={faPlus} /> Save these notes
          </button>
          {selectedSaved !== null ? (
            <button
              type="button"
              className="ghost-button"
              data-testid="preset-delete"
              // One press, no arm-then-confirm: deleting leaves the chips alone,
              // so the notes are still on screen and saving them again is a click.
              onClick={() => onSaved(removeSavedPreset(saved, selectedSaved.name))}
            >
              Delete “{selectedSaved.name}”
            </button>
          ) : (
            !savable && <p className="control-subtitle">These notes are already a preset.</p>
          )}
        </div>
      )}

      {error !== null ? (
        <p className="preset-save-error" data-testid="preset-save-error" role="alert">
          {SAVE_ERRORS[error]}
        </p>
      ) : null}

      {/* Reports on this list's own last write, so a store that had room for
          everything else but not for the presets still gets caught. */}
      {saveOffered && !savedPersisted ? (
        <p className="preset-ephemeral-notice" data-testid="preset-ephemeral-notice">
          Your browser is blocking saved data — this preset will work now, but it won't be here after you close the tab.
        </p>
      ) : null}

      <div className="control-block">
        <div className="control-label-row">
          <span className="label">Sharps or flats?</span>
        </div>
        <SegmentedControl
          ariaLabel="Sharps or flats?"
          testId="spelling"
          options={SPELLING_OPTIONS}
          value={spelling}
          onChange={onSpelling}
        />
        <p className="control-subtitle">Mixed keeps you fluent in both names for the same fret.</p>
      </div>
    </section>
  )
}
