import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { settingsReducer, useSettings, type Settings } from './useSettings'

const baseSettings = (): Settings => ({
  bpm: 72,
  beatsPerNote: 4,
  continuousMode: true,
  speedRampMode: false,
  rampTargetBpm: 112,
  showFretboard: true,
  spelling: 'mixed',
  pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  sessionGoalMin: 10,
  endSoundEnabled: true,
})

describe('settingsReducer', () => {
  it('clamps and rounds tempo changes', () => {
    const state = baseSettings()

    expect(settingsReducer(state, { type: 'setBpm', bpm: 999 }).bpm).toBe(240)
    expect(settingsReducer(state, { type: 'setBpm', bpm: 3 }).bpm).toBe(30)
    expect(settingsReducer(state, { type: 'setBpm', bpm: 100.6 }).bpm).toBe(101)
    expect(settingsReducer({ ...state, bpm: 240 }, { type: 'nudgeBpm', delta: 1 }).bpm).toBe(240)
    expect(settingsReducer({ ...state, bpm: 30 }, { type: 'nudgeBpm', delta: -1 }).bpm).toBe(30)
  })

  it('turning loop off also turns the ramp off', () => {
    const state = { ...baseSettings(), speedRampMode: true }
    const next = settingsReducer(state, { type: 'toggle', key: 'continuousMode' })

    expect(next.continuousMode).toBe(false)
    expect(next.speedRampMode).toBe(false)
  })

  it('refuses to enable the ramp while loop is off', () => {
    const state = { ...baseSettings(), continuousMode: false }
    expect(settingsReducer(state, { type: 'setRamp', enabled: true })).toBe(state)
  })

  describe('the ramp target', () => {
    it('steps in 5s and stops at the app maximum', () => {
      const state = { ...baseSettings(), rampTargetBpm: 112 }

      expect(settingsReducer(state, { type: 'nudgeRampTarget', delta: 5 }).rampTargetBpm).toBe(117)
      expect(settingsReducer(state, { type: 'nudgeRampTarget', delta: -5 }).rampTargetBpm).toBe(107)
      expect(
        settingsReducer({ ...state, rampTargetBpm: 238 }, { type: 'nudgeRampTarget', delta: 5 }).rampTargetBpm,
      ).toBe(240)
    })

    /** A goal behind you is not a goal — one climb ahead is the lowest it means. */
    it('floors at one climb above the current tempo', () => {
      const state = { ...baseSettings(), bpm: 100 }

      expect(settingsReducer(state, { type: 'setRampTarget', bpm: 60 }).rampTargetBpm).toBe(102)
      expect(
        settingsReducer({ ...state, rampTargetBpm: 104 }, { type: 'nudgeRampTarget', delta: -5 }).rampTargetBpm,
      ).toBe(102)
    })

    it('hands the ramp a fresh goal when it switches on past a stale one', () => {
      const state = { ...baseSettings(), bpm: 130, rampTargetBpm: 112 }
      expect(settingsReducer(state, { type: 'setRamp', enabled: true })).toMatchObject({
        speedRampMode: true,
        rampTargetBpm: 170,
      })
    })

    it('leaves a target the tempo has not reached alone when switching on', () => {
      const state = { ...baseSettings(), bpm: 72, rampTargetBpm: 90 }
      expect(settingsReducer(state, { type: 'setRamp', enabled: true }).rampTargetBpm).toBe(90)
    })

    /**
     * The ramp writes its climb back through setBpm, so re-flooring the target
     * against the tempo there would move the goalposts every single round.
     */
    it('never moves when the tempo climbs into it', () => {
      const state = { ...baseSettings(), bpm: 108, speedRampMode: true, rampTargetBpm: 110 }
      expect(settingsReducer(state, { type: 'setBpm', bpm: 110 }).rampTargetBpm).toBe(110)
    })
  })

  it('toggles pool notes but never empties the pool', () => {
    const state = { ...baseSettings(), pool: [3] }
    expect(settingsReducer(state, { type: 'togglePoolNote', pc: 3 })).toBe(state)

    const grown = settingsReducer(state, { type: 'togglePoolNote', pc: 0 })
    expect(grown.pool).toEqual([0, 3])
    expect(settingsReducer(grown, { type: 'togglePoolNote', pc: 3 }).pool).toEqual([0])
  })

  it('applies presets as sorted pools and ignores custom', () => {
    const state = baseSettings()

    expect(settingsReducer(state, { type: 'setPreset', preset: 'g-major' }).pool).toEqual([
      0, 2, 4, 6, 7, 9, 11,
    ])
    expect(settingsReducer(state, { type: 'setPreset', preset: 'custom' })).toBe(state)
  })
})

