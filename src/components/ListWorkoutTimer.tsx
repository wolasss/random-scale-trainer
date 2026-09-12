import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay'
import { faStop } from '@fortawesome/free-solid-svg-icons/faStop'
import { PLAYBACK_MESSAGES } from '../constants'
import { formatElapsed } from '../lib/time'

type ListWorkoutTimerProps = {
  isPlaying: boolean
  isPaused: boolean
  started: boolean
  elapsedMs: number
  metronomeEnabled: boolean
  beatsPerNote: number
  beatInSpan: number
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
  isPaused,
  started,
  elapsedMs,
  metronomeEnabled,
  beatsPerNote,
  beatInSpan,
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
    ? 'Preparing audio'
    : isCountingIn
      ? `Starting in ${countIn}`
      : isPlaying
        ? 'In progress'
        : hasStoppedResult
          ? 'Finished in'
          : 'Workout time'
  const status = problem ?? (isLoading
    ? PLAYBACK_MESSAGES.loadingAudio
    : isCountingIn
      ? metronomeEnabled ? 'Count-in' : 'Silent count-in'
      : isPlaying
        ? metronomeEnabled ? `Beat ${beatInSpan + 1} of ${beatsPerNote}` : 'Metronome off'
        : hasStoppedResult
          ? 'Result ready to note down'
          : metronomeEnabled ? 'Starts the timer and metronome' : 'Starts the workout timer')
  const action = isPlaying ? 'Stop' : hasStoppedResult ? 'Retry same list' : 'Start workout'
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

      {hasStoppedResult && isPaused ? (
        <button type="button" className="list-workout-continue" onClick={onToggle}>
          Continue attempt
        </button>
      ) : null}

      <p className="list-workout-status">{status}</p>
    </section>
  )
}
