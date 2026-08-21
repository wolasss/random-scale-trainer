/**
 * The client half of the shared board: a handful of calls against the service
 * in src/server/, and no state of its own.
 *
 * The board is read by anybody holding the URL. Changing it takes the ownership
 * token the server issued when the nickname was claimed, and that token rides
 * in an `Authorization: Bearer` header on the mutation calls only — never on
 * the GET, never in a query string, and never anywhere it could be logged by
 * something in between.
 *
 * Nothing here posts a total. The client reports *events* — a note hit, a note
 * missed, a bonus earned — into a session the server opened, and the server
 * decides what they are worth. The number on the board is one this browser
 * never computed, worked out from the same arithmetic the readout uses so the
 * two agree: what a hit reports is the note and what it was called under, and
 * the pricing is the server's.
 *
 * The reading calls answer `null` rather than throwing, as they always have: a
 * board is a nicety beside a practice session, and a server that is down reads
 * the same way to the player. The writing calls answer a *reason* instead,
 * because the difference between "that name is taken", "this is not your
 * nickname" and "you are going too fast" is the difference between three things
 * worth saying and one useless one.
 */
import type { BeatsPerNote } from '../constants'
import type { DifficultyInputs, PracticeMilestoneKind } from './scoring'

export type ScoreEntry = {
  nickname: string
  points: number
}

/** Mounted here by nginx in the container and by a Vite middleware in dev. */
export const SCOREBOARD_ENDPOINT = '/api/scoreboard'

/** The most events one request may carry; mirrors the server's own cap. */
export const MAX_EVENTS_PER_BATCH = 20

export type ScoreboardRequestOptions = {
  signal?: AbortSignal
  /** Injectable for tests; otherwise the browser's own. */
  fetchImpl?: typeof fetch
}

/**
 * What a mutation can come back as. Every one of these has something to say.
 *
 * `rejected` and `error` are deliberately not the same thing. A fetch that never
 * arrived is worth trying again with the same body; a batch the server *judged*
 * and refused is not, because the rules it failed are all-or-nothing and
 * deterministic — sending it a second time would be refused a second time, for
 * ever, and nothing after it would ever be scored.
 */
export type ScoreboardFailure =
  | 'taken'
  | 'unauthorized'
  | 'expired'
  | 'invalid-config'
  | 'rate-limited'
  | 'rejected'
  | 'error'

export type ScoreboardResult<T> = { outcome: 'ok'; value: T } | { outcome: ScoreboardFailure }

/** The settings a session is fixed at. Recorded by the server, and priced at nothing. */
export type SessionConfig = {
  bpm: number
  beatsPerNote: BeatsPerNote
}

/**
 * One thing the client observed. `at` is milliseconds since the session began.
 *
 * `difficulty` rides on a hit and on nothing else: it is what the server prices
 * the note by, and it is the note's own — the settings in force when it was
 * *called*, not when the batch was sent, which is the difference between a
 * board that agrees with the readout under a speed ramp and one that does not.
 */
export type ScoreEvent = {
  seq: number
  kind: 'hit' | 'miss' | 'bonus' | 'milestone'
  bonus?: 'octaves' | 'tempo'
  milestone?: PracticeMilestoneKind
  difficulty?: DifficultyInputs
  at: number
}

export type ClaimedNickname = { nickname: string; token: string }
export type ScoringSession = { sessionId: string; expiresAt: number; config: SessionConfig }
/** What the board looked like after the events landed, and the running total. */
export type SessionProgress = { points: number; scores: ScoreEntry[] }

const endpointFor = (challenge: string) => `${SCOREBOARD_ENDPOINT}/${encodeURIComponent(challenge)}`

/**
 * Anything that isn't a well-formed entry is dropped rather than rendered: this
 * is the one place in the app where the data came from somebody else's browser.
 */
const parseScores = (payload: unknown): ScoreEntry[] | null => {
  if (payload === null || typeof payload !== 'object') {
    return null
  }

  const { scores } = payload as { scores?: unknown }
  if (!Array.isArray(scores)) {
    return null
  }

  return scores.flatMap((entry): ScoreEntry[] => {
    if (entry === null || typeof entry !== 'object') {
      return []
    }

    const { nickname, points } = entry as { nickname?: unknown; points?: unknown }

    return typeof nickname === 'string' && nickname !== '' && typeof points === 'number' && Number.isFinite(points)
      ? [{ nickname, points }]
      : []
  })
}

const readScores = async (response: Response): Promise<ScoreEntry[] | null> => {
  if (!response.ok) {
    return null
  }

  try {
    return parseScores(await response.json())
  } catch {
    return null
  }
}

