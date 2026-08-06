import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import { STORAGE_KEYS } from '../constants'
import {
  blockFromSettings,
  blockPool,
  blockSpelling,
  createRoutineId,
  parseRoutines,
  SEEDED_ROUTINES,
  suggestRoutineName,
  withAppendedBlock,
  withRemovedBlock,
  type BlockSettings,
  type Routine,
  type RoutineBlock,
} from '../lib/routines'
import type { Settings, SettingsAction } from './useSettings'
import { usePersistentState } from './usePersistentState'

export type UseRoutineOptions = {
  settings: Settings
  /** Raw settings dispatch — reserved for the routine's own writes. */
  dispatch: Dispatch<SettingsAction>
  /** Practice time, which only advances while playing — the block clock rides it. */
  sessionElapsedMs: number
  isPlaying: boolean
  /** The last timed block ran out: stop playback cleanly. */
  onFinish: () => void
}

export type RoutineController = {
  routines: Routine[]
  selected: Routine | null
  blockIndex: number
  blockElapsedMs: number
  finished: boolean
  /** Settings were nudged mid-block; the next block reclaims them. */
  adjusted: boolean
  suggestedName: string
  select: (id: string) => void
  clear: () => void
  remove: (id: string) => void
  save: (name: string) => void
  addBlock: () => void
  removeBlock: (index: number) => void
  skipBlock: () => void
  /** Start pressed on a finished routine — back to block 0. */
  restart: () => void
  /** Reset session — the block clock goes back to zero with it. */
  reset: () => void
  /** Wire to the session timer's tick: advances the block when its time is up. */
  tick: (elapsedMs: number) => void
  /** Every settings change the user makes by hand goes through here first. */
  notifyManualChange: (action: SettingsAction) => void
}

/** Where the routine is right now — all of it moves together, so it is one state. */
type RoutineRuntime = {
  blockIndex: number
  /** Session time at which the current block started. */
  blockStartMs: number
  finished: boolean
  adjusted: boolean
}

const IDLE_RUNTIME: RoutineRuntime = { blockIndex: 0, blockStartMs: 0, finished: false, adjusted: false }

/** The settings a block owns; changing any of them by hand is a drift. */
const BLOCK_OWNED_ACTIONS = new Set<SettingsAction['type']>([
  'setBpm',
  'nudgeBpm',
  'setBeatsPerNote',
  'setSpelling',
  'togglePoolNote',
  'setPreset',
  'setPool',
])

const blockSettingsOf = (settings: Settings): BlockSettings => ({
  bpm: settings.bpm,
  beatsPerNote: settings.beatsPerNote,
  pool: settings.pool,
  spelling: settings.spelling,
})

