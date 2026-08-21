import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCOREBOARD_REFRESH_MS, useChallenge, type UseChallengeOptions } from './useChallenge'
import { STORAGE_KEYS } from '../constants'

const CONFIG = { bpm: 72, beatsPerNote: 4 } as const
const TOKEN = 'a'.repeat(64)

const board = (...scores: Array<[string, number]>) => ({
  scores: scores.map(([nickname, points]) => ({ nickname, points })),
})

const jsonFetch = (payload: unknown) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }) as unknown as Response)

type Spy = { mock: { calls: Array<[string, RequestInit | undefined]> } }

/** The body a fetch spy was called with, parsed. */
const bodyOf = (fetchImpl: Spy, index: number) => JSON.parse(String(fetchImpl.mock.calls[index][1]?.body))

/**
 * A fetch that answers each endpoint the way the real service would: the board
 * on a GET, a token on a claim, an id on a session, and a running total on a
 * batch. `points` is deliberately not what the caller sent — the whole point of
 * the contract is that the server works it out.
 */
/** A stub with fetch's own signature, so it drops straight into `fetchImpl`. */
const stubFetch = (handler: (path: string, init?: RequestInit) => Promise<Response>) =>
  vi.fn((input: URL | RequestInfo, init?: RequestInit) => handler(String(input), init)) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit | undefined]> }
  }

const reply = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response

const service = (overrides: Partial<Record<'nickname' | 'session' | 'events' | 'finish' | 'get', unknown>> = {}) => {
  let total = 0

  return stubFetch(async (url: string, init?: RequestInit) => {
    const path = String(url)

    if (init?.method !== 'POST') {
      return reply(overrides.get ?? board())
    }

    if (path.endsWith('/nickname')) {
      const { nickname } = JSON.parse(String(init.body))
      return reply(overrides.nickname ?? { nickname, token: TOKEN }, 201)
    }

    if (path.endsWith('/session')) {
      return reply(overrides.session ?? { sessionId: 'session-1', expiresAt: 0, config: CONFIG }, 201)
    }

    if (path.endsWith('/events')) {
      total += JSON.parse(String(init.body)).events.length * 10
      return reply(overrides.events ?? { points: total, ...board(['ada', total]) })
    }

    return reply(overrides.finish ?? { points: total, ...board(['ada', total]) })
  })
}

/** Joined already: the token map says this browser owns 'ada' on 'demo'. */
const owning = (challenge = 'demo', nickname = 'ada') => {
  window.localStorage.setItem(
    STORAGE_KEYS.challengeTokens,
    JSON.stringify({ [challenge]: { nickname, token: TOKEN } }),
  )
}