/** The current top ten, or null if the board could not be reached or read. */
export const fetchTopScores = async (
  challenge: string,
  { signal, fetchImpl = fetch }: ScoreboardRequestOptions = {},
): Promise<ScoreEntry[] | null> => {
  try {
    return await readScores(await fetchImpl(endpointFor(challenge), { signal }))
  } catch {
    return null
  }
}

/**
 * Why a refusal was a refusal. The server's own `error` code is asked first and
 * the status is only the fallback, so a route that grows a second reason for
 * one status does not quietly start reading as the wrong message on screen.
 */
const failureFrom = (status: number, error: unknown): ScoreboardFailure => {
  if (status === 429 || error === 'rate_limited') {
    return 'rate-limited'
  }

  if (status === 401 || error === 'invalid_owner') {
    return 'unauthorized'
  }

  if (error === 'nickname_taken') {
    return 'taken'
  }

  if (error === 'session_expired' || error === 'session_completed') {
    return 'expired'
  }

  if (error === 'invalid_event' || error === 'too_fast' || error === 'too_soon' || error === 'too_many') {
    return 'rejected'
  }

  return error === 'invalid_config' ? 'invalid-config' : 'error'
}

/** One POST, its body parsed, and a reason rather than a null when it failed. */
const mutate = async <T>(
  path: string,
  body: unknown,
  token: string | null,
  read: (payload: Record<string, unknown>) => T | null,
  { signal, fetchImpl = fetch }: ScoreboardRequestOptions,
): Promise<ScoreboardResult<T>> => {
  let response: Response
  try {
    response = await fetchImpl(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Only ever here, and only on the calls that change something.
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    return { outcome: 'error' }
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    payload = {}
  }

  if (!response.ok) {
    return { outcome: failureFrom(response.status, payload?.error) }
  }

  const value = read(payload ?? {})

  return value === null ? { outcome: 'error' } : { outcome: 'ok', value }
}

/**
 * Reserves a nickname on a challenge and takes the ownership token back.
 *
 * The token is spoken exactly once, here. The server keeps only its digest, so
 * losing this copy loses the nickname — which is the point: anything that would
 * hand it back to the next caller would hand it to anybody.
 */
export const claimNickname = (
  challenge: string,
  nickname: string,
  options: ScoreboardRequestOptions = {},
): Promise<ScoreboardResult<ClaimedNickname>> =>
  mutate(
    `${endpointFor(challenge)}/nickname`,
    { nickname },
    null,
    (payload) =>
      typeof payload.nickname === 'string' && typeof payload.token === 'string' && payload.token !== ''
        ? { nickname: payload.nickname, token: payload.token }
        : null,
    options,
  )

/** Opens a scoring session, fixed at `config` from the moment the server says so. */
export const startScoringSession = (
  challenge: string,
  nickname: string,
  token: string,
  config: SessionConfig,
  options: ScoreboardRequestOptions = {},
): Promise<ScoreboardResult<ScoringSession>> =>
  mutate(
    `${endpointFor(challenge)}/session`,
    { nickname, config },
    token,
    (payload) =>
      typeof payload.sessionId === 'string' && payload.sessionId !== ''
        ? {
            sessionId: payload.sessionId,
            expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : 0,
            config: (payload.config as SessionConfig | undefined) ?? config,
          }
        : null,
    options,
  )

const readProgress = (payload: Record<string, unknown>): SessionProgress | null => {
  const scores = parseScores(payload)

  return scores === null || typeof payload.points !== 'number' ? null : { points: payload.points, scores }
}

/**
 * Posts a batch of events. The answer carries the total the *server* worked out
 * and the board that produced, so a flush costs one round trip rather than two.
 */
export const sendScoreEvents = (
  challenge: string,
  sessionId: string,
  token: string,
  events: ScoreEvent[],
  options: ScoreboardRequestOptions = {},
): Promise<ScoreboardResult<SessionProgress>> =>
  mutate(
    `${endpointFor(challenge)}/session/${encodeURIComponent(sessionId)}/events`,
    { events },
    token,
    readProgress,
    options,
  )

/** Closes a session for good. Nothing lands on it afterwards, replays included. */
export const finishScoringSession = (
  challenge: string,
  sessionId: string,
  token: string,
  options: ScoreboardRequestOptions = {},
): Promise<ScoreboardResult<SessionProgress>> =>
  mutate(
    `${endpointFor(challenge)}/session/${encodeURIComponent(sessionId)}/finish`,
    {},
    token,
    readProgress,
    options,
  )
