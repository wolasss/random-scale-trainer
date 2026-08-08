import { act, renderHook } from '@testing-library/react'
import { useReducer } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import type { Routine, RoutineBlock } from '../lib/routines'
import { useRoutine } from './useRoutine'
import { settingsReducer, type Settings } from './useSettings'

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
const useRoutineHarness = (sessionElapsedMs: number, onFinish: () => void) => {
  const [settings, dispatch] = useReducer(settingsReducer, null, baseSettings)
  const routine = useRoutine({ settings, dispatch, sessionElapsedMs, isPlaying: true, onFinish })

  return { settings, routine }
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
