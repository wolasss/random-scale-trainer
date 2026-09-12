import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay'
import { faStop } from '@fortawesome/free-solid-svg-icons/faStop'
import { PLAYBACK_MESSAGES } from '../constants'
import { formatElapsed } from '../lib/time'

type ListWorkoutTimerProps = {
  isPlaying: boolean
  started: boolean
  elapsedMs: number
  countIn: number | null
  playbackMessage: string
  onToggle: () => void
  onRestart: () => void
}

const PLAYBACK_PROBLEMS = new Set<string>([
  PLAYBACK_MESSAGES.noNotes,
  PLAYBACK_MESSAGES.audioUnsupported,
  PLAYBACK_MESSAGES.audioLoadFailed,
  PLAYBACK_MESSAGES.hiddenTooLong,
])

/**
 * List-only presents the existing session clock as an attempt stopwatch. It
 * owns no timing state: the same action still starts and stops playback, the
 * metronome and the session clock together.
 */
export function ListWorkoutTimer({
  isPlaying,
  started,
  elapsedMs,
  countIn,
  playbackMessage,
  onToggle,
  onRestart,
}: ListWorkoutTimerProps) {
  const hasStoppedResult = started && !isPlaying
  const isLoading = isPlaying && playbackMessage === PLAYBACK_MESSAGES.loadingAudio
  const isCountingIn = isPlaying && countIn !== null
  const problem = PLAYBACK_PROBLEMS.has(playbackMessage) ? playbackMessage : null

  const label = problem
    ? 'Needs attention'
    : isLoading
    ? 'Preparing'
    : isCountingIn
      ? `Starting in ${countIn}`
      : isPlaying
        ? 'Running'
        : hasStoppedResult
          ? 'Result'
          : 'Ready'
  const action = isPlaying ? 'Stop' : hasStoppedResult ? 'Retry same list' : 'Start timed attempt'
  const handlePrimary = hasStoppedResult ? onRestart : onToggle

  return (
    <section
      className={`list-workout-timer ${hasStoppedResult ? 'finished' : isPlaying ? 'running' : 'ready'}`}
      aria-label="List workout timer"
    >
      <div className="list-workout-main">
        <div className="list-workout-readout">
          <span className="list-workout-state" aria-live="polite">
            {label}
          </span>
          <output
            className="list-workout-time"
            data-testid="list-workout-time"
            aria-label={`Elapsed time ${formatElapsed(elapsedMs)}`}
          >
            {formatElapsed(elapsedMs)}
          </output>
        </div>

        <div className="list-workout-actions">
          <button
            type="button"
            className="list-workout-toggle primary-button"
            data-testid="play-toggle"
            onClick={handlePrimary}
          >
            <FontAwesomeIcon icon={isPlaying ? faStop : faPlay} aria-hidden="true" /> {action}
          </button>
        </div>
      </div>

      {problem ? (
        <p className="list-workout-status" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  )
}
