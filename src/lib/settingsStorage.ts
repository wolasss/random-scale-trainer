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

/**
 * Owns every persisted practice setting: one codec per key, read on mount by
 * `initSettings` and written back by `writeChangedSettings`. The contract a
 * `deserialize` implements is reject, don't repair — returning `undefined`
 * rejects the stored value outright and leaves the default in place, which is
 * the rule several past bugs turned out to be a violation of. `bpm` and
 * `rampTargetBpm` are the two exceptions: a finite number is clamped into
 * range rather than rejected. `rampTargetBpm` is deliberately not re-floored
 * against the stored `bpm` on read (see the codec below for why). The pool is
 * validated segment by segment as text, so a blank or gappy value like ''
 * or '1,,3' can't coerce its way into a pool holding C. `initSettings` also
 * applies one cross-field invariant: a stored speed ramp is discarded when
 * `continuousMode` is off. `writeChangedSettings(null, next)` is the
 * mount-time write-back that normalizes the store (e.g. a clamped BPM comes
 * back clamped) and the e2e suite relies on it running. What each
 * `STORAGE_KEYS` entry holds is documented there, in `src/constants.ts`.
 */

export type SessionGoalMin = (typeof SESSION_GOAL_OPTIONS)[number]

export type Settings = {
  /** The practice tempo; clamped into range rather than rejected on read. */
  bpm: number
  /** How many clicks each note gets; one of `BEAT_SPAN_OPTIONS`. */
  beatsPerNote: BeatsPerNote
  /** Loop through new notes indefinitely instead of running once through the pool; gates `speedRampMode`. */
  continuousMode: boolean
  /** A four-beat count-in before the first note and each new cycle. */
  countInEnabled: boolean
  /** Climb the tempo toward `rampTargetBpm` as rounds complete; forced off when `continuousMode` is off. */
  speedRampMode: boolean
  /** The tempo the ramp climbs to and then holds; never below `bpm`. */
  rampTargetBpm: number
  /** Whether the "On the neck" card is shown at all. */
  showFretboard: boolean
  /** Listen through the microphone while practice runs. Off until asked for. */
  micEnabled: boolean
  /** Whether note names read as flats, sharps, or a mix. */
  spelling: SpellingPreference
  /** Sorted unique pitch classes; never empty. */
  pool: number[]
  /** The session-timer goal in minutes; one of `SESSION_GOAL_OPTIONS`. */
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
  showFretboard: false,
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
