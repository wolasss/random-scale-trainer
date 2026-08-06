import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faForwardStep, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import {
  blockCycleSeconds,
  blockFill,
  blockFlex,
  blockMeta,
  formatClock,
  formatMinutes,
  routineMeta,
  routineProgress,
  type Routine,
} from '../lib/routines'
import type { RoutineController } from '../hooks/useRoutine'

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
    return 'One block, no timer — runs until you stop.'
  }

  return `Block ${blockIndex + 1} of ${routine.blocks.length} · ${formatClock(remaining)} left of ${formatClock(total)}`
}

export function RoutineCard({ routine }: RoutineCardProps) {
  const { selected, blockIndex, blockElapsedMs, finished, adjusted } = routine
  const [draftName, setDraftName] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const isNaming = draftName !== null

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

  return (
    <section className="panel routine-card" data-testid="routine-card">
      <div className="panel-heading routine-heading">
        <div>
          <h2>Routine</h2>
          <p>
            A routine is a list of blocks — most have just one. Blocks set tempo, notes and rate for you.
          </p>
        </div>
        <div className="routine-heading-actions">
          {selected !== null ? (
            <button
              type="button"
              className="ghost-button routine-clear"
              data-testid="routine-clear"
              onClick={routine.clear}
            >
              Clear routine
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button routine-save"
            data-testid="routine-save"
            onClick={() => setDraftName(routine.suggestedName)}
          >
            <FontAwesomeIcon icon={faPlus} /> Save current settings
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
              }
            }}
          />
          <button type="submit" className="primary-button routine-save-confirm" data-testid="routine-save-confirm">
            Save
          </button>
          <button type="button" className="ghost-button" onClick={() => setDraftName(null)}>
            Cancel
          </button>
        </form>
      ) : null}

      <div className="routine-shelf" data-testid="routine-shelf">
        {routine.routines.map((entry) => {
          const isSelected = entry.id === selected?.id
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
                className="routine-chip-remove"
                aria-label={`Delete ${entry.name}`}
                title={`Delete ${entry.name}`}
                onClick={() => routine.remove(entry.id)}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          )
        })}
      </div>

      {selected === null ? (
        <p className="routine-empty" data-testid="routine-empty">
          Custom — free practice on whatever the controls above say. Pick a routine, or save these settings to
          come back to them.
        </p>
      ) : (
        <>
          <ol className="routine-timeline" data-testid="routine-timeline">
            {selected.blocks.map((block, index) => {
              const state = finished || index < blockIndex ? 'done' : index === blockIndex ? 'active' : 'upcoming'
              const fill = blockFill(block, state, blockElapsedMs)
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
                  style={{ flexGrow: blockFlex(block), flexShrink: 1, flexBasis: 0 }}
                >
                  <div className="routine-segment-head">
                    <span className="routine-segment-name">{block.name}</span>
                    {selected.blocks.length > 1 ? (
                      <button
                        type="button"
                        className="routine-segment-remove"
                        aria-label={`Remove block ${block.name}`}
                        title={`Remove block ${block.name}`}
                        onClick={() => routine.removeBlock(index)}
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    ) : null}
                  </div>
                  <span className="routine-segment-meta">{blockMeta(block)}</span>
                  <div className="routine-segment-track">
                    <div className="routine-segment-fill" style={{ width: `${Math.round(fill * 100)}%` }} />
                  </div>
                  <div className="routine-segment-time">
                    {/* Tempo alone doesn't compare across blocks that differ in
                        rate or pool size; how long a lap takes does. */}
                    <span className="routine-segment-cycle">{formatClock(blockCycleSeconds(block))} / cycle</span>
                    <span>{caption}</span>
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="routine-footer">
            <div className="routine-footer-actions">
              <button
                type="button"
                className="ghost-button"
                data-testid="routine-add-block"
                onClick={routine.addBlock}
              >
                <FontAwesomeIcon icon={faPlus} /> Add block from current settings
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
