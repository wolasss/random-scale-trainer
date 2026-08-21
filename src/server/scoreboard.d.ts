/**
 * Types for scoreboard.js. Hand-written, because that file is plain JS on
 * purpose — the container runs it with bare `node` and no build step — and both
 * vite.config.ts and the colocated test import it from TypeScript.
 *
 * This is the contract. If the JS beside it grows a function, it belongs here
 * too, or the callers cannot see it.
 */
import type { SessionState } from './session-scoring.js'

export type ScoreEntry = {
  nickname: string
  points: number
}

/**
 * Who owns one nickname on one challenge. `tokenHash` is a sha256 digest and
 * never the token itself; a null one is a tombstone — the name is taken and no
 * token can ever satisfy it.
 */
export type NicknameOwner = {
  nickname: string
  tokenHash: string | null
  claimedAt: number
  /** When this owner last put a total on the board; null means never. */
  scoredAt: number | null
}

export type ChallengeBoard = {
  /** Nickname → that nickname's best. */
  entries: Map<string, number>
  /** Case-folded nickname key → who owns it. */
  owners: Map<string, NicknameOwner>
  lastActiveAt: number
}

/** One open scoring session, keyed by the id the server issued for it. */
export type SessionRecord = {
  challenge: string
  /** The case-folded nickname key the session was opened for. */
  key: string
  session: SessionState
}

export type RateBucket = {
  count: number
  resetAt: number
}

export type ScoreStore = {
  challenges: Map<string, ChallengeBoard>
  sessions: Map<string, SessionRecord>
  limits: Map<string, RateBucket>
}

export type RateLimit = {
  limit: number
  windowMs: number
}

export type ClaimResult =
  | { outcome: 'claimed'; nickname: string; token: string }
  | { outcome: 'taken' | 'full' | 'invalid' | 'rate_limited' }

export type RecordOutcome = 'stored' | 'unchanged' | 'invalid' | 'full'

export type ApiRequest = {
  method: string
  pathname: string
  /** The raw request body; absent for a GET. */
  body?: string
  /** Lowercased request headers. Only `authorization` is ever read. */
  headers?: Record<string, string | undefined>
  /** Whoever is asking, as the HTTP edge resolved them. Rate limits key on it. */
  client?: string
  /** Injectable clock; defaults to `Date.now()`. */
  now?: number
}

export type ApiResponse = {
  status: number
  json: Record<string, unknown>
  /** Whether the store actually moved — what makes a snapshot worth writing. */
  changed: boolean
}

export declare const API_PREFIX: string
export declare const TOP_LIMIT: number
export declare const MAX_POINTS: number
export declare const MAX_ENTRIES: number
export declare const MAX_CHALLENGES: number
export declare const MAX_NEW_CHALLENGES_PER_HOUR: number
export declare const MAX_UNSCORED_OWNERS: number
export declare const UNUSED_OWNER_TTL_MS: number
export declare const MAX_LIMIT_BUCKETS: number
export declare const MAX_SESSIONS: number

export declare const CLAIM_LIMIT: RateLimit
export declare const SESSION_LIMIT: RateLimit
export declare const EVENTS_LIMIT: RateLimit
export declare const CHALLENGE_CLAIM_LIMIT: RateLimit

export declare const normalizeChallengeName: (raw: unknown) => string | null
export declare const normalizeNickname: (raw: unknown) => string | null
export declare const nicknameKey: (raw: unknown) => string | null
export declare const normalizePoints: (raw: unknown) => number | null

export declare const createStore: () => ScoreStore
export declare const takeToken: (store: ScoreStore, key: string, limit: RateLimit, now: number) => boolean
export declare const sweep: (store: ScoreStore, now: number) => void

export declare const claimNickname: (
  store: ScoreStore,
  challenge: unknown,
  nickname: unknown,
  now: number,
) => ClaimResult
export declare const verifyOwner: (
  store: ScoreStore,
  challenge: unknown,
  nickname: unknown,
  token: unknown,
) => NicknameOwner | null
export declare const recordSessionTotal: (
  store: ScoreStore,
  challenge: unknown,
  nickname: unknown,
  points: unknown,
  now: number,
) => RecordOutcome

export declare const topScores: (store: ScoreStore, challenge: unknown, limit?: number) => ScoreEntry[]
export declare const handleRequest: (store: ScoreStore, request: ApiRequest) => ApiResponse

export declare const serializeSnapshot: (store: ScoreStore) => string
export declare const readSnapshot: (path: string) => ScoreStore
export declare const writeSnapshot: (path: string, store: ScoreStore) => boolean
