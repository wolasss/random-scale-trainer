// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Lets one test simulate a disk that fills up partway through a write. */
const fsControl = vi.hoisted(() => ({ tearWriteAfterBytes: -1 }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (fsControl.tearWriteAfterBytes < 0) {
        return actual.writeFileSync(...args)
      }

      const [target, data] = args
      actual.writeFileSync(target, String(data).slice(0, fsControl.tearWriteAfterBytes))
      throw new Error('ENOSPC: no space left on device')
    },
  }
})

import {
  API_PREFIX,
  CHALLENGE_CLAIM_LIMIT,
  CLAIM_LIMIT,
  claimNickname,
  createStore,
  EVENTS_LIMIT,
  handleRequest,
  MAX_CHALLENGES,
  MAX_ENTRIES,
  MAX_LIMIT_BUCKETS,
  MAX_NEW_CHALLENGES_PER_HOUR,
  MAX_POINTS,
  MAX_UNSCORED_OWNERS,
  nicknameKey,
  normalizeChallengeName,
  normalizeNickname,
  readSnapshot,
  recordSessionTotal,
  serializeSnapshot,
  SESSION_LIMIT,
  sweep,
  takeToken,
  topScores,
  UNUSED_OWNER_TTL_MS,
  verifyOwner,
  writeSnapshot,
  type ApiRequest,
  type ScoreStore,
} from './scoreboard.js'
import { FASTEST_NOTE_INTERVAL_MS, POINTS_PER_HIT, SESSION_IDLE_MS } from './session-scoring.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  fsControl.tearWriteAfterBytes = -1
})

const tempFile = (contents?: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'callnote-board-'))
  dirs.push(dir)
  const path = join(dir, 'scoreboard.json')
  if (contents !== undefined) {
    writeFileSync(path, contents)
  }

  return path
}

const NOW = 1_700_000_000_000

// Mirrors the private READ_LIMIT in scoreboard.js — kept in step with it.
const READ_LIMIT = { limit: 2_400, windowMs: 60_000 }

/** A store with the named people owning their nicknames and holding a score. */
const seeded = (entries: Array<[string, number]>, challenge = 'demo') => {
  const store = createStore()
  const tokens = new Map<string, string>()
  for (const [nickname, points] of entries) {
    const claim = claimNickname(store, challenge, nickname, NOW)
    if (claim.outcome === 'claimed') {
      tokens.set(nickname, claim.token)
      recordSessionTotal(store, challenge, nickname, points, NOW)
    }
  }

  return { store, tokens }
}

const call = (store: ScoreStore, request: Partial<ApiRequest> & { pathname: string }) =>
  handleRequest(store, { method: 'GET', client: 'test-client', now: NOW, ...request })

const post = (
  store: ScoreStore,
  pathname: string,
  body: unknown,
  { token, client = 'test-client', now = NOW }: { token?: string; client?: string; now?: number } = {},
) =>
  handleRequest(store, {
    method: 'POST',
    pathname,
    body: JSON.stringify(body),
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    client,
    now,
  })

/** Joins through the API and hands back the token it was issued. */
const claimVia = (store: ScoreStore, challenge: string, nickname: string, client = 'test-client', now = NOW) => {
  const answer = post(store, `${API_PREFIX}${challenge}/nickname`, { nickname }, { client, now })

  return { answer, token: String(answer.json.token ?? '') }
}

/** Opens a session and plays `count` notes through it, at the legal spacing. */
const playSession = (
  store: ScoreStore,
  challenge: string,
  nickname: string,
  token: string,
  count: number,
  start = NOW,
) => {
  const opened = post(
    store,
    `${API_PREFIX}${challenge}/session`,
    { nickname, config: { bpm: 72, beatsPerNote: 4 } },
    { token, now: start },
  )
  const sessionId = String(opened.json.sessionId ?? '')
  const events = Array.from({ length: count }, (_, index) => ({
    seq: index,
    kind: 'hit' as const,
    at: index * FASTEST_NOTE_INTERVAL_MS,
  }))
  const posted = post(store, `${API_PREFIX}${challenge}/session/${sessionId}/events`, { events }, {
    token,
    now: start + count * FASTEST_NOTE_INTERVAL_MS,
  })

  return { sessionId, opened, posted, events }
}

describe('normalizeChallengeName', () => {
  it('lowercases, because a name is shared by being typed to somebody', () => {
    expect(normalizeChallengeName(' Summer Sprint ')).toBe('summer sprint')
  })

  it('refuses anything that is not a name', () => {
    for (const raw of ['', '   ', '-leading', '!!', 'a'.repeat(33), 'semi;colon', 42, null, undefined]) {
      expect(normalizeChallengeName(raw)).toBeNull()
    }
  })
})

describe('normalizeNickname', () => {
  it('collapses the whitespace, so one person is not two rows', () => {
    expect(normalizeNickname('  ada    lovelace ')).toBe('ada lovelace')
  })

  it('strips the characters that would be invisible on somebody else’s screen', () => {
    expect(normalizeNickname('ad\u0007a\u200b')).toBe('ad a')
  })

  it('caps the length rather than refusing a long one outright', () => {
    expect(normalizeNickname('a'.repeat(40))).toBe('a'.repeat(20))
  })

  it('is null when there is nothing left of it', () => {
    for (const raw of ['', '   ', '\u200b\u200b', '\u0000']) {
      expect(normalizeNickname(raw)).toBeNull()
    }
  })
})

