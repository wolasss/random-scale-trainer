/**
 * Types for scoreboard.js. Hand-written, because that file is plain JS on
 * purpose — the container runs it with bare `node` and no build step — and both
 * vite.config.ts and the colocated test import it from TypeScript.
 *
 * This is the contract. If the JS beside it grows a function, it belongs here
 * too, or the callers cannot see it.
 */

export type ScoreEntry = {
  nickname: string
  points: number
}

/** Challenge name → nickname → that nickname's best. */
export type ScoreStore = {
  challenges: Map<string, Map<string, number>>
}

export type SubmitOutcome = 'stored' | 'unchanged' | 'invalid' | 'full'

export type ApiRequest = {
  method: string
  pathname: string
  /** The raw request body; absent for a GET. */
  body?: string
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

export declare const normalizeChallengeName: (raw: unknown) => string | null
export declare const normalizeNickname: (raw: unknown) => string | null
export declare const normalizePoints: (raw: unknown) => number | null

export declare const createStore: () => ScoreStore
export declare const submitScore: (
  store: ScoreStore,
  challenge: unknown,
  nickname: unknown,
  points: unknown,
) => SubmitOutcome
export declare const topScores: (store: ScoreStore, challenge: unknown, limit?: number) => ScoreEntry[]
export declare const handleRequest: (store: ScoreStore, request: ApiRequest) => ApiResponse

export declare const serializeSnapshot: (store: ScoreStore) => string
export declare const readSnapshot: (path: string) => ScoreStore
export declare const writeSnapshot: (path: string, store: ScoreStore) => boolean
