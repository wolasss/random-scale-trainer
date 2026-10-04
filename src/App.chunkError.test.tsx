import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SCOREBOARD_RAIL_QUERY, STORAGE_KEYS } from './constants'
import { allowConsole } from './test/consoleGuard'
import { installMatchMedia } from './test/matchMedia'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

// Stands in for a new build having activated in this tab: the old bundle's
// import of the hashed chunk 404s, the same as `NicknamePrompt`/`ScoreboardStrip`
// missing from the cache would.
vi.mock('./components/NicknamePrompt', () => {
  throw new Error('nickname chunk missing after a new build')
})

vi.mock('./components/ScoreboardStrip', () => {
  throw new Error('scoreboard chunk missing after a new build')
})

const TOKEN = 'a'.repeat(64)

const board = (...scores: Array<[string, number]>) => ({
  scores: scores.map(([nickname, points]) => ({ nickname, points })),
})

const installFetch = (payload: unknown = board()) => {
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

    return reply({ points: 0, ...board() })
  })
  vi.stubGlobal('fetch', fetchImpl)

  return fetchImpl
}

const owning = (challenge = 'demo', nickname = 'ada') => {
  window.localStorage.setItem(
    STORAGE_KEYS.challengeTokens,
    JSON.stringify({ [challenge]: { nickname, token: TOKEN } }),
  )
}

const installGetUserMedia = () => {
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop() {}, addEventListener() {}, removeEventListener() {} }] }) as unknown as MediaStream)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })

  return getUserMedia
}

const DESKTOP = { [SCOREBOARD_RAIL_QUERY]: true }

const visit = (search: string) => window.history.replaceState({}, '', `/${search}`)

const renderApp = async () => {
  const rendered = render(<App />)
  await act(async () => {})

  return rendered
}

beforeEach(() => {
  window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
  installMatchMedia(DESKTOP)
})

afterEach(() => {
  visit('')
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('a challenge chunk failing to load', () => {
  it('still lets a session start when the nickname prompt chunk fails', async () => {
    allowConsole('error')
    installFetch()
    installGetUserMedia()
    visit('?challenge=demo')

    await renderApp()

    // Without a saved token the scoreboard mounts alongside the prompt, and
    // its chunk is stubbed to fail the same way, so both slots show a notice.
    for (const alert of await screen.findAllByRole('alert')) {
      expect(alert).toHaveTextContent("couldn’t load")
    }

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-toggle'))
    })
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')
  })

  it('still lets a session start when the scoreboard chunk fails', async () => {
    allowConsole('error')
    installFetch(board(['ada', 300]))
    installGetUserMedia()
    owning()
    visit('?challenge=demo')

    await renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent("couldn’t load")

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-toggle'))
    })
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')
  })
})
