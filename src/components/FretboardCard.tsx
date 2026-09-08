import { SegmentedControl } from './ui/SegmentedControl'
import {
  describeNeck,
  describePositions,
  FRETS,
  isTuningId,
  neckStrings,
  TUNINGS,
  type TuningId,
} from '../lib/tunings'

const HANDEDNESS_OPTIONS = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
] as const

// Classic inlay markers, drawn on the string boundary below the given row so
// singles sit on the neck's center line and fret 12 gets a symmetric pair. Keyed
// to the drawn row rather than the string, and the pattern is symmetric
// top-to-bottom, so a left-handed neck needs nothing here.
function hasInlay(rowIndex: number, fret: number) {
  if (fret === 12) return rowIndex === 1 || rowIndex === 3
  return rowIndex === 2 && [3, 5, 7, 9].includes(fret)
}

type FretboardCardProps = {
  currentPc: number | null
  /** Spelled name of the note being called, for the hint line. */
  currentDisplay?: string | null
  tuning: TuningId
  /** Rows run 6th string down to 1st, the way a left-handed player sees them. */
  leftHanded: boolean
  onTuning: (id: TuningId) => void
  onLeftHanded: (leftHanded: boolean) => void
}

export function FretboardCard({
  currentPc,
  currentDisplay,
  tuning,
  leftHanded,
  onTuning,
  onLeftHanded,
}: FretboardCardProps) {
  const strings = neckStrings(tuning, currentPc, leftHanded)
  const neck = describeNeck(tuning, leftHanded)
  const hint =
    currentPc !== null && currentDisplay
      ? `Every ${currentDisplay} from open to the 12th fret`
      : `Where each note lives — ${neck}`

  // The grid is a picture of the neck: six rows of blank spans whose only
  // content is the dot marking the called note, which reads as nothing at all.
  // Labelling it as an image spells out the positions instead.
  const label =
    currentPc !== null
      ? `Fretboard map: ${currentDisplay ?? 'the called note'} at ${describePositions(strings)}`
      : `Fretboard map: no note called — ${neck}`

  return (
    <section className="panel fretboard-card">
      <div className="panel-heading fretboard-heading">
        <h2>On the neck</h2>
        <p>{hint}</p>
        <div className="fretboard-controls">
          <select
            className="preset-select"
            data-testid="tuning-select"
            aria-label="Tuning"
            value={tuning}
            onChange={(event) => {
              const value = event.target.value
              // The list the options came from is the list this reads back, so
              // a stranger is impossible — but it costs one check to say so.
              if (isTuningId(value)) {
                onTuning(value)
              }
            }}
          >
            {TUNINGS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <SegmentedControl
            className="loose"
            ariaLabel="Handedness"
            testId="handedness"
            options={HANDEDNESS_OPTIONS}
            value={leftHanded ? 'left' : 'right'}
            onChange={(value) => onLeftHanded(value === 'left')}
          />
        </div>
      </div>

      {/* The neck overflows its card on phone widths and nothing inside it is
          focusable, so the scroller itself is the tab stop that reaches frets
          10–12 with the arrow keys. */}
      <div className="fretboard-scroll" tabIndex={0} role="group" aria-label="Fretboard map, scrolls sideways">
        <div className="fretboard" data-testid="fretboard" role="img" aria-label={label}>
          {strings.map((string, rowIndex) => (
            // Keyed by ordinal, not MIDI: a tuning may repeat a note across
            // strings — DADGAD has three Ds.
            <div className="fret-row" key={string.ordinal}>
              <span className="string-label">{string.label}</span>
              {FRETS.map((fret) => (
                <span key={fret} className={`fret-cell ${fret === 0 ? 'nut' : ''}`}>
                  {hasInlay(rowIndex, fret) ? <span className="inlay-dot" aria-hidden="true" /> : null}
                  {string.lit.includes(fret) ? <span className="fret-dot" data-testid="fret-dot" /> : null}
                </span>
              ))}
            </div>
          ))}
          <div className="fret-row fret-numbers" aria-hidden="true">
            <span className="string-label" />
            {FRETS.map((fret) => (
              <span key={fret} className="fret-number">
                {fret}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
