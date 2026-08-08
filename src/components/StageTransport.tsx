import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPause, faPlay, faRotateLeft, faSliders } from '@fortawesome/free-solid-svg-icons'
import { transportLabel } from '../lib/transport'
import { formatElapsed } from '../lib/time'
import type { SessionGoalMin } from '../hooks/useSettings'

type StageTransportProps = {
  isPlaying: boolean
  isPaused: boolean
  routineName?: string | null
  routineFinished?: boolean
  onPlayPause: () => void
  onReset: () => void
  onOpenSetup: () => void
  /** Anything to unwind yet — hides reset and the readout at a zeroed state,
   * matching the browser transport. */
  started: boolean
  elapsedMs: number
  goalMin: SessionGoalMin
  /** The routine strip, kept in view directly above the controls. */
  strip?: ReactNode
}

/**
 * The transport as it reads on a music stand: pinned to the bottom third, where
 * a thumb actually lands, and padded clear of the home indicator.
 *
 * The play control is the only large target. Setup and reset sit above it —
 * reachable, but never the thing you hit reaching for pause.
 */
export function StageTransport({
  isPlaying,
  isPaused,
  routineName,
  routineFinished,
  onPlayPause,
  onReset,
  onOpenSetup,
  started,
  elapsedMs,
  goalMin,
  strip,
}: StageTransportProps) {
  const label = transportLabel(isPlaying, isPaused, routineName, routineFinished)

  return (
    <div className="stage-foot">
      {strip}

      {/* How far into the session, without opening the sheet — the same readout
          the desktop transport carries, and it waits for the first press with it. */}
      {started ? (
        <span className="transport-readout stage-readout-line" data-testid="transport-readout">
          {formatElapsed(elapsedMs)} of {goalMin} min
        </span>
      ) : null}

      <div className="stage-secondary">
        <button type="button" className="secondary-button stage-setup" onClick={onOpenSetup} data-testid="open-setup">
          <FontAwesomeIcon icon={faSliders} /> Practice setup
        </button>
        {started ? (
          <button
            type="button"
            className="ghost-button stage-reset"
            onClick={onReset}
            data-testid="reset"
            aria-label="Reset session"
          >
            <FontAwesomeIcon icon={faRotateLeft} />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className={`stage-play ${isPlaying ? 'secondary-button' : 'primary-button'}`}
        data-testid="play-toggle"
        onClick={onPlayPause}
      >
        <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} /> {label}
      </button>
    </div>
  )
}
