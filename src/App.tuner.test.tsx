import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { detectPitch } from './lib/audio/pitch'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, STANDALONE_QUERY } from './hooks/useDisplayMode'
import { MIC_POLL_MS } from './hooks/useMicPitch'
import { installMatchMedia } from './test/matchMedia'
import { installGetUserMedia } from './test/fakeMic'
import { FAKE_CLOCKS } from './test/fakeTimers'

// Only the detector is faked. The arithmetic above it — nearest open string,
// cents, the note name — is the real one, so a test that names a string has to
// name it the way the app would from a real frequency.
vi.mock('./lib/audio/pitch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/audio/pitch')>()),
  detectPitch: vi.fn(() => null),
}))

/**
 * Records every call with whether the tuner was already on screen at the time,
 * which is what tells a call made from the click apart from one made later by
 * the panel's own effect.
 */
const { ensureContext } = vi.hoisted(() => ({ ensureContext: vi.fn<(panelOnScreen: boolean) => void>() }))

/** The App fake engine, plus the context the tuner hangs its analyser off. */
vi.mock('./lib/audio/engine', () => ({
  AudioEngine: class FakeAudioEngine {
    context = {
      sampleRate: 44100,
      // The capture watches this for the state iOS parks a context in.
      state: 'running',
      async resume() {},
      addEventListener() {},
      removeEventListener() {},
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
      ensureContext(document.querySelector('[data-testid="tuner-panel"]') !== null)
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

const PHONE_PORTRAIT = {
  [STANDALONE_QUERY]: true,
  [COARSE_POINTER_QUERY]: true,
  [LANDSCAPE_QUERY]: false,
}

/** A steady, perfectly-tuned A string. */
const playOpenA = () => {
  vi.mocked(detectPitch).mockReturnValue({ frequency: 110, clarity: 0.99 })
}

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

const click = async (testId: string) => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId))
  })
}

describe('tuning up', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS)
    ensureContext.mockClear()
    vi.mocked(detectPitch).mockReturnValue(null)
    window.localStorage.setItem('fretboard-setup-revealed', 'true')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'mediaDevices')
    Reflect.deleteProperty(window, 'matchMedia')
    document.documentElement.removeAttribute('data-stage')
    window.localStorage.clear()
  })

  it('asks for nothing until the tuner is opened', async () => {
    const getUserMedia = installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    expect(screen.queryByTestId('tuner-panel')).toBeNull()
    // Practice with the listen setting off still reaches no microphone API.
    await click('play-toggle')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('opens from the header and names the string it hears', async () => {
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await click('open-tuner')

    expect(screen.getByTestId('tuner-panel')).toBeInTheDocument()
    expect(screen.getByTestId('tuner-reading')).toHaveTextContent('Play a string.')

    playOpenA()
    await advance(MIC_POLL_MS)

    expect(screen.getByTestId('tuner-string')).toHaveTextContent('5th string')
    expect(screen.getByTestId('tuner-note')).toHaveTextContent('A2')
    expect(screen.getByTestId('tuner-reading')).toHaveTextContent('5th string A — in tune')
  })

  /**
   * Safari unlocks an audio context only inside the gesture that asked for one,
   * and an effect runs after the click that scheduled it has returned — so the
   * click opens the context and the panel awaits the one the click opened,
   * rather than asking for a second from a handler no gesture is behind.
   * Reopening asks again: a context suspended in between needs the new gesture.
   */
  it('opens the audio context from the click, not from the panel', async () => {
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    expect(ensureContext).not.toHaveBeenCalled()

    await click('open-tuner')

    // Asked for while the panel was still not on screen: the click made the
    // call, and the panel's effect — which runs a commit later — reused it.
    expect(ensureContext).toHaveBeenCalledTimes(1)
    expect(ensureContext).toHaveBeenCalledWith(false)

    await click('tuner-close')
    await click('open-tuner')
    expect(ensureContext).toHaveBeenCalledTimes(2)
  })

  it('gives the microphone back the moment it is closed', async () => {
    const track = { stop: vi.fn() }
    installGetUserMedia(async () => ({ getTracks: () => [track] }) as unknown as MediaStream)
    render(<App />)

    await click('open-tuner')
    expect(track.stop).not.toHaveBeenCalled()

    await click('tuner-close')

    expect(screen.queryByTestId('tuner-panel')).toBeNull()
    expect(track.stop).toHaveBeenCalled()
  })

  /**
   * Tuning up is a thing you do before you play, and a tuner listening through
   * the app's own clicks would be reading the metronome.
   */
  it('pauses playback on the way in', async () => {
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await click('play-toggle')
    expect(screen.getByTestId('play-toggle')).toHaveTextContent(/pause/i)

    await click('open-tuner')

    expect(screen.getByTestId('play-toggle')).not.toHaveTextContent(/pause/i)
  })

  it('opens from the practice sheet on the stand, and Escape closes only it', async () => {
    installMatchMedia(PHONE_PORTRAIT)
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await click('open-setup')
    const sheet = screen.getByTestId('practice-sheet')
    expect(sheet.querySelector('[data-testid="open-tuner"]')).not.toBeNull()

    await click('open-tuner')
    expect(screen.getByTestId('tuner-panel')).toBeInTheDocument()

    // The tuner traps on capture, so one press closes the tuner and leaves the
    // sheet it opened over exactly where it was.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(screen.queryByTestId('tuner-panel')).toBeNull()
    expect(screen.getByTestId('practice-sheet')).toBeInTheDocument()
  })
})
