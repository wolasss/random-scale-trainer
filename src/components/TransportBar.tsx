import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { GoalReadout, PlayToggle } from './TransportControls'
import type { TransportState } from '../lib/transport'
import type { SessionGoalMin } from '../hooks/useSettings'

type TransportBarProps = TransportState & {
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
  onPlayPause,
  onReset,
  started,
  elapsedMs,
  goalMin,
  ...transport
}: TransportBarProps) {
  return (
    <div className={`transport-bar ${started ? '' : 'zeroed'}`}>
      <div className="transport-actions">
        <PlayToggle transport={transport} className="transport-primary" onClick={onPlayPause} />
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

      {started ? <GoalReadout elapsedMs={elapsedMs} goalMin={goalMin} /> : null}
    </div>
  )
}
