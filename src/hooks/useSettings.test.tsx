import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { settingsReducer, useSettings, type Settings } from './useSettings'

const baseSettings = (): Settings => ({
  bpm: 72,
  beatsPerNote: 4,
  countInEnabled: true,
  continuousMode: true,
  speedRampMode: false,
  speakNotes: true,
  referencePitch: true,
  earOnly: false,
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
    expect(settingsReducer(state, { type: 'toggle', key: 'speedRampMode' })).toBe(state)
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
    expect(window.localStorage.getItem('fretboard-count-in')).toBe('true')
    expect(window.localStorage.getItem('fretboard-session-goal')).toBe('10')
  })

  it('restores valid stored values', () => {
    window.localStorage.setItem('fretboard-bpm', '100')
    window.localStorage.setItem('fretboard-note-pool', '0,2,4')
    window.localStorage.setItem('fretboard-spelling', 'sharp')
    window.localStorage.setItem('fretboard-beats-per-note', '8')
    window.localStorage.setItem('fretboard-ear-only', 'true')

    const { result } = renderHook(() => useSettings())

    expect(result.current[0]).toMatchObject({
      bpm: 100,
      pool: [0, 2, 4],
      spelling: 'sharp',
      beatsPerNote: 8,
      earOnly: true,
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

  it('persists dispatched changes per key', () => {
    const { result } = renderHook(() => useSettings())

    act(() => {
      result.current[1]({ type: 'setBpm', bpm: 120 })
      result.current[1]({ type: 'togglePoolNote', pc: 5 })
      result.current[1]({ type: 'toggle', key: 'speakNotes' })
    })

    expect(window.localStorage.getItem('fretboard-bpm')).toBe('120')
    expect(window.localStorage.getItem('fretboard-note-pool')).toBe('0,1,2,3,4,6,7,8,9,10,11')
    expect(window.localStorage.getItem('fretboard-speak-note')).toBe('false')
  })
})
