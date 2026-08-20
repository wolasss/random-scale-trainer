import {
  BEAT_SPAN_OPTIONS,
  clampBpm,
  DEFAULT_BEATS_PER_NOTE,
  DEFAULT_BPM,
  DEFAULT_SESSION_GOAL_MIN,
  defaultRampTarget,
  SESSION_GOAL_OPTIONS,
  STORAGE_KEYS,
  type BeatsPerNote,
} from '../constants'
import { PITCH_CLASSES, sortedPcs, type SpellingPreference } from './notes'
import { readRaw, writeRaw } from './storage'

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
  /** Listen through the microphone while practice runs. Off until asked for. */
  micEnabled: boolean
  spelling: SpellingPreference
  /** Sorted unique pitch classes; never empty. */
  pool: number[]
  sessionGoalMin: SessionGoalMin
  /** Stored setting without UI: deliberately kept read-only. */
  endSoundEnabled: boolean
}

type Codec<T> = {
  storageKey: string
  /** Return undefined to reject the stored value and fall back to the default. */
  deserialize: (raw: string) => T | undefined
  serialize: (value: T) => string
}

/** A stored pool entry: plain digits, no sign, no padding, within an octave. */
const isPitchClassText = (segment: string) => /^\d{1,2}$/.test(segment) && Number(segment) <= 11

const booleanCodec = (storageKey: string): Codec<boolean> => ({
  storageKey,
  // Only the two values we write count: anything else is rejected so the
  // default holds, rather than reading as off for the three toggles that
  // default to on.
  deserialize: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
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
  micEnabled: booleanCodec(STORAGE_KEYS.micListen),
  spelling: {
    storageKey: STORAGE_KEYS.spelling,
    deserialize: (raw) =>
      raw === 'flat' || raw === 'sharp' || raw === 'mixed' ? (raw as SpellingPreference) : undefined,
    serialize: String,
  },
  pool: {
    storageKey: STORAGE_KEYS.notePool,
    // Checked segment by segment as text: `split` always hands back at least
    // one entry, so a blank or gappy value like '' or '1,,3' would otherwise
    // coerce through Number into a pool holding C.
    deserialize: (raw) => {
      const segments = raw.split(',')
      const pcs = segments.map(Number)
      const valid = segments.every(isPitchClassText) && new Set(pcs).size === pcs.length
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
  micEnabled: false,
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

export const initSettings = (): Settings => {
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
 * Writes only the settings that changed since `previous` to localStorage.
 * `previous === null` means "write everything" — the mount-time write-back
 * that normalizes stored values (e.g. clamped BPM), which the e2e suite
 * relies on.
 */
export const writeChangedSettings = (previous: Settings | null, next: Settings): void => {
  for (const key of SETTING_KEYS) {
    const codec = SETTING_CODECS[key] as Codec<Settings[typeof key]>
    const value = next[key]
    if (previous === null || previous[key] !== value) {
      writeRaw(codec.storageKey, codec.serialize(value))
    }
  }
}
