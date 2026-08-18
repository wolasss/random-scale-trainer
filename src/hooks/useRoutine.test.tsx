import { act, renderHook } from '@testing-library/react'
import { useReducer } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import { matchPreset } from '../lib/presets'
import { blockPool, type Routine, type RoutineBlock } from '../lib/routines'
import { useRoutine } from './useRoutine'
import { settingsReducer, type SettingsAction, type Settings } from './useSettings'

const baseSettings = (): Settings => ({
  bpm: 72,
  beatsPerNote: 4,
  continuousMode: true,
  countInEnabled: false,
  speedRampMode: false,
  rampTargetBpm: 112,
  showFretboard: true,
  spelling: 'mixed',
  pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  sessionGoalMin: 10,
  endSoundEnabled: true,
})

const block = (name: string, overrides: Partial<RoutineBlock>): RoutineBlock => ({
  name,
  poolKey: 'chromatic',
  pool: null,
  bpm: 72,
  beats: 4,
  acc: null,
  ramp: false,
  rampTo: 112,
  dur: 120,
  ...overrides,
})

/** Three blocks, each with settings distinct enough to name the active one by. */
const WORKOUT: Routine = {
  id: 'r-three-blocks',
  name: 'Three blocks',
  blocks: [
    block('First', { poolKey: 'naturals', bpm: 60, beats: 4, dur: 120 }),
    block('Second', { poolKey: 'accidentals', bpm: 80, beats: 2, dur: 180 }),
    block('Third', { poolKey: 'chromatic', bpm: 100, beats: 4, acc: 'sharps', dur: 240 }),
  ],
}

/** The routine against a live settings reducer, so applied blocks really land. */
const useRoutineHarness = (sessionElapsedMs: number, onFinish: () => void, isPlaying = true) => {
  const [settings, dispatch] = useReducer(settingsReducer, null, baseSettings)
  const routine = useRoutine({ settings, dispatch, sessionElapsedMs, isPlaying, onFinish })

  return { settings, dispatch, routine }
}

/**
 * Selects the workout at 0, then skips onto the given block at 2:10 and lets
 * the session run to 3:20 — so the active block is 70s into its own clock.
 */
const renderOnBlock = (blockIndex: number) => {
  window.localStorage.setItem(STORAGE_KEYS.routines, JSON.stringify([WORKOUT]))

  const onFinish = vi.fn()
  const view = renderHook(({ sessionElapsedMs }) => useRoutineHarness(sessionElapsedMs, onFinish), {
    initialProps: { sessionElapsedMs: 0 },
  })

  act(() => {
    view.result.current.routine.select(WORKOUT.id)
  })

  view.rerender({ sessionElapsedMs: 130_000 })
  for (let step = 0; step < blockIndex; step += 1) {
    act(() => {
      view.result.current.routine.skipBlock()
    })
  }
  view.rerender({ sessionElapsedMs: 200_000 })

  expect(view.result.current.routine.blockIndex).toBe(blockIndex)
  return view
}

/** The block the routine says it is on, by name — index alone proves nothing. */
const activeBlockName = (routine: { selected: Routine | null; blockIndex: number }) =>
  routine.selected!.blocks[routine.blockIndex].name

/** The workout, selected and sitting on its first block. */
const renderOnFirstBlock = (isPlaying: boolean) => {
  window.localStorage.setItem(STORAGE_KEYS.routines, JSON.stringify([WORKOUT]))

  const view = renderHook(() => useRoutineHarness(0, vi.fn(), isPlaying))
  act(() => {
    view.result.current.routine.select(WORKOUT.id)
  })

  return view
}

/** What App does on every hand-made change: tell the routine, then apply it. */
const userDispatch = (
  view: ReturnType<typeof renderOnFirstBlock>,
  action: SettingsAction,
) => {
  act(() => {
    view.result.current.routine.notifyManualChange(action)
    view.result.current.dispatch(action)
  })
}

/** One object for every render: a fresh one churns the settings ref effect. */
const STATIC_SETTINGS = baseSettings()

/**
 * The routine against a recording dispatch. The live-reducer harness proves the
 * block settings landed; this one proves *which* actions a handover fired, and
 * in what order, which is the part the block clock is responsible for.
 */
