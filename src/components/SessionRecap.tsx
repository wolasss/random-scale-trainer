import { practiceDayTitle } from '../lib/history'
import type { DayStanding, SessionSummary } from '../lib/session'
import { formatElapsed } from '../lib/time'

type SessionRecapProps = {
  summary: SessionSummary
  day: DayStanding
  onDismiss: () => void
}

/**
 * What you just practised, read once the room has gone quiet.
 *
 * Deliberately not a modal. It appears under the session reading, in the flow
 * the page already had, so it needs no focus trap, no escape key and no stored
 * preference for whether anyone wants it — it is a paragraph that turned up,
 * and the next thing you do makes it go away. Done is not a close button
 * either: it puts the session back to zero, which is the thing anybody reading
 * a finished session is about to want, and it is why the transport behind it
 * reads *Start* rather than *Resume* afterwards.
 *
 * The tiles are the session card's own, so the same figures read the same way
 * in both places. Tempo is the one that has to say more than a number: a
 * session played at one tempo shows it bare, one that moved shows both ends,
 * and a ramp or a hand on the stepper that went higher than either end is
 * named in the label rather than given a tile of its own — where it went is a
 * footnote to where it started and finished, not a fourth figure to compare.
 *
 * Under the tiles, the two lines a session is placed by: what was running, and
 * where the day now stands. The streak clause is dropped entirely at zero
 * rather than printed as "0-day streak", which reads as a scolding for a
 * session someone just finished.
 */
export function SessionRecap({ summary, day, onDismiss }: SessionRecapProps) {
  const { startBpm, endBpm, peakBpm } = summary
  const held = startBpm === endBpm
  const peaked = peakBpm > Math.max(startBpm, endBpm)

  return (
    <section className="session-recap" data-testid="session-recap" role="status">
      <div className="session-recap-heading">
        <h2>What you just practised</h2>
        <button type="button" className="secondary-button" data-testid="recap-done" onClick={onDismiss}>
          Done
        </button>
      </div>

      <div className="session-stats session-recap-stats">
        <RecapStat testId="recap-time" value={formatElapsed(summary.elapsedMs)} label="practised" />
        <RecapStat testId="recap-notes" value={String(summary.notesCalled)} label="notes called" />
        <RecapStat testId="recap-rounds" value={String(summary.cyclesCompleted)} label="rounds" />
        <RecapStat
          testId="recap-tempo"
          value={held ? String(startBpm) : `${startBpm} → ${endBpm}`}
          label={peaked ? `BPM, peaked at ${peakBpm}` : held ? 'BPM held' : 'BPM, start to finish'}
        />
      </div>

      <p className="session-recap-line" data-testid="recap-setup">
        {summary.setup}
      </p>

      <p className="session-recap-line" data-testid="recap-day">
        {`Today: ${practiceDayTitle(Math.round(day.todaySec / 60), day.todaySec)}`}
        {day.streak > 0 ? ` · ${day.streak}-day streak` : ''}
      </p>
    </section>
  )
}

/** The session card's own tile, so a figure reads the same in both places. */
function RecapStat({ testId, value, label }: { testId: string; value: string; label: string }) {
  return (
    <div className="session-stat">
      <span className="session-stat-value" data-testid={testId}>
        {value}
      </span>
      <span className="session-stat-label">{label}</span>
    </div>
  )
}
