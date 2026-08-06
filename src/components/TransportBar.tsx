import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPause, faPlay, faRotateLeft } from '@fortawesome/free-solid-svg-icons'

type TransportBarProps = {
  isPlaying: boolean
  isPaused: boolean
  /** Name of the selected routine, or null for free practice. */
  routineName?: string | null
  routineFinished?: boolean
  onPlayPause: () => void
  onReset: () => void
}

/** The only start button in the app — it labels itself from state. */
const transportLabel = (
  isPlaying: boolean,
  isPaused: boolean,
  routineName: string | null | undefined,
  routineFinished: boolean | undefined,
) => {
  if (isPlaying) return 'Pause'
  if (routineFinished) return 'Restart routine'
  if (isPaused) return 'Resume'
  return routineName ? `Start ${routineName}` : 'Start practice'
}

export function TransportBar({
  isPlaying,
  isPaused,
  routineName,
  routineFinished,
  onPlayPause,
  onReset,
}: TransportBarProps) {
  const label = transportLabel(isPlaying, isPaused, routineName, routineFinished)

  return (
    <div className="transport-bar">
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
  )
}
