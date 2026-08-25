/**
 * Types for session-scoring.js. Hand-written, because that file is plain JS on
 * purpose — the container runs it with bare `node` and no build step — and both
 * scoreboard.js's callers and the colocated test import it from TypeScript.
 *
 * This is the contract. If the JS beside it grows a function, it belongs here
 * too, or the callers cannot see it.
 */

/** The settings a session is fixed at when it opens. Recorded, never priced. */
export type SessionConfig = {
  bpm: number
  beatsPerNote: number
}

/** The settings one note was called under, which is what prices it. */
export type SessionDifficulty = {
  spelling: 'flat' | 'sharp' | 'mixed'
  showFretboard: boolean
  bpm: number
  beatsPerNote: number
  pool: readonly number[]
}

/** The milestones the session clock can earn, and what each is worth. */
export type PracticeMilestoneKind = 'practice10' | 'practice20' | 'practice30'

/**
 * The last judged note: which bonuses it has already paid out, and the price it
 * was called at, so one discovered later is paid at what its own note was worth.
 */
export type LastNote = {
  at: number
  hit: boolean
  bonuses: string[]
  multiplier: number
}

export type SessionState = {
  config: SessionConfig
  startedAt: number
  lastSeenAt: number
  nextSeq: number
  points: number
  streak: number
  /** The `at` of the last accepted event; -1 before any. */
  lastAt: number
  lastNote: LastNote | null
  /** Which practice milestones this session has paid. Once each, ever. */
  milestones: string[]
  /** Hits and misses together — what the milestone floor counts. */
  judgedNotes: number
  completed: boolean
}

/** One thing the client says it observed. `at` is ms since the session began. */
export type SessionEvent = {
  seq: number
  kind: 'hit' | 'miss' | 'bonus' | 'milestone'
  bonus?: 'octaves' | 'tempo' | null
  milestone?: PracticeMilestoneKind | null
  /** Only ever on a hit, and only ever the note's own: absent is priced flat. */
  difficulty?: SessionDifficulty | null
  at: number
}

export type SessionEventRejection =
  | 'session_expired'
  | 'session_completed'
  | 'invalid_event'
  | 'too_fast'
  | 'too_soon'
  | 'too_many'

export type SessionEventResult =
  | { ok: true; session: SessionState; points: number; gained: number }
  | { ok: false; reason: SessionEventRejection }

export declare const POINTS_PER_HIT: number
export declare const STREAK_BONUS_FROM: number
export declare const STREAK_BONUS_STEP: number
export declare const STREAK_BONUS_MAX: number
export declare const OCTAVES_BONUS_POINTS: number
export declare const TEMPO_BONUS_POINTS: number
export declare const PRACTICE_MILESTONES: Record<PracticeMilestoneKind, { atMs: number; points: number }>
export declare const MILESTONE_LEAD_MS: number

export declare const MIN_BPM: number
export declare const MAX_BPM: number
export declare const DEFAULT_BPM: number
export declare const BEAT_SPAN_OPTIONS: number[]
export declare const SPELLING_OPTIONS: string[]
export declare const PITCH_CLASS_COUNT: number
export declare const ACCIDENTAL_PITCH_CLASSES: number[]

export declare const MIXED_SPELLING_MULTIPLIER: number
export declare const SINGLE_SPELLING_MULTIPLIER: number
export declare const FRETBOARD_HIDDEN_MULTIPLIER: number
export declare const FRETBOARD_SHOWN_MULTIPLIER: number
export declare const BEAT_SPAN_MULTIPLIERS: Record<number, number>
export declare const POOL_MULTIPLIERS: Record<number, number>
export declare const TEMPO_MULTIPLIER_GAIN: number
export declare const TEMPO_MULTIPLIER_MAX: number
export declare const MAX_DIFFICULTY_MULTIPLIER: number

export declare const FASTEST_NOTE_INTERVAL_MS: number
export declare const SLOWEST_NOTE_INTERVAL_MS: number
export declare const MILESTONE_MIN_JUDGED_NOTES: Record<PracticeMilestoneKind, number>
export declare const SESSION_IDLE_MS: number
export declare const SESSION_MAX_MS: number
export declare const MAX_EVENTS_PER_BATCH: number
export declare const MAX_SESSION_EVENTS: number
export declare const CLOCK_SKEW_MS: number

export declare const streakBonusPoints: (streak: number) => number
export declare const difficultyMultiplier: (difficulty: SessionDifficulty) => number
export declare const validateDifficulty: (raw: unknown) => SessionDifficulty | null
export declare const validateConfig: (raw: unknown) => SessionConfig | null
export declare const createSessionState: (config: SessionConfig, now: number) => SessionState
export declare const isSessionExpired: (session: SessionState, now: number) => boolean
export declare const completeSession: (session: SessionState) => SessionState
export declare const applySessionEvents: (
  session: SessionState,
  events: unknown,
  now: number,
) => SessionEventResult