describe('nicknameKey', () => {
  /** A board where two rows differ by a capital letter is one you can be impersonated on. */
  it('folds every variant of one name onto one key', () => {
    for (const raw of ['Alice', 'alice ', ' ALICE', 'aLiCe', 'alice\u200b']) {
      expect(nicknameKey(raw)).toBe('alice')
    }
  })

  it('is null for what is not a nickname', () => {
    expect(nicknameKey('   ')).toBeNull()
    expect(nicknameKey(42)).toBeNull()
  })

  /**
   * A key is read back out of a snapshot and put through here again, so a key
   * that is not itself a key is an owner that vanishes on restart. Folding can
   * *lengthen* a name — 'İ' becomes two code units — which is the one way a
   * fold can push a legal name past the length cap.
   */
  it('is a key of itself, even for a name that grows when it is folded', () => {
    for (const raw of ['Alice', 'İ'.repeat(11), 'a'.repeat(20), 'İ İ İ İ İ İ']) {
      const key = nicknameKey(raw)
      expect(key).not.toBeNull()
      expect(nicknameKey(key)).toBe(key)
    }
  })
})

describe('claimNickname', () => {
  it('hands the first claimant a token and refuses everybody after', () => {
    const store = createStore()

    const first = claimNickname(store, 'demo', 'Alice', NOW)
    expect(first.outcome).toBe('claimed')
    expect(first.outcome === 'claimed' && first.token).toMatch(/^[0-9a-f]{64}$/)

    // Same person, spelled differently. Not a second owner.
    for (const variant of ['alice', 'ALICE', ' Alice ']) {
      expect(claimNickname(store, 'demo', variant, NOW).outcome).toBe('taken')
    }
  })

  /**
   * The claim is a synchronous check-and-set on a Map, so node runs it to
   * completion: two racing claims are two sequential ones, whichever order they
   * arrive in. This is what makes the concurrency guarantee hold without a lock.
   */
  it('is one success and one refusal however the two are interleaved', () => {
    const store = createStore()
    const outcomes = ['Alice', 'alice'].map((name) => claimNickname(store, 'demo', name, NOW).outcome)

    expect(outcomes.filter((outcome) => outcome === 'claimed')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome === 'taken')).toHaveLength(1)
  })

  it('keeps only a digest, never the token', () => {
    const store = createStore()
    const claim = claimNickname(store, 'demo', 'ada', NOW)

    const owner = store.challenges.get('demo')?.owners.get('ada')
    expect(owner?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(claim.outcome === 'claimed' && owner?.tokenHash).not.toBe(claim.outcome === 'claimed' && claim.token)
    expect(serializeSnapshot(store)).not.toContain(claim.outcome === 'claimed' ? claim.token : 'unreachable')
  })

  it('refuses what is not a nickname, and creates nothing for it', () => {
    const store = createStore()

    expect(claimNickname(store, 'demo', '   ', NOW).outcome).toBe('invalid')
    expect(claimNickname(store, '!!', 'ada', NOW).outcome).toBe('invalid')
    expect(store.challenges.size).toBe(0)
  })
})

describe('verifyOwner', () => {
  it('accepts the token it issued and nothing else', () => {
    const store = createStore()
    const claim = claimNickname(store, 'demo', 'Alice', NOW)
    const token = claim.outcome === 'claimed' ? claim.token : ''

    expect(verifyOwner(store, 'demo', 'alice', token)?.nickname).toBe('Alice')
    expect(verifyOwner(store, 'demo', 'ALICE', token)?.nickname).toBe('Alice')
    for (const wrong of ['', 'a'.repeat(64), token.slice(0, -1), token.toUpperCase(), null, 42]) {
      expect(verifyOwner(store, 'demo', 'alice', wrong)).toBeNull()
    }
  })

  it('never satisfies a tombstone, whatever it is handed', () => {
    const path = tempFile(JSON.stringify({ version: 1, challenges: { demo: { ada: 300 } } }))
    const store = readSnapshot(path)

    for (const token of ['', 'a'.repeat(64), 'anything']) {
      expect(verifyOwner(store, 'demo', 'ada', token)).toBeNull()
    }
  })
})

