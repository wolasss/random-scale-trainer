// Standard tuning, high e → low E, by MIDI note number.
const STRING_MIDI = [64, 59, 55, 50, 45, 40]
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']
const FRETS = Array.from({ length: 13 }, (_, fret) => fret)

// Classic inlay markers, drawn on the string boundary below the given row so
// singles sit on the neck's center line and fret 12 gets a symmetric pair.
function hasInlay(stringIndex: number, fret: number) {
  if (fret === 12) return stringIndex === 1 || stringIndex === 3
  return stringIndex === 2 && [3, 5, 7, 9].includes(fret)
}

type FretboardCardProps = {
  currentPc: number | null
  /** Spelled name of the note being called, for the hint line. */
  currentDisplay?: string | null
}

export function FretboardCard({ currentPc, currentDisplay }: FretboardCardProps) {
  const showDots = currentPc !== null
  const hint =
    showDots && currentDisplay
      ? `Every ${currentDisplay} from open to the 12th fret`
      : 'Where each note lives — all six strings, standard tuning'

  return (
    <section className="panel fretboard-card">
      <div className="panel-heading fretboard-heading">
        <h2>On the neck</h2>
        <p>{hint}</p>
      </div>

      <div className="fretboard-scroll">
        <div className="fretboard" data-testid="fretboard">
          {STRING_MIDI.map((midi, stringIndex) => (
            <div className="fret-row" key={midi}>
              <span className="string-label">{STRING_LABELS[stringIndex]}</span>
              {FRETS.map((fret) => (
                <span key={fret} className={`fret-cell ${fret === 0 ? 'nut' : ''}`}>
                  {hasInlay(stringIndex, fret) ? <span className="inlay-dot" aria-hidden="true" /> : null}
                  {showDots && (midi + fret) % 12 === currentPc ? (
                    <span className="fret-dot" data-testid="fret-dot" />
                  ) : null}
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
