import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay'
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons/faRotateLeft'
import { faStop } from '@fortawesome/free-solid-svg-icons/faStop'
import { PLAYBACK_MESSAGES } from '../constants'
import { formatElapsed } from '../lib/time'

type ListWorkoutTimerProps = {
  isPlaying: boolean
  isPaused: boolean
  started: boolean
  elapsedMs: number
  bpm: number
  beatsPerNote: number
  beatInSpan: number
  countIn: number | null
  playbackMessage: string
  onToggle: () => void
  onRestart: () => void
  onReset: () => void
}

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
  bpm,
  beatsPerNote,
  beatInSpan,
  countIn,
  playbackMessage,
  onToggle,
  onRestart,
  onReset,
}: ListWorkoutTimerProps) {
  const hasStoppedResult = started && !isPlaying
  const isLoading = isPlaying && playbackMessage === PLAYBACK_MESSAGES.loadingAudio
  const isCountingIn = isPlaying && countIn !== null

  const label = isLoading
    ? 'Preparing audio'
    : isCountingIn
      ? `Starting in ${countIn}`
      : isPlaying
        ? 'In progress'
        : hasStoppedResult
          ? 'Finished in'
          : 'Workout time'
  const status = isLoading
    ? PLAYBACK_MESSAGES.loadingAudio
    : isCountingIn
      ? `${bpm} BPM · Count-in`
      : isPlaying
        ? `${bpm} BPM · Beat ${beatInSpan + 1} of ${beatsPerNote}`
        : hasStoppedResult
          ? `${bpm} BPM · Result stays here until reset`
          : `${bpm} BPM · Starts the timer and metronome`
  const action = isPlaying ? 'Stop' : hasStoppedResult ? 'Start again' : 'Start workout'
  const handlePrimary = hasStoppedResult ? onRestart : onToggle

  return (
    <section className="list-workout-timer" aria-label="List workout timer">
      <span className="list-workout-state" aria-live="polite">
        {label}
      </span>
      <output className="list-workout-time" data-testid="list-workout-time" aria-label={`Elapsed time ${formatElapsed(elapsedMs)}`}>
        {formatElapsed(elapsedMs)}
      </output>

      <div className="list-workout-actions">
        <button
          type="button"
          className="list-workout-toggle primary-button"
          data-testid="play-toggle"
          onClick={handlePrimary}
        >
          <FontAwesomeIcon icon={isPlaying ? faStop : faPlay} aria-hidden="true" /> {action}
        </button>

        {hasStoppedResult ? (
          <button type="button" className="ghost-button list-workout-reset" data-testid="reset" onClick={onReset}>
            <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" /> Reset timer
          </button>
        ) : null}
      </div>

      {hasStoppedResult && isPaused ? (
        <button type="button" className="list-workout-continue" onClick={onToggle}>
          Continue this attempt
        </button>
      ) : null}

      <p className="list-workout-status">{status}</p>
    </section>
  )
}
