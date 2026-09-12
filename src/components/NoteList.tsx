import { useState, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faShuffle } from '@fortawesome/free-solid-svg-icons/faShuffle'
import { createNoteDeck } from '../lib/playback/deck'
import type { NoteCall, SpellingPreference } from '../lib/notes'

type NoteListProps = {
  pool: number[]
  spelling: SpellingPreference
  bpm: number
  beatsPerNote: number
  transport: ReactNode
  locked?: boolean
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

type NoteListDeal = {
  notes: NoteCall[]
  pool: number[]
  spelling: SpellingPreference
}

const createDeal = (
  pool: number[],
  spelling: SpellingPreference,
  random?: () => number,
): NoteListDeal => ({
  notes: dealList(pool, spelling, random),
  pool: [...pool],
  spelling,
})

const samePool = (left: number[], right: number[]) =>
  left.length === right.length && left.every((pc, index) => pc === right[index])

/**
 * One shuffled practice list, deliberately independent from playback. Beat
 * snapshots and setup edits may re-render this component, but only the button
 * deals a new order.
 */
export function NoteList({
  pool,
  spelling,
  bpm,
  beatsPerNote,
  transport,
  locked = false,
  onRegenerate,
  random,
}: NoteListProps) {
  const [deal, setDeal] = useState(() => createDeal(pool, spelling, random))
  const settingsChanged = deal.spelling !== spelling || !samePool(deal.pool, pool)
  const accentText = beatsPerNote === 1 ? 'accent every beat' : `accent every ${beatsPerNote} beats`

  return (
    <div className="note-list-block">
      <div className="note-list-heading">
        <p className="note-list-summary" data-testid="note-list-summary">
          {deal.notes.length}-note workout · {bpm} BPM · {accentText}
        </p>
        {settingsChanged ? (
          <p className="note-list-pending" data-testid="note-list-pending" role="status">
            Settings changed · your next shuffled list will use them.
          </p>
        ) : null}
      </div>

      <ol className="note-list" data-testid="note-list" aria-label="Practice note order">
        {deal.notes.map((note) => (
          <li key={note.pc} className="note-list-item" data-testid="note-list-item">
            {note.display}
          </li>
        ))}
      </ol>

      {transport}

      {locked ? (
        <p className="note-list-lock" data-testid="note-list-lock" role="status">
          List locked during attempt
        </p>
      ) : (
        <button
          type="button"
          className="ghost-button note-list-regenerate"
          data-testid="note-list-regenerate"
          onClick={() => {
            onRegenerate?.()
            setDeal(createDeal(pool, spelling, random))
          }}
        >
          <FontAwesomeIcon icon={faShuffle} aria-hidden="true" /> New shuffled list
        </button>
      )}
    </div>
  )
}
