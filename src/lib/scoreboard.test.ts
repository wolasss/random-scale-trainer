import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_NICKNAME_LENGTH } from './challenge'
import {
  claimNickname,
  fetchTopScores,
  finishScoringSession,
  MAX_BOARD_ENTRIES,
  SCOREBOARD_ENDPOINT,
  SCOREBOARD_REQUEST_TIMEOUT_MS,
  sendScoreEvents,
  startScoringSession,
} from './scoreboard'

const jsonResponse = (payload: unknown, ok = true, status = ok ? 200 : 400) =>
  ({ ok, status, json: async () => payload }) as unknown as Response

const fetchReturning = (payload: unknown, ok = true, status = ok ? 200 : 400) =>
  vi.fn(async () => jsonResponse(payload, ok, status))

const BOARD = { scores: [{ nickname: 'ada', points: 300 }] }
const CONFIG = { bpm: 72, beatsPerNote: 4 } as const
const TOKEN = 'a'.repeat(64)

/** The init a fetch spy was called with, so the header can be read back. */
const initOf = (fetchImpl: ReturnType<typeof fetchReturning>, call = 0) =>
  (fetchImpl.mock.calls[call] as unknown as [string, RequestInit])[1]

describe('fetchTopScores', () => {
  it('asks the board for the challenge, escaping the name into the path', async () => {
    const fetchImpl = fetchReturning(BOARD)

    await expect(fetchTopScores('summer sprint', { fetchImpl })).resolves.toEqual(BOARD.scores)
    expect(fetchImpl).toHaveBeenCalledWith(`${SCOREBOARD_ENDPOINT}/summer%20sprint`, {
      signal: expect.any(AbortSignal),
    })
  })

  /** The read is the one call anybody may make, so it carries no credential. */
  it('sends no Authorization header, ever', async () => {
    const fetchImpl = fetchReturning(BOARD)

    await fetchTopScores('demo', { fetchImpl })

    expect(initOf(fetchImpl)).toEqual({ signal: expect.any(AbortSignal) })
  })

  it('aborts the request when the caller signal fires, so a board can be dropped on unmount', async () => {
    const fetchImpl = fetchReturning(BOARD)
    const controller = new AbortController()

    const pending = fetchTopScores('demo', { fetchImpl, signal: controller.signal })
    const sentSignal = initOf(fetchImpl).signal as AbortSignal
    expect(sentSignal.aborted).toBe(false)

    controller.abort()
    expect(sentSignal.aborted).toBe(true)

    await pending
  })

  /** A board is a nicety beside a practice session — never an error boundary. */
  it('is null rather than a throw when the request fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(fetchTopScores('demo', { fetchImpl })).resolves.toBeNull()
  })

  it('is null on a response the server refused', async () => {
    await expect(fetchTopScores('demo', { fetchImpl: fetchReturning({}, false) })).resolves.toBeNull()
  })

  it('is null on a body that is not JSON', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => {
            throw new SyntaxError('Unexpected token')
          },
        }) as unknown as Response,
    )

    await expect(fetchTopScores('demo', { fetchImpl })).resolves.toBeNull()
  })

  it('is null when the payload is not a board at all', async () => {
    for (const payload of [null, 'a string', {}, { scores: 'nope' }]) {
      await expect(fetchTopScores('demo', { fetchImpl: fetchReturning(payload) })).resolves.toBeNull()
    }
  })

  /**
   * The one place in this app where the data came out of somebody else's
   * browser, so an entry that isn't one is dropped rather than rendered.
   */
  it('drops the entries that are not entries and keeps the rest', async () => {
    const fetchImpl = fetchReturning({
      scores: [
        { nickname: 'ada', points: 300 },
        { nickname: '', points: 10 },
        { nickname: 'bo' },
        { points: 10 },
        { nickname: 'cy', points: 'lots' },
        { nickname: 'dee', points: Number.POSITIVE_INFINITY },
        null,
        'nope',
        { nickname: 'eve', points: 5 },
      ],
    })

    await expect(fetchTopScores('demo', { fetchImpl })).resolves.toEqual([
      { nickname: 'ada', points: 300 },
      { nickname: 'eve', points: 5 },
    ])
  })

  it('keeps a normal top ten whole', async () => {
    const scores = Array.from({ length: MAX_BOARD_ENTRIES }, (_, i) => ({ nickname: `p${i}`, points: 100 - i }))
    const fetchImpl = fetchReturning({ scores })

    await expect(fetchTopScores('demo', { fetchImpl })).resolves.toEqual(scores)
  })

  /**
   * The over-long name comes first so a slice-only bound would hide it and let
   * an unbounded nickname length pass unnoticed.
   */
  it('is bounded no matter what the board host answers', async () => {
    const boundary = { nickname: 'b'.repeat(MAX_NICKNAME_LENGTH), points: 999 }
    const overLong = { nickname: 'x'.repeat(MAX_NICKNAME_LENGTH + 1), points: 1000 }
    const fillers = Array.from({ length: 10_000 }, (_, i) => ({ nickname: `f${i}`, points: i }))

    const fetchImpl = fetchReturning({ scores: [overLong, boundary, ...fillers] })

    const result = await fetchTopScores('demo', { fetchImpl })

    expect(result).toHaveLength(MAX_BOARD_ENTRIES)
    expect(result?.[0]).toEqual(boundary)
    expect(result?.slice(1)).toEqual(fillers.slice(0, MAX_BOARD_ENTRIES - 1))
    for (const entry of result ?? []) {
      expect(entry.nickname.length).toBeLessThanOrEqual(MAX_NICKNAME_LENGTH)
      expect(entry.nickname).not.toBe(overLong.nickname.slice(0, MAX_NICKNAME_LENGTH))
    }
  })
})

