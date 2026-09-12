import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faShuffle } from '@fortawesome/free-solid-svg-icons/faShuffle'
import { createNoteDeck } from '../lib/playback/deck'
import type { NoteCall, SpellingPreference } from '../lib/notes'

type NoteListProps = {
  pool: number[]
  spelling: SpellingPreference
  locked?: boolean
  hasResult?: boolean
  onRegenerate?: () => void
  /** Injectable so the shuffled order and regeneration stay deterministic in tests. */
  random?: () => number
}

const dealList = (pool: number[], spelling: SpellingPreference, random?: () => number): NoteCall[] => {
  const deck = createNoteDeck({
    getPool: () => pool,
    getSpelling: () => spelling,
    ...(random === undefined ? {} : { random }),
  })

  const notes: NoteCall[] = []
  for (let index = 0; index < pool.length; index += 1) {
    const note = deck.draw()
    if (note !== null) {
      notes.push(note)
    }
  }
  return notes
}

/**
 * One shuffled practice list, deliberately independent from playback. Beat
 * snapshots and setup edits may re-render this component, but only the button
 * deals a new order.
 */
export function NoteList({
  pool,
  spelling,
  locked = false,
  hasResult = false,
  onRegenerate,
  random,
}: NoteListProps) {
  const [notes, setNotes] = useState(() => dealList(pool, spelling, random))

  return (
    <div className="note-list-block">
      <ol className="note-list" data-testid="note-list" aria-label="Practice note order">
        {notes.map((note) => (
          <li key={note.pc} className="note-list-item" data-testid="note-list-item">
            {note.display}
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="ghost-button note-list-regenerate"
        data-testid="note-list-regenerate"
        disabled={locked}
        onClick={() => {
          onRegenerate?.()
          setNotes(dealList(pool, spelling, random))
        }}
      >
        {locked ? (
          'List locked while timing'
        ) : (
          <>
            <FontAwesomeIcon icon={faShuffle} aria-hidden="true" />{' '}
            {hasResult ? 'New list · Reset timer' : 'Regenerate list'}
          </>
        )}
      </button>
    </div>
  )
}
