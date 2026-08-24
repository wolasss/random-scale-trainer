/**
 * The shared-challenge scoreboard, as a pure function of a store and a request.
 *
 * A board that several people can see is the one thing in this app that cannot
 * live in localStorage, so this is the only server it has. It is plain JS for
 * the same reason src/sw/service-worker.js is: it never goes through the app
 * bundle, and the container runs it with bare `node` and no build step. The
 * hand-written scoreboard.d.ts beside it is what lets vite.config.ts and the
 * colocated test import it.
 *
 * Everything below the HTTP edge is a pure function of the store it is handed,
 * so the whole contract — ownership, the point rules, the caps, the tolerance
 * for a snapshot file somebody has edited — is testable without a socket.
 * src/server/http.js is the only part that opens one.
 *
 * A nickname *is* an identity here, and this is the file that makes it one.
 * Claiming an unused one hands back a random 32-byte token and keeps only its
 * sha256; every mutation afterwards has to present the token that hashes to it.
 * Nothing re-issues a token and nothing downgrades a claim, so a browser that
 * cleared its storage has genuinely lost that nickname — which is the price of
 * the alternative being "anyone who can type your name can edit your score".
 * Holding the challenge URL is read access and nothing more.
 *
 * The score itself is never taken from the client. See session-scoring.js: a
 * client opens a session, streams events, and the total that reaches the board
 * is the one computed here.
 *
 * The caps have a job the ownership rules cannot do. There is no user identity
 * to authorize *creation* with, so growth is bounded four ways instead: a
 * challenge exists only because somebody successfully claimed a nickname on it;
 * a global hourly bucket limits how fast new ones appear at all; a challenge
 * nobody has scored on may only hold so many owners, and those owners expire;
 * and when the table is full the least recently active *unscored* challenge is
 * evicted, so squatting cannot permanently wedge it and a board with a real
 * score on it is never thrown away.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  applySessionEvents,
  completeSession,
  createSessionState,
  isSessionExpired,
  SESSION_IDLE_MS,
  validateConfig,
} from './session-scoring.js'

/** Everything the API answers on lives under here. */
export const API_PREFIX = '/api/scoreboard/'

/** How many entries a board hands back. The task calls for a top ten. */
export const TOP_LIMIT = 10

/** Points are a session tally, not a lifetime one — this is far above any real run. */
export const MAX_POINTS = 1_000_000

/** Per-challenge and overall ceilings, so one caller cannot grow the file forever. */
export const MAX_ENTRIES = 500
export const MAX_CHALLENGES = 200

/**
 * How fast new challenges may appear *in total*, regardless of who asks. A
 * per-client bucket alone does not bound this: clients are only ever identified
 * by an address, and addresses are cheap. This is the backstop that keeps the
 * MAX_CHALLENGES table from being filled in one burst.
 */
export const MAX_NEW_CHALLENGES_PER_HOUR = 30

/**
 * How many owners a challenge may hold who have never scored. Squatting names
 * would otherwise consume the MAX_ENTRIES slots the people playing need.
 */
export const MAX_UNSCORED_OWNERS = 25

/** ...and a claim nobody ever scored under is swept after a day. A scored one never is. */
export const UNUSED_OWNER_TTL_MS = 24 * 60 * 60_000

/**
 * Rate limits, per client identity unless the name says otherwise. Claiming is
 * a thing a person does once per challenge, so the per-client bucket is only
 * there to stop a script; the per-challenge one below is what actually bounds
 * how fast one board can be filled.
 */
export const CLAIM_LIMIT = { limit: 10, windowMs: 60_000 }
export const SESSION_LIMIT = { limit: 10, windowMs: 60_000 }
export const EVENTS_LIMIT = { limit: 120, windowMs: 60_000 }
export const CHALLENGE_CLAIM_LIMIT = { limit: 20, windowMs: 60 * 60_000 }

