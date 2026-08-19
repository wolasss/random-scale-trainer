import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faForwardStep, faXmark } from '@fortawesome/free-solid-svg-icons'
import { formatClock, routineProgress, type Routine } from '../lib/routines'

type RoutineStripProps = {
  routine: Routine
  blockIndex: number
  blockElapsedMs: number
  finished: boolean
  onSkip: () => void
  onClear: () => void
}

/**
 * The routine card lives at the bottom of the page, so the hero carries this
 * strip: whatever is running stays readable without scrolling back down.
 */
export function RoutineStrip({ routine, blockIndex, blockElapsedMs, finished, onSkip, onClear }: RoutineStripProps) {
  const { fraction, remaining } = routineProgress(routine, blockIndex, blockElapsedMs, finished)
  const percent = Math.round(fraction * 100)

  // A lone block and a finished routine both have nothing to skip to.
  const canSkip = !finished && routine.blocks.length > 1

  const status = finished
    ? 'complete'
    : remaining === null
      ? 'runs until you stop'
      : routine.blocks.length === 1
        ? `${formatClock(remaining)} left`
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

      {canSkip ? (
        <button
          type="button"
          className="routine-strip-skip"
          data-testid="routine-strip-skip"
          aria-label={`Skip to the next block of ${routine.name}`}
          title={`Skip to the next block of ${routine.name}`}
          onClick={onSkip}
        >
          <FontAwesomeIcon icon={faForwardStep} />
        </button>
      ) : null}

      <button
        type="button"
        className="routine-strip-clear"
        data-testid="routine-strip-clear"
        aria-label={`Unload ${routine.name}`}
        title={`Unload ${routine.name}`}
        onClick={onClear}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  )
}
