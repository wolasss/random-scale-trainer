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
 * so the whole contract — best-wins upserts, ordering, the caps, the tolerance
 * for a snapshot file somebody has edited — is testable without a socket.
 * src/server/main.js is the only part that opens one.
 *
 * A nickname is not an identity: nothing here authenticates, and it is not
 * meant to. The caps are the only defence against a board being filled with
 * junk, and they are sized so that the damage is bounded rather than prevented.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

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

export const normalizePoints = (raw) => {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return null
  }

  return Math.min(MAX_POINTS, Math.floor(raw))
}

export const createStore = () => ({ challenges: new Map() })

/**
 * A per-nickname best, so a tally that has already been submitted is a no-op
 * and a session that ends lower than an earlier one cannot take the board down
 * with it. The client submits at every pause, which makes this the difference
 * between a board and a log.
 */
export const submitScore = (store, challenge, nickname, points) => {
  const name = normalizeChallengeName(challenge)
  const who = normalizeNickname(nickname)
  const score = normalizePoints(points)
  if (name === null || who === null || score === null) {
    return 'invalid'
  }

  let board = store.challenges.get(name)
  if (board === undefined) {
    if (store.challenges.size >= MAX_CHALLENGES) {
      return 'full'
    }

    board = new Map()
    store.challenges.set(name, board)
  }

  const previous = board.get(who)
  if (previous === undefined) {
    if (board.size >= MAX_ENTRIES) {
      return 'full'
    }

    board.set(who, score)
    return 'stored'
  }

  if (score <= previous) {
    return 'unchanged'
  }

  board.set(who, score)

  return 'stored'
}

/**
 * Highest first, then by nickname so a tie is stable rather than dependent on
 * who happened to submit first.
 */
export const topScores = (store, challenge, limit = TOP_LIMIT) => {
  const name = normalizeChallengeName(challenge)
  const board = name === null ? undefined : store.challenges.get(name)
  if (board === undefined) {
    return []
  }

  return [...board.entries()]
    .map(([nickname, points]) => ({ nickname, points }))
    .sort((a, b) => b.points - a.points || (a.nickname < b.nickname ? -1 : a.nickname > b.nickname ? 1 : 0))
    .slice(0, Math.max(0, limit))
}

/** The challenge a path names, or null if it names none this server would accept. */
const challengeFromPath = (pathname) => {
  if (typeof pathname !== 'string' || !pathname.startsWith(API_PREFIX)) {
    return null
  }

  const segment = pathname.slice(API_PREFIX.length)
  // A stray '%' is a malformed escape, and decodeURIComponent throws on one.
  try {
    return normalizeChallengeName(decodeURIComponent(segment))
  } catch {
    return null
  }
}

/** The two fields a POST body may carry, or null if it carries neither usefully. */
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

/**
 * The whole routing table. `changed` is what tells main.js a snapshot is worth
 * writing — a repeat submit changes nothing and costs no disk.
 */
export const handleRequest = (store, { method, pathname, body }) => {
  if (typeof pathname !== 'string' || !pathname.startsWith(API_PREFIX)) {
    return { status: 404, json: { error: 'not found' }, changed: false }
  }

  const challenge = challengeFromPath(pathname)
  if (challenge === null) {
    return { status: 400, json: { error: 'invalid challenge name' }, changed: false }
  }

  if (method === 'GET') {
    return { status: 200, json: { challenge, scores: topScores(store, challenge) }, changed: false }
  }

  if (method !== 'POST') {
    return { status: 405, json: { error: 'method not allowed' }, changed: false }
  }

  const parsed = parseBody(body)
  if (parsed === null) {
    return { status: 400, json: { error: 'expected a JSON object' }, changed: false }
  }

  const outcome = submitScore(store, challenge, parsed.nickname, parsed.points)
  if (outcome === 'invalid') {
    return { status: 400, json: { error: 'invalid nickname or points' }, changed: false }
  }

  if (outcome === 'full') {
    return { status: 409, json: { error: 'this challenge is full' }, changed: false }
  }

  return {
    status: 200,
    json: { challenge, scores: topScores(store, challenge) },
    changed: outcome === 'stored',
  }
}

export const serializeSnapshot = (store) =>
  JSON.stringify({
    version: 1,
    challenges: Object.fromEntries(
      [...store.challenges.entries()].map(([name, board]) => [name, Object.fromEntries(board)]),
    ),
  })

/**
 * A snapshot that is missing, unreadable, not JSON, or half-edited by hand
 * reads as an empty board rather than as a crash on boot: losing a scoreboard
 * is a nuisance, and a container that will not start is an outage. Salvage is
 * per entry, the way the app's own routine list is — one junk nickname does not
 * cost the challenge it is in.
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

  for (const [name, board] of Object.entries(challenges)) {
    if (board === null || typeof board !== 'object' || Array.isArray(board)) {
      continue
    }

    for (const [nickname, points] of Object.entries(board)) {
      submitScore(store, name, nickname, points)
    }
  }

  return store
}

/**
 * Best-effort: a scoreboard is not worth taking the server down for, so a
 * read-only volume or a full disk is reported rather than thrown.
 */
export const writeSnapshot = (path, store) => {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, serializeSnapshot(store))
    return true
  } catch {
    return false
  }
}
