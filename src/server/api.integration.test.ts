// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo, Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createScoreboardServer, MAX_BODY_BYTES } from './http.js'
import { API_PREFIX, CLAIM_LIMIT, createStore, readSnapshot } from './scoreboard.js'
import {
  difficultyMultiplier,
  FASTEST_NOTE_INTERVAL_MS,
  POINTS_PER_HIT,
  TEMPO_BONUS_POINTS,
} from './session-scoring.js'

/**
 * The scoreboard over a real socket.
 *
 * scoreboard.test.ts covers what the handler decides; this covers everything
 * that only exists once there is a connection: the body cap, who a request
 * counts as for rate limiting, the Authorization header actually reaching the
 * store, two claims genuinely in flight at the same time, and a restart that
 * reads the snapshot the first process wrote.
 */
const dirs: string[] = []
let server: Server
let base = ''

const listen = async (dataPath = '') => {
  const started = createScoreboardServer({ store: createStore(), dataPath })
  await new Promise<void>((resolve) => started.listen(0, '127.0.0.1', resolve))
  const { port } = started.address() as AddressInfo

  return { started, url: `http://127.0.0.1:${port}` }
}

beforeEach(async () => {
  const opened = await listen()
  server = opened.started
  base = opened.url
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

type Reply = { status: number; body: Record<string, unknown>; raw: string }

const request = async (
  path: string,
  { method = 'GET', body, token, forwardedFor, url = base, headers = {} }: {
    method?: string
    body?: unknown
    token?: string
    forwardedFor?: string
    url?: string
    /** Spread last, so a case can override the Content-Type the body implies. */
    headers?: Record<string, string>
  } = {},
): Promise<Reply> => {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      ...(forwardedFor === undefined ? {} : { 'X-Forwarded-For': forwardedFor }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })

  const raw = await response.text()

  return { status: response.status, body: raw === '' ? {} : JSON.parse(raw), raw }
}

const claim = (challenge: string, nickname: string, extra: Parameters<typeof request>[1] = {}) =>
  request(`${API_PREFIX}${challenge}/nickname`, { method: 'POST', body: { nickname }, ...extra })

/** Opens a session and plays `count` notes through it at the legal spacing. */
const play = async (
  challenge: string,
  nickname: string,
  token: string,
  count: number,
  extra: Parameters<typeof request>[1] = {},
) => {
  const opened = await request(`${API_PREFIX}${challenge}/session`, {
    method: 'POST',
    token,
    body: { nickname, config: { bpm: 72, beatsPerNote: 4 } },
    ...extra,
  })
  const sessionId = String(opened.body.sessionId ?? '')
  const events = Array.from({ length: count }, (_, index) => ({
    seq: index,
    kind: 'hit',
    at: index * FASTEST_NOTE_INTERVAL_MS,
  }))
  const posted = await request(`${API_PREFIX}${challenge}/session/${sessionId}/events`, {
    method: 'POST',
    token,
    body: { events },
    ...extra,
  })

  return { opened, sessionId, events, posted }
}

describe('claiming a nickname', () => {
  /**
   * The acceptance case, and the reason `claimNickname` is a synchronous
   * check-and-set: two requests genuinely dispatched together, one board.
   */
  it('is exactly one success and one 409 when two browsers race for the same name', async () => {
    const [first, second] = await Promise.all([claim('race', 'Alice'), claim('race', 'alice ')])
    const statuses = [first.status, second.status].sort()

    expect(statuses).toEqual([201, 409])
    const won = first.status === 201 ? first : second
    const lost = first.status === 201 ? second : first
    expect(won.body).toMatchObject({ nickname: expect.any(String), token: expect.any(String) })
    expect(lost.body).toEqual({ error: 'nickname_taken' })
  })

  it('will not let a second browser touch the first’s score', async () => {
    const owner = await claim('guarded', 'ada')
    const token = String(owner.body.token)
    await play('guarded', 'ada', token, 3)
    const mine = (await request(`${API_PREFIX}guarded`)).body.scores

    // Claim it again, open a session on it, and post the old total straight at
    // the board. None of the three is a way in.
    expect((await claim('guarded', 'ADA')).status).toBe(409)
    expect(
      (
        await request(`${API_PREFIX}guarded/session`, {
          method: 'POST',
          token: 'f'.repeat(64),
          body: { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } },
        })
      ).status,
    ).toBe(401)
    expect(
      (await request(`${API_PREFIX}guarded`, { method: 'POST', body: { nickname: 'ada', points: 1_000_000 } })).status,
    ).toBe(410)

    expect((await request(`${API_PREFIX}guarded`)).body.scores).toEqual(mine)
  })

  /** Holding the URL buys the board and nothing else. */
  it('gives a stranger with the URL read-only access', async () => {
    const owner = await claim('read-only', 'ada')
    await play('read-only', 'ada', String(owner.body.token), 2)

    const read = await request(`${API_PREFIX}read-only`)
    expect(read.status).toBe(200)
    expect(read.body.scores).toEqual([{ nickname: 'ada', points: POINTS_PER_HIT * 2 }])

    // ...and there is nothing in that answer to become an owner with.
    expect(read.raw).not.toContain('token')
    expect(read.raw).not.toContain('Hash')
  })
})

