import { useEffect, useReducer, useRef, type Dispatch } from 'react'
import { clampBpm, clampRampTarget, defaultRampTarget, type BeatsPerNote } from '../constants'
import { sortedPcs, type SpellingPreference } from '../lib/notes'
import { PRESETS, type PresetId } from '../lib/presets'
import { initSettings, writeChangedSettings, type Settings, type SessionGoalMin } from '../lib/settingsStorage'
import { isCapo, type TuningId } from '../lib/tuning'

export type { BeatsPerNote, Settings, SessionGoalMin, TuningId }

export type SettingsToggleKey = 'continuousMode' | 'countInEnabled' | 'showFretboard' | 'micEnabled'

export type SettingsAction =
  | { type: 'setBpm'; bpm: number }
  | { type: 'nudgeBpm'; delta: number }
  | { type: 'setBeatsPerNote'; value: BeatsPerNote }
  | { type: 'toggle'; key: SettingsToggleKey }
  // The ramp and its ceiling are block-owned, so they get action types of their
  // own rather than riding `toggle` alongside the app-wide switches.
  | { type: 'setRamp'; enabled: boolean }
  | { type: 'setRampTarget'; bpm: number }
  | { type: 'nudgeRampTarget'; delta: number }
  | { type: 'setSpelling'; value: SpellingPreference }
  | { type: 'togglePoolNote'; pc: number }
  | { type: 'setPreset'; preset: PresetId }
  | { type: 'setPool'; pool: readonly number[] }
  | { type: 'setSessionGoal'; minutes: SessionGoalMin }
  | { type: 'setTuning'; value: TuningId }
  | { type: 'setCapo'; value: number }

export const settingsReducer = (state: Settings, action: SettingsAction): Settings => {
  switch (action.type) {
    case 'setBpm':
      return { ...state, bpm: clampBpm(action.bpm) }
    case 'nudgeBpm':
      return { ...state, bpm: clampBpm(state.bpm + action.delta) }
    case 'setBeatsPerNote':
      return { ...state, beatsPerNote: action.value }
    case 'toggle': {
      const next = { ...state, [action.key]: !state[action.key] }
      // The ramp only applies while looping — a run that stops after one lap
      // never reaches a second round to climb on.
      if (action.key === 'continuousMode' && !next.continuousMode) {
        next.speedRampMode = false
      }

      return next
    }
    case 'setRamp': {
      if (action.enabled && !state.continuousMode) {
        return state
      }

      const next = { ...state, speedRampMode: action.enabled }
      // Switching on against a target the tempo has already passed would offer
      // a ramp with nowhere to go; hand it a fresh goal instead.
      if (action.enabled && next.rampTargetBpm <= state.bpm) {
        next.rampTargetBpm = defaultRampTarget(state.bpm)
      }

      return next
    }
    case 'setRampTarget':
      return { ...state, rampTargetBpm: clampRampTarget(action.bpm, state.bpm) }
    case 'nudgeRampTarget':
      return { ...state, rampTargetBpm: clampRampTarget(state.rampTargetBpm + action.delta, state.bpm) }
    case 'setSpelling':
      return { ...state, spelling: action.value }
    case 'togglePoolNote': {
      const selected = state.pool.includes(action.pc)
      // Never allow an empty pool — the last remaining note stays selected.
      if (selected && state.pool.length === 1) {
        return state
      }

      const pool = selected
        ? state.pool.filter((pc) => pc !== action.pc)
        : sortedPcs([...state.pool, action.pc])

      return { ...state, pool }
    }
    case 'setPreset': {
      const preset = PRESETS.find((entry) => entry.id === action.preset)
      // 'custom' is derived from the chips, never applied.
      if (!preset || preset.pcs === null) {
        return state
      }

      return { ...state, pool: sortedPcs(preset.pcs) }
    }
    case 'setPool': {
      // Routines set the pool wholesale; an empty one would starve the deck.
      if (action.pool.length === 0) {
        return state
      }

      return { ...state, pool: sortedPcs(action.pool) }
    }
    case 'setSessionGoal':
      return { ...state, sessionGoalMin: action.minutes }
    case 'setTuning':
      return { ...state, tuning: action.value }
    case 'setCapo':
      // Only frets the picker offers: a capo elsewhere would draw a window the
      // neck has no numbers for.
      return isCapo(action.value) ? { ...state, capo: action.value } : state
  }
}

/**
 * All practice settings behind one reducer, persisted per-key to localStorage
 * via `settingsStorage` — including the mount-time write-back that normalizes
 * stored values (e.g. clamped BPM), which the e2e suite relies on.
 */
export function useSettings(): [Settings, Dispatch<SettingsAction>] {
  const [settings, dispatch] = useReducer(settingsReducer, undefined, initSettings)
  const previousRef = useRef<Settings | null>(null)

  useEffect(() => {
    writeChangedSettings(previousRef.current, settings)
    previousRef.current = settings
  }, [settings])

  return [settings, dispatch]
}