const renderClock = () => {
  window.localStorage.setItem(STORAGE_KEYS.routines, JSON.stringify([WORKOUT]))

  const dispatch = vi.fn<(action: SettingsAction) => void>()
  const onFinish = vi.fn()
  const view = renderHook(
    ({ sessionElapsedMs }) =>
      useRoutine({ settings: STATIC_SETTINGS, dispatch, sessionElapsedMs, isPlaying: true, onFinish }),
    { initialProps: { sessionElapsedMs: 0 } },
  )

  act(() => {
    view.result.current.select(WORKOUT.id)
  })
  // Selecting applies block one; from here on, only handovers are recorded.
  dispatch.mockClear()

  const applied = () => dispatch.mock.calls.map(([action]) => action)
  return { view, dispatch, onFinish, applied }
}

/** Tick the session clock to `ms`, then re-render at it so the block clock reads. */
const tickAt = (view: ReturnType<typeof renderClock>['view'], ms: number) => {
  act(() => {
    view.result.current.tick(ms)
  })
  view.rerender({ sessionElapsedMs: ms })
}

describe('the block clock', () => {
  it('hands over at the block duration, not a millisecond before', () => {
    const { view, applied } = renderClock()

    tickAt(view, 119_999)

    expect(view.result.current.blockIndex).toBe(0)
    expect(view.result.current.blockElapsedMs).toBe(119_999)
    expect(applied()).toEqual([])

    tickAt(view, 120_000)

    expect(view.result.current.blockIndex).toBe(1)
    expect(view.result.current.blockElapsedMs).toBe(0)
    // No setSpelling: the second block's acc is null, so it leaves the choice alone.
    expect(applied()).toEqual([
      { type: 'setBpm', bpm: 80 },
      { type: 'setBeatsPerNote', value: 2 },
      { type: 'setPool', pool: [1, 3, 6, 8, 10] },
      { type: 'setRamp', enabled: false },
      { type: 'setRampTarget', bpm: 112 },
    ])
  })

  it('advances a late tick by the block own length, so nothing drifts', () => {
    const { view, dispatch, applied } = renderClock()

    tickAt(view, 125_000)

    // The second block starts at its boundary, not at the tick that noticed it.
    expect(view.result.current.blockIndex).toBe(1)
    expect(view.result.current.blockElapsedMs).toBe(5_000)

    dispatch.mockClear()
    tickAt(view, 305_000)

    expect(view.result.current.blockIndex).toBe(2)
    expect(view.result.current.blockElapsedMs).toBe(5_000)
    expect(applied()).toContainEqual({ type: 'setSpelling', value: 'sharp' })

    // Three blocks in and the last boundary is still 2:00 + 3:00 + 4:00 exactly.
    tickAt(view, 539_999)

    expect(view.result.current.blockIndex).toBe(2)
    expect(view.result.current.finished).toBe(false)
  })

  it('never hands over a block with no duration, even inside a timed sequence', () => {
    const { view, onFinish, applied } = renderClock()

    // normalizeBlocks drops untimed blocks out of a stored sequence, so this
    // shape only exists if it is planted on the object tick reads. Mutating the
    // parsed routine is safe: it came back out of localStorage, not from WORKOUT.
    view.result.current.selected!.blocks[0].dur = null

    tickAt(view, 120_000)
    tickAt(view, 600_000)

    expect(view.result.current.blockIndex).toBe(0)
    expect(view.result.current.finished).toBe(false)
    expect(view.result.current.blockElapsedMs).toBe(600_000)
    expect(onFinish).not.toHaveBeenCalled()
    expect(applied()).toEqual([])
  })

  it('finishes once on the last block, and later ticks do nothing', () => {
    const { view, dispatch, onFinish, applied } = renderClock()

    tickAt(view, 120_000)
    tickAt(view, 300_000)
    tickAt(view, 540_000)

    expect(view.result.current.finished).toBe(true)
    // Finishing stops the routine on its last block rather than past the end.
    expect(view.result.current.blockIndex).toBe(2)
    expect(onFinish).toHaveBeenCalledTimes(1)

    dispatch.mockClear()
    tickAt(view, 600_000)
    tickAt(view, 1_000_000)

    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(view.result.current.finished).toBe(true)
    expect(applied()).toEqual([])
  })

  it('keeps the active block on time when the session clock is cleared under it', () => {
    const { view } = renderClock()

    tickAt(view, 120_000)
    view.rerender({ sessionElapsedMs: 200_000 })

    expect(view.result.current.blockIndex).toBe(1)
    expect(view.result.current.blockElapsedMs).toBe(80_000)

    act(() => {
      view.result.current.rebase(200_000)
    })
    view.rerender({ sessionElapsedMs: 0 })

    // The session went back to zero; the block kept the 1:20 it had run.
    expect(view.result.current.blockElapsedMs).toBe(80_000)

    tickAt(view, 99_999)
    expect(view.result.current.blockIndex).toBe(1)

    // 1:20 already run plus 1:40 more is the block's own 3:00, and no more.
    tickAt(view, 100_000)
    expect(view.result.current.blockIndex).toBe(2)
  })
})

