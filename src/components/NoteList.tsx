import { useState, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faShuffle } from '@fortawesome/free-solid-svg-icons/faShuffle'
import { createNoteDeck, type NoteOrder } from '../lib/playback/deck'
import type { NoteCall, SpellingPreference } from '../lib/notes'

type NoteListProps = {
  pool: number[]
  spelling: SpellingPreference
  /** The order the list is dealt in; a fourths list starts on a random note. */
  order?: NoteOrder | undefined
  bpm: number
  metronomeEnabled: boolean
  beatsPerNote: number
  transport: ReactNode
  locked?: boolean
  onRegenerate?: () => void
  /** Injectable so the shuffled order and regeneration stay deterministic in tests. */
  random?: () => number
}

const dealList = (
  pool: number[],
  spelling: SpellingPreference,
  order: NoteOrder,
  random?: () => number,
): NoteCall[] => {
  const deck = createNoteDeck({
    getPool: () => pool,
    getSpelling: () => spelling,
    getOrder: () => order,
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
  order: NoteOrder
}

const createDeal = (
  pool: number[],
  spelling: SpellingPreference,
  order: NoteOrder,
  random?: () => number,
): NoteListDeal => ({
  notes: dealList(pool, spelling, order, random),
  pool: [...pool],
  spelling,
  order,
})

const samePool = (left: number[], right: number[]) =>
  left.length === right.length && left.every((pc, index) => pc === right[index])

/**
 * One practice list, shuffled or in fourths, deliberately independent from playback. Beat
 * snapshots and setup edits may re-render this component, but only the button
 * deals a new order.
 */
export function NoteList({
  pool,
  spelling,
  order = 'shuffled',
  bpm,
  metronomeEnabled,
  beatsPerNote,
  transport,
  locked = false,
  onRegenerate,
  random,
}: NoteListProps) {
  const [deal, setDeal] = useState(() => createDeal(pool, spelling, order, random))
  const settingsChanged = deal.spelling !== spelling || deal.order !== order || !samePool(deal.pool, pool)
  const timingText = metronomeEnabled
    ? `Metronome on · ${bpm} BPM · ${beatsPerNote === 1 ? 'accent every beat' : `accent every ${beatsPerNote} beats`}`
    : 'Metronome off'

  return (
    <div className="note-list-block">
      <div className="note-list-heading">
        <div className="note-list-context">
          <p className="note-list-title" data-testid="note-list-summary">
            {deal.notes.length}-note list
          </p>
          {settingsChanged ? (
            <p className="note-list-pending" data-testid="note-list-pending" role="status">
              Settings changed · {locked ? 'stop, then shuffle to apply' : 'shuffle to apply'}
            </p>
          ) : (
            <p className="note-list-meta">{timingText}</p>
          )}
        </div>
      </div>

      <ol className="note-list" data-testid="note-list" aria-label="Practice note order">
        {deal.notes.map((note) => (
          <li key={note.pc} className="note-list-item" data-testid="note-list-item">
            {note.display}
          </li>
        ))}
      </ol>

      <div className="note-list-command-bar" data-testid="note-list-command-bar">
        {transport}

        <div className="note-list-action-slot">
          {locked ? (
            <p className="note-list-lock" data-testid="note-list-lock" role="status">
              Shuffle unavailable
            </p>
          ) : (
            <button
              type="button"
              className="ghost-button note-list-regenerate"
              data-testid="note-list-regenerate"
              onClick={() => {
                onRegenerate?.()
                setDeal(createDeal(pool, spelling, order, random))
              }}
            >
              <FontAwesomeIcon icon={faShuffle} aria-hidden="true" /> Shuffle list
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
