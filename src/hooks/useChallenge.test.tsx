import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useChallenge } from './useChallenge'
import { STORAGE_KEYS } from '../constants'

const board = (...scores: Array<[string, number]>) => ({
  scores: scores.map(([nickname, points]) => ({ nickname, points })),
})

const jsonFetch = (payload: unknown) =>
  vi.fn(async () => ({ ok: true, json: async () => payload }) as unknown as Response)

/** The body a fetch spy was called with, parsed. The spy takes no declared
 * arguments, so the recorded call has to be read back as the pair it really is. */
const bodyOf = (fetchImpl: ReturnType<typeof jsonFetch>, call: number) =>
  JSON.parse(String((fetchImpl.mock.calls[call] as unknown as [string, RequestInit])[1].body))

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('off a challenge', () => {
  it('does nothing at all — which is the whole of "the feature is disabled"', async () => {
    const fetchImpl = jsonFetch(board(['ada', 300]))

    const { result } = renderHook(() => useChallenge({ search: '?src=pwa', fetchImpl }))

    expect(result.current.active).toBe(false)
    expect(result.current.name).toBeNull()
    expect(result.current.needsNickname).toBe(false)
    expect(result.current.status).toBe('off')
    expect(result.current.scores).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never reads or writes the stored nickname', async () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')
    const fetchImpl = jsonFetch(board())

    const { result } = renderHook(() => useChallenge({ search: '', fetchImpl }))

    expect(result.current.nickname).toBeNull()
    act(() => result.current.join('bo'))
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeNickname)).toBe('ada')
  })

  it('sends nothing when a session is banked', () => {
    const fetchImpl = jsonFetch(board())
    const { result } = renderHook(() => useChallenge({ search: '', fetchImpl }))

    act(() => result.current.submit(500))

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('on a challenge', () => {
  it('loads the board on mount', async () => {
    const fetchImpl = jsonFetch(board(['ada', 300], ['bo', 100]))

    const { result } = renderHook(() => useChallenge({ search: '?challenge=demo', fetchImpl }))

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

    const { result } = renderHook(() => useChallenge({ search: '?challenge=demo', fetchImpl }))

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.scores).toEqual([])
  })

  it('asks for a nickname when nothing is stored, and remembers the one it is given', async () => {
    const fetchImpl = jsonFetch(board())
    const { result } = renderHook(() => useChallenge({ search: '?challenge=demo', fetchImpl }))

    expect(result.current.needsNickname).toBe(true)

    act(() => result.current.join('  Ada  Lovelace  '))

    expect(result.current.needsNickname).toBe(false)
    // Normalised on the way in, exactly as it will appear on the board.
    expect(result.current.nickname).toBe('Ada Lovelace')
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeNickname)).toBe('Ada Lovelace')
  })

  it('skips the prompt when this browser has been on a challenge before', () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')

    const { result } = renderHook(() =>
      useChallenge({ search: '?challenge=demo', fetchImpl: jsonFetch(board()) }),
    )

    expect(result.current.needsNickname).toBe(false)
    expect(result.current.nickname).toBe('ada')
  })

  it('refuses a name that normalises away', () => {
    const { result } = renderHook(() =>
      useChallenge({ search: '?challenge=demo', fetchImpl: jsonFetch(board()) }),
    )

    act(() => result.current.join('   '))

    expect(result.current.nickname).toBeNull()
    expect(result.current.needsNickname).toBe(true)
  })

  /** A link somebody sent is not consent to be listed; the board still reads. */
  it('lets the prompt be dismissed without leaving the challenge', () => {
    const { result } = renderHook(() =>
      useChallenge({ search: '?challenge=demo', fetchImpl: jsonFetch(board()) }),
    )

    act(() => result.current.dismissPrompt())

    expect(result.current.needsNickname).toBe(false)
    expect(result.current.active).toBe(true)
    expect(result.current.nickname).toBeNull()
  })
})

describe('submitting', () => {
  const joined = async (fetchImpl: ReturnType<typeof jsonFetch>) => {
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')
    const rendered = renderHook(() => useChallenge({ search: '?challenge=demo', fetchImpl }))
    await waitFor(() => expect(rendered.result.current.status).toBe('ready'))

    return rendered
  }

  it('posts the tally and takes the board back from the answer', async () => {
    const fetchImpl = jsonFetch(board(['ada', 300]))
    const { result } = await joined(fetchImpl)

    await act(async () => result.current.submit(300))

    expect(bodyOf(fetchImpl, 1)).toEqual({ nickname: 'ada', points: 300 })
    expect(result.current.scores).toEqual([{ nickname: 'ada', points: 300 }])
  })

  /** A pause is something people do often, and every one of them calls this. */
  it('sends nothing for a tally that has not grown', async () => {
    const fetchImpl = jsonFetch(board(['ada', 300]))
    const { result } = await joined(fetchImpl)

    await act(async () => result.current.submit(300))
    await act(async () => result.current.submit(300))
    await act(async () => result.current.submit(120))

    // One load, one submit, and nothing for the two that changed nothing.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('sends the rise when the session goes past its own best', async () => {
    const fetchImpl = jsonFetch(board(['ada', 500]))
    const { result } = await joined(fetchImpl)

    await act(async () => result.current.submit(300))
    await act(async () => result.current.submit(500))

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(bodyOf(fetchImpl, 2)).toEqual({ nickname: 'ada', points: 500 })
  })

  it('sends nothing before anybody has said who they are', async () => {
    const fetchImpl = jsonFetch(board())
    const { result } = renderHook(() => useChallenge({ search: '?challenge=demo', fetchImpl }))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => result.current.submit(300))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('tries again after a submit that never landed', async () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce({ ok: true, json: async () => board() } as unknown as Response)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => board(['ada', 300]) } as unknown as Response)

    const { result } = renderHook(() => useChallenge({ search: '?challenge=demo', fetchImpl }))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => result.current.submit(300))
    expect(result.current.status).toBe('unavailable')

    await act(async () => result.current.submit(300))

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.current.scores).toEqual([{ nickname: 'ada', points: 300 }])
  })

  it('leaves the board where it is when a refresh fails, rather than blanking it', async () => {
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce({ ok: true, json: async () => board(['bo', 100]) } as unknown as Response)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const { result } = renderHook(() => useChallenge({ search: '?challenge=demo', fetchImpl }))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => result.current.submit(300))

    expect(result.current.status).toBe('unavailable')
    expect(result.current.scores).toEqual([{ nickname: 'bo', points: 100 }])
  })

  it('drops a response that arrives after the app is gone', async () => {
    let land: (response: Response) => void = () => undefined
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          land = resolve
        }),
    )

    const { unmount } = renderHook(() => useChallenge({ search: '?challenge=demo', fetchImpl }))
    unmount()

    // Resolving into an unmounted tree would be a React warning at best.
    await act(async () => land({ ok: true, json: async () => board(['ada', 1]) } as unknown as Response))
  })
})
