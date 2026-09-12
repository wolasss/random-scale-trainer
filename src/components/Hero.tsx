import type { ReactNode, RefObject } from 'react'
import type { PlaybackSnapshot } from '../lib/playback/machine'
import type { IdlePreviewNote } from '../hooks/useIdlePreview'
import type { SpellingPreference } from '../lib/notes'
import { PLAYBACK_MESSAGES } from '../constants'
import { useHardwareKeyboard } from '../hooks/useHardwareKeyboard'
import { NoteList } from './NoteList'

type HeroProps = {
  snapshot: PlaybackSnapshot
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
  /** A completed list result is reset if a different order replaces it. */
  listHasResult?: boolean
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
  beatsPerNote,
  pool,
  spelling,
  ringRef,
  message,
  idlePreview,
  listOnly = false,
  listWorkoutTimer,
  listLocked = false,
  listHasResult = false,
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
    listOnly
      ? `${pool.length}-note list`
      : currentNote && positionInCycle !== null
      ? `note ${positionInCycle} of ${cycleLength}`
      : `${pool.length} notes queued`
  const listTimerHandlesMessage =
    snapshot.message === PLAYBACK_MESSAGES.idle ||
    snapshot.message === PLAYBACK_MESSAGES.idleTouch ||
    snapshot.message === PLAYBACK_MESSAGES.loadingAudio ||
    snapshot.message === PLAYBACK_MESSAGES.countingIn ||
    snapshot.message === PLAYBACK_MESSAGES.playing ||
    snapshot.message === PLAYBACK_MESSAGES.paused
  const showPlaybackMessage = !listOnly || message !== undefined || !listTimerHandlesMessage
  const activeBeat = currentNote && (!listOnly || status === 'playing') ? beatInSpan : -1

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
      locked={listLocked}
      hasResult={listHasResult}
      {...(onListRegenerate === undefined ? {} : { onRegenerate: onListRegenerate })}
    />
  ) : null

  if (isStage) {
    return (
      <section className={`stage-hero ${listOnly ? 'list-only' : ''}`}>
        {listOnly ? (
          <div className="stage-readout list-stage-heading">
            <CyclePosition text={nowText} />
          </div>
        ) : null}

        {noteLine}

        {listWorkoutTimer}

        <BeatDots count={beatsPerNote} active={activeBeat} />

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
      <div className="hero-top">
        <div className="now-chip">
          <CyclePosition text={nowText} />
        </div>
        {!listOnly ? (
          <div className="next-chip">
            <NextChipContent nextNote={nextNote} />
          </div>
        ) : null}
      </div>

      {listWorkoutTimer}

      {listOnly ? <BeatDots count={beatsPerNote} active={activeBeat} /> : null}

      {noteLine}

      {noteList}

      {showPlaybackMessage ? <PlaybackMessage>{coachingLine}</PlaybackMessage> : null}

      {!listOnly ? <BeatDots count={beatsPerNote} active={activeBeat} /> : null}
    </section>
  )
}