describe('topScores', () => {
  it('orders by points, then by nickname so a tie does not shuffle', () => {
    const { store } = seeded([
      ['bo', 100],
      ['ada', 300],
      ['cy', 100],
    ])

    expect(topScores(store, 'demo')).toEqual([
      { nickname: 'ada', points: 300 },
      { nickname: 'bo', points: 100 },
      { nickname: 'cy', points: 100 },
    ])
  })

  it('hands back ten and no more', () => {
    const { store } = seeded(Array.from({ length: 25 }, (_, index): [string, number] => [`p${index}`, index + 1]))

    const top = topScores(store, 'demo')
    expect(top).toHaveLength(10)
    expect(top[0]).toEqual({ nickname: 'p24', points: 25 })
  })

  it('is an empty board for a challenge nobody has played', () => {
    expect(topScores(createStore(), 'nobody-here')).toEqual([])
  })

  it('keeps challenges apart', () => {
    const { store } = seeded([['ada', 120]])
    const claim = claimNickname(store, 'other', 'bo', NOW)
    expect(claim.outcome).toBe('claimed')
    recordSessionTotal(store, 'other', 'bo', 300, NOW)

    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 120 }])
    expect(topScores(store, 'other')).toEqual([{ nickname: 'bo', points: 300 }])
  })
})

describe('recordSessionTotal', () => {
  it('keeps the best, so a worse session cannot take the board down', () => {
    const { store } = seeded([['ada', 120]])

    expect(recordSessionTotal(store, 'demo', 'ada', 90, NOW)).toBe('unchanged')
    expect(recordSessionTotal(store, 'demo', 'ada', 200, NOW)).toBe('stored')
    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 200 }])
  })

  it('caps the points rather than storing whatever it was handed', () => {
    const { store } = seeded([['ada', MAX_POINTS * 10]])

    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: MAX_POINTS }])
  })

  /** Only claiming creates. A total for a name nobody owns is not a row. */
  it('never invents a challenge or an unowned entry', () => {
    const store = createStore()

    expect(recordSessionTotal(store, 'demo', 'ada', 300, NOW)).toBe('invalid')
    expect(store.challenges.size).toBe(0)

    claimNickname(store, 'demo', 'ada', NOW)
    expect(recordSessionTotal(store, 'demo', 'bo', 300, NOW)).toBe('invalid')
    expect(topScores(store, 'demo')).toEqual([])
  })
})

describe('the nickname endpoint', () => {
  it('answers a claim with the name and a token, and a repeat with a 409', () => {
    const store = createStore()

    const first = claimVia(store, 'demo', 'Alice')
    expect(first.answer.status).toBe(201)
    expect(first.answer.json).toEqual({ challenge: 'demo', nickname: 'Alice', token: expect.any(String) })
    expect(first.answer.changed).toBe(true)

    const second = claimVia(store, 'demo', 'alice', 'other-client')
    expect(second.answer).toEqual({ status: 409, json: { error: 'nickname_taken' }, changed: false })
  })

  it('is a 400 for a body that is not a nickname, and stores nothing for it', () => {
    const store = createStore()
    for (const body of [{}, { nickname: '   ' }, { nickname: 42 }]) {
      expect(post(store, `${API_PREFIX}demo/nickname`, body).status).toBe(400)
    }

    expect(store.challenges.size).toBe(0)
  })
})

describe('the old submit contract', () => {
  /** The acceptance case: a total posted straight at the board, refused outright. */
  it('is gone — a posted total is a 410 and moves nothing', () => {
    const store = createStore()
    claimVia(store, 'demo', 'alice')

    const answer = post(store, `${API_PREFIX}demo`, { nickname: 'alice', points: 1_000_000 })

    expect(answer).toEqual({ status: 410, json: { error: 'unsupported' }, changed: false })
    expect(topScores(store, 'demo')).toEqual([])
  })
})

