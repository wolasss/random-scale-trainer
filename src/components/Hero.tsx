import type { ReactNode, RefObject } from 'react'
import type { PlaybackSnapshot } from '../lib/playback/machine'
import type { IdlePreviewNote } from '../hooks/useIdlePreview'
import type { SpellingPreference } from '../lib/notes'
import { PLAYBACK_MESSAGES } from '../constants'
import { useHardwareKeyboard } from '../hooks/useHardwareKeyboard'
import { NoteList } from './NoteList'

type HeroProps = {
  snapshot: PlaybackSnapshot
  bpm: number
  beatsPerNote: number
  pool: number[]
  spelling: SpellingPreference
  ringRef: RefObject<HTMLDivElement | null>
  /** Replaces the coaching line while a multi-block routine names its block. */
  message?: string | undefined
  /** The idle ghost note — null while playing, paused, or the pool is empty. */
  idlePreview?: IdlePreviewNote | null
  /** Replace called-note playback with an unaccented list of notes. */
  listOnly?: boolean
  /** The list-only stopwatch, supplied by App so it shares the real transport. */
  listWorkoutTimer?: ReactNode
  /** A running attempt cannot be invalidated by reshuffling its list. */
  listLocked?: boolean
  onListRegenerate?: () => void
  /**
   * 'stage' is the installed-on-a-phone reading: the glyph takes the room the
   * browser chrome gave up, and the surrounding cards are gone. Everything the
   * desktop shows is still here, just re-stacked and receded.
   */
  variant?: 'card' | 'stage'
}

function BeatDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="beat-dots" data-testid="beat-dots" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={`beat-dot ${index === active ? 'active' : ''}`} />
      ))}
    </div>
  )
}

// The four readings below are shared verbatim by both variants; only the class
// string and the surrounding chrome differ, so those stay with the caller.
function NoteLine({
  className,
  ringRef,
  glyph,
}: {
  className: string
  ringRef: RefObject<HTMLDivElement | null>
  glyph: ReactNode
}) {
  return (
    <div className={className} data-testid="now-playing">
      <div className="beat-ring" ref={ringRef} aria-hidden="true" />
      {glyph}
    </div>
  )
}

function NextChipContent({ nextNote }: { nextNote: PlaybackSnapshot['nextNote'] }) {
  return (
    <>
      <span className="chip-label">Next</span>
      <span className="next-chip-value" data-testid="next-note">
        {nextNote?.display ?? '—'}
      </span>
    </>
  )
}

function CyclePosition({ text }: { text: string }) {
  return (
    <span className="chip-text" data-testid="cycle-position">
      {text}
    </span>
  )
}

function PlaybackMessage({ children }: { children: ReactNode }) {
  return (
    <p className="playback-message" data-testid="playback-message" aria-live="polite">
      {children}
    </p>
  )
}

export function Hero({
  snapshot,
  bpm,
  beatsPerNote,
  pool,
  spelling,
  ringRef,
  message,
  idlePreview,
  listOnly = false,
  listWorkoutTimer,
  listLocked = false,
  onListRegenerate,
  variant = 'card',
}: HeroProps) {
  const { status, currentNote, nextNote, countIn, beatInSpan, positionInCycle, cycleLength } = snapshot
  const state = status === 'playing' ? 'active' : status === 'paused' ? 'paused' : 'idle'
  const isStage = variant === 'stage'

  // The idle line names the Space shortcut, which is nothing to a phone: until
  // there is a keyboard to press it with, say the keyboard-free version.
  const hasKeyboard = useHardwareKeyboard()
  const coachingLine =
    message ??
    (!hasKeyboard && snapshot.message === PLAYBACK_MESSAGES.idle
      ? PLAYBACK_MESSAGES.idleTouch
      : snapshot.message)

  const nowText =
    currentNote && positionInCycle !== null
      ? `note ${positionInCycle} of ${cycleLength}`
      : `${pool.length} notes queued`
  // List-only reports loading, count-in, beat and audio failures beside its own
  // action. Only a routine's explicit block message still sits outside it.
  const showPlaybackMessage = !listOnly || message !== undefined
  const activeBeat = currentNote ? beatInSpan : -1

  // The glyph itself: identical in both readings, so the count-in digit and the
  // note share one element and one pop animation wherever they are shown.
  const glyph =
    countIn !== null ? (
      // key remounts the element per digit so the pop animation replays
      <strong key={`count-${countIn}`} className="hero-note note-pop" data-testid="current-note">
        {countIn}
      </strong>
    ) : currentNote ? (
      <strong key={snapshot.notesCalled} className="hero-note note-pop" data-testid="current-note">
        {currentNote.display}
      </strong>
    ) : (
      // Idle: the ghost note breathes where the real note will land, with the
      // state still named above it. Decoration only — hidden from screen
      // readers, keyed per deal so the CSS crossfade replays, and never the
      // note-pop or beat-ring, which stay exclusive to actual playback.
      <span className="hero-ready-stack">
        <span className="hero-ready hero-ready-caption">ready</span>
        {idlePreview ? (
          <strong key={idlePreview.tick} className="hero-ghost-note" data-testid="idle-ghost" aria-hidden="true">
            {idlePreview.display}
          </strong>
        ) : null}
      </span>
    )

  // List-only never turns a beat into a visual call, including during count-in.
  // The message and click still announce that phase without replacing the list.
  const noteLine = !listOnly ? (
      <NoteLine
        className={`hero-note-line ${isStage ? 'stage-note-line ' : ''}${state}`}
        ringRef={ringRef}
        glyph={glyph}
      />
    ) : null
  const noteList = listOnly ? (
    <NoteList
      pool={pool}
      spelling={spelling}
      bpm={bpm}
      beatsPerNote={beatsPerNote}
      transport={listWorkoutTimer}
      locked={listLocked}
      {...(onListRegenerate === undefined ? {} : { onRegenerate: onListRegenerate })}
    />
  ) : null

  if (isStage) {
    return (
      <section className={`stage-hero ${listOnly ? 'list-only' : ''}`}>
        {noteLine}

        {!listOnly ? <BeatDots count={beatsPerNote} active={activeBeat} /> : null}

        {noteList}

        {!listOnly ? (
          <div className="stage-readout">
            <span className="next-chip stage-next-chip">
              <NextChipContent nextNote={nextNote} />
            </span>
            <CyclePosition text={nowText} />
          </div>
        ) : null}

        {showPlaybackMessage ? <PlaybackMessage>{coachingLine}</PlaybackMessage> : null}
      </section>
    )
  }

  // No card chrome of its own: the note is one half of the practice stage, and
  // the stage card around it draws the panel.
  return (
    <section className={`hero-card ${listOnly ? 'list-only' : ''}`}>
      {!listOnly ? (
        <div className="hero-top">
          <div className="now-chip">
            <CyclePosition text={nowText} />
          </div>
          <div className="next-chip">
            <NextChipContent nextNote={nextNote} />
          </div>
        </div>
      ) : null}

      {noteLine}

      {noteList}

      {showPlaybackMessage ? <PlaybackMessage>{coachingLine}</PlaybackMessage> : null}

      {!listOnly ? <BeatDots count={beatsPerNote} active={activeBeat} /> : null}
    </section>
  )
}
