import { describe, expect, it, vi } from 'vitest'
import { fetchTopScores, SCOREBOARD_ENDPOINT, submitScore } from './scoreboard'

const jsonResponse = (payload: unknown, ok = true) =>
  ({ ok, json: async () => payload }) as unknown as Response

const fetchReturning = (payload: unknown, ok = true) => vi.fn(async () => jsonResponse(payload, ok))

const BOARD = { scores: [{ nickname: 'ada', points: 300 }] }

describe('fetchTopScores', () => {
  it('asks the board for the challenge, escaping the name into the path', async () => {
    const fetchImpl = fetchReturning(BOARD)

    await expect(fetchTopScores('summer sprint', { fetchImpl })).resolves.toEqual(BOARD.scores)
    expect(fetchImpl).toHaveBeenCalledWith(`${SCOREBOARD_ENDPOINT}/summer%20sprint`, { signal: undefined })
  })

  it('passes an abort signal through, so a board can be dropped on unmount', async () => {
    const fetchImpl = fetchReturning(BOARD)
    const { signal } = new AbortController()

    await fetchTopScores('demo', { fetchImpl, signal })

    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), { signal })
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
})

describe('submitScore', () => {
  it('posts the tally and hands back the board it produced', async () => {
    const fetchImpl = fetchReturning(BOARD)

    await expect(submitScore('demo', 'ada', 300, { fetchImpl })).resolves.toEqual(BOARD.scores)
    expect(fetchImpl).toHaveBeenCalledWith(`${SCOREBOARD_ENDPOINT}/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'ada', points: 300 }),
      signal: undefined,
    })
  })

  it('is null when the submit never landed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(submitScore('demo', 'ada', 300, { fetchImpl })).resolves.toBeNull()
  })

  it('is null when the server refused the submit', async () => {
    await expect(submitScore('demo', 'ada', 300, { fetchImpl: fetchReturning({}, false) })).resolves.toBeNull()
  })
})