describe('scoring sessions', () => {
  it('adds the events up itself and puts its own total on the board', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')

    const { posted } = playSession(store, 'demo', 'ada', token, 2)

    expect(posted.status).toBe(200)
    expect(posted.json.points).toBe(POINTS_PER_HIT * 2)
    expect(posted.json.scores).toEqual([{ nickname: 'ada', points: POINTS_PER_HIT * 2 }])
    expect(posted.changed).toBe(true)
  })

  it('refuses a config the app does not offer, and opens nothing for it', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')

    const answer = post(
      store,
      `${API_PREFIX}demo/session`,
      { nickname: 'ada', config: { bpm: 100_000, beatsPerNote: 4 } },
      { token },
    )

    expect(answer).toEqual({ status: 400, json: { error: 'invalid_config' }, changed: false })
    expect(store.sessions.size).toBe(0)
  })

  it('will not open a session without the nickname’s token', () => {
    const store = createStore()
    claimVia(store, 'demo', 'ada')

    for (const token of [undefined, 'not-the-token']) {
      const answer = post(store, `${API_PREFIX}demo/session`, { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } }, { token })
      expect(answer).toEqual({ status: 401, json: { error: 'invalid_owner' }, changed: false })
    }

    expect(store.sessions.size).toBe(0)
  })

  /** The acceptance case: a second browser cannot touch the first's score. */
  it('lets nobody else raise, lower or delete a score they do not own', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')
    playSession(store, 'demo', 'ada', token, 3)
    const before = topScores(store, 'demo')

    // Claiming the name again: refused.
    expect(claimVia(store, 'demo', 'ada', 'attacker').answer.status).toBe(409)
    // Opening a session as them with a token of their own invention: refused.
    expect(
      post(store, `${API_PREFIX}demo/session`, { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } }, {
        token: 'f'.repeat(64),
        client: 'attacker',
      }).status,
    ).toBe(401)
    // The old contract, at any number: gone.
    expect(post(store, `${API_PREFIX}demo`, { nickname: 'ada', points: 0 }, { client: 'attacker' }).status).toBe(410)
    // DELETE has never been a method this answers.
    expect(call(store, { method: 'DELETE', pathname: `${API_PREFIX}demo` }).status).toBe(405)

    expect(topScores(store, 'demo')).toEqual(before)
  })

  it('refuses a replayed batch, and the board does not move for it', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')
    const { sessionId, events } = playSession(store, 'demo', 'ada', token, 4)
    const before = topScores(store, 'demo')

    const replay = post(store, `${API_PREFIX}demo/session/${sessionId}/events`, { events }, {
      token,
      now: NOW + 10_000,
    })

    expect(replay).toEqual({ status: 400, json: { error: 'invalid_event' }, changed: false })
    expect(topScores(store, 'demo')).toEqual(before)
  })

  it('refuses everything on a session that has been finished, replayed finish included', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')
    const { sessionId, events } = playSession(store, 'demo', 'ada', token, 3)

    const finished = post(store, `${API_PREFIX}demo/session/${sessionId}/finish`, {}, { token, now: NOW + 5_000 })
    expect(finished.status).toBe(200)
    const before = topScores(store, 'demo')

    for (const path of [`session/${sessionId}/events`, `session/${sessionId}/finish`]) {
      expect(post(store, `${API_PREFIX}demo/${path}`, { events }, { token, now: NOW + 6_000 }).status).toBe(404)
    }

    expect(topScores(store, 'demo')).toEqual(before)
  })

  /** A finish is the path saying what it means; there is nothing to put in it. */
  it('closes a session with no body at all', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')
    const { sessionId } = playSession(store, 'demo', 'ada', token, 2)

    const answer = handleRequest(store, {
      method: 'POST',
      pathname: `${API_PREFIX}demo/session/${sessionId}/finish`,
      body: '',
      headers: { authorization: `Bearer ${token}` },
      client: 'test-client',
      now: NOW + 5_000,
    })

    expect(answer.status).toBe(200)
    expect(answer.json.points).toBe(POINTS_PER_HIT * 2)
  })

  it('is a 404 for a session id nobody was issued, or one from another challenge', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')
    const { sessionId } = playSession(store, 'demo', 'ada', token, 1)
    claimVia(store, 'other', 'ada')

    expect(post(store, `${API_PREFIX}demo/session/deadbeef/events`, { events: [] }, { token }).status).toBe(404)
    expect(post(store, `${API_PREFIX}other/session/${sessionId}/events`, { events: [] }, { token }).status).toBe(404)
  })

  /**
   * A name whose folded form is longer than the name itself: eleven 'İ's fold
   * to twenty-two code units. The key is the store's own, so nothing may
   * re-derive one from it and quietly get a different answer — that would lock
   * the owner out of the session they had just been issued.
   */
  it('keeps the owner of a name that grows when it is folded', () => {
    const store = createStore()
    const nickname = 'İ'.repeat(11)
    const { token } = claimVia(store, 'demo', nickname)
    expect(token).not.toBe('')

    const { posted } = playSession(store, 'demo', nickname, token, 2)

    expect(posted.status).toBe(200)
    expect(posted.json.points).toBe(POINTS_PER_HIT * 2)
    expect(topScores(store, 'demo')).toEqual([{ nickname, points: POINTS_PER_HIT * 2 }])

    // ...and it is still that browser's name after a restart, and nobody else's.
    const path = tempFile()
    writeSnapshot(path, store)
    const restored = readSnapshot(path)
    expect(verifyOwner(restored, 'demo', nickname, token)).not.toBeNull()
    expect(topScores(restored, 'demo')).toEqual([{ nickname, points: POINTS_PER_HIT * 2 }])
    expect(claimNickname(restored, 'demo', nickname, NOW).outcome).toBe('taken')
  })

  it('forgets a session once it has been abandoned', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')
    const { sessionId } = playSession(store, 'demo', 'ada', token, 1)

    const later = NOW + SESSION_IDLE_MS + 10_000
    sweep(store, later)

    expect(store.sessions.size).toBe(0)
    expect(
      post(store, `${API_PREFIX}demo/session/${sessionId}/events`, { events: [] }, { token, now: later }).status,
    ).toBe(404)
  })
})

