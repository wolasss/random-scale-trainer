import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRotateLeft, faSliders } from '@fortawesome/free-solid-svg-icons'
import { GoalReadout, PlayToggle } from './TransportControls'
import type { TransportState } from '../lib/transport'
import type { SessionGoalMin } from '../hooks/useSettings'

type StageTransportProps = TransportState & {
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
  onPlayPause,
  onReset,
  onOpenSetup,
  started,
  elapsedMs,
  goalMin,
  strip,
  ...transport
}: StageTransportProps) {
  return (
    <div className="stage-foot">
      {strip}

      {/* How far into the session, without opening the sheet — the same readout
          the desktop transport carries, and it waits for the first press with it. */}
      {started ? <GoalReadout elapsedMs={elapsedMs} goalMin={goalMin} className="stage-readout-line" /> : null}

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

      <PlayToggle transport={transport} className="stage-play" onClick={onPlayPause} />
    </div>
  )
}
