import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, STANDALONE_QUERY } from './hooks/useDisplayMode'
import { SCOREBOARD_RAIL_QUERY } from './components/ScoreboardStrip'
import { STORAGE_KEYS } from './constants'
import { installMatchMedia } from './test/matchMedia'
import { FAKE_CLOCKS } from './test/fakeTimers'

vi.mock('./lib/audio/engine', () => ({
  AudioEngine: class FakeAudioEngine {
    context = {
      sampleRate: 44100,
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createAnalyser: () => ({
        fftSize: 0,
        smoothingTimeConstant: 1,
        getFloatTimeDomainData() {},
        connect() {},
        disconnect() {},
      }),
    }
    async ensureContext() {
      return this.context
    }
    getContext() {
      return this.context
    }
    async loadNoteBuffers() {}
    hasBuffers() {
      return true
    }
    getCurrentTime() {
      return performance.now() / 1000
    }
    isWithinCue() {
      return false
    }
    getCueEndForBeat() {
      return null
    }
    playClickAt() {}
    playNoteAt() {}
    playSessionEndChime() {}
    stopScheduledSounds() {}
  },
}))

const board = (...scores: Array<[string, number]>) => ({
  scores: scores.map(([nickname, points]) => ({ nickname, points })),
})

const TOKEN = 'a'.repeat(64)

/**
 * The app's own fetch, stubbed, answering each endpoint the way the real
 * service would: the board on a GET, a token on a claim, a session id, and a
 * running total the *server* worked out on a batch of events.
 */
const installFetch = (payload: unknown = board()) => {
  let total = 0
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    const reply = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body }) as unknown as Response

    if (init?.method !== 'POST') {
      return reply(payload)
    }

    if (path.endsWith('/nickname')) {
      return reply({ nickname: JSON.parse(String(init.body)).nickname, token: TOKEN }, 201)
    }

    if (path.endsWith('/session')) {
      return reply({ sessionId: 'session-1', expiresAt: 0 }, 201)
    }

    total += JSON.parse(String(init.body ?? '{}')).events?.length ?? 0
    return reply({ points: total, ...board(['ada', total]) })
  })
  vi.stubGlobal('fetch', fetchImpl)

  return fetchImpl
}

/**
 * A browser that already owns 'ada' on 'demo'. Membership is the *token*, not
 * the remembered name — seeding the name alone is a browser that still has to
 * claim, which is what the prompt test below is about.
 */
const owning = (challenge = 'demo', nickname = 'ada') => {
  window.localStorage.setItem(
    STORAGE_KEYS.challengeTokens,
    JSON.stringify({ [challenge]: { nickname, token: TOKEN } }),
  )
}

const installGetUserMedia = () => {
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })

  return getUserMedia
}

const PHONE_PORTRAIT = {
  [STANDALONE_QUERY]: true,
  [COARSE_POINTER_QUERY]: true,
  [LANDSCAPE_QUERY]: false,
}

/** A pointer-and-keyboard browser with the width the rail asks for. */
const DESKTOP = { [SCOREBOARD_RAIL_QUERY]: true }

const visit = (search: string) => window.history.replaceState({}, '', `/${search}`)

const renderApp = async () => {
  const rendered = render(<App />)
  // The board is loaded from an effect, so let it land before anything is read.
  await act(async () => {})

  return rendered
}

beforeEach(() => {
  window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
})

afterEach(() => {
  visit('')
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  Reflect.deleteProperty(window, 'matchMedia')
  document.documentElement.removeAttribute('data-stage')
  document.body.style.overflow = ''
})

