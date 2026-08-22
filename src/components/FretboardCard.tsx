import { describeString, FRETS, litFrets, STRING_LABELS, STRING_MIDI } from '../lib/strings'

// Classic inlay markers, drawn on the string boundary below the given row so
// singles sit on the neck's center line and fret 12 gets a symmetric pair.
function hasInlay(stringIndex: number, fret: number) {
  if (fret === 12) return stringIndex === 1 || stringIndex === 3
  return stringIndex === 2 && [3, 5, 7, 9].includes(fret)
}

// Reads the lit dots out in the order they are drawn, high e string first, so
// someone hearing the label can walk the neck in the same order as someone
// looking at it. Every string carries the note somewhere in 0–12, and a string
// whose open note matches also lights the 12th fret. With a string called,
// only that one row is drawn and only that one row is read out.
function describePositions(lit: number[][]) {
  return lit
    .map((frets, stringIndex) => {
      if (frets.length === 0) {
        return null
      }

      const spoken = frets.map((fret) => (fret === 0 ? 'open' : `fret ${fret}`))

      return `${describeString(stringIndex)} ${spoken.join(' and ')}`
    })
    .filter((reading) => reading !== null)
    .join(', ')
}

type FretboardCardProps = {
  currentPc: number | null
  /** Spelled name of the note being called, for the hint line. */
  currentDisplay?: string | null
  /** The string the call asks for (0 = high e), or null when it asks for none. */
  currentString?: number | null
}

export function FretboardCard({ currentPc, currentDisplay, currentString = null }: FretboardCardProps) {
  // A called string narrows the picture to that row: the point of the call is
  // to send you to one place on the neck, and six lit dots would say the
  // opposite of what the badge above them says.
  const all = currentPc !== null ? litFrets(currentPc) : null
  const lit =
    all !== null && currentString !== null
      ? all.map((frets, stringIndex) => (stringIndex === currentString ? frets : []))
      : all

  const hint =
    lit !== null && currentDisplay
      ? currentString !== null
        ? `Every ${currentDisplay} on the ${describeString(currentString)}`
        : `Every ${currentDisplay} from open to the 12th fret`
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

      <div className="fretboard-scroll">
        <div
          className="fretboard"
          data-testid="fretboard"
          data-string-called={currentString !== null ? '' : undefined}
          role="img"
          aria-label={label}
        >
          {STRING_MIDI.map((midi, stringIndex) => (
            <div className={`fret-row ${stringIndex === currentString ? 'target' : ''}`} key={midi}>
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
