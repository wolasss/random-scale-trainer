import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { formatClock, routineProgress, type Routine } from '../lib/routines'

type RoutineStripProps = {
  routine: Routine
  blockIndex: number
  blockElapsedMs: number
  finished: boolean
  onClear: () => void
}

/**
 * The routine card lives at the bottom of the page, so the hero carries this
 * strip: whatever is running stays readable without scrolling back down.
 */
export function RoutineStrip({ routine, blockIndex, blockElapsedMs, finished, onClear }: RoutineStripProps) {
  const { fraction, remaining } = routineProgress(routine, blockIndex, blockElapsedMs, finished)
  const percent = Math.round(fraction * 100)

  const status = finished
    ? 'complete'
    : remaining === null
      ? 'runs until you stop'
      : `block ${blockIndex + 1} of ${routine.blocks.length} · ${formatClock(remaining)} left`

  return (
    <div className="routine-strip" data-testid="routine-strip">
      <span className="routine-strip-name">{routine.name}</span>

      <div
        className="routine-strip-track"
        role="progressbar"
        aria-label={`${routine.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-testid="routine-strip-progress"
      >
        <div className="routine-strip-fill" style={{ width: `${percent}%` }} />
      </div>

      <span className="routine-strip-status" data-testid="routine-strip-status">
        {status}
      </span>

      <button
        type="button"
        className="routine-strip-clear"
        data-testid="routine-strip-clear"
        aria-label="Clear routine"
        title="Clear routine"
        onClick={onClear}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  )
}
