import {
  CAPO_OPTIONS,
  findTuning,
  hasInlay,
  isCapo,
  isTuningId,
  neckModel,
  TUNINGS,
  type TuningId,
} from '../lib/tuning'

type FretboardCardProps = {
  currentPc: number | null
  /** Spelled name of the note being called, for the hint line. */
  currentDisplay?: string | null
  tuning: TuningId
  /** Fret the capo is clamped to; 0 means none. */
  capo: number
  onTuningChange: (value: TuningId) => void
  onCapoChange: (value: number) => void
}

export function FretboardCard({
  currentPc,
  currentDisplay,
  tuning,
  capo,
  onTuningChange,
  onCapoChange,
}: FretboardCardProps) {
  // One model of the neck: the dots, the numbers under them and the spoken
  // reading are all drawn from the same instance, so the picture and its label
  // cannot drift apart.
  const neck = neckModel(findTuning(tuning), capo, currentPc)
  const called = currentPc !== null

  const hint =
    called && currentDisplay
      ? capo === 0
        ? `Every ${currentDisplay} from open to the 12th fret`
        : `Every ${currentDisplay} from the capo up twelve frets`
      : `Where each note lives — ${neck.summary}`

  // The grid is a picture of the neck: rows of blank spans whose only content
  // is the dot marking the called note, which reads as nothing at all.
  // Labelling it as an image spells out the positions instead.
  const label = called
    ? `Fretboard map: ${currentDisplay ?? 'the called note'} at ${neck.reading}`
    : `Fretboard map: no note called — ${neck.summary}`

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
              // The options came from this same list, so an id it doesn't hold
              // is impossible — but it costs one check to say so.
              if (isTuningId(value)) {
                onTuningChange(value)
              }
            }}
          >
            {TUNINGS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>

          <select
            className="preset-select"
            data-testid="capo-select"
            aria-label="Capo"
            value={capo}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (isCapo(value)) {
                onCapoChange(value)
              }
            }}
          >
            {CAPO_OPTIONS.map((fret) => (
              <option key={fret} value={fret}>
                {fret === 0 ? 'No capo' : `Capo ${fret}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="fretboard-scroll">
        <div className="fretboard" data-testid="fretboard" role="img" aria-label={label}>
          {neck.strings.map((string, stringIndex) => (
            // Keyed by position, not by note: two strings can be tuned to the
            // same pitch (DADGAD, Open G) and share a MIDI number.
            <div className="fret-row" key={stringIndex}>
              <span className="string-label">{string.label}</span>
              {neck.frets.map((fret) => (
                <span key={fret} className={`fret-cell ${fret === capo ? 'nut' : ''}`}>
                  {hasInlay(neck.strings.length, stringIndex, fret, capo) ? (
                    <span className="inlay-dot" aria-hidden="true" />
                  ) : null}
                  {string.lit.includes(fret) ? <span className="fret-dot" data-testid="fret-dot" /> : null}
                </span>
              ))}
            </div>
          ))}
          <div className="fret-row fret-numbers" aria-hidden="true">
            <span className="string-label" />
            {neck.frets.map((fret) => (
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