describe('the Custom preset is not a manual edit', () => {
  const firstBlockPool = blockPool(WORKOUT.blocks[0])

  it('keeps the routine, and the selector still shows its preset, while stopped', () => {
    const view = renderOnFirstBlock(false)

    userDispatch(view, { type: 'setPreset', preset: 'custom' })

    const { routine, settings } = view.result.current
    expect(routine.selected).toEqual(WORKOUT)
    expect(settings.pool).toEqual(firstBlockPool)
    // The select is driven by the pool, so it reads the block's preset — not 'Custom'.
    expect(matchPreset(settings.pool)).toBe('naturals')
  })

  it('does not flag the block adjusted while playing', () => {
    const view = renderOnFirstBlock(true)

    userDispatch(view, { type: 'setPreset', preset: 'custom' })

    const { routine, settings } = view.result.current
    expect(routine.adjusted).toBe(false)
    expect(settings.pool).toEqual(firstBlockPool)
  })

  it('still forks to the edited pool when a real preset is picked while stopped', () => {
    const view = renderOnFirstBlock(false)

    userDispatch(view, { type: 'setPreset', preset: 'accidentals' })

    const { routine, settings } = view.result.current
    expect(routine.selected).toBeNull()
    expect(settings.pool).toEqual([1, 3, 6, 8, 10])
  })
})

describe('duplicate', () => {
  /** Like WORKOUT, but its first block owns a pool of its own — the one nested
      value a block holds, and the one a shallow clone would leave shared. */
  const CUSTOM_WORKOUT: Routine = {
    ...WORKOUT,
    blocks: [
      block('First', { poolKey: 'custom', pool: [0, 4, 7], bpm: 60, dur: 120 }),
      ...WORKOUT.blocks.slice(1),
    ],
  }

  const renderShelf = () => {
    window.localStorage.setItem(STORAGE_KEYS.routines, JSON.stringify([CUSTOM_WORKOUT]))
    return renderHook(() => useRoutineHarness(0, vi.fn()))
  }

  const stored = (): Routine[] => JSON.parse(window.localStorage.getItem(STORAGE_KEYS.routines) ?? '[]')

  const copyOf = (routines: Routine[]) => routines.find((entry) => entry.id !== CUSTOM_WORKOUT.id)!

  it('adds a persisted copy under its own id and loads it', () => {
    const view = renderShelf()

    act(() => {
      view.result.current.routine.duplicate(CUSTOM_WORKOUT.id)
    })

    const { routine } = view.result.current
    expect(routine.routines).toHaveLength(2)

    const copy = copyOf(routine.routines)
    expect(copy.name).toBe('Three blocks copy')
    expect(copy.id).not.toBe(CUSTOM_WORKOUT.id)
    expect(copy.blocks).toEqual(CUSTOM_WORKOUT.blocks)

    // The copy is what is loaded, from its first block.
    expect(routine.selected!.id).toBe(copy.id)
    expect(routine.blockIndex).toBe(0)
    expect(view.result.current.settings).toMatchObject({ bpm: 60, pool: [0, 4, 7] })

    expect(stored().map((entry) => entry.id)).toEqual([CUSTOM_WORKOUT.id, copy.id])
  })

  it('shares nothing with the original, down to a block pool', () => {
    const view = renderShelf()

    act(() => {
      view.result.current.routine.duplicate(CUSTOM_WORKOUT.id)
    })

    const { routines } = view.result.current.routine
    const original = routines.find((entry) => entry.id === CUSTOM_WORKOUT.id)!
    const copy = copyOf(routines)

    copy.blocks.forEach((copied, index) => {
      expect(copied).not.toBe(original.blocks[index])
    })
    expect(copy.blocks[0].pool).toEqual([0, 4, 7])
    expect(copy.blocks[0].pool).not.toBe(original.blocks[0].pool)
  })

  it('leaves the original alone when the copy is edited', () => {
    const view = renderShelf()

    act(() => {
      view.result.current.routine.duplicate(CUSTOM_WORKOUT.id)
    })
    act(() => {
      view.result.current.routine.removeBlock(0)
    })

    const { routines, selected } = view.result.current.routine
    expect(selected!.blocks.map((entry) => entry.name)).toEqual(['Second', 'Third'])

    const original = routines.find((entry) => entry.id === CUSTOM_WORKOUT.id)!
    expect(original.blocks.map((entry) => entry.name)).toEqual(['First', 'Second', 'Third'])
    expect(original.blocks[0].pool).toEqual([0, 4, 7])

    const [storedOriginal, storedCopy] = stored()
    expect(storedOriginal.blocks.map((entry) => entry.name)).toEqual(['First', 'Second', 'Third'])
    expect(storedCopy.blocks.map((entry) => entry.name)).toEqual(['Second', 'Third'])
  })
})

