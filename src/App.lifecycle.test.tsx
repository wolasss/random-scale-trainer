import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { HIDDEN_STOP_MS, PLAYBACK_MESSAGES } from './constants'
import { installMatchMedia } from './test/matchMedia'
import { FAKE_CLOCKS_AND_FRAMES } from './test/fakeTimers'
import { FakeAudioEngine } from './test/fakeAudioEngine'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

/** jsdom's visibilityState is a getter, so it is replaced rather than assigned. */
const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

// Default 72 BPM → 0.833s beats; count-in is 4 beats starting 50ms in.
const COUNT_IN_MS = 4 * (60_000 / 72) + 100

const startPlaying = async () => {
  fireEvent.click(screen.getByTestId('play-toggle'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 200)
  })
}

describe('App background lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS_AND_FRAMES)
    installMatchMedia({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    Reflect.deleteProperty(document, 'visibilityState')
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('keeps clicking just under the limit, stops with the pocket message at it', async () => {
    render(<App />)
    await startPlaying()

    setVisibility('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HIDDEN_STOP_MS - 1_000)
    })

    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')
    expect(screen.getByTestId('now-playing').className).toContain('active')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.hiddenTooLong)
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')
    expect(screen.getByTestId('now-playing').className).toContain('idle')
  })

  it('does not arm the timer while the transport is idle', async () => {
    render(<App />)

    setVisibility('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HIDDEN_STOP_MS * 2)
    })
    setVisibility('visible')

    expect(screen.getByTestId('playback-message')).toHaveTextContent(PLAYBACK_MESSAGES.idle)
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')
  })

  it('coming back to visible while playing resumes the audio clock and leaves the transport playing', async () => {
    const ensureContext = vi.spyOn(FakeAudioEngine.prototype, 'ensureContext')

    render(<App />)
    await startPlaying()

    setVisibility('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HIDDEN_STOP_MS / 2)
    })

    const callsBeforeReturn = ensureContext.mock.calls.length
    setVisibility('visible')
    expect(ensureContext.mock.calls.length).toBe(callsBeforeReturn + 1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')
    expect(screen.getByTestId('playback-message')).not.toHaveTextContent(PLAYBACK_MESSAGES.hiddenTooLong)
  })
})
