import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronLeft,
  faChevronRight,
  faClone,
  faForwardStep,
  faPlus,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { DEFAULT_BLOCK_SECONDS } from '../constants'
import {
  BLOCK_STEP_SECONDS,
  blockCycleSeconds,
  blockFill,
  blockFlex,
  blockMeta,
  formatClock,
  formatMinutes,
  isOpenEnded,
  routineMeta,
  routineProgress,
  type Routine,
  type RoutineBlock,
} from '../lib/routines'
import type { RoutineController } from '../hooks/useRoutine'

type RoutineCardProps = {
  routine: RoutineController
}

const ADJUSTED_SUFFIX = ' · adjusted, next block resets it'

// Armed, the button's visible text shrinks to a bare "Delete?" — enough beside
// a name you can already see, and nothing at all to a screen reader reading the
// button alone. The accessible name has to say both which thing is at stake and
// that the press just made was not the one that deletes it.
const confirmLabel = (label: string, armed: boolean) => (armed ? `${label}? Press again to confirm` : label)

const statusLine = (
  routine: Routine,
  blockIndex: number,
  blockElapsedMs: number,
  finished: boolean,
): string => {
  const { total, remaining } = routineProgress(routine, blockIndex, blockElapsedMs, finished)

  if (finished) {
    return `Finished — ${formatMinutes(total)} done. Press start to run it again.`
  }

  if (remaining === null) {
    return 'No timer — runs until you stop.'
  }

  // "Block 1 of 1" is a countdown pretending to be a sequence.
  if (routine.blocks.length === 1) {
    return `One block · ${formatClock(remaining)} left of ${formatClock(total)}`
  }

  return `Block ${blockIndex + 1} of ${routine.blocks.length} · ${formatClock(remaining)} left of ${formatClock(total)}`
}

