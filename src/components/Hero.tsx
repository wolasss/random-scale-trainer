import type { RefObject } from 'react'
import type { PlaybackSnapshot } from '../lib/playback/machine'

type HeroProps = {
  snapshot: PlaybackSnapshot
  beatsPerNote: number
  earOnly: boolean
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

export function Hero({ snapshot, beatsPerNote, earOnly, ringRef }: HeroProps) {
  const { status, currentNote, nextNote, countIn, beatInSpan, positionInCycle, cycleLength, message } = snapshot
  const state = status === 'playing' ? 'active' : status === 'paused' ? 'paused' : 'idle'
  // Ear-only hides the note until the last beat of its span for self-checking.
  const revealed = !earOnly || beatInSpan === beatsPerNote - 1

  return (
    <section className="hero-card panel">
      <div className="hero-top">
        <div>
          <h1>Random notes generator</h1>
          <p className="lede">Train music notes in random order. Hear each note on the beat</p>
        </div>
        {nextNote && !earOnly ? (
          <div className="next-chip">
            <span className="next-chip-label">Next</span>
            <span className="next-chip-value" data-testid="next-note">
              {nextNote.display}
            </span>
          </div>
        ) : null}
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
            {revealed ? currentNote.display : '?'}
          </strong>
        ) : (
          <span className="hero-ready">ready</span>
        )}
      </div>

      <div className="hero-meta">
        {currentNote && positionInCycle !== null ? (
          <span className="cycle-position" data-testid="cycle-position">
            note {positionInCycle} of {cycleLength}
          </span>
        ) : null}
        {currentNote ? <BeatDots count={beatsPerNote} active={beatInSpan} /> : null}
      </div>

      <p className="playback-message" data-testid="playback-message" aria-live="polite">
        {message}
      </p>
    </section>
  )
}
