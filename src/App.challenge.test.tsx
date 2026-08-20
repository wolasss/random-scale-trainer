import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, STANDALONE_QUERY } from './hooks/useDisplayMode'
import { STORAGE_KEYS } from './constants'

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

/** The app's own fetch, stubbed. Every call answers with the same board. */
const installFetch = (payload: unknown = board()) => {
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => payload }) as unknown as Response)
  vi.stubGlobal('fetch', fetchImpl)

  return fetchImpl
}

const installGetUserMedia = () => {
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })

  return getUserMedia
}

/** jsdom's own matchMedia always says false, which is the desktop reading. */
const installMatchMedia = (matching: Record<string, boolean>) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: matching[query] ?? false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}

const PHONE_PORTRAIT = {
  [STANDALONE_QUERY]: true,
  [COARSE_POINTER_QUERY]: true,
  [LANDSCAPE_QUERY]: false,
}

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
  beforeEach(() => visit('?challenge=demo'))

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

  it('shows the board that is already there', async () => {
    installFetch(board(['ada', 300], ['bo', 120]))
    installGetUserMedia()

    await renderApp()

    const entries = document.querySelectorAll('.scoreboard-entry')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('ada')
    expect(entries[0]).toHaveTextContent('300')
  })

  it('joins under the name that was typed and remembers it', async () => {
    const fetchImpl = installFetch(board(['ada', 300]))
    installGetUserMedia()

    await renderApp()

    fireEvent.change(screen.getByTestId('nickname-input'), { target: { value: 'ada' } })
    fireEvent.click(screen.getByTestId('nickname-submit'))

    expect(screen.queryByTestId('nickname-prompt')).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEYS.challengeNickname)).toBe('ada')

    await waitFor(() => expect(document.querySelector('.scoreboard-entry[data-you="true"]')).not.toBeNull())
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('skips the prompt for a browser that has been on a challenge before', async () => {
    installFetch()
    installGetUserMedia()
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')

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
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    })
    visit('?challenge=demo')
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('puts the tally on the board when practice is paused', async () => {
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

    // One load and one submit. The tally is whatever the session earned; what
    // matters here is that a pause is what sends it.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('/api/scoreboard/demo')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ nickname: 'ada' })
  })
})

describe('on the stand', () => {
  it('puts the board between the mic readout and the transport', async () => {
    installFetch(board(['ada', 300]))
    installGetUserMedia()
    installMatchMedia(PHONE_PORTRAIT)
    visit('?challenge=demo')
    window.localStorage.setItem(STORAGE_KEYS.challengeNickname, 'ada')

    await renderApp()

    const stage = document.querySelector('.stage')
    expect(stage).not.toBeNull()

    const order = Array.from(stage!.children).map((child) => child.className.split(' ')[0])
    expect(order).toEqual(['stage-hero', 'mic-readout', 'scoreboard', 'stage-foot'])
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
