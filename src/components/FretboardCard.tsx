// Standard tuning, high e → low E, by MIDI note number.
const STRING_MIDI = [64, 59, 55, 50, 45, 40]
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']
const STRING_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th']
const FRETS = Array.from({ length: 13 }, (_, fret) => fret)

// Classic inlay markers, drawn on the string boundary below the given row so
// singles sit on the neck's center line and fret 12 gets a symmetric pair.
function hasInlay(stringIndex: number, fret: number) {
  if (fret === 12) return stringIndex === 1 || stringIndex === 3
  return stringIndex === 2 && [3, 5, 7, 9].includes(fret)
}

// One model of where a pitch class lives: for each string, high e first, the
// frets in 0–12 that sound it. The dots and the spoken reading are both drawn
// from the same instance, so the picture and its label cannot drift apart.
function litFrets(pc: number) {
  return STRING_MIDI.map((midi) => FRETS.filter((fret) => (midi + fret) % 12 === pc))
}

// Reads the lit dots out in the order they are drawn, high e string first, so
// someone hearing the label can walk the neck in the same order as someone
// looking at it. Every string carries the note somewhere in 0–12, and a string
// whose open note matches also lights the 12th fret.
function describePositions(lit: number[][]) {
  return lit
    .map((frets, stringIndex) => {
      const spoken = frets.map((fret) => (fret === 0 ? 'open' : `fret ${fret}`))

      return `${STRING_ORDINALS[stringIndex]} string (${STRING_LABELS[stringIndex]}) ${spoken.join(' and ')}`
    })
    .join(', ')
}

type FretboardCardProps = {
  currentPc: number | null
  /** Spelled name of the note being called, for the hint line. */
  currentDisplay?: string | null
}

export function FretboardCard({ currentPc, currentDisplay }: FretboardCardProps) {
  const lit = currentPc !== null ? litFrets(currentPc) : null
  const hint =
    lit !== null && currentDisplay
      ? `Every ${currentDisplay} from open to the 12th fret`
      : 'Where each note lives — all six strings, standard tuning'

  // The grid is a picture of the neck: six rows of blank spans whose only
  // content is the dot marking the called note, which reads as nothing at all.
  // Labelling it as an image spells out the positions instead.
  const label =
    lit !== null
      ? `Fretboard map: ${currentDisplay ?? 'the called note'} at ${describePositions(lit)}`
      : 'Fretboard map: no note called — all six strings, standard tuning'

  return (
    <section className="panel fretboard-card">
      <div className="panel-heading fretboard-heading">
        <h2>On the neck</h2>
        <p>{hint}</p>
      </div>

      {/* The neck overflows its card on phone widths and nothing inside it is
          focusable, so the scroller itself is the tab stop that reaches frets
          10–12 with the arrow keys. */}
      <div className="fretboard-scroll" tabIndex={0} role="group" aria-label="Fretboard map, scrolls sideways">
        <div className="fretboard" data-testid="fretboard" role="img" aria-label={label}>
          {STRING_MIDI.map((midi, stringIndex) => (
            <div className="fret-row" key={midi}>
              <span className="string-label">{STRING_LABELS[stringIndex]}</span>
              {FRETS.map((fret) => (
                <span key={fret} className={`fret-cell ${fret === 0 ? 'nut' : ''}`}>
                  {hasInlay(stringIndex, fret) ? <span className="inlay-dot" aria-hidden="true" /> : null}
                  {lit?.[stringIndex].includes(fret) ? (
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