describe('without ?challenge= in the URL', () => {
  it('has no scoreboard, no prompt, and touches neither the network nor the microphone', async () => {
    const fetchImpl = installFetch()
    const getUserMedia = installGetUserMedia()
    visit('?src=pwa')

    await renderApp()

    expect(screen.queryByTestId('scoreboard')).toBeNull()
    expect(screen.queryByTestId('nickname-prompt')).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(getUserMedia).not.toHaveBeenCalled()
    // The microphone setting is untouched, so the readout is off as ever.
    expect(screen.queryByTestId('mic-readout')).toBeNull()
  })

  it('is equally absent when the parameter is not a usable challenge name', async () => {
    const fetchImpl = installFetch()
    visit('?challenge=%20%20')

    await renderApp()

    expect(screen.queryByTestId('scoreboard')).toBeNull()
    expect(screen.queryByTestId('nickname-prompt')).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('arriving on a challenge', () => {
  beforeEach(() => {
    visit('?challenge=demo')
    installMatchMedia(DESKTOP)
  })

  /**
   * Scoring is what a shared board is a board of, so the permission is needed
   * either way — and asked for now rather than on top of the first note.
   */
  it('asks for the microphone straight away, before anybody has said who they are', async () => {
    installFetch()
    const getUserMedia = installGetUserMedia()

    await renderApp()

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('nickname-prompt')).toBeInTheDocument()
  })

  it('listens for the player whatever the stored setting says', async () => {
    installFetch()
    installGetUserMedia()
    window.localStorage.setItem(STORAGE_KEYS.micListen, 'false')

    await renderApp()

    expect(screen.getByTestId('mic-readout')).toBeInTheDocument()
    // The switch still reports the stored preference — it is the challenge that
    // is listening, not the setting.
    expect(document.getElementById('mic-listen')).toHaveAttribute('aria-checked', 'false')
  })

  it('shows the board that is already there, in a rail beside the note', async () => {
    installFetch(board(['ada', 300], ['bo', 120]))
    installGetUserMedia()

    await renderApp()

    const entries = document.querySelectorAll('.scoreboard-rail .scoreboard-entry')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('ada')
    expect(entries[0]).toHaveTextContent('300')
    // The stack the rail stands beside, rather than under.
    const stage = document.querySelector('.practice-stage')
    expect(Array.from(stage!.children).map((child) => child.className.split(' ')[0])).toEqual([
      'practice-stage-main',
      'scoreboard',
    ])
  })

  /** Folding it away is layout and nothing else — the board goes on polling. */
  it('folds the rail to a handle that survives a reload, per challenge', async () => {
    installFetch(board(['ada', 300]))
    installGetUserMedia()
    owning()

    const first = await renderApp()

    fireEvent.click(screen.getByTestId('scoreboard-hide'))
    expect(screen.getByTestId('scoreboard-handle')).toHaveAccessibleName(
      'Show the demo scoreboard — you are 1st with 300 points',
    )
    first.unmount()

    await renderApp()
    expect(screen.getByTestId('scoreboard-handle')).toBeInTheDocument()
    expect(screen.queryByTestId('scoreboard')).toBeNull()
  })

  it('reserves the name that was typed before joining under it', async () => {
    const fetchImpl = installFetch(board(['ada', 300]))
    installGetUserMedia()

    await renderApp()

    fireEvent.change(screen.getByTestId('nickname-input'), { target: { value: 'ada' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('nickname-submit'))
    })

    expect(screen.queryByTestId('nickname-prompt')).toBeNull()
    // The token is the membership; the bare name is only the next prefill.
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.challengeTokens) ?? '{}')).toEqual({
      demo: { nickname: 'ada', token: TOKEN },
    })
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeNickname)).toBe('ada')

    await waitFor(() => expect(document.querySelector('.scoreboard-entry[data-you="true"]')).not.toBeNull())
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('/api/scoreboard/demo/nickname')
    expect(init.method).toBe('POST')
  })

  it('says so, and does not join, when the name is already somebody else’s', async () => {
    installGetUserMedia()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? ({ ok: false, status: 409, json: async () => ({ error: 'nickname_taken' }) } as unknown as Response)
          : ({ ok: true, status: 200, json: async () => board(['ada', 300]) } as unknown as Response),
      ),
    )

    await renderApp()

    fireEvent.change(screen.getByTestId('nickname-input'), { target: { value: 'ada' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('nickname-submit'))
    })

    expect(screen.getByTestId('nickname-error')).toHaveTextContent('already has that name')
    expect(screen.getByTestId('nickname-prompt')).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeTokens)).toBeNull()
  })

  /** Having been on *a* board is not a credential for *this* one. */
  it('still asks a browser that has a remembered name but owns nothing here', async () => {
    installFetch()
    installGetUserMedia()
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')

    await renderApp()

    expect(screen.getByTestId('nickname-prompt')).toBeInTheDocument()
    // ...prefilled, so re-claiming it is a tap rather than typing.
    expect(screen.getByTestId('nickname-input')).toHaveValue('ada')
  })

  it('skips the prompt for a browser that already owns a name on this challenge', async () => {
    installFetch()
    installGetUserMedia()
    owning()

    await renderApp()

    expect(screen.queryByTestId('nickname-prompt')).toBeNull()
    expect(screen.getByTestId('scoreboard')).toBeInTheDocument()
  })

  it('keeps the board on screen for somebody who would rather not be listed', async () => {
    installFetch(board(['ada', 300]))
    installGetUserMedia()

    await renderApp()

    fireEvent.click(screen.getByTestId('nickname-dismiss'))

    expect(screen.queryByTestId('nickname-prompt')).toBeNull()
    expect(screen.getByTestId('scoreboard')).toBeInTheDocument()
    expect(document.querySelector('.scoreboard-entry[data-you="true"]')).toBeNull()
  })
})