describe('scoring over the wire', () => {
  it('adds the events up itself rather than taking a total', async () => {
    const owner = await claim('wire', 'ada')
    const { posted } = await play('wire', 'ada', String(owner.body.token), 4)

    expect(posted.status).toBe(200)
    // Four hits plus the streak bonuses the third and fourth earn.
    expect(posted.body.points).toBe(POINTS_PER_HIT * 4 + 5 + 10)
    expect(posted.body.scores).toEqual([{ nickname: 'ada', points: posted.body.points }])
  })

  /**
   * The difficulty rides over the wire on the hit, is priced by the server, and
   * reaches the board — which is the whole path the readout has to agree with.
   */
  it('prices a hit by the settings its note was called under', async () => {
    const owner = await claim('priced', 'ada')
    const token = String(owner.body.token)
    const difficulty = {
      spelling: 'mixed',
      showFretboard: false,
      bpm: 96,
      beatsPerNote: 4,
      pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    } as const
    const multiplier = difficultyMultiplier(difficulty)

    const opened = await request(`${API_PREFIX}priced/session`, {
      method: 'POST',
      token,
      body: { nickname: 'ada', config: { bpm: 96, beatsPerNote: 4 } },
    })

    const posted = await request(`${API_PREFIX}priced/session/${String(opened.body.sessionId)}/events`, {
      method: 'POST',
      token,
      body: {
        events: [
          { seq: 0, kind: 'hit', at: 0, difficulty },
          { seq: 1, kind: 'bonus', bonus: 'tempo', at: 0 },
          // Priced flat, in the same session: what a note is worth is the
          // note's own business and not the session's.
          { seq: 2, kind: 'hit', at: FASTEST_NOTE_INTERVAL_MS },
        ],
      },
    })

    const priced = Math.round(POINTS_PER_HIT * multiplier) + Math.round(TEMPO_BONUS_POINTS * multiplier)
    expect(posted.status).toBe(200)
    expect(posted.body.points).toBe(priced + POINTS_PER_HIT)
    expect(posted.body.scores).toEqual([{ nickname: 'ada', points: priced + POINTS_PER_HIT }])
  })

  /** Settings the app cannot produce are a bad event, and a bad event is a bad batch. */
  it('refuses a hit declaring a difficulty the app cannot produce', async () => {
    const owner = await claim('bogus', 'ada')
    const token = String(owner.body.token)
    const opened = await request(`${API_PREFIX}bogus/session`, {
      method: 'POST',
      token,
      body: { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } },
    })

    const posted = await request(`${API_PREFIX}bogus/session/${String(opened.body.sessionId)}/events`, {
      method: 'POST',
      token,
      body: {
        events: [
          {
            seq: 0,
            kind: 'hit',
            at: 0,
            difficulty: { spelling: 'mixed', showFretboard: false, bpm: 9000, beatsPerNote: 4, pool: [0, 1] },
          },
        ],
      },
    })

    expect(posted.status).toBe(400)
    expect(posted.body.error).toBe('invalid_event')
    expect((await request(`${API_PREFIX}bogus`)).body.scores).toEqual([])
  })

  it('refuses a replayed batch and leaves the board where it was', async () => {
    const owner = await claim('replay', 'ada')
    const token = String(owner.body.token)
    const { sessionId, events } = await play('replay', 'ada', token, 3)
    const before = (await request(`${API_PREFIX}replay`)).body.scores

    const again = await request(`${API_PREFIX}replay/session/${sessionId}/events`, {
      method: 'POST',
      token,
      body: { events },
    })

    expect(again.status).toBe(400)
    expect((await request(`${API_PREFIX}replay`)).body.scores).toEqual(before)
  })

  it('will not open a session for somebody holding no token', async () => {
    await claim('unowned', 'ada')

    const answer = await request(`${API_PREFIX}unowned/session`, {
      method: 'POST',
      body: { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } },
    })

    expect(answer.status).toBe(401)
    expect(answer.body).toEqual({ error: 'invalid_owner' })
  })

  it('never puts a token in any response body, on any endpoint', async () => {
    const owner = await claim('quiet', 'ada')
    const token = String(owner.body.token)
    const { opened, posted, sessionId } = await play('quiet', 'ada', token, 2)
    const finished = await request(`${API_PREFIX}quiet/session/${sessionId}/finish`, { method: 'POST', token })

    // The claim is the one and only place the token is ever spoken.
    for (const reply of [opened, posted, finished, await request(`${API_PREFIX}quiet`)]) {
      expect(reply.raw).not.toContain(token)
    }
  })
})

