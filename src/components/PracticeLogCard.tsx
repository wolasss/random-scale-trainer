import {
  bestStreak,
  buildWindow,
  currentStreak,
  hasHistory,
  recentTotals,
  STREAK_MIN_SECONDS,
  type PracticeHistory,
} from '../lib/history'

type PracticeLogCardProps = {
  history: PracticeHistory
  onClear: () => void
  /** Injectable for tests; the card is otherwise pinned to the real calendar. */
  today?: Date
}

const barTitle = (minutes: number, sec: number) => {
  if (sec === 0) {
    return 'no practice'
  }

  return minutes === 0 ? 'under a minute' : `${minutes} min`
}

/**
 * Leads with the streak rather than a cumulative total. A total rewards people
 * who already practise; a streak gives someone deciding whether to pick the
 * guitar up tonight a specific reason to. The bars exist to make a gap visible
 * without nagging about it — that is the whole mechanic, and it stops there.
 */
export function PracticeLogCard({ history, onClear, today }: PracticeLogCardProps) {
  const now = today ?? new Date()
  const streak = currentStreak(history, now)
  const best = bestStreak(history)
  const bars = buildWindow(history, now)
  const totals = recentTotals(history, now)
  const populated = hasHistory(history)

  // A day that has been practised but hasn't reached the minute reads as a
  // drawn bar next to a zero, which looks like the log lost the session. While
  // that's true, the footer says what the day is short of instead of the
  // seven-day totals — the threshold is worth keeping, but not worth hiding.
  const todayBar = bars[bars.length - 1]
  const shortToday = todayBar.sec > 0 && todayBar.sec < STREAK_MIN_SECONDS

  return (
    <section className="panel practice-log-card">
      <div className="panel-heading practice-log-heading">
        <h2>Practice log</h2>
        {/* "Clear" beside a practice log reads as "delete my history", which is
            the one thing it does not do. It zeroes the session clock and
            nothing else — so it is named after the clock. */}
        <button
          type="button"
          className="practice-log-clear"
          onClick={onClear}
          data-testid="practice-log-clear"
          title="Put the session clock back to 00:00 — the log below is kept"
        >
          Reset clock
        </button>
      </div>

      <div className="practice-log-streak">
        <span className="practice-log-streak-value" data-testid="practice-streak">
          {streak}
        </span>
        <span className="practice-log-streak-label">{streak === 1 ? 'day in a row' : 'days in a row'}</span>
        {/* Nothing to say about a best of zero, and 'your best yet' on day one
            would be the kind of empty praise that makes the number worthless. */}
        {best > 0 ? (
          <span className="practice-log-best" data-testid="practice-best">
            {streak === best ? 'your best yet' : `best ${best}`}
          </span>
        ) : null}
      </div>

      <div className="practice-log-bars" data-testid="practice-bars">
        {bars.map((bar) => (
          <div className="practice-log-column" key={bar.key}>
            <div className="practice-log-track">
              <div
                className={bar.sec > 0 ? 'practice-log-bar' : 'practice-log-bar is-empty'}
                style={bar.sec > 0 ? { height: `${(bar.ratio * 100).toFixed(2)}%` } : undefined}
                title={barTitle(bar.minutes, bar.sec)}
                role="img"
                aria-label={`${bar.key}: ${barTitle(bar.minutes, bar.sec)}`}
              />
            </div>
            <span className={bar.isToday ? 'practice-log-weekday is-today' : 'practice-log-weekday'}>
              {bar.weekday}
            </span>
          </div>
        ))}
      </div>

      <p className="practice-log-footer" data-testid="practice-log-footer">
        {!populated
          ? 'Your first session lands here.'
          : shortToday
            ? `${todayBar.sec} sec today — a minute starts the streak`
            : `Last 7 days: ${totals.minutes} min, ${totals.notes} notes`}
      </p>
    </section>
  )
}