const render = (options: UseChallengeOptions) =>
  renderHook(() => useChallenge({ config: CONFIG, now: () => Date.now(), ...options }))

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('off a challenge', () => {
  it('does nothing at all — which is the whole of "the feature is disabled"', async () => {
    const fetchImpl = jsonFetch(board(['ada', 300]))

    const { result } = render({ search: '?src=pwa', fetchImpl })

    expect(result.current.active).toBe(false)
    expect(result.current.name).toBeNull()
    expect(result.current.needsNickname).toBe(false)
    expect(result.current.status).toBe('off')
    expect(result.current.scores).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never reads or writes the stored nickname or any token', async () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')
    const fetchImpl = jsonFetch(board())

    const { result } = render({ search: '', fetchImpl })

    expect(result.current.nickname).toBeNull()
    expect(result.current.prefill).toBe('')
    act(() => result.current.join('bo'))
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeNickname)).toBe('ada')
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeTokens)).toBeNull()
  })

  it('sends nothing when a note is scored or a session is flushed', () => {
    const fetchImpl = jsonFetch(board())
    const { result } = render({ search: '', fetchImpl })

    act(() => result.current.recordEvent({ kind: 'hit' }))
    act(() => result.current.flushEvents())
    act(() => result.current.endSession())

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('on a challenge', () => {
  it('loads the board on mount', async () => {
    const fetchImpl = jsonFetch(board(['ada', 300], ['bo', 100]))

    const { result } = render({ search: '?challenge=demo', fetchImpl })

    expect(result.current.active).toBe(true)
    expect(result.current.name).toBe('demo')
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.scores).toEqual(board(['ada', 300], ['bo', 100]).scores)
    expect(fetchImpl).toHaveBeenCalledWith('/api/scoreboard/demo', expect.anything())
  })

  it('says so when the board could not be read, rather than showing an empty one', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    const { result } = render({ search: '?challenge=demo', fetchImpl })

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.scores).toEqual([])
  })

  it('reserves the name before joining, and remembers the token it was given', async () => {
    const fetchImpl = service()
    const { result } = render({ search: '?challenge=demo', fetchImpl })
    expect(result.current.needsNickname).toBe(true)

    await act(async () => result.current.join('  Ada  Lovelace  '))

    expect(result.current.needsNickname).toBe(false)
    // Normalised on the way in, exactly as it will appear on the board.
    expect(result.current.nickname).toBe('Ada Lovelace')
    expect(bodyOf(fetchImpl, 1)).toEqual({ nickname: 'Ada Lovelace' })
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.challengeTokens) ?? '{}')).toEqual({
      demo: { nickname: 'Ada Lovelace', token: TOKEN },
    })
    // ...and the bare name survives as the next challenge's prefill.
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeNickname)).toBe('Ada Lovelace')
  })

  it('says the name is taken and does not join under it', async () => {
    const fetchImpl = stubFetch(async (_url, init) =>
      init?.method === 'POST' ? reply({ error: 'nickname_taken' }, 409) : reply(board(['ada', 300])),
    )

    const { result } = render({ search: '?challenge=demo', fetchImpl })
    await act(async () => result.current.join('ada'))

    expect(result.current.joinError).toBe('taken')
    expect(result.current.nickname).toBeNull()
    expect(result.current.needsNickname).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeTokens)).toBeNull()
    // The board is still readable — being refused a name is not being locked out.
    await waitFor(() => expect(result.current.scores).toEqual([{ nickname: 'ada', points: 300 }]))
  })

  it('reports a rate-limited claim as its own thing', async () => {
    const fetchImpl = stubFetch(async (_url, init) =>
      init?.method === 'POST' ? reply({ error: 'rate_limited' }, 429) : reply(board()),
    )

    const { result } = render({ search: '?challenge=demo', fetchImpl })
    await act(async () => result.current.join('ada'))

    expect(result.current.joinError).toBe('rate-limited')
  })

  /**
   * Membership is the token, not a name. A browser that joined some other
   * challenge before still has to claim this one — otherwise "having been on a
   * board once" would be a credential, which is exactly what it must not be.
   */
  it('still prompts a browser that has a stored name but no token here', () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')

    const { result } = render({ search: '?challenge=demo', fetchImpl: service() })

    expect(result.current.needsNickname).toBe(true)
    expect(result.current.nickname).toBeNull()
    // ...prefilled, so re-claiming it is one tap rather than typing.
    expect(result.current.prefill).toBe('ada')
  })

  it('walks straight in when this browser holds a token for this challenge', () => {
    owning()

    const { result } = render({ search: '?challenge=demo', fetchImpl: service() })

    expect(result.current.needsNickname).toBe(false)
    expect(result.current.nickname).toBe('ada')
  })

  it('ignores a token map that has been edited into nonsense', () => {
    for (const raw of ['not json', '[]', '{"demo":{"nickname":"ada"}}', '{"demo":{"token":""}}']) {
      window.localStorage.setItem(STORAGE_KEYS.challengeTokens, raw)
      const { result, unmount } = render({ search: '?challenge=demo', fetchImpl: service() })

      expect(result.current.nickname).toBeNull()
      expect(result.current.needsNickname).toBe(true)
      unmount()
    }
  })

  it('refuses a name that normalises away', () => {
    const { result } = render({ search: '?challenge=demo', fetchImpl: service() })

    act(() => result.current.join('   '))

    expect(result.current.nickname).toBeNull()
    expect(result.current.needsNickname).toBe(true)
  })

  /** A link somebody sent is not consent to be listed; the board still reads. */
  it('lets the prompt be dismissed without leaving the challenge', () => {
    const { result } = render({ search: '?challenge=demo', fetchImpl: service() })

    act(() => result.current.dismissPrompt())

    expect(result.current.needsNickname).toBe(false)
    expect(result.current.active).toBe(true)
    expect(result.current.nickname).toBeNull()
  })
})

