import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { formatClock, routineProgress, type Routine } from '../lib/routines'

/** What a finished run amounted to, measured from where the run began. */
export type RoutineRecap = {
  elapsedMs: number
  notesCalled: number
  /** The tempo the ramp had climbed to, or null when nothing ramped. */
  rampedToBpm: number | null
}

type RoutineStripProps = {
  routine: Routine
  blockIndex: number
  blockElapsedMs: number
  finished: boolean
  /** Captured the moment the workout ended; absent when there is nothing to recap. */
  recap?: RoutineRecap | null
  onClear: () => void
}

const recapStatus = (recap: RoutineRecap) => {
  const notes = `${recap.notesCalled} ${recap.notesCalled === 1 ? 'note' : 'notes'}`
  const reached = recap.rampedToBpm === null ? '' : ` · reached ${recap.rampedToBpm} BPM`

  return `complete · ${formatClock(Math.floor(recap.elapsedMs / 1000))} · ${notes}${reached}`
}

/**
 * The routine card lives at the bottom of the page, so the hero carries this
 * strip: whatever is running stays readable without scrolling back down.
 */
export function RoutineStrip({
  routine,
  blockIndex,
  blockElapsedMs,
  finished,
  recap = null,
  onClear,
}: RoutineStripProps) {
  const { fraction, remaining } = routineProgress(routine, blockIndex, blockElapsedMs, finished)
  const percent = Math.round(fraction * 100)

  // The recap is what the run came to — time played, notes called, and where a
  // ramp got to — so the end of a workout reads as a result rather than a stop.
  const status = finished
    ? recap === null
      ? 'complete'
      : recapStatus(recap)
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