describe('banking a session', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS)
    visit('?challenge=demo')
    installMatchMedia(DESKTOP)
    owning()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * The board is a board of what the *server* worked out. A pause posts what
   * happened — a session, then a batch of events — and never a total, which is
   * what stops a browser putting whatever number it likes on it.
   */
  it('posts what was played when practice is paused, and no total', async () => {
    const fetchImpl = installFetch(board(['ada', 0]))
    installGetUserMedia()

    render(<App />)
    await act(async () => {})

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-toggle'))
    })
    // Long enough for a note to be called and go by unplayed, which scores.
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-toggle'))
    })

    const posts = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>).filter(
      ([, init]) => init?.method === 'POST',
    )
    expect(posts.map(([url]) => url)).toEqual([
      '/api/scoreboard/demo/session',
      '/api/scoreboard/demo/session/session-1/events',
    ])

    const [, session] = posts[0]
    expect(JSON.parse(String(session.body))).toMatchObject({ nickname: 'ada', config: expect.any(Object) })
    const [, batch] = posts[1]
    const { events } = JSON.parse(String(batch.body))
    expect(events.length).toBeGreaterThan(0)
    expect(events[0]).toMatchObject({ seq: 0, kind: 'miss' })
    // The ownership token rides the header, never the body or the URL.
    expect((batch.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(String(batch.body)).not.toContain('points')
  })
})

describe('on the stand', () => {
  it('folds the board to one line between the mic readout and the transport', async () => {
    installFetch(board(['ada', 300]))
    installGetUserMedia()
    installMatchMedia(PHONE_PORTRAIT)
    visit('?challenge=demo')
    owning()

    await renderApp()

    const stage = document.querySelector('.stage')
    expect(stage).not.toBeNull()

    const order = Array.from(stage!.children).map((child) => child.className.split(' ')[0])
    expect(order).toEqual(['stage-hero', 'mic-readout', 'scoreboard', 'stage-foot'])

    // A stand has no column to give a rail, so the board is a strip and a
    // sheet — and the list is behind the tap rather than taking the screen.
    expect(screen.getByTestId('scoreboard-summary')).toHaveTextContent('you #1 · 300')
    expect(document.querySelectorAll('.scoreboard-entry')).toHaveLength(0)

    fireEvent.click(screen.getByTestId('scoreboard-summary'))
    expect(document.querySelectorAll('.scoreboard-sheet .scoreboard-entry')).toHaveLength(1)

    fireEvent.click(screen.getByTestId('scoreboard-sheet-close'))
    expect(screen.queryByTestId('scoreboard-sheet')).toBeNull()
    expect(screen.getByTestId('scoreboard-summary')).toBeInTheDocument()
  })

  it('has no board at all off a challenge, so the stand layout is what it was', async () => {
    installFetch()
    installGetUserMedia()
    installMatchMedia(PHONE_PORTRAIT)
    visit('')

    await renderApp()

    expect(document.querySelector('.stage')).not.toBeNull()
    expect(screen.queryByTestId('scoreboard')).toBeNull()
  })
})