describe('claimNickname', () => {
  it('posts the name and hands the ownership token back', async () => {
    const fetchImpl = fetchReturning({ nickname: 'Ada', token: TOKEN })

    await expect(claimNickname('demo', 'Ada', { fetchImpl })).resolves.toEqual({
      outcome: 'ok',
      value: { nickname: 'Ada', token: TOKEN },
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${SCOREBOARD_ENDPOINT}/demo/nickname`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Ada' }),
      signal: expect.any(AbortSignal),
    })
  })

  it('says the name is taken rather than just failing', async () => {
    const fetchImpl = fetchReturning({ error: 'nickname_taken' }, false, 409)

    await expect(claimNickname('demo', 'ada', { fetchImpl })).resolves.toEqual({ outcome: 'taken' })
  })

  it('tells a rate limit apart from everything else', async () => {
    const fetchImpl = fetchReturning({ error: 'rate_limited' }, false, 429)

    await expect(claimNickname('demo', 'ada', { fetchImpl })).resolves.toEqual({ outcome: 'rate-limited' })
  })

  it('is an error when the board could not be reached, or answered nonsense', async () => {
    const unreachable = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(claimNickname('demo', 'ada', { fetchImpl: unreachable })).resolves.toEqual({ outcome: 'error' })
    await expect(claimNickname('demo', 'ada', { fetchImpl: fetchReturning({ nickname: 'ada' }) })).resolves.toEqual({
      outcome: 'error',
    })
  })
})

describe('scoring sessions', () => {
  it('opens one under the ownership token', async () => {
    const fetchImpl = fetchReturning({ sessionId: 'abc', expiresAt: 42, config: CONFIG })

    await expect(startScoringSession('demo', 'ada', TOKEN, CONFIG, { fetchImpl })).resolves.toEqual({
      outcome: 'ok',
      value: { sessionId: 'abc', expiresAt: 42, config: CONFIG },
    })
    expect(initOf(fetchImpl).headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    })
  })

  it('reports a config the board refused as exactly that', async () => {
    const fetchImpl = fetchReturning({ error: 'invalid_config' }, false, 400)

    await expect(startScoringSession('demo', 'ada', TOKEN, CONFIG, { fetchImpl })).resolves.toEqual({
      outcome: 'invalid-config',
    })
  })

  it('reports a token the board does not recognise as exactly that', async () => {
    const fetchImpl = fetchReturning({ error: 'invalid_owner' }, false, 401)

    await expect(startScoringSession('demo', 'ada', TOKEN, CONFIG, { fetchImpl })).resolves.toEqual({
      outcome: 'unauthorized',
    })
  })

  /** The whole shape of the new contract: events up, the server's total down. */
  it('posts events and takes the server’s own total back', async () => {
    const fetchImpl = fetchReturning({ points: 30, ...BOARD })
    const events = [{ seq: 0, kind: 'hit' as const, at: 0 }]

    await expect(sendScoreEvents('demo', 'abc', TOKEN, events, { fetchImpl })).resolves.toEqual({
      outcome: 'ok',
      value: { points: 30, scores: BOARD.scores },
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${SCOREBOARD_ENDPOINT}/demo/session/abc/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ events }),
      signal: expect.any(AbortSignal),
    })
  })

  it('reports an expired or finished session as expired', async () => {
    for (const error of ['session_expired', 'session_completed']) {
      const fetchImpl = fetchReturning({ error }, false, 404)
      await expect(sendScoreEvents('demo', 'abc', TOKEN, [], { fetchImpl })).resolves.toEqual({ outcome: 'expired' })
    }
  })

  /**
   * A batch the server judged and refused is not a batch that failed to arrive.
   * The rules it broke are all-or-nothing and do not change, so retrying it is
   * a loop — the caller needs to know to abandon the session instead.
   */
  it('separates a batch the server refused from one that never landed', async () => {
    for (const error of ['invalid_event', 'too_fast', 'too_many']) {
      const fetchImpl = fetchReturning({ error }, false, 400)
      await expect(sendScoreEvents('demo', 'abc', TOKEN, [], { fetchImpl })).resolves.toEqual({ outcome: 'rejected' })
    }

    const unreachable = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(sendScoreEvents('demo', 'abc', TOKEN, [], { fetchImpl: unreachable })).resolves.toEqual({
      outcome: 'error',
    })
  })

  it('is an error, not a total, when the answer carries no points', async () => {
    await expect(sendScoreEvents('demo', 'abc', TOKEN, [], { fetchImpl: fetchReturning(BOARD) })).resolves.toEqual({
      outcome: 'error',
    })
  })

  it('closes a session and takes the final board back', async () => {
    const fetchImpl = fetchReturning({ points: 30, ...BOARD })

    await expect(finishScoringSession('demo', 'abc', TOKEN, { fetchImpl })).resolves.toEqual({
      outcome: 'ok',
      value: { points: 30, scores: BOARD.scores },
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${SCOREBOARD_ENDPOINT}/demo/session/abc/finish`, expect.anything())
  })

  it('escapes a session id into the path rather than trusting it', async () => {
    const fetchImpl = fetchReturning({ points: 0, scores: [] })

    await finishScoringSession('demo', 'a/../b', TOKEN, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith(`${SCOREBOARD_ENDPOINT}/demo/session/a%2F..%2Fb/finish`, expect.anything())
  })
})

/**
 * A mobile network can accept a request and never answer it. These pin the
 * deadline that stands in for the reload a stuck 'loading' board or joining
 * spinner would otherwise need.
 */
describe('request deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const signalOf = (fetchImpl: ReturnType<typeof vi.fn>, call = 0) =>
    (fetchImpl.mock.calls[call] as unknown as [string, RequestInit])[1].signal as AbortSignal

  const abortError = () => new DOMException('aborted', 'AbortError')

  /** Headers never arrive; the fetch itself only ever settles if its signal fires. */
  const hangingFetch = () =>
    vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) {
          reject(abortError())
          return
        }
        signal.addEventListener('abort', () => reject(abortError()), { once: true })
      })
    })

  /** Headers arrive fine, but the body never does. */
  const stalledBodyFetch = () =>
    vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            if (signal.aborted) {
              reject(abortError())
              return
            }
            signal.addEventListener('abort', () => reject(abortError()), { once: true })
          }),
      } as unknown as Response)
    })

  it('is the existing failure, not a hang, when a request never gets an answer', async () => {
    const fetchImpl = hangingFetch()

    const scores = fetchTopScores('demo', { fetchImpl })
    const claim = claimNickname('demo', 'ada', { fetchImpl })

    await vi.advanceTimersByTimeAsync(SCOREBOARD_REQUEST_TIMEOUT_MS)

    await expect(scores).resolves.toBeNull()
    await expect(claim).resolves.toEqual({ outcome: 'error' })
    expect(signalOf(fetchImpl, 0).aborted).toBe(true)
    expect(signalOf(fetchImpl, 1).aborted).toBe(true)
  })

  /** The deadline has to outlive the fetch call, not just the headers. */
  it('is the existing failure when the body stalls after the headers arrive', async () => {
    const fetchImpl = stalledBodyFetch()

    const claim = claimNickname('demo', 'ada', { fetchImpl })

    await vi.advanceTimersByTimeAsync(SCOREBOARD_REQUEST_TIMEOUT_MS)

    await expect(claim).resolves.toEqual({ outcome: 'error' })
  })

  it('aborts on a caller signal fired before the deadline, without waiting for it', async () => {
    const fetchImpl = hangingFetch()
    const controller = new AbortController()

    const scores = fetchTopScores('demo', { fetchImpl, signal: controller.signal })
    const claim = claimNickname('demo', 'ada', { fetchImpl, signal: controller.signal })

    controller.abort()

    await expect(scores).resolves.toBeNull()
    await expect(claim).resolves.toEqual({ outcome: 'error' })
    expect(signalOf(fetchImpl, 0).aborted).toBe(true)
    expect(signalOf(fetchImpl, 1).aborted).toBe(true)
  })

  it('aborts a call made with an already-aborted signal, rather than waiting for the deadline', async () => {
    const fetchImpl = hangingFetch()
    const controller = new AbortController()
    controller.abort()

    await expect(claimNickname('demo', 'ada', { fetchImpl, signal: controller.signal })).resolves.toEqual({
      outcome: 'error',
    })
    expect(signalOf(fetchImpl).aborted).toBe(true)
  })

  it('clears the deadline and returns the value unchanged when the answer beats it', async () => {
    await expect(fetchTopScores('demo', { fetchImpl: fetchReturning(BOARD) })).resolves.toEqual(BOARD.scores)
    expect(vi.getTimerCount()).toBe(0)

    await expect(
      claimNickname('demo', 'ada', { fetchImpl: fetchReturning({ nickname: 'ada', token: TOKEN }) }),
    ).resolves.toEqual({ outcome: 'ok', value: { nickname: 'ada', token: TOKEN } })
    expect(vi.getTimerCount()).toBe(0)
  })
})