describe('rate limits', () => {
  it('stops a client claiming names faster than a person could type them', () => {
    const store = createStore()
    for (let index = 0; index < CLAIM_LIMIT.limit; index += 1) {
      expect(claimVia(store, 'demo', `player ${index}`).answer.status).toBe(201)
    }

    const refused = claimVia(store, 'demo', 'one too many')
    expect(refused.answer).toEqual({ status: 429, json: { error: 'rate_limited' }, changed: false })
    // ...and refusing wrote nothing.
    expect(store.challenges.get('demo')?.owners.has('one too many')).toBe(false)
  })

  it('stops one challenge being filled from a room full of addresses', () => {
    const store = createStore()
    for (let index = 0; index < CHALLENGE_CLAIM_LIMIT.limit; index += 1) {
      expect(claimVia(store, 'demo', `player ${index}`, `client-${index}`).answer.status).toBe(201)
    }

    expect(claimVia(store, 'demo', 'late arrival', 'client-fresh').answer.status).toBe(429)
  })

  it('bounds how fast new challenges can appear at all', () => {
    const store = createStore()
    for (let index = 0; index < MAX_NEW_CHALLENGES_PER_HOUR; index += 1) {
      expect(claimVia(store, `challenge ${index}`, 'ada', `client-${index}`).answer.status).toBe(201)
    }

    expect(claimVia(store, 'one more challenge', 'ada', 'client-fresh').answer.status).toBe(429)
    expect(store.challenges.size).toBe(MAX_NEW_CHALLENGES_PER_HOUR)
  })

  it('lets the bucket refill once its window is past', () => {
    const store = createStore()
    for (let index = 0; index < CLAIM_LIMIT.limit; index += 1) {
      claimVia(store, 'demo', `player ${index}`)
    }
    expect(claimVia(store, 'demo', 'blocked').answer.status).toBe(429)

    expect(claimVia(store, 'demo', 'later', 'test-client', NOW + CLAIM_LIMIT.windowMs + 1).answer.status).toBe(201)
  })

  it('lets a client read a board many times before being limited', () => {
    const { store } = seeded([['ada', 5]])
    for (let index = 0; index < READ_LIMIT.limit; index += 1) {
      const answer = call(store, { pathname: `${API_PREFIX}demo` })
      expect(answer.status).toBe(200)
      expect(answer.json.scores).toEqual([{ nickname: 'ada', points: 5 }])
    }
  })

  it('refuses a read past the limit before the sweep runs, and changes nothing', () => {
    const { store } = seeded([['ada', 5]])
    for (let index = 0; index < READ_LIMIT.limit; index += 1) {
      call(store, { pathname: `${API_PREFIX}demo` })
    }

    // Something a sweep would remove, so a sweep that ran would be visible.
    claimNickname(store, 'demo', 'stale walker', NOW - UNUSED_OWNER_TTL_MS - 1)
    const cursorBefore = store.sweepCursor

    const refused = call(store, { pathname: `${API_PREFIX}demo` })
    expect(refused).toEqual({ status: 429, json: { error: 'rate_limited' }, changed: false })
    expect(store.challenges.get('demo')?.owners.has('stale walker')).toBe(true)
    expect(store.challenges.get('demo')?.unscored.has('stale walker')).toBe(true)
    expect(store.sweepCursor).toBe(cursorBefore)
    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 5 }])

    // A GET subpath spends nothing from the read bucket and still 404s.
    expect(call(store, { pathname: `${API_PREFIX}demo/extra` }).status).toBe(404)

    // Another client's bucket is untouched.
    expect(call(store, { pathname: `${API_PREFIX}demo`, client: 'a stranger' }).status).toBe(200)
  })

  it('lets the read bucket refill once its window is past', () => {
    const { store } = seeded([['ada', 5]])
    for (let index = 0; index < READ_LIMIT.limit; index += 1) {
      call(store, { pathname: `${API_PREFIX}demo` })
    }
    expect(call(store, { pathname: `${API_PREFIX}demo` }).status).toBe(429)

    const refreshed = call(store, { pathname: `${API_PREFIX}demo`, now: NOW + READ_LIMIT.windowMs + 1 })
    expect(refreshed.status).toBe(200)
    expect(refreshed.json.scores).toEqual([{ nickname: 'ada', points: 5 }])
  })

  it('keeps the read bucket separate from the claim bucket', () => {
    const store = createStore()
    for (let index = 0; index < READ_LIMIT.limit; index += 1) {
      call(store, { pathname: `${API_PREFIX}demo` })
    }
    expect(call(store, { pathname: `${API_PREFIX}demo` }).status).toBe(429)

    expect(claimVia(store, 'demo', 'ada').answer.status).toBe(201)
  })

  it('reclaims expired buckets for a never-seen reader instead of locking the board forever', () => {
    const store = createStore()
    for (let index = 0; index < MAX_LIMIT_BUCKETS; index += 1) {
      takeToken(store, `old:${index}`, { limit: 1, windowMs: 1_000 }, NOW)
    }
    expect(store.limits.size).toBe(MAX_LIMIT_BUCKETS)

    // The read gate runs ahead of sweep() (see the test above), so a caller it
    // has never seen would be stuck behind a map full of buckets nobody is
    // using anymore, forever, unless takeToken reclaims them itself.
    const answer = call(store, { pathname: `${API_PREFIX}demo`, client: 'newcomer', now: NOW + 1_001 })
    expect(answer.status).toBe(200)
  })

  it('leaves the session-start limit exactly as it was', () => {
    const store = createStore()
    for (let index = 0; index < SESSION_LIMIT.limit; index += 1) {
      expect(
        post(store, `${API_PREFIX}demo/session`, { nickname: 'ghost', config: { bpm: 72, beatsPerNote: 4 } }).status,
      ).toBe(401)
    }

    expect(
      post(store, `${API_PREFIX}demo/session`, { nickname: 'ghost', config: { bpm: 72, beatsPerNote: 4 } }).status,
    ).toBe(429)
  })

  it('leaves the session-events limit exactly as it was', () => {
    const store = createStore()
    for (let index = 0; index < EVENTS_LIMIT.limit; index += 1) {
      expect(post(store, `${API_PREFIX}demo/session/no-such-id/events`, { events: [] }).status).toBe(404)
    }

    expect(post(store, `${API_PREFIX}demo/session/no-such-id/events`, { events: [] }).status).toBe(429)
  })
})