describe('the edge itself', () => {
  it('refuses a body past the cap without reading it', async () => {
    const answer = await request(`${API_PREFIX}oversized/nickname`, {
      method: 'POST',
      body: JSON.stringify({ nickname: 'a'.repeat(MAX_BODY_BYTES * 2) }),
    })

    expect(answer.status).toBe(413)
  })

  /**
   * nginx sets X-Forwarded-For to $remote_addr rather than appending, so the
   * last hop is the one it observed. A caller who prepends hops of their own
   * invention must not get a rate-limit bucket per request out of it.
   */
  it('does not let a spoofed X-Forwarded-For widen a rate limit', async () => {
    for (let index = 0; index < CLAIM_LIMIT.limit; index += 1) {
      const answer = await claim('spoofed', `player ${index}`, { forwardedFor: `10.0.0.${index}, 203.0.113.9` })
      expect(answer.status).toBe(201)
    }

    // A fresh first hop, the same last one. Same bucket, and it is empty.
    const refused = await claim('spoofed', 'one more', { forwardedFor: '10.9.9.9, 203.0.113.9' })
    expect(refused.status).toBe(429)
    expect(refused.body).toEqual({ error: 'rate_limited' })
  })

  /**
   * A claim needs no Authorization, so without this the page a player happens
   * to be reading could squat names on their board in their name.
   */
  it('refuses a claim the browser marks as coming from another site', async () => {
    const forged = await claim('forged', 'ada', { headers: { 'Sec-Fetch-Site': 'cross-site' } })

    expect(forged.status).toBe(403)
    expect(forged.body).toEqual({ error: 'cross_site' })
    expect((await request(`${API_PREFIX}forged`)).body.scores).toEqual([])
    // Nothing was spent: the name is still there to be claimed.
    expect((await claim('forged', 'ada')).status).toBe(201)
  })

  /** The CORS 'simple request' — a POST that skips the preflight entirely. */
  it('refuses a claim declaring a Content-Type that is not JSON', async () => {
    const forged = await claim('simple', 'ada', { headers: { 'Content-Type': 'text/plain' } })

    expect(forged.status).toBe(403)
    expect(forged.body).toEqual({ error: 'cross_site' })
    expect((await request(`${API_PREFIX}simple`)).body.scores).toEqual([])
    expect((await claim('simple', 'ada')).status).toBe(201)
  })

  /** Present but not on the allowlist is refused; only *absent* is allowed. */
  it('refuses a claim carrying an empty Sec-Fetch-Site', async () => {
    const forged = await claim('empty-site', 'ada', { headers: { 'Sec-Fetch-Site': '' } })

    expect(forged.status).toBe(403)
    expect((await request(`${API_PREFIX}empty-site`)).body.scores).toEqual([])
    expect((await claim('empty-site', 'ada')).status).toBe(201)
  })

  /** Reading a board is public — a shared link is meant to open anywhere. */
  it('still serves a board to a cross-site GET', async () => {
    const owner = await claim('public-read', 'ada')
    await play('public-read', 'ada', String(owner.body.token), 2)

    const read = await request(`${API_PREFIX}public-read`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })
    expect(read.status).toBe(200)
    expect(read.body.scores).toEqual([{ nickname: 'ada', points: POINTS_PER_HIT * 2 }])
  })

  /** The shape the app's own fetches actually have, claim through to score. */
  it('lets the app’s own same-origin JSON requests claim and score', async () => {
    const sameOrigin = { headers: { 'Sec-Fetch-Site': 'same-origin' } }
    const owner = await claim('same-origin', 'ada', sameOrigin)
    expect(owner.status).toBe(201)

    const { opened, posted } = await play('same-origin', 'ada', String(owner.body.token), 2, sameOrigin)
    expect(opened.status).toBe(201)
    expect(posted.status).toBe(200)
    expect((await request(`${API_PREFIX}same-origin`)).body.scores).toEqual([
      { nickname: 'ada', points: POINTS_PER_HIT * 2 },
    ])
  })
})

describe('a restart', () => {
  it('still honours the old token, and still refuses a claim on the same name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'callnote-api-'))
    dirs.push(dir)
    const dataPath = join(dir, 'scoreboard.json')

    const first = await listen(dataPath)
    const owner = await request(`${API_PREFIX}durable/nickname`, {
      method: 'POST',
      body: { nickname: 'ada' },
      url: first.url,
    })
    const token = String(owner.body.token)
    await new Promise<void>((resolve) => first.started.close(() => resolve()))

    // A brand-new process, reading only what the first one wrote.
    const restarted = createScoreboardServer({ store: readSnapshot(dataPath), dataPath })
    await new Promise<void>((resolve) => restarted.listen(0, '127.0.0.1', resolve))
    const { port } = restarted.address() as AddressInfo
    const url = `http://127.0.0.1:${port}`

    try {
      const opened = await request(`${API_PREFIX}durable/session`, {
        method: 'POST',
        token,
        body: { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } },
        url,
      })
      expect(opened.status).toBe(201)

      const stolen = await request(`${API_PREFIX}durable/nickname`, {
        method: 'POST',
        body: { nickname: 'Ada' },
        url,
      })
      expect(stolen.status).toBe(409)
    } finally {
      await new Promise<void>((resolve) => restarted.close(() => resolve()))
    }
  })
})
