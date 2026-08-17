import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

/**
 * The same fake engine the other App suites use, plus the three methods the
 * microphone reads: a context to hang the analyser off, the clock, and the cue
 * intervals that keep the app from hearing itself.
 */
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

const installGetUserMedia = (getUserMedia: () => Promise<MediaStream>) => {
  const spy = vi.fn(getUserMedia)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: spy },
  })

  return spy
}

const start = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('play-toggle'))
  })
}

describe('listening for the player', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    })
    // Past the first run, so the setup cards (and the switch) are on the page.
    window.localStorage.setItem('fretboard-setup-revealed', 'true')
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'mediaDevices')
  })

  it('asks for nothing and shows nothing while the setting is off', async () => {
    const getUserMedia = installGetUserMedia(async () => ({}) as MediaStream)
    render(<App />)

    expect(document.getElementById('mic-listen')).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByTestId('mic-readout')).toBeNull()

    await start()

    // A practice session on the defaults must never reach a microphone API.
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(screen.queryByTestId('mic-readout')).toBeNull()
  })

  it('says the microphone is blocked when the browser refuses it', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    const getUserMedia = installGetUserMedia(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    })

    render(<App />)

    expect(document.getElementById('mic-listen')).toHaveAttribute('aria-checked', 'true')
    // Nothing is asked for until practice is actually running.
    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Listening starts with playback.')
    expect(getUserMedia).not.toHaveBeenCalled()

    await start()

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('mic-readout')).toHaveTextContent('Mic blocked')
  })

  it('turns the readout on and off with the switch', async () => {
    installGetUserMedia(async () => ({}) as MediaStream)
    render(<App />)

    fireEvent.click(document.getElementById('mic-listen')!)
    expect(screen.getByTestId('mic-readout')).not.toBeNull()
    expect(window.localStorage.getItem('fretboard-mic-listen')).toBe('true')

    fireEvent.click(document.getElementById('mic-listen')!)
    expect(screen.queryByTestId('mic-readout')).toBeNull()
  })
})
