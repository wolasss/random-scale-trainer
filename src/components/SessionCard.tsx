import { SESSION_GOAL_OPTIONS } from '../constants'
import { formatElapsed } from '../lib/time'
import type { SessionGoalMin } from '../hooks/useSettings'
import { SegmentedControl } from './ui/SegmentedControl'

type SessionCardProps = {
  elapsedMs: number
  goalMin: SessionGoalMin
  onGoal: (minutes: SessionGoalMin) => void
  notesCalled: number
  cyclesCompleted: number
}

export function SessionCard({ elapsedMs, goalMin, onGoal, notesCalled, cyclesCompleted }: SessionCardProps) {
  const goalMs = goalMin * 60_000
  const progressPct = Math.min(100, Math.round((elapsedMs / goalMs) * 100))

  return (
    <section className="panel session-card">
      <div className="panel-heading session-heading">
        <h2>Session</h2>
        <SegmentedControl
          ariaLabel="Practice goal in minutes"
          testId="session-goal"
          options={SESSION_GOAL_OPTIONS.map((minutes) => ({ value: minutes, label: `${minutes} min` }))}
          value={goalMin}
          onChange={onGoal}
        />
      </div>

      <div className="timer-face" data-testid="timer">
        {formatElapsed(elapsedMs)}
      </div>

      <div
        className="session-progress"
        role="progressbar"
        aria-label="Progress toward the practice goal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        data-testid="session-progress"
      >
        <div className="session-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="session-stats">
        <div className="session-stat">
          <span className="session-stat-value" data-testid="stat-notes">
            {notesCalled}
          </span>
          <span className="session-stat-label">notes called</span>
        </div>
        <div className="session-stat">
          <span className="session-stat-value" data-testid="stat-cycles">
            {cyclesCompleted}
          </span>
          <span className="session-stat-label">full cycles</span>
        </div>
      </div>
    </section>
  )
}