// The two shapes a routine comes in are one object at different lengths, but
// they are NOT presented as peers. Setups — presets, a concept nobody has to
// learn — are the card; workouts hang beneath them as the thing a setup can
// grow into. The card is tiered the way its audience is: everyone reads the
// top row, and the player who practises deliberately finds the bottom one.

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
function RoutineTimeline({
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
                {armed ? 'Remove?' : <FontAwesomeIcon icon={faXmark} />}
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
                <FontAwesomeIcon icon={faPlus} />
              </button>
              <button
                type="button"
                className="routine-segment-control"
                aria-label={`Move block ${block.name} earlier`}
                title={`Move block ${block.name} earlier`}
                disabled={index === 0}
                onClick={() => onMoveBlock(index, -1)}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <button
                type="button"
                className="routine-segment-control"
                aria-label={`Move block ${block.name} later`}
                title={`Move block ${block.name} later`}
                disabled={index === routine.blocks.length - 1}
                onClick={() => onMoveBlock(index, 1)}
              >
                <FontAwesomeIcon icon={faChevronRight} />
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
function LoneBlockTimer({ block, onSetDuration }: LoneBlockTimerProps) {
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

/**
 * Which remove button, if any, is one tap away from firing. A deletion here is
 * final — there is no undo and nothing else holds a copy of a hand-built
 * workout — so the X arms itself first and only deletes on the second tap.
 * The block variant is keyed by routine as well as index: the card stays
 * mounted across a select(), and an index alone would arrive at the next
 * workout already armed.
 */
type PendingRemove = { kind: 'chip'; id: string } | { kind: 'block'; routineId: string; index: number }

export function RoutineCard({ routine }: RoutineCardProps) {
  const { selected, blockIndex, blockElapsedMs, finished, adjusted } = routine
  const [draftName, setDraftName] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null)
  // Whether anybody has reached for the save button yet. A store that drops
  // writes is only worth mentioning to someone about to trust it with
  // something; until then it is noise about a browser setting.
  const [saveOffered, setSaveOffered] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const isNaming = draftName !== null

  const disarmRemove = () => setPendingRemove(null)

  const removeChip = (id: string) => {
    if (pendingRemove?.kind === 'chip' && pendingRemove.id === id) {
      setPendingRemove(null)
      routine.remove(id)
      return
    }

    setPendingRemove({ kind: 'chip', id })
  }

  const armedBlockIndex =
    pendingRemove?.kind === 'block' && pendingRemove.routineId === selected?.id ? pendingRemove.index : null

  const removeBlock = (index: number) => {
    if (selected === null) {
      return
    }

    // Cleared on the way out either way: the surviving blocks shift up, so a
    // held index would point at whichever block took the deleted one's place.
    if (armedBlockIndex === index) {
      setPendingRemove(null)
      routine.removeBlock(index)
      return
    }

    setPendingRemove({ kind: 'block', routineId: selected.id, index })
  }

  // Every edit disarms first. The pending index addresses a position, not a
  // block, so a move or an insert would otherwise leave a *different* block
  // armed and one tap from deletion — the same hazard the shift-up after a
  // delete has.
  const moveBlock = (index: number, delta: -1 | 1) => {
    disarmRemove()
    routine.moveBlock(index, delta)
  }

  const setBlockDuration = (index: number, seconds: number | null) => {
    disarmRemove()
    routine.setBlockDuration(index, seconds)
  }

  const insertBlock = (index: number) => {
    disarmRemove()
    routine.insertBlock(index)
  }

  useEffect(() => {
    if (isNaming) {
      nameInputRef.current?.select()
    }
  }, [isNaming])

  const submitSave = () => {
    if (draftName === null) {
      return
    }

    routine.save(draftName)
    setDraftName(null)
  }

  const setups = routine.routines.filter(isOpenEnded)
  const workouts = routine.routines.filter((entry) => !isOpenEnded(entry))

  const chip = (entry: Routine) => {
    const isSelected = entry.id === selected?.id
    const isArmed = pendingRemove?.kind === 'chip' && pendingRemove.id === entry.id
    const removeLabel = confirmLabel(`Delete ${entry.name}`, isArmed)
    // Nothing is lost by copying, so unlike the X this one fires on first tap.
    const copyLabel = `Duplicate ${entry.name}`
    return (
      <div
        key={entry.id}
        className={`routine-chip ${isSelected ? 'selected' : ''}`}
        data-testid={`routine-chip-${entry.id}`}
        data-selected={isSelected}
      >
        <button
          type="button"
          className="routine-chip-body"
          aria-pressed={isSelected}
          onClick={() => routine.select(entry.id)}
        >
          <span className="routine-chip-name">{entry.name}</span>
          <span className="routine-chip-meta">{routineMeta(entry)}</span>
        </button>
        <button
          type="button"
          className="routine-chip-copy"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={() => routine.duplicate(entry.id)}
        >
          <FontAwesomeIcon icon={faClone} />
        </button>
        <button
          type="button"
          className={`routine-chip-remove ${isArmed ? 'armed' : ''}`}
          aria-label={removeLabel}
          title={removeLabel}
          onClick={() => removeChip(entry.id)}
          onBlur={disarmRemove}
        >
          {isArmed ? 'Delete?' : <FontAwesomeIcon icon={faXmark} />}
        </button>
      </div>
    )
  }

  return (
    <section className="panel routine-card" data-testid="routine-card">
      <div className="panel-heading routine-heading">
        <div>
          <h2>Saved setups</h2>
          <p>Tap one to load its tempo and notes.</p>
        </div>
        <div className="routine-heading-actions">
          {selected !== null ? (
            <button
              type="button"
              className="ghost-button routine-clear"
              data-testid="routine-clear"
              onClick={routine.clear}
            >
              Unload
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button routine-save"
            data-testid="routine-save"
            onClick={() => {
              setDraftName(routine.suggestedName)
              setSaveOffered(true)
            }}
          >
            <FontAwesomeIcon icon={faPlus} /> Save as a setup
          </button>
        </div>
      </div>

      {draftName !== null ? (
        <form
          className="routine-save-form"
          data-testid="routine-save-form"
          onSubmit={(event) => {
            event.preventDefault()
            submitSave()
          }}
        >
          <input
            ref={nameInputRef}
            type="text"
            className="routine-name-input"
            data-testid="routine-name-input"
            aria-label="Routine name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDraftName(null)
                setSaveOffered(false)
              }
            }}
          />
          <button type="submit" className="primary-button routine-save-confirm" data-testid="routine-save-confirm">
            Save
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setDraftName(null)
              setSaveOffered(false)
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}

      {/* Reports on the shelf's own last write, so a store that had room for
          everything else but not for this list still gets caught. Survives the
          save, so it is still on screen beside the chip it is about — the
          moment somebody would otherwise assume it kept. */}
      {saveOffered && !routine.persisted ? (
        <p className="routine-ephemeral-notice" data-testid="routine-ephemeral-notice">
          Your browser is blocking saved data — this setup will work now, but it won't be here after you close the tab.
        </p>
      ) : null}

      <div className="routine-shelf" data-testid="routine-shelf">
        {/* Setups need no label — they are what the card's own heading says. */}
        {setups.length > 0 ? (
          <div className="routine-group" data-testid="routine-group-setups">
            <div className="routine-group-chips">{setups.map(chip)}</div>
          </div>
        ) : null}

        {workouts.length > 0 ? (
          <div className="routine-group" data-testid="routine-group-workouts">
            <p className="routine-group-label">
              Workouts <span className="routine-group-hint">timed setups in a row — they stop on their own</span>
            </p>
            <div className="routine-group-chips">{workouts.map(chip)}</div>
          </div>
        ) : null}
      </div>

      {/* No direction words ("the controls below") in the empty state — this
          card sits above the knobs in the browser and below them in the stage
          sheet. */}
      {selected === null ? (
        <p className="routine-empty" data-testid="routine-empty">
          Nothing loaded — free practice on the current settings.
        </p>
      ) : (
        <>
          {/* One block has no sequence to draw, and a bar chart of a single bar
              is just the chip again, taller. The timeline earns its space only
              once there is an order to read. */}
          {selected.blocks.length > 1 ? (
            <RoutineTimeline
              routine={selected}
              blockIndex={blockIndex}
              blockElapsedMs={blockElapsedMs}
              finished={finished}
              armedIndex={armedBlockIndex}
              onRemoveBlock={removeBlock}
              onMoveBlock={moveBlock}
              onSetDuration={setBlockDuration}
              onInsertBlock={insertBlock}
              onDisarm={disarmRemove}
            />
          ) : null}

          <div className="routine-footer">
            <div className="routine-footer-actions">
              {/* The click that turns a setup into a workout, named after what
                  it does rather than what it appends — this is the one place
                  the two shapes on the shelf are shown to be the same thing. */}
              <button
                type="button"
                className="ghost-button"
                data-testid="routine-add-block"
                onClick={routine.addBlock}
              >
                <FontAwesomeIcon icon={faPlus} />{' '}
                {isOpenEnded(selected) ? 'Turn into a workout' : 'Add a block from current settings'}
              </button>
              {selected.blocks.length > 1 ? (
                <button
                  type="button"
                  className="ghost-button"
                  data-testid="routine-skip-block"
                  onClick={routine.skipBlock}
                >
                  Skip block <FontAwesomeIcon icon={faForwardStep} />
                </button>
              ) : null}
              {/* A lone block is the only shape whose timer may come and go: an
                  untimed block inside a sequence would stall the routine on it
                  forever, so the round trip is offered here and nowhere else.
                  The segments carry their own retiming controls. */}
              {selected.blocks.length === 1 ? <LoneBlockTimer block={selected.blocks[0]} onSetDuration={setBlockDuration} /> : null}
            </div>
            <p className="routine-status" data-testid="routine-status">
              {statusLine(selected, blockIndex, blockElapsedMs, finished)}
              {adjusted && !finished ? ADJUSTED_SUFFIX : ''}
            </p>
          </div>
        </>
      )}
    </section>
  )
}
