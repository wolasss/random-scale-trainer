import type { RefObject } from 'react'
import type { PlaybackSnapshot } from '../lib/playback/machine'

type HeroProps = {
  snapshot: PlaybackSnapshot
  beatsPerNote: number
  poolSize: number
  ringRef: RefObject<HTMLDivElement | null>
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

export function Hero({ snapshot, beatsPerNote, poolSize, ringRef }: HeroProps) {
  const { status, currentNote, nextNote, countIn, beatInSpan, positionInCycle, cycleLength, message } = snapshot
  const state = status === 'playing' ? 'active' : status === 'paused' ? 'paused' : 'idle'

  const nowText =
    currentNote && positionInCycle !== null
      ? `note ${positionInCycle} of ${cycleLength}`
      : `${poolSize} notes in the bag`

  return (
    <section className="hero-card panel">
      <div className="hero-top">
        <div className="now-chip">
          <span className="chip-label">Now</span>
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
        {countIn !== null ? (
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
        )}
      </div>

      <p className="playback-message" data-testid="playback-message" aria-live="polite">
        {message}
      </p>

      <BeatDots count={beatsPerNote} active={currentNote ? beatInSpan : -1} />
    </section>
  )
}
