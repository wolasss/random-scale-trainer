import {
  FLAT_DISPLAY,
  isNaturalPitchClass,
  PITCH_CLASSES,
  SHARP_DISPLAY,
  type SpellingPreference,
} from '../lib/notes'
import { matchPreset, PRESETS, type PresetId } from '../lib/presets'
import { SegmentedControl } from './ui/SegmentedControl'

type NotePoolCardProps = {
  pool: number[]
  spelling: SpellingPreference
  onTogglePc: (pc: number) => void
  onPreset: (preset: PresetId) => void
  onSpelling: (value: SpellingPreference) => void
}

const SPELLING_OPTIONS = [
  { value: 'flat', label: '♭ flats' },
  { value: 'sharp', label: '♯ sharps' },
  { value: 'mixed', label: 'mixed' },
] as const

export function NotePoolCard({ pool, spelling, onTogglePc, onPreset, onSpelling }: NotePoolCardProps) {
  // Mixed varies per call, so accidental chips carry both names.
  const chipLabel = (pc: number) => {
    if (spelling === 'sharp' || isNaturalPitchClass(pc)) return SHARP_DISPLAY[pc]
    if (spelling === 'flat') return FLAT_DISPLAY[pc]
    return `${FLAT_DISPLAY[pc]}/${SHARP_DISPLAY[pc]}`
  }
  const count = pool.length

  return (
    <section className="panel note-pool-card">
      <div className="panel-heading note-pool-heading">
        <div>
          <h2>Note pool</h2>
          <p data-testid="pool-guarantee">
            {count} {count === 1 ? 'note' : 'notes'}, shuffled — every note appears once per cycle, no
            repeats.
          </p>
        </div>
        <select
          className="preset-select"
          data-testid="preset-select"
          aria-label="Note pool preset"
          value={matchPreset(pool)}
          onChange={(event) => onPreset(event.target.value as PresetId)}
        >
          {PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
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

      <div className="control-block">
        <div className="control-label-row">
          <span className="label">Spell accidentals as</span>
        </div>
        <SegmentedControl
          ariaLabel="Spell accidentals as"
          testId="spelling"
          options={SPELLING_OPTIONS}
          value={spelling}
          onChange={onSpelling}
        />
        <p className="control-subtitle">Mixed keeps you fluent in both names.</p>
      </div>
    </section>
  )
}
