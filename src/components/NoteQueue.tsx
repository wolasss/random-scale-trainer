import type { NoteCall } from '../lib/notes'

type NoteQueueProps = {
  /** The head of the visible list; omitted while idle or counting in. */
  current: NoteCall | null
  /** What is queued behind it, in the order it will be called. */
  upcoming: NoteCall[]
}

/**
 * The list-only reading: a window onto the deck that gives every note exactly
 * the same treatment. There is deliberately no current state or round marker;
 * the metronome provides the timing without turning one item into a call.
 */
export function NoteQueue({ current, upcoming }: NoteQueueProps) {
  const chips = current ? [current, ...upcoming] : upcoming

  return (
    <ul className="note-queue" data-testid="note-queue" aria-label="Notes">
      {chips.map((note, index) => (
        <li
          // The strip is a window onto a queue that shifts by one every note,
          // so position is the only stable identity a chip has.
          key={index}
          className="note-queue-chip"
          data-testid="note-queue-chip"
        >
          {note.display}
        </li>
      ))}
    </ul>
  )
}
