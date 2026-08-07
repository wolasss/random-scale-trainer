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
  elapsedMs,
  goalMin,
}: TransportBarProps) {
  const label = transportLabel(isPlaying, isPaused, routineName, routineFinished)

  return (
    <div className="transport-bar">
      <div className="transport-actions">
        <button
          type="button"
          className={`transport-primary ${isPlaying ? 'secondary-button' : 'primary-button'}`}
          data-testid="play-toggle"
          onClick={onPlayPause}
        >
          <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} /> {label}
        </button>
        <button type="button" className="ghost-button transport-reset" data-testid="reset" onClick={onReset}>
          <FontAwesomeIcon icon={faRotateLeft} /> Reset timer
        </button>
      </div>

      {/* Progress toward the goal, read from the playing position — this is what
          lets the Session card live at the foot of the page. */}
      <span className="transport-readout" data-testid="transport-readout">
        {formatElapsed(elapsedMs)} of {goalMin} min
      </span>
    </div>
  )
}
