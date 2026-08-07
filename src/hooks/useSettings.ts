import { useEffect, useReducer, useRef, type Dispatch } from 'react'
import {
  BEAT_SPAN_OPTIONS,
  clampBpm,
  clampRampTarget,
  DEFAULT_BEATS_PER_NOTE,
  DEFAULT_BPM,
  DEFAULT_SESSION_GOAL_MIN,
  defaultRampTarget,
  SESSION_GOAL_OPTIONS,
  STORAGE_KEYS,
  type BeatsPerNote,
} from '../constants'
import { PITCH_CLASSES, type SpellingPreference } from '../lib/notes'
import { PRESETS, type PresetId } from '../lib/presets'
import { readRaw, writeRaw } from '../lib/storage'

export type { BeatsPerNote }
export type SessionGoalMin = (typeof SESSION_GOAL_OPTIONS)[number]

export type Settings = {
  bpm: number
  beatsPerNote: BeatsPerNote
  continuousMode: boolean
  /** A four-beat count-in before the first note and each new cycle. */
  countInEnabled: boolean
  speedRampMode: boolean
  /** The tempo the ramp climbs to and then holds; never below `bpm`. */
  rampTargetBpm: number
  /** Whether the "On the neck" card is shown at all. */
  showFretboard: boolean
  spelling: SpellingPreference
  /** Sorted unique pitch classes; never empty. */
  pool: number[]
  sessionGoalMin: SessionGoalMin
  /** Stored setting without UI: deliberately kept read-only. */
  endSoundEnabled: boolean
}

export type SettingsToggleKey = 'continuousMode' | 'countInEnabled' | 'showFretboard'

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

const sortedPcs = (pcs: readonly number[]) => [...pcs].sort((left, right) => left - right)

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
  }
}

type Codec<T> = {
  storageKey: string
  /** Return undefined to reject the stored value and fall back to the default. */
  deserialize: (raw: string) => T | undefined
  serialize: (value: T) => string
}

const booleanCodec = (storageKey: string): Codec<boolean> => ({
  storageKey,
  deserialize: (raw) => raw === 'true',
  serialize: String,
})

const SETTING_CODECS: { [K in keyof Settings]: Codec<Settings[K]> } = {
  bpm: {
    storageKey: STORAGE_KEYS.bpm,
    deserialize: (raw) => {
      const stored = Number(raw)
      return Number.isFinite(stored) ? clampBpm(stored) : undefined
    },
    serialize: String,
  },
  beatsPerNote: {
    storageKey: STORAGE_KEYS.beatsPerNote,
    deserialize: (raw) => {
      const stored = Number(raw)
      return (BEAT_SPAN_OPTIONS as readonly number[]).includes(stored) ? (stored as BeatsPerNote) : undefined
    },
    serialize: String,
  },
  continuousMode: booleanCodec(STORAGE_KEYS.continuousMode),
  countInEnabled: booleanCodec(STORAGE_KEYS.countIn),
  speedRampMode: booleanCodec(STORAGE_KEYS.speedRampMode),
  rampTargetBpm: {
    storageKey: STORAGE_KEYS.rampTarget,
    // Read back as a plain tempo, deliberately NOT re-floored against the
    // stored BPM: a session that finished at its target saved both as the same
    // number, and flooring on launch would quietly move the goalposts.
    deserialize: (raw) => {
      const stored = Number(raw)
      return Number.isFinite(stored) ? clampBpm(stored) : undefined
    },
    serialize: String,
  },
  showFretboard: booleanCodec(STORAGE_KEYS.showFretboard),
  spelling: {
    storageKey: STORAGE_KEYS.spelling,
    deserialize: (raw) =>
      raw === 'flat' || raw === 'sharp' || raw === 'mixed' ? (raw as SpellingPreference) : undefined,
    serialize: String,
  },
  pool: {
    storageKey: STORAGE_KEYS.notePool,
    deserialize: (raw) => {
      const pcs = raw.split(',').map(Number)
      const valid =
        pcs.length > 0 &&
        pcs.every((pc) => Number.isInteger(pc) && pc >= 0 && pc <= 11) &&
        new Set(pcs).size === pcs.length
      return valid ? sortedPcs(pcs) : undefined
    },
    serialize: (pool) => pool.join(','),
  },
  sessionGoalMin: {
    storageKey: STORAGE_KEYS.sessionGoal,
    deserialize: (raw) => {
      const stored = Number(raw)
      return (SESSION_GOAL_OPTIONS as readonly number[]).includes(stored) ? (stored as SessionGoalMin) : undefined
    },
    serialize: String,
  },
  endSoundEnabled: booleanCodec(STORAGE_KEYS.endSound),
}

const DEFAULT_SETTINGS: Settings = {
  bpm: DEFAULT_BPM,
  beatsPerNote: DEFAULT_BEATS_PER_NOTE as BeatsPerNote,
  continuousMode: true,
  countInEnabled: true,
  speedRampMode: false,
  rampTargetBpm: defaultRampTarget(DEFAULT_BPM),
  showFretboard: true,
  spelling: 'mixed',
  pool: [...PITCH_CLASSES],
  sessionGoalMin: DEFAULT_SESSION_GOAL_MIN as SessionGoalMin,
  endSoundEnabled: true,
}

const SETTING_KEYS = Object.keys(SETTING_CODECS) as (keyof Settings)[]

const readStored = <K extends keyof Settings>(settings: Settings, key: K) => {
  const codec = SETTING_CODECS[key]
  const raw = readRaw(codec.storageKey)
  if (raw === null) {
    return
  }

  const parsed = codec.deserialize(raw)
  if (parsed !== undefined) {
    settings[key] = parsed
  }
}

const initSettings = (): Settings => {
  const settings = { ...DEFAULT_SETTINGS, pool: [...DEFAULT_SETTINGS.pool] }
  if (typeof window === 'undefined') {
    return settings
  }

  for (const key of SETTING_KEYS) {
    readStored(settings, key)
  }

  // Cross-field invariant: a stored ramp is discarded when loop mode is off.
  if (!settings.continuousMode) {
    settings.speedRampMode = false
  }

  return settings
}

/**
 * All practice settings behind one reducer, persisted per-key to localStorage
 * in the same format usePersistentState used — including the mount-time
 * write-back that normalizes stored values (e.g. clamped BPM), which the e2e
 * suite relies on.
 */
export function useSettings(): [Settings, Dispatch<SettingsAction>] {
  const [settings, dispatch] = useReducer(settingsReducer, undefined, initSettings)
  const previousRef = useRef<Settings | null>(null)

  useEffect(() => {
    const previous = previousRef.current
    for (const key of SETTING_KEYS) {
      const codec = SETTING_CODECS[key] as Codec<Settings[typeof key]>
      const value = settings[key]
      if (previous === null || previous[key] !== value) {
        writeRaw(codec.storageKey, codec.serialize(value))
      }
    }

    previousRef.current = settings
  }, [settings])

  return [settings, dispatch]
}
