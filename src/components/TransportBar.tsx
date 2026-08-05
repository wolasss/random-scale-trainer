import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPause, faPlay, faRotateLeft } from '@fortawesome/free-solid-svg-icons'

type TransportBarProps = {
  isPlaying: boolean
  onPlayPause: () => void
  onReset: () => void
}

export function TransportBar({ isPlaying, onPlayPause, onReset }: TransportBarProps) {
  return (
    <div className="transport-bar">
      <button
        type="button"
        className={`transport-primary ${isPlaying ? 'secondary-button' : 'primary-button'}`}
        data-testid="play-toggle"
        onClick={onPlayPause}
      >
        <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} /> {isPlaying ? 'Pause' : 'Start practice'}
      </button>
      <button type="button" className="ghost-button transport-reset" data-testid="reset" onClick={onReset}>
        <FontAwesomeIcon icon={faRotateLeft} /> Reset session
      </button>
    </div>
  )
}
