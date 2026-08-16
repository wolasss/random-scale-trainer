import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPause, faPlay } from '@fortawesome/free-solid-svg-icons'
import { transportLabel, type TransportState } from '../lib/transport'
import { formatElapsed } from '../lib/time'
import type { SessionGoalMin } from '../hooks/useSettings'

/**
 * The play control, shared by both readings of the transport — the desktop bar
 * and the stand's bottom control. It is the only start button in the app, so
 * the two can only differ in where they sit, never in what they say.
 */
export function PlayToggle({
  transport,
  className,
  onClick,
}: {
  transport: TransportState
  className: string
  onClick: () => void
}) {
  const label = transportLabel(
    transport.isPlaying,
    transport.isPaused,
    transport.routineName,
    transport.routineFinished,
  )

  return (
    <button
      type="button"
      className={`${className} ${transport.isPlaying ? 'secondary-button' : 'primary-button'}`}
      data-testid="play-toggle"
      onClick={onClick}
    >
      <FontAwesomeIcon icon={transport.isPlaying ? faPause : faPlay} /> {label}
    </button>
  )
}

/**
 * Progress toward the goal, read from the playing position — this is what lets
 * the Session card live at the foot of the page. Both transports render it, and
 * both wait for the first press before showing it.
 */
export function GoalReadout({
  elapsedMs,
  goalMin,
  className,
}: {
  elapsedMs: number
  goalMin: SessionGoalMin
  className?: string
}) {
  return (
    <span className={`transport-readout ${className ?? ''}`.trim()} data-testid="transport-readout">
      {formatElapsed(elapsedMs)} of {goalMin} min
    </span>
  )
}