/** A ceiling on the bookkeeping itself, so the buckets cannot become the leak. */
export const MAX_LIMIT_BUCKETS = 5_000
export const MAX_SESSIONS = 2_000

/** How much of the store one sweep is allowed to walk. Bounded work per request. */
const SWEEP_BUDGET = 64

/**
 * These two duplicate `readChallengeName` and `normalizeNickname` in
 * src/lib/challenge.ts on purpose: this file is plain JS and cannot import TS,
 * and the server has to be the one that decides what it stores anyway. Keep the
 * two in step — the rules are asserted on both sides.
 */
const CHALLENGE_PATTERN = /^[a-z0-9][a-z0-9 _-]{0,31}$/
const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/gu
const MAX_NICKNAME_LENGTH = 20

export const normalizeChallengeName = (raw) => {
  if (typeof raw !== 'string') {
    return null
  }

  const name = raw.trim().toLowerCase()

  return CHALLENGE_PATTERN.test(name) ? name : null
}

export const normalizeNickname = (raw) => {
  if (typeof raw !== 'string') {
    return null
  }

  // Control characters would otherwise reach every other player's screen.
  const nickname = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NICKNAME_LENGTH).trim()

  return nickname === '' ? null : nickname
}

/**
 * The key one nickname is owned under. Case-folded, so `Alice`, `alice ` and
 * `ALICE` are one person and not three — a board where the difference between
 * two rows is a capital letter is a board anybody can impersonate you on.
 * Kept in step with `nicknameKey` in src/lib/challenge.ts.
 *
 * Normalised *again* after folding, and that second pass is load-bearing:
 * lowercasing can lengthen a name — `İ` folds to two code units — so folding a
 * name at the length limit can push it past it. Without the second pass the key
 * of a key would differ from the key, and a key is round-tripped through here
 * every time one is read back out of a snapshot.
 */
export const nicknameKey = (raw) => {
  const nickname = normalizeNickname(raw)

  return nickname === null ? null : normalizeNickname(nickname.toLowerCase())
}

export const normalizePoints = (raw) => {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return null
  }

  return Math.min(MAX_POINTS, Math.floor(raw))
}

export const createStore = () => ({ challenges: new Map(), sessions: new Map(), limits: new Map(), sweepCursor: 0 })

const createBoard = (now) => ({ entries: new Map(), owners: new Map(), unscored: new Set(), lastActiveAt: now })

const hashToken = (token) => createHash('sha256').update(token, 'utf8').digest('hex')

/**
 * Constant-time as far as it can be: the digests are fixed-length hex, so a
 * mismatched length is a malformed token rather than a hint about the secret.
 */
const hashesMatch = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

/**
 * A token bucket over a bounded map. Every limited route checks this *before*
 * touching anything else, so an exhausted caller cannot leave a half-written
 * store behind.
 */
export const takeToken = (store, key, { limit, windowMs }, now) => {
  const bucket = store.limits.get(key)
  if (bucket === undefined || now >= bucket.resetAt) {
    if (store.limits.size >= MAX_LIMIT_BUCKETS && bucket === undefined) {
      // The bookkeeping is full and this is a caller we have never seen. Refuse
      // rather than grow: a refusal costs a request, growing costs the process.
      return false
    }

    store.limits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) {
    return false
  }

  bucket.count += 1

  return true
}

/**
 * Expires what has gone stale, a bounded slice at a time. Called on the way in
 * to every request, so nothing accumulates while the server is busy and nothing
 * turns one request into a full-table scan.
 */
