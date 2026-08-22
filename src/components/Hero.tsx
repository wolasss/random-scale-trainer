import type { ReactNode, RefObject } from 'react'
import type { PlaybackSnapshot } from '../lib/playback/machine'
import type { IdlePreviewNote } from '../hooks/useIdlePreview'
import { PLAYBACK_MESSAGES } from '../constants'
import { useHardwareKeyboard } from '../hooks/useHardwareKeyboard'
import { describeString, STRING_LABELS, STRING_ORDINALS } from '../lib/strings'

type HeroProps = {
  snapshot: PlaybackSnapshot
  beatsPerNote: number
  poolSize: number
  ringRef: RefObject<HTMLDivElement | null>
  /** Replaces the coaching line while a multi-block routine names its block. */
  message?: string
  /** The idle ghost note — null while playing, paused, or the pool is empty. */
  idlePreview?: IdlePreviewNote | null
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
      {/* The note's own span stays the bare name: the string it is coming on
          rides beside it rather than inside it. */}
      <span className="next-chip-value" data-testid="next-note">
        {nextNote?.display ?? '—'}
      </span>
      {nextNote?.stringIndex !== undefined ? (
        <span
          className="next-chip-string"
          data-testid="next-string"
          role="img"
          aria-label={`on the ${describeString(nextNote.stringIndex)}`}
        >
          {STRING_ORDINALS[nextNote.stringIndex]}
        </span>
      ) : null}
    </>
  )
}

/**
 * Which string to find the note on, when the call names one. The ordinal is
 * what a player counts with and the letter is what the neck is labelled with,
 * so the badge carries both; a screen reader gets the sentence instead.
 */
function StringBadge({ stringIndex }: { stringIndex: number }) {
  return (
    <span
      className="hero-string"
      data-testid="called-string"
      role="img"
      aria-label={describeString(stringIndex)}
    >
      {STRING_ORDINALS[stringIndex]} · {STRING_LABELS[stringIndex]}
    </span>
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

export function Hero({ snapshot, beatsPerNote, poolSize, ringRef, message, idlePreview, variant = 'card' }: HeroProps) {
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

  // Only ever a string while a note is actually on screen: the count-in has no
  // call to place, and the idle ghost is decoration.
  const calledString = currentNote?.stringIndex

  const nowText =
    currentNote && positionInCycle !== null
      ? `note ${positionInCycle} of ${cycleLength}`
      : `${poolSize} notes queued`

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

  if (isStage) {
    return (
      <section className="stage-hero">
        <NoteLine className={`hero-note-line stage-note-line ${state}`} ringRef={ringRef} glyph={glyph} />

        {calledString !== undefined ? <StringBadge stringIndex={calledString} /> : null}

        <BeatDots count={beatsPerNote} active={currentNote ? beatInSpan : -1} />

        <div className="stage-readout">
          <span className="next-chip stage-next-chip">
            <NextChipContent nextNote={nextNote} />
          </span>
          <CyclePosition text={nowText} />
        </div>

        <PlaybackMessage>{coachingLine}</PlaybackMessage>
      </section>
    )
  }

  // No card chrome of its own: the note is one half of the practice stage, and
  // the stage card around it draws the panel.
  return (
    <section className="hero-card">
      <div className="hero-top">
        <div className="now-chip">
          <CyclePosition text={nowText} />
        </div>
        <div className="next-chip">
          <NextChipContent nextNote={nextNote} />
        </div>
      </div>

      <NoteLine className={`hero-note-line ${state}`} ringRef={ringRef} glyph={glyph} />

      {calledString !== undefined ? <StringBadge stringIndex={calledString} /> : null}

      <PlaybackMessage>{coachingLine}</PlaybackMessage>

      <BeatDots count={beatsPerNote} active={currentNote ? beatInSpan : -1} />
    </section>
  )
}