describe('quotas', () => {
  it('will not let squatters eat a challenge’s entry slots', () => {
    const store = createStore()
    // Direct, because the per-challenge claim bucket would refuse the twenty-
    // first of these long before the quota bound: that is a separate rule, and
    // it is what makes reaching this one take hours rather than seconds.
    for (let index = 0; index < MAX_UNSCORED_OWNERS; index += 1) {
      expect(claimNickname(store, 'demo', `squat ${index}`, NOW).outcome).toBe('claimed')
    }

    expect(claimNickname(store, 'demo', 'genuine', NOW).outcome).toBe('full')
    // Every one of the MAX_ENTRIES slots the people playing need is still free.
    expect(store.challenges.get('demo')?.entries.size).toBe(0)
    expect(MAX_UNSCORED_OWNERS).toBeLessThan(MAX_ENTRIES)
  })

  it('sweeps a claim nobody ever scored under, and keeps every one that did', () => {
    const store = createStore()
    const { token } = claimVia(store, 'demo', 'ada')
    playSession(store, 'demo', 'ada', token, 2)
    claimVia(store, 'demo', 'never played', 'other-client')

    sweep(store, NOW + UNUSED_OWNER_TTL_MS + 1)

    expect(store.challenges.get('demo')?.owners.has('ada')).toBe(true)
    expect(store.challenges.get('demo')?.owners.has('never played')).toBe(false)
    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: POINTS_PER_HIT * 2 }])
  })

  /**
   * The sweep has a budget, and an owner who has scored can never expire — so
   * spending the budget on those would leave every board behind a busy one
   * permanently unswept, and permanently full at MAX_UNSCORED_OWNERS.
   */
  it('does not spend a sweep on the owners that can never expire', () => {
    const store = createStore()
    for (let index = 0; index < 100; index += 1) {
      claimNickname(store, 'busy', `player ${index}`, NOW)
      recordSessionTotal(store, 'busy', `player ${index}`, index + 1, NOW)
    }
    claimNickname(store, 'quiet', 'never played', NOW)

    sweep(store, NOW + UNUSED_OWNER_TTL_MS + 1)

    expect(store.challenges.get('quiet')?.owners.size).toBe(0)
    expect(store.challenges.get('busy')?.owners.size).toBe(100)
  })

  /** And when there is more expiring than one sweep can carry, it picks up where it left off. */
  it('resumes at the board the last sweep stopped on', () => {
    const store = createStore()
    // What is under test is the cursor, so the count is pinned: three boards
    // of twenty-five overflow one sweep's budget by a board and a bit. The
    // MAX_UNSCORED_OWNERS cap is a separate rule, and far past the budget.
    for (let board = 0; board < 3; board += 1) {
      for (let index = 0; index < 25; index += 1) {
        claimNickname(store, `busy ${board}`, `squat ${index}`, NOW)
      }
    }
    claimNickname(store, 'quiet', 'never played', NOW)

    const later = NOW + UNUSED_OWNER_TTL_MS + 1
    sweep(store, later)
    expect(store.challenges.get('quiet')?.owners.size).toBe(1)

    sweep(store, later)
    expect(store.challenges.get('quiet')?.owners.size).toBe(0)
  })

  it('evicts an unscored challenge to make room, and never a scored one', () => {
    const store = createStore()
    for (let index = 0; index < MAX_CHALLENGES; index += 1) {
      // The hourly creation bucket is a separate rule, tested above; filling
      // the table through it would take seven simulated hours.
      store.limits.delete('new-challenge')
      claimNickname(store, `challenge ${index}`, 'ada', NOW + index)
    }
    recordSessionTotal(store, 'challenge 0', 'ada', 500, NOW)

    store.limits.delete('new-challenge')
    expect(claimNickname(store, 'brand new', 'ada', NOW + 10_000).outcome).toBe('claimed')
    // The oldest *unscored* one went; the one with a real board on it stayed.
    expect(store.challenges.has('challenge 1')).toBe(false)
    expect(store.challenges.has('challenge 0')).toBe(true)
    expect(store.challenges.size).toBe(MAX_CHALLENGES)
  })

  it('refuses a new challenge outright once every one of them has been scored on', () => {
    const store = createStore()
    for (let index = 0; index < MAX_CHALLENGES; index += 1) {
      store.limits.delete('new-challenge')
      claimNickname(store, `challenge ${index}`, 'ada', NOW)
      recordSessionTotal(store, `challenge ${index}`, 'ada', 10, NOW)
    }

    store.limits.delete('new-challenge')
    expect(claimNickname(store, 'brand new', 'ada', NOW).outcome).toBe('full')
  })

  it('stops taking new names once a challenge is genuinely full of players', () => {
    const store = createStore()
    for (let index = 0; index < MAX_ENTRIES; index += 1) {
      expect(claimNickname(store, 'demo', `player ${index}`, NOW).outcome).toBe('claimed')
      recordSessionTotal(store, 'demo', `player ${index}`, index + 1, NOW)
    }

    expect(claimNickname(store, 'demo', 'one too many', NOW).outcome).toBe('full')
  })
})