export const sweep = (store, now) => {
  let budget = SWEEP_BUDGET

  for (const [key, bucket] of store.limits) {
    if (budget-- <= 0) {
      break
    }

    if (now >= bucket.resetAt) {
      store.limits.delete(key)
    }
  }

  budget = SWEEP_BUDGET
  for (const [id, record] of store.sessions) {
    if (budget-- <= 0) {
      break
    }

    if (record.session.completed || isSessionExpired(record.session, now)) {
      store.sessions.delete(id)
    }
  }

  // Only the owners who have never scored are candidates, so the budget is
  // spent on those and never on the permanent records of a busy board — which
  // would otherwise consume a whole sweep and leave the boards behind it
  // untouched forever. The cursor is the other half of that: a sweep resumes
  // where the last one stopped, so every board comes round in turn rather than
  // the first few being swept over and over.
  const boards = [...store.challenges.values()]
  if (boards.length === 0) {
    return
  }

  budget = SWEEP_BUDGET
  let index = store.sweepCursor % boards.length
  for (let visited = 0; visited < boards.length && budget > 0; visited += 1) {
    const board = boards[index]
    index = (index + 1) % boards.length

    for (const key of board.unscored) {
      if (budget-- <= 0) {
        break
      }

      // A claim that never scored is a name somebody typed and walked away
      // from. One that did score is the board, and never expires.
      const owner = board.owners.get(key)
      if (owner === undefined || now - owner.claimedAt > UNUSED_OWNER_TTL_MS) {
        board.owners.delete(key)
        board.unscored.delete(key)
        if (owner !== undefined) {
          board.entries.delete(owner.nickname)
        }
      }
    }
  }

  store.sweepCursor = index
}

/**
 * Makes room for a new challenge, or reports that there is none.
 *
 * Only ever evicts a challenge with no scored entry on it: a board somebody has
 * actually played on is not something a stranger gets to push out by claiming
 * names elsewhere. When every challenge has been scored on, the table is
 * genuinely full and a claim is refused — which is what the cap has always
 * meant.
 */
const evictForNewChallenge = (store) => {
  if (store.challenges.size < MAX_CHALLENGES) {
    return true
  }

  let oldestName = null
  let oldestAt = Infinity
  for (const [name, board] of store.challenges) {
    if (board.entries.size > 0) {
      continue
    }

    if (board.lastActiveAt < oldestAt) {
      oldestAt = board.lastActiveAt
      oldestName = name
    }
  }

  if (oldestName === null) {
    return false
  }

  store.challenges.delete(oldestName)

  return true
}

/**
 * Claims a nickname on a challenge, atomically.
 *
 * Atomic by construction rather than by locking: this is a synchronous
 * check-and-set on a Map, and node runs it to completion. Two requests racing
 * for the same normalized name therefore produce exactly one `claimed` and one
 * `taken`, whichever order they are dispatched in.
 *
 * The token is returned exactly once, here. Only its digest is kept, so a
 * snapshot on disk — or a leaked one — is not a set of credentials.
 */
export const claimNickname = (store, challenge, nickname, now) => {
  const name = normalizeChallengeName(challenge)
  const who = normalizeNickname(nickname)
  const key = nicknameKey(nickname)
  if (name === null || who === null || key === null) {
    return { outcome: 'invalid' }
  }

  let board = store.challenges.get(name)
  if (board === undefined) {
    // A challenge only ever comes into being because somebody joined it.
    if (!takeToken(store, 'new-challenge', { limit: MAX_NEW_CHALLENGES_PER_HOUR, windowMs: 60 * 60_000 }, now)) {
      return { outcome: 'rate_limited' }
    }

    if (!evictForNewChallenge(store)) {
      return { outcome: 'full' }
    }

    board = createBoard(now)
    store.challenges.set(name, board)
  }

  // A key that is present — with a token or with a tombstone — is taken, and
  // there is no path from here that re-issues a token for one.
  if (board.owners.has(key)) {
    return { outcome: 'taken' }
  }

  if (board.owners.size >= MAX_ENTRIES) {
    return { outcome: 'full' }
  }

  if (board.unscored.size >= MAX_UNSCORED_OWNERS) {
    return { outcome: 'full' }
  }

  const token = randomBytes(32).toString('hex')
  board.owners.set(key, { nickname: who, tokenHash: hashToken(token), claimedAt: now, scoredAt: null })
  board.unscored.add(key)
  board.lastActiveAt = now

  return { outcome: 'claimed', nickname: who, token }
}