export function useRoutine(options: UseRoutineOptions): RoutineController {
  const { settings, dispatch, sessionElapsedMs, isPlaying, onFinish } = options

  const [routines, setRoutines] = usePersistentState<Routine[]>(STORAGE_KEYS.routines, {
    defaultValue: SEEDED_ROUTINES,
    deserialize: parseRoutines,
    serialize: (value) => JSON.stringify(value),
  })
  // Restored on launch so an installed app comes back to the routine it was
  // left on. Only the choice is restored — the block settings it implies were
  // persisted in their own right, and the runtime starts fresh at block 0.
  const [selectedId, setSelectedId] = usePersistentState<string | null>(STORAGE_KEYS.selectedRoutine, {
    defaultValue: null,
    deserialize: (raw) => (raw === '' ? null : raw),
    serialize: (value) => value ?? '',
  })
  const [runtime, setRuntime] = useState<RoutineRuntime>(IDLE_RUNTIME)

  const selected = routines.find((routine) => routine.id === selectedId) ?? null

  // The timer tick fires outside React's render, so what it reads has to be
  // current the instant it is written — hence refs written alongside state.
  const runtimeRef = useRef(runtime)
  const selectedRef = useRef(selected)
  const settingsRef = useRef(settings)
  const onFinishRef = useRef(onFinish)

  useEffect(() => {
    selectedRef.current = selected
    settingsRef.current = settings
    onFinishRef.current = onFinish
  })

  const commit = useCallback((next: RoutineRuntime) => {
    runtimeRef.current = next
    setRuntime(next)
  }, [])

  const applyBlock = useCallback(
    (block: RoutineBlock) => {
      dispatch({ type: 'setBpm', bpm: block.bpm })
      dispatch({ type: 'setBeatsPerNote', value: block.beats })
      dispatch({ type: 'setPool', pool: blockPool(block) })

      const forcedSpelling = blockSpelling(block)
      if (forcedSpelling !== null) {
        dispatch({ type: 'setSpelling', value: forcedSpelling })
      }

      // The deck is deliberately NOT invalidated here. This runs inside the
      // timer callback, before React has pushed the new pool into playback's
      // ref, so invalidating now would re-seed the deck from the OLD pool
      // (invalidate() re-peeks immediately). usePlayback already drops the deck
      // on a pool/spelling change, with the committed values; when neither
      // changed, the pending notes are still valid and must be left alone.
    },
    [dispatch],
  )

  const detach = useCallback(() => {
    selectedRef.current = null
    setSelectedId(null)
    commit(IDLE_RUNTIME)
  }, [commit, setSelectedId])

  // --- the block clock -----------------------------------------------------
  const blockElapsedMs = Math.max(0, sessionElapsedMs - runtime.blockStartMs)

  const tick = useCallback(
    (elapsedMs: number) => {
      const routine = selectedRef.current
      const { blockIndex, blockStartMs, finished } = runtimeRef.current
      if (routine === null || finished) {
        return
      }

      const block = routine.blocks[blockIndex]
      // Blocks with no duration never auto-advance.
      if (!block || block.dur === null || elapsedMs - blockStartMs < block.dur * 1000) {
        return
      }

      const nextIndex = blockIndex + 1
      if (nextIndex >= routine.blocks.length) {
        commit({ ...runtimeRef.current, finished: true })
        onFinishRef.current()
        return
      }

      commit({
        blockIndex: nextIndex,
        // Advance by the block's own length, so a late tick doesn't shift the rest.
        blockStartMs: blockStartMs + block.dur * 1000,
        finished: false,
        adjusted: false,
      })
      applyBlock(routine.blocks[nextIndex])
    },
    [applyBlock, commit],
  )

  // --- drift ---------------------------------------------------------------
  /**
   * One rule, matching the note chips: a manual edit while stopped forks out to
   * Custom, and a manual edit while playing is an override of the current block
   * that the next block reclaims. Routed through the dispatch the controls use,
   * rather than diffed after the fact, so the routine's own writes and the
   * speed ramp's BPM write-back are never mistaken for the user's hand.
   */
  const notifyManualChange = (action: SettingsAction) => {
    if (selected === null || !BLOCK_OWNED_ACTIONS.has(action.type)) {
      return
    }

    if (isPlaying) {
      if (!runtime.adjusted) {
        commit({ ...runtime, adjusted: true })
      }
      return
    }

    detach()
  }

  // --- actions -------------------------------------------------------------
  const startAt = (index: number, routine: Routine) => {
    commit({ blockIndex: index, blockStartMs: sessionElapsedMs, finished: false, adjusted: false })
    applyBlock(routine.blocks[index])
  }

  const select = (id: string) => {
    if (id === selectedId) {
      detach()
      return
    }

    const routine = routines.find((entry) => entry.id === id)
    if (!routine) {
      return
    }

    setSelectedId(id)
    selectedRef.current = routine
    startAt(0, routine)
  }

  const remove = (id: string) => {
    setRoutines((list) => list.filter((routine) => routine.id !== id))
    if (id === selectedId) {
      detach()
    }
  }

  const save = (name: string) => {
    const blockSettings = blockSettingsOf(settings)
    const trimmed = name.trim()
    const routine: Routine = {
      id: createRoutineId(),
      name: trimmed === '' ? suggestRoutineName(blockSettings) : trimmed,
      blocks: [blockFromSettings(blockSettings, null)],
    }

    setRoutines((list) => [...list, routine])
    setSelectedId(routine.id)
    selectedRef.current = routine
    // Built from the live settings, so there is nothing to apply.
    commit({ blockIndex: 0, blockStartMs: sessionElapsedMs, finished: false, adjusted: false })
  }

  const replaceSelected = (next: Routine) => {
    selectedRef.current = next
    setRoutines((list) => list.map((routine) => (routine.id === next.id ? next : routine)))
  }

  const addBlock = () => {
    if (selected === null) {
      return
    }

    const wasOpenEnded = selected.blocks.length === 1 && selected.blocks[0].dur === null
    replaceSelected(withAppendedBlock(selected, blockSettingsOf(settings)))
    commit({
      ...runtime,
      // The open block just gained a 2:00 timer — give it the full two minutes
      // rather than expiring it against a clock that has been running all along.
      blockStartMs: wasOpenEnded ? sessionElapsedMs : runtime.blockStartMs,
      finished: false,
    })
  }

  const removeBlock = (index: number) => {
    if (selected === null) {
      return
    }

    const next = withRemovedBlock(selected, index)
    if (next === selected) {
      return
    }

    replaceSelected(next)

    if (index > runtime.blockIndex) {
      commit({ ...runtime, finished: false })
      return
    }

    if (index < runtime.blockIndex) {
      // The active block only shifted position; it keeps running on its clock.
      commit({ ...runtime, blockIndex: runtime.blockIndex - 1, finished: false })
      return
    }

    // The active block itself is gone — whatever slid into its place takes over.
    startAt(Math.min(runtime.blockIndex, next.blocks.length - 1), next)
  }

  const skipBlock = () => {
    if (selected === null) {
      return
    }

    const nextIndex = runtime.blockIndex + 1
    if (nextIndex >= selected.blocks.length) {
      commit({ ...runtime, finished: true })
      onFinish()
      return
    }

    startAt(nextIndex, selected)
  }

  const restart = () => {
    if (selected !== null) {
      startAt(0, selected)
    }
  }

  const reset = () => {
    commit(IDLE_RUNTIME)
    if (selected !== null) {
      applyBlock(selected.blocks[0])
    }
  }

  return {
    routines,
    selected,
    blockIndex: runtime.blockIndex,
    blockElapsedMs,
    finished: runtime.finished,
    adjusted: runtime.adjusted,
    suggestedName: suggestRoutineName(blockSettingsOf(settings)),
    select,
    clear: detach,
    remove,
    save,
    addBlock,
    removeBlock,
    skipBlock,
    restart,
    reset,
    tick,
    notifyManualChange,
  }
}
