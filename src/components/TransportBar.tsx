import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPause, faPlay, faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { transportLabel } from '../lib/transport'
import { formatElapsed } from '../lib/time'
import type { SessionGoalMin } from '../hooks/useSettings'

type TransportBarProps = {
  isPlaying: boolean
  isPaused: boolean
  /** Name of the selected routine, or null for free practice. */
  routineName?: string | null
  routineFinished?: boolean
  onPlayPause: () => void
  onReset: () => void
  /** Anything to unwind yet — clock, counters or routine position. Until then
   * the bar is just the start button: no reset with nothing to reset, and no
   * second number to parse before the first press. */
  started: boolean
  elapsedMs: number
  goalMin: SessionGoalMin
}

export function TransportBar({
  isPlaying,
  isPaused,
  routineName,
  routineFinished,
  onPlayPause,
  onReset,
  started,
  elapsedMs,
  goalMin,
}: TransportBarProps) {
  const label = transportLabel(isPlaying, isPaused, routineName, routineFinished)

  return (
    <div className={`transport-bar ${started ? '' : 'zeroed'}`}>
      <div className="transport-actions">
        <button
          type="button"
          className={`transport-primary ${isPlaying ? 'secondary-button' : 'primary-button'}`}
          data-testid="play-toggle"
          onClick={onPlayPause}
        >
          <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} /> {label}
        </button>
        {/* Named for its scope, not its most visible effect: this puts the
            clock, the counters and the routine's place in it all back to the
            start. The practice log's own control is the narrow one. */}
        {started ? (
          <button
            type="button"
            className="ghost-button transport-reset"
            data-testid="reset"
            onClick={onReset}
            title="Back to the start — clock, counters and routine position"
          >
            <FontAwesomeIcon icon={faRotateLeft} /> Reset session
          </button>
        ) : null}
      </div>

      {/* Progress toward the goal, read from the playing position — this is what
          lets the Session card live at the foot of the page. */}
      {started ? (
        <span className="transport-readout" data-testid="transport-readout">
          {formatElapsed(elapsedMs)} of {goalMin} min
        </span>
      ) : null}
    </div>
  )
}
