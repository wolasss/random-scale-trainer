type HeroCardProps = {
  /** Current note name, a count-in digit, or '' to hide the note element. */
  note: string
  message: string
  isPlaying: boolean
  isPaused: boolean
}

export function HeroCard({ note, message, isPlaying, isPaused }: HeroCardProps) {
  return (
    <section className="hero-card panel">
      <h1>Random notes generator</h1>
      <p className="lede">
        Train music notes in random order. Hear each note on the beat
      </p>

      <div className={`now-playing ${isPlaying ? 'active' : isPaused ? 'paused' : 'idle'}`} data-testid="now-playing">
        {/* key={note} remounts the element per note so the pop animation replays */}
        {note !== '' ? <strong key={note} className="current-note note-pop" data-testid="current-note">{note}</strong> : null}
      </div>

      <p className="playback-message" data-testid="playback-message">{message}</p>
    </section>
  )
}
