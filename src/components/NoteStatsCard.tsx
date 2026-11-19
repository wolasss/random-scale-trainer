import { useState } from 'react'
import {
  FLAT_DISPLAY,
  isNaturalPitchClass,
  PITCH_CLASSES,
  SHARP_DISPLAY,
  type SpellingPreference,
} from '../lib/notes'
import { accuracy, meanResponseMs, type NoteStats } from '../lib/noteStats'

type NoteStatsCardProps = {
  stats: NoteStats
  spelling: SpellingPreference
  /** The notes "Drill weakest" would load; empty until something is played. */
  weakest: readonly number[]
  onDrill: () => void
  onReset: () => void
}

/** The same rule the note chips use: mixed asks by either name, so both show. */
const noteName = (pc: number, spelling: SpellingPreference) => {
  if (spelling === 'sharp' || isNaturalPitchClass(pc)) {
    return SHARP_DISPLAY[pc]
  }

  return spelling === 'flat' ? FLAT_DISPLAY[pc] : `${FLAT_DISPLAY[pc]}/${SHARP_DISPLAY[pc]}`
}

const seconds = (ms: number) => (ms / 1000).toFixed(1)

const notes = (scored: number) => `${scored} ${scored === 1 ? 'note' : 'notes'}`

/**
 * Which of the twelve you actually know, and which you only think you do.
 *
 * A session's accuracy is a single number and it dies with the session, so a
 * player who loses B♭ every time never finds that out — it is averaged in with
 * eleven notes they have cold. This is the same evidence cut the only way that
 * changes what to practise next: per note, kept across sessions, with a button
 * that loads the worst of them into the pool.
 *
 * A note nobody has played says so in words rather than showing a 0% it did not
 * earn — the difference between "you keep missing this" and "we have never
 * asked you" is the whole value of the card, and a zero would collapse it.
 */
export function NoteStatsCard({ stats, spelling, weakest, onDrill, onReset }: NoteStatsCardProps) {
  // Armed the way RoutineCard arms its deletes: this throws away every session
  // that ever fed it, so it does not go on one stray click.
  const [armed, setArmed] = useState(false)
  const resetLabel = armed ? 'Reset? Press again to confirm' : 'Reset note strengths'
  const drillable = weakest.length > 0

  return (
    <section className="panel" data-testid="note-stats-card" aria-labelledby="note-strengths-heading">
      <div className="panel-heading practice-log-heading">
        <h2 id="note-strengths-heading">Note strengths</h2>
        <div className="practice-log-actions">
          <button
            type="button"
            className="practice-log-clear"
            data-testid="note-stats-drill"
            disabled={!drillable}
            title={
              drillable
                ? 'Load the notes you miss most into the note pool'
                : 'Play a few notes with the microphone on first'
            }
            onClick={onDrill}
          >
            Drill weakest
          </button>
          <button
            type="button"
            className="practice-log-clear"
            data-testid="note-stats-reset"
            aria-label={resetLabel}
            title="Forget every note's record — the practice log below is kept"
            onClick={() => {
              if (!armed) {
                setArmed(true)
                return
              }

              setArmed(false)
              onReset()
            }}
            onBlur={() => setArmed(false)}
          >
            {armed ? 'Reset?' : 'Reset'}
          </button>
        </div>
      </div>

      <div className="session-stats" data-testid="note-stats-grid">
        {PITCH_CLASSES.map((pc) => {
          const stat = stats[pc]
          const name = noteName(pc, spelling)
          const hitRate = accuracy(stat)
          const mean = meanResponseMs(stat)

          const detail =
            hitRate === null
              ? 'not practised yet'
              : mean === null
                ? `${notes(stat.scored)} · no hits yet`
                : `${notes(stat.scored)} · ${seconds(mean)} s avg`
          const spoken =
            hitRate === null
              ? `${name}: not practised yet`
              : mean === null
                ? `${name}: none of ${notes(stat.scored)} hit yet`
                : `${name}: ${Math.round(hitRate * 100)} percent of ${notes(stat.scored)}, ${seconds(mean)} seconds on average`

          return (
            <div className="session-stat" key={pc} data-testid={`note-stat-${pc}`} role="img" aria-label={spoken}>
              <span className="session-stat-value">{hitRate === null ? '—' : `${Math.round(hitRate * 100)}%`}</span>
              <span className="session-stat-label">
                {name} · {detail}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