describe('removeBlock around the active block', () => {
  it('shifts the active index down when an earlier block goes, clock intact', () => {
    const view = renderOnBlock(1)

    act(() => {
      view.result.current.routine.removeBlock(0)
    })

    const { routine, settings } = view.result.current
    expect(routine.selected!.blocks.map((entry) => entry.name)).toEqual(['Second', 'Third'])
    expect(routine.blockIndex).toBe(0)
    expect(activeBlockName(routine)).toBe('Second')
    // Same block, same clock: it was never restarted, only renumbered.
    expect(routine.blockElapsedMs).toBe(70_000)
    expect(settings).toMatchObject({ bpm: 80, beatsPerNote: 2, pool: [1, 3, 6, 8, 10] })
  })

  it('leaves the active block untouched when a later block goes', () => {
    const view = renderOnBlock(1)

    act(() => {
      view.result.current.routine.removeBlock(2)
    })

    const { routine, settings } = view.result.current
    expect(routine.selected!.blocks.map((entry) => entry.name)).toEqual(['First', 'Second'])
    expect(routine.blockIndex).toBe(1)
    expect(activeBlockName(routine)).toBe('Second')
    expect(routine.blockElapsedMs).toBe(70_000)
    expect(settings).toMatchObject({ bpm: 80, beatsPerNote: 2, pool: [1, 3, 6, 8, 10] })
  })

  it('restarts the clock on whatever slides into the removed active block', () => {
    const view = renderOnBlock(1)

    act(() => {
      view.result.current.routine.removeBlock(1)
    })

    const { routine, settings } = view.result.current
    expect(routine.selected!.blocks.map((entry) => entry.name)).toEqual(['First', 'Third'])
    expect(routine.blockIndex).toBe(1)
    expect(activeBlockName(routine)).toBe('Third')
    // The block that took over gets its full duration, not the leftover clock.
    expect(routine.blockElapsedMs).toBe(0)
    expect(settings).toMatchObject({
      bpm: 100,
      beatsPerNote: 4,
      spelling: 'sharp',
      pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    })
  })

  it('falls back to the new last block when the active one was the last', () => {
    const view = renderOnBlock(2)

    act(() => {
      view.result.current.routine.removeBlock(2)
    })

    const { routine, settings } = view.result.current
    expect(routine.selected!.blocks.map((entry) => entry.name)).toEqual(['First', 'Second'])
    expect(routine.blockIndex).toBe(1)
    expect(activeBlockName(routine)).toBe('Second')
    expect(routine.blockElapsedMs).toBe(0)
    expect(settings).toMatchObject({ bpm: 80, beatsPerNote: 2, pool: [1, 3, 6, 8, 10] })
  })
})
