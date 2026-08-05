// Standard tuning, high e → low E, by MIDI note number.
const STRING_MIDI = [64, 59, 55, 50, 45, 40]
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']
const FRETS = Array.from({ length: 13 }, (_, fret) => fret)

type FretboardCardProps = {
  currentPc: number | null
  /** False while ear-only hides the answer; dots stay off until the reveal. */
  revealed: boolean
}

export function FretboardCard({ currentPc, revealed }: FretboardCardProps) {
  const showDots = currentPc !== null && revealed

  return (
    <section className="panel fretboard-card">
      <div className="panel-heading fretboard-heading">
        <h2>On the neck</h2>
        <p>Every place the called note lives — frets 0–12, standard tuning.</p>
      </div>

      <div className="fretboard-scroll">
        <div className="fretboard" data-testid="fretboard">
          {STRING_MIDI.map((midi, stringIndex) => (
            <div className="fret-row" key={midi}>
              <span className="string-label">{STRING_LABELS[stringIndex]}</span>
              {FRETS.map((fret) => (
                <span key={fret} className={`fret-cell ${fret === 0 ? 'nut' : ''}`}>
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
