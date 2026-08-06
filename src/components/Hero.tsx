import type { RefObject } from 'react'
import type { PlaybackSnapshot } from '../lib/playback/machine'

type HeroProps = {
  snapshot: PlaybackSnapshot
  beatsPerNote: number
  poolSize: number
  ringRef: RefObject<HTMLDivElement | null>
  /** Replaces the coaching line while a multi-block routine names its block. */
  message?: string
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

export function Hero({ snapshot, beatsPerNote, poolSize, ringRef, message, variant = 'card' }: HeroProps) {
  const { status, currentNote, nextNote, countIn, beatInSpan, positionInCycle, cycleLength } = snapshot
  const state = status === 'playing' ? 'active' : status === 'paused' ? 'paused' : 'idle'
  const isStage = variant === 'stage'

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
      <span className="hero-ready">ready</span>
    )

  if (isStage) {
    return (
      <section className="stage-hero">
        <div className={`hero-note-line stage-note-line ${state}`} data-testid="now-playing">
          <div className="beat-ring" ref={ringRef} aria-hidden="true" />
          {glyph}
        </div>

        <BeatDots count={beatsPerNote} active={currentNote ? beatInSpan : -1} />

        <div className="stage-readout">
          <span className="next-chip stage-next-chip">
            <span className="chip-label">Next</span>
            <span className="next-chip-value" data-testid="next-note">
              {nextNote?.display ?? '—'}
            </span>
          </span>
          <span className="chip-text" data-testid="cycle-position">
            {nowText}
          </span>
        </div>

        <p className="playback-message" data-testid="playback-message" aria-live="polite">
          {message ?? snapshot.message}
        </p>
      </section>
    )
  }

  // No card chrome of its own: the note is one half of the practice stage, and
  // the stage card around it draws the panel.
  return (
    <section className="hero-card">
      <div className="hero-top">
        <div className="now-chip">
          <span className="chip-text" data-testid="cycle-position">
            {nowText}
          </span>
        </div>
        <div className="next-chip">
          <span className="chip-label">Next</span>
          <span className="next-chip-value" data-testid="next-note">
            {nextNote?.display ?? '—'}
          </span>
        </div>
      </div>

      <div className={`hero-note-line ${state}`} data-testid="now-playing">
        <div className="beat-ring" ref={ringRef} aria-hidden="true" />
        {glyph}
      </div>

      <p className="playback-message" data-testid="playback-message" aria-live="polite">
        {message ?? snapshot.message}
      </p>

      <BeatDots count={beatsPerNote} active={currentNote ? beatInSpan : -1} />
    </section>
  )
}