describe('routing', () => {
  it('answers a GET with the board, and never with an owner or a digest', () => {
    const { store } = seeded([['ada', 120]])

    const answer = call(store, { pathname: `${API_PREFIX}demo` })

    expect(answer).toEqual({
      status: 200,
      json: { challenge: 'demo', scores: [{ nickname: 'ada', points: 120 }] },
      changed: false,
    })
    expect(JSON.stringify(answer.json)).not.toContain('token')
  })

  /** Holding the URL is read access. That is the whole of what it buys. */
  it('lets anybody at all read the board', () => {
    const { store } = seeded([['ada', 120]])

    expect(call(store, { pathname: `${API_PREFIX}demo`, client: 'a stranger' }).json.scores).toEqual([
      { nickname: 'ada', points: 120 },
    ])
  })

  it('decodes the challenge out of the path', () => {
    const { store } = seeded([['ada', 120]], 'summer sprint')

    expect(call(store, { pathname: `${API_PREFIX}summer%20sprint` }).json).toEqual({
      challenge: 'summer sprint',
      scores: [{ nickname: 'ada', points: 120 }],
    })
  })

  it('is a 400 for a challenge name it would never store', () => {
    const store = createStore()
    for (const pathname of [`${API_PREFIX}!!`, API_PREFIX, `${API_PREFIX}%zz`]) {
      expect(call(store, { pathname }).status).toBe(400)
    }
  })

  it('is a 404 anywhere else, and for a sub-path it does not serve', () => {
    const store = createStore()
    for (const pathname of ['/api/something-else', '/index.html', `${API_PREFIX}demo/nonsense`]) {
      expect(call(store, { pathname }).status).toBe(404)
    }

    expect(call(store, { pathname: `${API_PREFIX}demo/nickname` }).status).toBe(404)
  })

  it('is a 405 for a method it does not answer', () => {
    expect(call(createStore(), { method: 'DELETE', pathname: `${API_PREFIX}demo` }).status).toBe(405)
  })

  it('is a 400 for a body that is not a JSON object', () => {
    const store = createStore()
    for (const body of ['', 'not json', '[]', 'null']) {
      expect(
        handleRequest(store, { method: 'POST', pathname: `${API_PREFIX}demo/nickname`, body, now: NOW }).status,
      ).toBe(400)
    }

    expect(store.challenges.size).toBe(0)
  })
})