describe('scoring through a session', () => {
  const joined = async (fetchImpl: typeof fetch) => {
    owning()
    const rendered = render({ search: '?challenge=demo', fetchImpl })
    await waitFor(() => expect(rendered.result.current.status).toBe('ready'))

    return rendered
  }

  /** The acceptance case, from this side: no total is ever posted. */
  it('never sends a points total — only what happened, and when', async () => {
    const fetchImpl = service()
    const { result } = await joined(fetchImpl)

    act(() => {
      result.current.recordEvent({ kind: 'hit' })
      result.current.recordEvent({ kind: 'bonus', bonus: 'octaves' })
      result.current.recordEvent({ kind: 'miss' })
    })
    await act(async () => result.current.flushEvents())

    // A session first, then the batch. Neither body mentions a total.
    expect(bodyOf(fetchImpl, 1)).toEqual({ nickname: 'ada', config: CONFIG })
    expect(bodyOf(fetchImpl, 2)).toEqual({
      events: [
        { seq: 0, kind: 'hit', at: expect.any(Number) },
        { seq: 1, kind: 'bonus', bonus: 'octaves', at: expect.any(Number) },
        { seq: 2, kind: 'miss', at: expect.any(Number) },
      ],
    })
    for (const [, init] of fetchImpl.mock.calls) {
      expect(String(init?.body ?? '')).not.toContain('points')
    }
  })

  it('takes the board back from the server’s own arithmetic', async () => {
    const fetchImpl = service()
    const { result } = await joined(fetchImpl)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())

    expect(result.current.scores).toEqual([{ nickname: 'ada', points: 10 }])
  })

  it('sends the token on the mutations and never on the board’s GET', async () => {
    const fetchImpl = service()
    const { result } = await joined(fetchImpl)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())

    for (const [url, init] of fetchImpl.mock.calls) {
      const headers = (init?.headers ?? {}) as Record<string, string>
      expect(headers.Authorization).toBe(init?.method === 'POST' ? `Bearer ${TOKEN}` : undefined)
      // And never in the URL, where a proxy log would keep it forever.
      expect(url).not.toContain(TOKEN)
    }
  })

  it('opens one session for a run of events, not one per event', async () => {
    const fetchImpl = service()
    const { result } = await joined(fetchImpl)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())
    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())

    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/session'))).toHaveLength(1)
  })

  it('sends nothing when there is nothing queued', async () => {
    const fetchImpl = service()
    const { result } = await joined(fetchImpl)

    await act(async () => result.current.flushEvents())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('records nothing before anybody has said who they are', async () => {
    const fetchImpl = service()
    const { result } = render({ search: '?challenge=demo', fetchImpl })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('keeps a batch that never landed and sends it again next time', async () => {
    let failNext = true
    const inner = service()
    const fetchImpl = stubFetch(async (url, init) => {
      if (failNext && url.endsWith('/events')) {
        failNext = false
        throw new TypeError('Failed to fetch')
      }

      return inner(url, init)
    })

    const { result } = await joined(fetchImpl)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())
    expect(result.current.scores).toEqual([])

    await act(async () => result.current.flushEvents())
    expect(result.current.scores).toEqual([{ nickname: 'ada', points: 10 }])
  })

  /** A rejected session is not something to retry in a loop against. */
  it('falls back to read-only with a notice when the session has expired', async () => {
    const fetchImpl = stubFetch(async (path, init) => {
      if (init?.method !== 'POST') {
        return reply(board(['bo', 50]))
      }

      return path.endsWith('/session')
        ? reply({ sessionId: 's', expiresAt: 0 }, 201)
        : reply({ error: 'session_expired' }, 404)
    })

    const { result } = await joined(fetchImpl)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())

    expect(result.current.notice).toContain('expired')
    // Nothing is retried, and the board is still readable.
    const before = fetchImpl.mock.calls.length
    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(before)
    expect(result.current.scores).toEqual([{ nickname: 'bo', points: 50 }])
  })

  it('says so when this browser turns out not to own the name', async () => {
    const fetchImpl = stubFetch(async (_url, init) =>
      init?.method === 'POST' ? reply({ error: 'invalid_owner' }, 401) : reply(board()),
    )

    const { result } = await joined(fetchImpl)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())

    expect(result.current.notice).toContain('read-only')
  })

  it('says so when the board is rate-limiting this browser', async () => {
    const fetchImpl = stubFetch(async (_url, init) =>
      init?.method === 'POST' ? reply({ error: 'rate_limited' }, 429) : reply(board()),
    )

    const { result } = await joined(fetchImpl as unknown as ReturnType<typeof service>)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())

    expect(result.current.notice).toContain('Slow down')
  })

  /**
   * A reset starts a new tally, so it has to start a new session too — the
   * server one would otherwise go on accumulating under a score the player
   * believes they have put back to zero.
   */
  it('closes the session on end, and the next event opens a fresh one', async () => {
    const fetchImpl = service()
    const { result } = await joined(fetchImpl)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())
    await act(async () => result.current.endSession())

    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/finish'))).toBe(true)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.flushEvents())

    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/session'))).toHaveLength(2)
    // ...and the new one numbers its events from the beginning again.
    const last = fetchImpl.mock.calls.length - 1
    expect(bodyOf(fetchImpl, last).events[0].seq).toBe(0)
  })

  it('drops a queued run on end rather than posting it to a dead session', async () => {
    const fetchImpl = service()
    const { result } = await joined(fetchImpl)

    act(() => result.current.recordEvent({ kind: 'hit' }))
    await act(async () => result.current.endSession())

    // The queue was flushed on the way out, so it went up before the finish.
    const paths = fetchImpl.mock.calls.map(([url]) => url)
    expect(paths.filter((path) => path.endsWith('/events'))).toHaveLength(1)
    expect(paths[paths.length - 1]).toContain('/finish')
  })

  it('drops a response that arrives after the app is gone', async () => {
    let land: (response: Response) => void = () => undefined
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          land = resolve
        }),
    )

    const { unmount } = render({ search: '?challenge=demo', fetchImpl })
    unmount()

    // Resolving into an unmounted tree would be a React warning at best.
    await act(async () => land({ ok: true, status: 200, json: async () => board(['ada', 1]) } as unknown as Response))
  })
})

