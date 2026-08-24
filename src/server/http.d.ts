/**
 * Types for http.js. Hand-written, for the same reason scoreboard.d.ts is: the
 * file beside it is plain JS the container runs with bare `node`, and the
 * integration test imports it from TypeScript.
 */
import type { Server } from 'node:http'
import type { ScoreStore } from './scoreboard.js'

export type ScoreboardServerOptions = {
  store: ScoreStore
  /** Where to keep the board between restarts; '' means memory only. */
  dataPath?: string
  /** Injectable clock, so a test can age a session out without waiting. */
  now?: () => number
}

export declare const MAX_BODY_BYTES: number
export declare const HEADERS_TIMEOUT_MS: number
export declare const REQUEST_TIMEOUT_MS: number
export declare const KEEP_ALIVE_TIMEOUT_MS: number
export declare const clientIdentity: (remoteAddress: unknown, forwardedFor: unknown) => string
export declare const isCrossSitePost: (method: unknown, headers: Record<string, unknown>) => boolean
export declare const createScoreboardServer: (options: ScoreboardServerOptions) => Server
