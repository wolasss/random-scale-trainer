/**
 * Types for session-scoring.js. Hand-written, because that file is plain JS on
 * purpose — the container runs it with bare `node` and no build step — and both
 * scoreboard.js's callers and the colocated test import it from TypeScript.
 *
 * This is the contract. If the JS beside it grows a function, it belongs here
 * too, or the callers cannot see it.
 */

/** The settings a session is fixed at when it opens. Priced at nothing. */
export type SessionConfig = {
  bpm: number
  beatsPerNote: number
}

/** The last judged note, and which bonuses it has already paid out. */
export type LastNote = {
  at: number
  hit: boolean
  bonuses: string[]
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
  completed: boolean
}

/** One thing the client says it observed. `at` is ms since the session began. */
export type SessionEvent = {
  seq: number
  kind: 'hit' | 'miss' | 'bonus'
  bonus?: 'octaves' | 'tempo' | null
  at: number
}

export type SessionEventRejection =
  | 'session_expired'
  | 'session_completed'
  | 'invalid_event'
  | 'too_fast'
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

export declare const MIN_BPM: number
export declare const MAX_BPM: number
export declare const BEAT_SPAN_OPTIONS: number[]

export declare const FASTEST_NOTE_INTERVAL_MS: number
export declare const SESSION_IDLE_MS: number
export declare const SESSION_MAX_MS: number
export declare const MAX_EVENTS_PER_BATCH: number
export declare const MAX_SESSION_EVENTS: number
export declare const CLOCK_SKEW_MS: number

export declare const streakBonusPoints: (streak: number) => number
export declare const validateConfig: (raw: unknown) => SessionConfig | null
export declare const createSessionState: (config: SessionConfig, now: number) => SessionState
export declare const isSessionExpired: (session: SessionState, now: number) => boolean
export declare const completeSession: (session: SessionState) => SessionState
export declare const applySessionEvents: (
  session: SessionState,
  events: unknown,
  now: number,
) => SessionEventResult