describe('keeping up with the room', () => {
  const settled = () => act(async () => undefined)

  it('reloads the board while the page is open, without anybody asking', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce({ ok: true, json: async () => board(['ada', 300]) } as unknown as Response)
      .mockResolvedValue({ ok: true, json: async () => board(['bo', 900], ['ada', 300]) } as unknown as Response)

    const { result } = render({ search: '?challenge=demo', fetchImpl })
    await settled()
    expect(result.current.scores).toEqual([{ nickname: 'ada', points: 300 }])

    // Somebody else has been playing in the meantime.
    await act(async () => void (await vi.advanceTimersByTimeAsync(SCOREBOARD_REFRESH_MS)))

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.current.scores).toEqual([
      { nickname: 'bo', points: 900 },
      { nickname: 'ada', points: 300 },
    ])
  })

  /** A phone in a pocket is not watching a board; it catches up when it is. */
  it('asks for nothing while the page is out of sight', async () => {
    vi.useFakeTimers()
    const fetchImpl = jsonFetch(board(['ada', 300]))
    render({ search: '?challenge=demo', fetchImpl })
    await settled()

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await act(async () => void (await vi.advanceTimersByTimeAsync(SCOREBOARD_REFRESH_MS * 3)))
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    hidden.mockReturnValue(false)
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does none of this off a challenge', async () => {
    vi.useFakeTimers()
    const fetchImpl = jsonFetch(board(['ada', 300]))
    render({ search: '', fetchImpl })

    await act(async () => void (await vi.advanceTimersByTimeAsync(SCOREBOARD_REFRESH_MS * 3)))

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