describe('snapshots', () => {
  it('round-trips owners, scores and tombstones through a file', () => {
    const path = tempFile()
    const { store, tokens } = seeded([
      ['ada', 300],
      ['bo', 100],
    ])

    expect(writeSnapshot(path, store)).toBe(true)
    const restored = readSnapshot(path)

    expect(topScores(restored, 'demo')).toEqual(topScores(store, 'demo'))
    // The token issued before the restart still works after it...
    expect(verifyOwner(restored, 'demo', 'ada', tokens.get('ada'))?.nickname).toBe('ada')
    // ...and the name is still not available to anybody else.
    expect(claimNickname(restored, 'demo', 'ADA', NOW).outcome).toBe('taken')
  })

  it('writes digests only — a snapshot is not a set of credentials', () => {
    const { store, tokens } = seeded([['ada', 300]])

    const written = serializeSnapshot(store)

    expect(written).toContain('tokenHash')
    for (const token of tokens.values()) {
      expect(written).not.toContain(token)
    }
  })

  it('creates the directory it was pointed at', () => {
    const path = join(tempFile(), 'nested', 'deeper', 'scoreboard.json')

    expect(writeSnapshot(path, seeded([['ada', 10]]).store)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('ada')
  })

  it('reads a missing file as an empty board rather than a crash on boot', () => {
    expect(readSnapshot(join(tempFile(), 'never-written.json')).challenges.size).toBe(0)
  })

  it('reads a corrupt file as an empty board', () => {
    for (const contents of ['', 'not json at all', '[]', '{"challenges":[]}', 'null']) {
      expect(readSnapshot(tempFile(contents)).challenges.size).toBe(0)
    }
  })

  /** Salvage is per entry, the way the app's own stored routine list is. */
  it('keeps every entry it can read out of a half-edited file', () => {
    const path = tempFile(
      JSON.stringify({
        version: 1,
        challenges: {
          demo: { ada: 300, bo: 'not a number', '   ': 50, cy: 100 },
          '!!not a challenge': { ada: 1 },
          broken: 'not an object',
        },
      }),
    )

    const store = readSnapshot(path)

    expect(topScores(store, 'demo')).toEqual([
      { nickname: 'ada', points: 300 },
      { nickname: 'cy', points: 100 },
    ])
    expect(store.challenges.has('!!not a challenge')).toBe(false)
    expect(store.challenges.has('broken')).toBe(false)
  })

  /**
   * The migration that matters. A name from before ownership existed keeps its
   * score and becomes unclaimable — handing it to whoever asks first would be
   * the hijack this whole feature exists to stop.
   */
  it('freezes every legacy nickname rather than leaving it up for grabs', () => {
    const store = readSnapshot(tempFile(JSON.stringify({ version: 1, challenges: { demo: { ada: 300 } } })))

    expect(claimNickname(store, 'demo', 'ada', NOW).outcome).toBe('taken')
    expect(claimNickname(store, 'demo', 'ADA', NOW).outcome).toBe('taken')
    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 300 }])
  })

  it('drops an owner record that has been edited into nonsense', () => {
    const store = readSnapshot(
      tempFile(
        JSON.stringify({
          version: 2,
          challenges: {
            demo: {
              scores: { ada: 300 },
              owners: { ada: { nickname: 'ada', tokenHash: 'x'.repeat(64), claimedAt: NOW, scoredAt: NOW }, bo: null },
              lastActiveAt: NOW,
            },
          },
        }),
      ),
    )

    expect(store.challenges.get('demo')?.owners.has('bo')).toBe(false)
    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 300 }])
  })

  /**
   * A file that was hand-edited, or written by a build with a different
   * ceiling, must not restore a board bigger than the one the running server
   * would agree to build.
   */
  it('caps the owners a snapshot may restore', () => {
    const owners: Record<string, unknown> = {}
    const scores: Record<string, number> = {}
    for (let index = 0; index < MAX_ENTRIES + 20; index += 1) {
      const nickname = `player ${index}`
      owners[nicknameKey(nickname) as string] = { nickname, tokenHash: 'x'.repeat(64), claimedAt: NOW, scoredAt: NOW }
      scores[nickname] = 100
    }

    const store = readSnapshot(
      tempFile(JSON.stringify({ version: 2, challenges: { demo: { scores, owners, lastActiveAt: NOW } } })),
    )
    const board = store.challenges.get('demo')

    expect(board?.owners.size).toBe(MAX_ENTRIES)
    expect(board?.entries.size).toBeLessThanOrEqual(MAX_ENTRIES)
    // No scored name is left unowned — an unowned row is a name up for grabs.
    for (const nickname of board?.entries.keys() ?? []) {
      expect(board?.owners.has(nicknameKey(nickname) as string)).toBe(true)
    }
    // And the restored board is full, exactly as the live claim path says.
    expect(claimNickname(store, 'demo', 'a fresh name', NOW).outcome).toBe('full')
  })

  it('drops an over-cap legacy row together with its owner', () => {
    // The owners map is already at the ceiling, and `ada` is a score row with
    // no owner record — the legacy shape, arriving with nowhere left to go.
    const owners: Record<string, unknown> = {}
    for (let index = 0; index < MAX_ENTRIES; index += 1) {
      const nickname = `player ${index}`
      owners[nicknameKey(nickname) as string] = { nickname, tokenHash: 'x'.repeat(64), claimedAt: NOW, scoredAt: NOW }
    }
    const scores: Record<string, number> = { ada: 300 }

    const store = readSnapshot(
      tempFile(JSON.stringify({ version: 2, challenges: { demo: { scores, owners, lastActiveAt: NOW } } })),
    )
    const board = store.challenges.get('demo')

    expect(board?.entries.has('ada')).toBe(false)
    expect(board?.owners.has('ada')).toBe(false)
    expect(claimNickname(store, 'demo', 'ada', NOW).outcome).toBe('full')
  })

  it('reports a write it could not make rather than throwing', () => {
    // A directory where the file should be: the rename cannot possibly land.
    const path = tempFile()
    mkdirSync(path)

    expect(writeSnapshot(path, seeded([['ada', 10]]).store)).toBe(false)
    expect(readdirSync(dirname(path))).toEqual(['scoreboard.json'])
  })

  it('leaves no temp file beside the snapshot it wrote', () => {
    const path = tempFile()

    expect(writeSnapshot(path, seeded([['ada', 300]]).store)).toBe(true)

    expect(readdirSync(dirname(path))).toEqual(['scoreboard.json'])
    expect(claimNickname(readSnapshot(path), 'demo', 'ada', NOW).outcome).toBe('taken')
  })

  it('keeps the previous snapshot when a write tears part-way through', () => {
    const path = tempFile()
    expect(writeSnapshot(path, seeded([['ada', 300]]).store)).toBe(true)
    const before = readFileSync(path, 'utf8')

    fsControl.tearWriteAfterBytes = 12
    expect(writeSnapshot(path, seeded([['bo', 10]]).store)).toBe(false)

    expect(readFileSync(path, 'utf8')).toBe(before)
    expect(readdirSync(dirname(path))).toEqual(['scoreboard.json'])
    expect(claimNickname(readSnapshot(path), 'demo', 'ada', NOW).outcome).toBe('taken')
  })
})