/**
 * The owner record a token unlocks, looked up by the key it is stored under, or
 * null. A record with a null hash is a tombstone — a nickname carried over from
 * before ownership existed — and no token satisfies it, ever.
 */
export const verifyOwnerKey = (store, challenge, key, token) => {
  const name = normalizeChallengeName(challenge)
  if (name === null || typeof key !== 'string' || typeof token !== 'string' || token === '') {
    return null
  }

  const owner = store.challenges.get(name)?.owners.get(key)
  if (owner === undefined || owner.tokenHash === null) {
    return null
  }

  return hashesMatch(owner.tokenHash, hashToken(token)) ? owner : null
}

/** The same, for a nickname as somebody typed it rather than a stored key. */
export const verifyOwner = (store, challenge, nickname, token) =>
  verifyOwnerKey(store, challenge, nicknameKey(nickname), token)

/**
 * Puts a session's computed total on the board, best-wins.
 *
 * Best-wins for the reason it always was: a client posts on every pause, and a
 * session that ends lower than an earlier one must not take the board down with
 * it. Never creates a challenge and never creates an entry for a nickname
 * nobody owns — both of those go through `claimNickname`.
 */
export const recordSessionTotal = (store, challenge, nickname, points, now) => {
  const name = normalizeChallengeName(challenge)
  const key = nicknameKey(nickname)
  const score = normalizePoints(points)
  if (name === null || key === null || score === null) {
    return 'invalid'
  }

  const board = store.challenges.get(name)
  const owner = board?.owners.get(key)
  if (board === undefined || owner === undefined) {
    return 'invalid'
  }

  board.lastActiveAt = now
  owner.scoredAt = now
  board.unscored.delete(key)

  const previous = board.entries.get(owner.nickname)
  if (previous !== undefined && score <= previous) {
    return 'unchanged'
  }

  if (previous === undefined && board.entries.size >= MAX_ENTRIES) {
    return 'full'
  }

  board.entries.set(owner.nickname, score)

  return 'stored'
}

/**
 * Highest first, then by nickname so a tie is stable rather than dependent on
 * who happened to submit first. Nothing about ownership is in here: this is the
 * one endpoint anybody holding the URL may read, and it hands back names and
 * numbers only.
 */
export const topScores = (store, challenge, limit = TOP_LIMIT) => {
  const name = normalizeChallengeName(challenge)
  const board = name === null ? undefined : store.challenges.get(name)
  if (board === undefined) {
    return []
  }

  return [...board.entries.entries()]
    .map(([nickname, points]) => ({ nickname, points }))
    .sort((a, b) => b.points - a.points || (a.nickname < b.nickname ? -1 : a.nickname > b.nickname ? 1 : 0))
    .slice(0, Math.max(0, limit))
}

/** The challenge and the rest of the path, or null if it names none we accept. */
const parsePath = (pathname) => {
  if (typeof pathname !== 'string' || !pathname.startsWith(API_PREFIX)) {
    return null
  }

  const [head, ...tail] = pathname.slice(API_PREFIX.length).split('/')
  // A stray '%' is a malformed escape, and decodeURIComponent throws on one.
  try {
    const challenge = normalizeChallengeName(decodeURIComponent(head))

    return challenge === null ? null : { challenge, tail }
  } catch {
    return null
  }
}