describe('useSettings persistence', () => {
  it('writes every setting back on mount (normalization)', () => {
    window.localStorage.setItem('fretboard-bpm', '999')
    renderHook(() => useSettings())

    expect(window.localStorage.getItem('fretboard-bpm')).toBe('240')
    expect(window.localStorage.getItem('fretboard-note-pool')).toBe('0,1,2,3,4,5,6,7,8,9,10,11')
    expect(window.localStorage.getItem('fretboard-spelling')).toBe('mixed')
    expect(window.localStorage.getItem('fretboard-show-neck')).toBe('true')
    expect(window.localStorage.getItem('fretboard-session-goal')).toBe('10')
  })

  it('restores valid stored values', () => {
    window.localStorage.setItem('fretboard-bpm', '100')
    window.localStorage.setItem('fretboard-note-pool', '0,2,4')
    window.localStorage.setItem('fretboard-spelling', 'sharp')
    window.localStorage.setItem('fretboard-beats-per-note', '8')
    window.localStorage.setItem('fretboard-show-neck', 'false')

    const { result } = renderHook(() => useSettings())

    expect(result.current[0]).toMatchObject({
      bpm: 100,
      pool: [0, 2, 4],
      spelling: 'sharp',
      beatsPerNote: 8,
      showFretboard: false,
    })
  })

  it('rejects invalid stored values', () => {
    window.localStorage.setItem('fretboard-note-pool', '5,5,99')
    window.localStorage.setItem('fretboard-beats-per-note', '3')
    window.localStorage.setItem('fretboard-spelling', 'both')

    const { result } = renderHook(() => useSettings())

    expect(result.current[0]).toMatchObject({
      pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      beatsPerNote: 4,
      spelling: 'mixed',
    })
  })

  it('discards a stored ramp when loop mode starts off', () => {
    window.localStorage.setItem('fretboard-continuous-mode', 'false')
    window.localStorage.setItem('fretboard-speed-ramp-mode', 'true')

    const { result } = renderHook(() => useSettings())

    expect(result.current[0].speedRampMode).toBe(false)
    expect(window.localStorage.getItem('fretboard-speed-ramp-mode')).toBe('false')
  })

  /**
   * A session that finished at its target saved both numbers as the same value.
   * Re-flooring on launch would silently hand the player a target they never set.
   */
  it('restores a reached target as reached, not as one more climb', () => {
    window.localStorage.setItem('fretboard-bpm', '110')
    window.localStorage.setItem('fretboard-ramp-target', '110')

    const { result } = renderHook(() => useSettings())

    expect(result.current[0].rampTargetBpm).toBe(110)
  })

  it('persists dispatched changes per key', () => {
    const { result } = renderHook(() => useSettings())

    act(() => {
      result.current[1]({ type: 'setBpm', bpm: 120 })
      result.current[1]({ type: 'togglePoolNote', pc: 5 })
      result.current[1]({ type: 'toggle', key: 'showFretboard' })
    })

    expect(window.localStorage.getItem('fretboard-bpm')).toBe('120')
    expect(window.localStorage.getItem('fretboard-note-pool')).toBe('0,1,2,3,4,6,7,8,9,10,11')
    expect(window.localStorage.getItem('fretboard-show-neck')).toBe('false')
  })
})
