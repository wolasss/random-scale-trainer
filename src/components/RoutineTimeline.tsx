import { Icon } from './ui/Icon'
import { faChevronLeft, faChevronRight, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { DEFAULT_BLOCK_SECONDS } from '../constants'
import {
  BLOCK_STEP_SECONDS,
  blockCycleSeconds,
  blockFill,
  blockFlex,
  blockMeta,
  formatClock,
  type Routine,
  type RoutineBlock,
} from '../lib/routines'

// Armed, the button's visible text shrinks to a bare "Delete?" — enough beside
// a name you can already see, and nothing at all to a screen reader reading the
// button alone. The accessible name has to say both which thing is at stake and
// that the press just made was not the one that deletes it.
// eslint-disable-next-line react-refresh/only-export-components -- shared with RoutineCard's chip renderer
export const confirmLabel = (label: string, armed: boolean) => (armed ? `${label}? Press again to confirm` : label)

type RoutineTimelineProps = {
  routine: Routine
  blockIndex: number
  blockElapsedMs: number
  finished: boolean
  armedIndex: number | null
  onRemoveBlock: (index: number) => void
  onMoveBlock: (index: number, delta: -1 | 1) => void
  onSetDuration: (index: number, seconds: number | null) => void
  onInsertBlock: (index: number) => void
  onDisarm: () => void
}

/**
 * The sequence, drawn to scale. Only ever rendered for a routine with more than
 * one block, which is why every segment here carries a remove control — the
 * lone-block case that had to suppress it no longer reaches this far.
 *
 * Editing is plain buttons rather than a drag handle: reordering has to be
 * reachable from a keyboard and hittable with a thumb, and a handle is neither.
 */
export function RoutineTimeline({
  routine,
  blockIndex,
  blockElapsedMs,
  finished,
  armedIndex,
  onRemoveBlock,
  onMoveBlock,
  onSetDuration,
  onInsertBlock,
  onDisarm,
}: RoutineTimelineProps) {
  return (
    <ol className="routine-timeline" data-testid="routine-timeline">
      {routine.blocks.map((block, index) => {
        const state = finished || index < blockIndex ? 'done' : index === blockIndex ? 'active' : 'upcoming'
        const fill = blockFill(block, state, blockElapsedMs)
        const armed = armedIndex === index
        const removeLabel = confirmLabel(`Remove block ${block.name}`, armed)
        const caption =
          state === 'done'
            ? 'done'
            : state === 'active'
              ? block.dur === null
                ? 'runs until you stop'
                : `${formatClock(block.dur - blockElapsedMs / 1000)} left`
              : block.dur === null
                ? 'no timer'
                : formatClock(block.dur)

        return (
          <li
            key={index}
            className={`routine-segment ${state}`}
            data-testid={`routine-segment-${index}`}
            data-state={state}
            style={{ flexGrow: blockFlex(block), flexShrink: 1 }}
          >
            <div className="routine-segment-head">
              <span className="routine-segment-name">{block.name}</span>
              <button
                type="button"
                className={`routine-segment-remove ${armed ? 'armed' : ''}`}
                aria-label={removeLabel}
                title={removeLabel}
                onClick={() => onRemoveBlock(index)}
                onBlur={onDisarm}
              >
                {armed ? 'Remove?' : <Icon icon={faXmark} />}
              </button>
            </div>
            <span className="routine-segment-meta">{blockMeta(block)}</span>
            <div className="routine-segment-track">
              <div className="routine-segment-fill" style={{ width: `${Math.round(fill * 100)}%` }} />
            </div>
            <div className="routine-segment-time">
              {/* Tempo alone doesn't compare across blocks that differ in rate
                  or pool size; how long a lap takes does. */}
              <span className="routine-segment-cycle">{formatClock(blockCycleSeconds(block))} / cycle</span>
              <span>{caption}</span>
            </div>
            <div className="routine-segment-controls">
              <button
                type="button"
                className="routine-segment-control"
                aria-label={`Insert current settings before block ${block.name}`}
                title={`Insert current settings before block ${block.name}`}
                onClick={() => onInsertBlock(index)}
              >
                <Icon icon={faPlus} />
              </button>
              <button
                type="button"
                className="routine-segment-control"
                aria-label={`Move block ${block.name} earlier`}
                title={`Move block ${block.name} earlier`}
                disabled={index === 0}
                onClick={() => onMoveBlock(index, -1)}
              >
                <Icon icon={faChevronLeft} />
              </button>
              <button
                type="button"
                className="routine-segment-control"
                aria-label={`Move block ${block.name} later`}
                title={`Move block ${block.name} later`}
                disabled={index === routine.blocks.length - 1}
                onClick={() => onMoveBlock(index, 1)}
              >
                <Icon icon={faChevronRight} />
              </button>
              {/* Every block in a sequence is timed — normalizeBlocks sees to
                  that — so these two always have a duration to work from. */}
              <button
                type="button"
                className="routine-segment-control"
                aria-label={`Shorten block ${block.name} by ${BLOCK_STEP_SECONDS} seconds`}
                title={`Shorten block ${block.name} by ${BLOCK_STEP_SECONDS} seconds`}
                disabled={(block.dur ?? 0) <= BLOCK_STEP_SECONDS}
                onClick={() => onSetDuration(index, (block.dur ?? 0) - BLOCK_STEP_SECONDS)}
              >
                −{BLOCK_STEP_SECONDS}s
              </button>
              <button
                type="button"
                className="routine-segment-control"
                aria-label={`Lengthen block ${block.name} by ${BLOCK_STEP_SECONDS} seconds`}
                title={`Lengthen block ${block.name} by ${BLOCK_STEP_SECONDS} seconds`}
                onClick={() => onSetDuration(index, (block.dur ?? 0) + BLOCK_STEP_SECONDS)}
              >
                +{BLOCK_STEP_SECONDS}s
              </button>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

type LoneBlockTimerProps = {
  block: RoutineBlock
  onSetDuration: (index: number, seconds: number | null) => void
}

/**
 * The timer controls for a routine of one block — the only place a block may
 * gain or lose its clock, which is the round trip between the two shapes on the
 * shelf: untimed it is a saved setup, timed it is a single exercise.
 */
export function LoneBlockTimer({ block, onSetDuration }: LoneBlockTimerProps) {
  const dur = block.dur
  if (dur === null) {
    return (
      <button
        type="button"
        className="ghost-button"
        data-testid="routine-add-timer"
        onClick={() => onSetDuration(0, DEFAULT_BLOCK_SECONDS)}
      >
        Add a timer
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        className="ghost-button"
        aria-label={`Shorten block ${block.name} by ${BLOCK_STEP_SECONDS} seconds`}
        disabled={dur <= BLOCK_STEP_SECONDS}
        onClick={() => onSetDuration(0, dur - BLOCK_STEP_SECONDS)}
      >
        −{BLOCK_STEP_SECONDS}s
      </button>
      <button
        type="button"
        className="ghost-button"
        aria-label={`Lengthen block ${block.name} by ${BLOCK_STEP_SECONDS} seconds`}
        onClick={() => onSetDuration(0, dur + BLOCK_STEP_SECONDS)}
      >
        +{BLOCK_STEP_SECONDS}s
      </button>
      <button
        type="button"
        className="ghost-button"
        data-testid="routine-remove-timer"
        onClick={() => onSetDuration(0, null)}
      >
        Remove timer
      </button>
    </>
  )
}