/** The JSON object a POST body carries, or null if it carries none usefully. */
const parseBody = (body) => {
  if (typeof body !== 'string' || body === '') {
    return null
  }

  try {
    const parsed = JSON.parse(body)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** The token on an `Authorization: Bearer` header, or null. */
const bearerToken = (headers) => {
  const raw = headers?.authorization ?? headers?.Authorization
  if (typeof raw !== 'string') {
    return null
  }

  const match = /^Bearer +([A-Za-z0-9._~+/-]+=*)$/.exec(raw.trim())

  return match === null ? null : match[1]
}

const answer = (status, json, changed = false) => ({ status, json, changed })

const board = (store, challenge, extra = {}) =>
  answer(200, { challenge, scores: topScores(store, challenge), ...extra })

/**
 * The whole routing table. `changed` is what tells the HTTP edge a snapshot is
 * worth writing — a repeat submit changes nothing and costs no disk.
 *
 * Every refusal below happens before anything is written. A 400, a 401, a 409
 * and a 429 all leave the store byte-for-byte where they found it.
 */
export const handleRequest = (store, request) => {
  const { method, pathname, body, headers = {}, client = '', now = Date.now() } = request

  sweep(store, now)

  const parsed = parsePath(pathname)
  if (parsed === null) {
    return typeof pathname === 'string' && pathname.startsWith(API_PREFIX)
      ? answer(400, { error: 'invalid challenge name' })
      : answer(404, { error: 'not found' })
  }

  const { challenge, tail } = parsed

  if (method === 'GET') {
    return tail.length === 0 ? board(store, challenge) : answer(404, { error: 'not found' })
  }

  if (method !== 'POST') {
    return answer(405, { error: 'method not allowed' })
  }

  // The old contract, where a browser posted the number it had arrived at. It
  // is gone rather than deprecated: any body at this path is a claim about a
  // score, and this server no longer takes claims about scores.
  if (tail.length === 0) {
    return answer(410, { error: 'unsupported' })
  }

  if (tail.length === 1 && tail[0] === 'nickname') {
    return handleClaim(store, { challenge, body, client, now })
  }

  if (tail.length === 1 && tail[0] === 'session') {
    return handleSessionStart(store, { challenge, body, headers, client, now })
  }

  if (tail.length === 3 && tail[0] === 'session' && (tail[2] === 'events' || tail[2] === 'finish')) {
    return handleSessionPost(store, { challenge, id: tail[1], step: tail[2], body, headers, client, now })
  }

  return answer(404, { error: 'not found' })
}

const handleClaim = (store, { challenge, body, client, now }) => {
  const parsed = parseBody(body)
  if (parsed === null || normalizeNickname(parsed.nickname) === null) {
    return answer(400, { error: 'invalid nickname' })
  }

  if (
    !takeToken(store, `claim:${client}`, CLAIM_LIMIT, now) ||
    !takeToken(store, `claim-challenge:${challenge}`, CHALLENGE_CLAIM_LIMIT, now)
  ) {
    return answer(429, { error: 'rate_limited' })
  }

  const result = claimNickname(store, challenge, parsed.nickname, now)
  if (result.outcome === 'taken') {
    return answer(409, { error: 'nickname_taken' })
  }

  if (result.outcome === 'rate_limited') {
    return answer(429, { error: 'rate_limited' })
  }

  if (result.outcome === 'full') {
    return answer(409, { error: 'challenge_full' })
  }

  if (result.outcome === 'invalid') {
    return answer(400, { error: 'invalid nickname' })
  }

  return answer(201, { challenge, nickname: result.nickname, token: result.token }, true)
}

const handleSessionStart = (store, { challenge, body, headers, client, now }) => {
  const parsed = parseBody(body)
  if (parsed === null) {
    return answer(400, { error: 'expected a JSON object' })
  }

  if (!takeToken(store, `session:${client}`, SESSION_LIMIT, now)) {
    return answer(429, { error: 'rate_limited' })
  }

  const owner = verifyOwner(store, challenge, parsed.nickname, bearerToken(headers))
  if (owner === null) {
    return answer(401, { error: 'invalid_owner' })
  }

  const config = validateConfig(parsed.config)
  if (config === null) {
    return answer(400, { error: 'invalid_config' })
  }

  if (store.sessions.size >= MAX_SESSIONS) {
    return answer(429, { error: 'rate_limited' })
  }

  const id = randomBytes(16).toString('hex')
  const session = createSessionState(config, now)
  store.sessions.set(id, { challenge, key: nicknameKey(owner.nickname), session })

  return answer(201, {
    challenge,
    sessionId: id,
    // Reported so a client can tell what it is being scored under, and so the
    // number it was fixed at is never a secret.
    config,
    expiresAt: now + SESSION_IDLE_MS,
  })
}

const handleSessionPost = (store, { challenge, id, step, body, headers, client, now }) => {
  const parsed = parseBody(body)
  // A finish carries nothing — it is the path that says what it means — so an
  // empty body is the ordinary case there rather than a malformed request.
  if (parsed === null && step !== 'finish') {
    return answer(400, { error: 'expected a JSON object' })
  }

  if (!takeToken(store, `events:${client}`, EVENTS_LIMIT, now)) {
    return answer(429, { error: 'rate_limited' })
  }

  const record = store.sessions.get(id)
  if (record === undefined || record.challenge !== challenge) {
    return answer(404, { error: 'session_expired' })
  }

  // The token is checked against the owner the session was opened for, by the
  // key the store already holds rather than by re-deriving one, so a guessed
  // session id is worth nothing without the token and a name that is its own
  // edge case cannot lock its owner out of a session they legitimately opened.
  const owner = verifyOwnerKey(store, challenge, record.key, bearerToken(headers))
  if (owner === null) {
    return answer(401, { error: 'invalid_owner' })
  }

  if (step === 'finish') {
    // Already-finished is not an error worth a different answer than the board
    // itself: a replayed finish simply adds nothing.
    record.session = completeSession(record.session)
    const outcome = recordSessionTotal(store, challenge, owner.nickname, record.session.points, now)
    store.sessions.delete(id)

    return {
      status: 200,
      json: { challenge, scores: topScores(store, challenge), points: record.session.points },
      changed: outcome === 'stored',
    }
  }

  const applied = applySessionEvents(record.session, parsed?.events, now)
  if (!applied.ok) {
    return answer(applied.reason === 'session_expired' || applied.reason === 'session_completed' ? 404 : 400, {
      error: applied.reason,
    })
  }

  record.session = applied.session
  const outcome = recordSessionTotal(store, challenge, owner.nickname, applied.points, now)

  return {
    status: 200,
    json: { challenge, scores: topScores(store, challenge), points: applied.points },
    changed: outcome === 'stored',
  }
}

export const serializeSnapshot = (store) =>
  JSON.stringify({
    version: 2,
    challenges: Object.fromEntries(
      [...store.challenges.entries()].map(([name, entry]) => [
        name,
        {
          scores: Object.fromEntries(entry.entries),
          // Digests and tombstones only. A snapshot is not a set of credentials.
          owners: Object.fromEntries(
            [...entry.owners.entries()].map(([key, owner]) => [
              key,
              {
                nickname: owner.nickname,
                tokenHash: owner.tokenHash,
                claimedAt: owner.claimedAt,
                scoredAt: owner.scoredAt,
              },
            ]),
          ),
          lastActiveAt: entry.lastActiveAt,
        },
      ]),
    ),
  })

/** A number out of a file somebody may have edited, or the fallback. */
const readTime = (raw, fallback) => (typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback)

/**
 * A snapshot that is missing, unreadable, not JSON, or half-edited by hand
 * reads as an empty board rather than as a crash on boot: losing a scoreboard
 * is a nuisance, and a container that will not start is an outage. Salvage is
 * per entry, the way the app's own routine list is — one junk nickname does not
 * cost the challenge it is in.
 *
 * Version 1 — the shape written before nicknames were owned — is read as a set
 * of *tombstones*: every name in it keeps its score and its place, and no token
 * can ever satisfy it. Handing those names out to whoever claims them first
 * would be worse than freezing them, and quietly issuing a token to the next
 * caller would be exactly the hijack this whole file exists to stop.
 */
export const readSnapshot = (path) => {
  const store = createStore()

  let raw = ''
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return store
  }

  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return store
  }

  const challenges = parsed !== null && typeof parsed === 'object' ? parsed.challenges : null
  if (challenges === null || typeof challenges !== 'object' || Array.isArray(challenges)) {
    return store
  }

  const now = Date.now()
  const version = parsed.version === 2 ? 2 : 1

  for (const [rawName, rawBoard] of Object.entries(challenges)) {
    const name = normalizeChallengeName(rawName)
    if (name === null || rawBoard === null || typeof rawBoard !== 'object' || Array.isArray(rawBoard)) {
      continue
    }

    const scores = version === 2 ? rawBoard.scores : rawBoard
    if (scores === null || typeof scores !== 'object' || Array.isArray(scores)) {
      continue
    }

    const entry = createBoard(version === 2 ? readTime(rawBoard.lastActiveAt, now) : now)
    const owners = version === 2 && rawBoard.owners !== null && typeof rawBoard.owners === 'object' ? rawBoard.owners : {}

    for (const [rawKey, rawOwner] of Object.entries(owners)) {
      const key = nicknameKey(rawKey)
      const nickname = rawOwner === null || typeof rawOwner !== 'object' ? null : normalizeNickname(rawOwner.nickname)
      if (key === null || nickname === null || nicknameKey(nickname) !== key) {
        continue
      }

      const scoredAt = rawOwner.scoredAt === null ? null : readTime(rawOwner.scoredAt, now)
      entry.owners.set(key, {
        nickname,
        tokenHash: typeof rawOwner.tokenHash === 'string' && rawOwner.tokenHash !== '' ? rawOwner.tokenHash : null,
        claimedAt: readTime(rawOwner.claimedAt, now),
        scoredAt,
      })
      if (scoredAt === null) {
        entry.unscored.add(key)
      }
    }

    for (const [rawNickname, rawPoints] of Object.entries(scores)) {
      const nickname = normalizeNickname(rawNickname)
      const points = normalizePoints(rawPoints)
      const key = nicknameKey(rawNickname)
      if (nickname === null || points === null || key === null || entry.entries.size >= MAX_ENTRIES) {
        continue
      }

      const owner = entry.owners.get(key)
      if (owner === undefined) {
        // A legacy row, or one whose owner was edited out of the file. It keeps
        // its score and becomes unclaimable, which is the safe half of the two.
        entry.owners.set(key, { nickname, tokenHash: null, claimedAt: entry.lastActiveAt, scoredAt: entry.lastActiveAt })
        entry.entries.set(nickname, points)
        continue
      }

      // A row on the board is a claim that was scored under, whatever the file
      // said about it.
      owner.scoredAt = readTime(owner.scoredAt, entry.lastActiveAt)
      entry.unscored.delete(key)
      entry.entries.set(owner.nickname, points)
    }

    if (entry.owners.size > 0 && store.challenges.size < MAX_CHALLENGES) {
      store.challenges.set(name, entry)
    }
  }

  return store
}

/**
 * Best-effort: a scoreboard is not worth taking the server down for, so a
 * read-only volume or a full disk is reported rather than thrown.
 *
 * Writes to a sibling temp file and renames it over the target instead of
 * truncating the target in place, because a kill or a full disk mid-write
 * would otherwise leave torn JSON — which readSnapshot treats as an empty
 * board, putting every owned nickname and every tokenHash back up for grabs.
 */
export const writeSnapshot = (path, store) => {
  let temp = null
  try {
    temp = `${path}.${randomBytes(8).toString('hex')}.tmp`
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(temp, serializeSnapshot(store))
    renameSync(temp, path)
    return true
  } catch {
    if (temp !== null) {
      try {
        rmSync(temp, { force: true })
      } catch {
        // best-effort cleanup: a failed write must not throw out of a best-effort writer
      }
    }
    return false
  }
}
