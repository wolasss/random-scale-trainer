import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClone, faForwardStep, faPen, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import {
  formatClock,
  formatMinutes,
  isOpenEnded,
  routineMeta,
  routineProgress,
  type Routine,
} from '../lib/routines'
import type { RoutineController } from '../hooks/useRoutine'
import { confirmLabel, LoneBlockTimer, RoutineTimeline } from './RoutineTimeline'

type RoutineCardProps = {
  routine: RoutineController
}

const ADJUSTED_SUFFIX = ' · adjusted, next block resets it'

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

/**
 * Which remove button, if any, is one tap away from firing. A deletion here is
 * final — there is no undo and nothing else holds a copy of a hand-built
 * workout — so the X arms itself first and only deletes on the second tap.
 * The block variant is keyed by routine as well as index: the card stays
 * mounted across a select(), and an index alone would arrive at the next
 * workout already armed.
 */
type PendingRemove = { kind: 'chip'; id: string } | { kind: 'block'; routineId: string; index: number }

/** One form serves both flows: a fresh save has no id yet, a rename always does. */
type Naming = { mode: 'save'; name: string } | { mode: 'rename'; id: string; name: string }

export function RoutineCard({ routine }: RoutineCardProps) {
  const { selected, blockIndex, blockElapsedMs, finished, adjusted } = routine
  const [naming, setNaming] = useState<Naming | null>(null)
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null)
  // Whether anybody has reached for the save button yet. A store that drops
  // writes is only worth mentioning to someone about to trust it with
  // something; until then it is noise about a browser setting.
  const [saveOffered, setSaveOffered] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const isNaming = naming !== null
  // Which chip's form is open, so re-selecting the input fires when that
  // changes but not on every keystroke into the name it already selected.
  const namingKey = naming === null ? null : naming.mode === 'save' ? 'save' : naming.id

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
  }, [isNaming, namingKey])

  const cancelNaming = () => {
    if (naming?.mode === 'save') {
      setSaveOffered(false)
    }
    setNaming(null)
  }

  const submitName = () => {
    if (naming === null) {
      return
    }

    if (naming.mode === 'save') {
      routine.save(naming.name)
    } else {
      routine.rename(naming.id, naming.name)
    }
    setNaming(null)
  }

  const setups = routine.routines.filter(isOpenEnded)
  const workouts = routine.routines.filter((entry) => !isOpenEnded(entry))

  const chip = (entry: Routine) => {
    const isSelected = entry.id === selected?.id
    const isArmed = pendingRemove?.kind === 'chip' && pendingRemove.id === entry.id
    const removeLabel = confirmLabel(`Delete ${entry.name}`, isArmed)
    // Nothing is lost by copying, so unlike the X this one fires on first tap.
    const copyLabel = `Duplicate ${entry.name}`
    const renameLabel = `Rename ${entry.name}`
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
          className="routine-chip-rename"
          aria-label={renameLabel}
          title={renameLabel}
          onClick={() => setNaming({ mode: 'rename', id: entry.id, name: entry.name })}
        >
          <FontAwesomeIcon icon={faPen} />
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
              setNaming({ mode: 'save', name: routine.suggestedName })
              setSaveOffered(true)
            }}
          >
            <FontAwesomeIcon icon={faPlus} /> Save as a setup
          </button>
        </div>
      </div>

      {naming !== null ? (
        <form
          className="routine-save-form"
          data-testid="routine-save-form"
          onSubmit={(event) => {
            event.preventDefault()
            submitName()
          }}
        >
          <input
            ref={nameInputRef}
            type="text"
            className="routine-name-input"
            data-testid="routine-name-input"
            aria-label="Routine name"
            value={naming.name}
            onChange={(event) => setNaming({ ...naming, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                cancelNaming()
              }
            }}
          />
          <button type="submit" className="primary-button routine-save-confirm" data-testid="routine-save-confirm">
            {naming.mode === 'rename' ? 'Rename' : 'Save'}
          </button>
          <button type="button" className="ghost-button" onClick={cancelNaming}>
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
