import type { NoteCall } from '../lib/notes'

type NoteQueueProps = {
  /** The note being called; omitted from the strip while idle or counting in. */
  current: NoteCall | null
  /** What is queued behind it, in the order it will be called. */
  upcoming: NoteCall[]
}

/**
 * The read-ahead list: the note on the glyph plus the ones still to come, so a
 * phrase can be read off the screen instead of one note at a time. Purely a
 * view of the deck — it never draws, so what it shows is exactly what the
 * metronome is about to call, right down to the spelling of each name.
 */
export function NoteQueue({ current, upcoming }: NoteQueueProps) {
  const chips = current ? [current, ...upcoming] : upcoming

  return (
    <ul className="note-queue" data-testid="note-queue" aria-label="Upcoming notes">
      {chips.map((note, index) => (
        <li
          // The strip is a window onto a queue that shifts by one every note,
          // so position is the only stable identity a chip has.
          key={index}
          className={`note-queue-chip ${index === 0 && current ? 'current' : ''} ${
            // A round boundary inside the strip is worth reading: the notes
            // after it come from a fresh bag. Never on the head, which is
            // simply where the strip starts.
            index > 0 && note.cycleStart ? 'cycle-start' : ''
          }`}
          data-testid="note-queue-chip"
        >
          {note.display}
        </li>
      ))}
    </ul>
  )
}
