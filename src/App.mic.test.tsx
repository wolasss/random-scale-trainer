import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { detectPitch } from './lib/audio/pitch'
import { FAKE_CLOCKS } from './test/fakeTimers'

// Only the detector is faked; the frequency-to-pitch-class arithmetic under it
// is the real one, so a test that names a note has to name it the way the app
// would from a real frequency.
vi.mock('./lib/audio/pitch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/audio/pitch')>()),
  detectPitch: vi.fn(() => null),
}))

/**
 * The same fake engine the other App suites use, plus the three methods the
 * microphone reads: a context to hang the analyser off, the clock, and the cue
 * intervals that keep the app from hearing itself.
 */
vi.mock('./lib/audio/engine', () => ({
  AudioEngine: class FakeAudioEngine {
    context = {
      sampleRate: 44100,
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

/** The one control, pressed again: the same button is the pause. */
const pause = start

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

// Default 72 BPM, four beats to a note. Far enough in that a note is on screen
// with most of its span still ahead of it.
const BEAT_MS = 60_000 / 72
const NOTE_MS = 4 * BEAT_MS
const INTO_A_NOTE_MS = NOTE_MS + 100
// With the count-in on, the first note lands a beat after the fourth count.
const COUNT_IN_MS = 4 * BEAT_MS

/** The named pitch class, played in the fourth octave. */
const play = (pitchClass: number) => {
  vi.mocked(detectPitch).mockReturnValue({
    frequency: 440 * 2 ** ((60 + pitchClass - 69) / 12),
    clarity: 0.99,
  })
}

const hush = () => vi.mocked(detectPitch).mockReturnValue(null)

/** Pitch class of whatever the app is calling right now, from its own glyph. */
const calledPitchClass = () => {
  const glyph = screen.getByTestId('current-note').textContent ?? ''
  const natural = 'C.D.EF.G.A.B'.indexOf(glyph[0])

  return natural + (glyph.includes('♯') ? 1 : glyph.includes('♭') ? -1 : 0)
}

describe('listening for the player', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS)
    hush()
    // Past the first run, so the setup cards (and the switch) are on the page.
    window.localStorage.setItem('fretboard-setup-revealed', 'true')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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

  /**
   * A setting stored by a browser that could listen, carried to one that
   * cannot: the switch is the only thing that may speak for it, so the readout
   * the user has no way to dismiss must not be on the page at all.
   */
  it('stays off everywhere where the browser has no microphone API', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    render(<App />)

    expect(document.getElementById('mic-listen')).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByTestId('mic-readout')).toBeNull()

    await start()

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

  /**
   * On the default 'mixed' spelling the call is a coin flip between E♭ and D♯,
   * and a readout that flips it again reads as a wrong note to the player who
   * just played the right one. The coin is loaded here to the side the readout
   * would not have picked on its own.
   */
  it('names what it heard the way the note was called', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    // One pitch class, spelled by the coin flip 'mixed' makes on every call.
    window.localStorage.setItem('fretboard-note-pool', '3')
    // A one-note pool ends a cycle on every note, and a count-in between them
    // would put a stretch with no note called in the middle of the test.
    window.localStorage.setItem('fretboard-count-in', 'false')
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    await advance(INTO_A_NOTE_MS)

    expect(screen.getByTestId('current-note')).toHaveTextContent('E♭')
    play(calledPitchClass())
    await advance(100)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('E♭')
    expect(screen.getByTestId('heard-note')).not.toHaveTextContent('D♯')
  })

  it('marks the wrong note wrong and the right note right', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    window.localStorage.setItem('fretboard-note-pool', '3')
    window.localStorage.setItem('fretboard-count-in', 'false')
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    await advance(INTO_A_NOTE_MS)

    const called = calledPitchClass()
    play(called + 2)
    await advance(100)
    expect(screen.getByTestId('heard-note')).toHaveAttribute('data-match', 'false')

    play(called)
    await advance(100)
    expect(screen.getByTestId('heard-note')).toHaveAttribute('data-match', 'true')
  })

  /**
   * A one-note pool ends a cycle on every note, so the count-in runs between
   * every round — the same stretch a full pool gets once a cycle. There is no
   * note on screen through it, and a reading standing there answers nothing.
   */
  it('clears the reading through the count-in between rounds', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    window.localStorage.setItem('fretboard-note-pool', '3')
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    // The first count-in, then far enough into the note that it is on screen.
    await advance(COUNT_IN_MS + 200)

    play(calledPitchClass())
    await advance(100)
    expect(screen.getByTestId('heard-note')).toHaveAttribute('data-match', 'true')

    // Into the count-in for the next round, still playing the note.
    await advance(NOTE_MS)

    expect(screen.getByTestId('heard-note')).toHaveTextContent('nothing yet')
    expect(screen.getByTestId('heard-note')).not.toHaveAttribute('data-match')
  })

  it('scores nothing anywhere while the setting is off', async () => {
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    await advance(INTO_A_NOTE_MS)
    play(calledPitchClass())
    await advance(NOTE_MS)

    expect(screen.queryByTestId('score-play')).toBeNull()
    expect(screen.queryByTestId('score-points')).toBeNull()
  })

  it('scores the note that was played while it is still the note on screen', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    window.localStorage.setItem('fretboard-note-pool', '3')
    window.localStorage.setItem('fretboard-count-in', 'false')
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    // Nothing to report before a note has been judged.
    expect(screen.queryByTestId('score-play')).toBeNull()

    // The first note goes by unplayed, so the second one is called with a miss
    // already on the board — which is what makes the hit below visible as a
    // change rather than as a first reading.
    await advance(INTO_A_NOTE_MS)
    expect(screen.getByTestId('score-points')).toHaveTextContent('0')
    expect(screen.queryByTestId('score-delta')).toBeNull()

    const called = screen.getByTestId('current-note').textContent
    play(calledPitchClass())
    // Enough for the window to open past the cue and for two frames to confirm.
    await advance(300)

    // The reading is about the note still being called, not the one before it.
    expect(screen.getByTestId('current-note')).toHaveTextContent(called!)
    expect(screen.getByTestId('heard-note')).toHaveAttribute('data-match', 'true')

    // One note has scored, so what it earned is the whole of the total beside
    // it — whatever the settings priced this pool and tempo at.
    const total = screen.getByTestId('score-points').textContent
    expect(Number(total)).toBeGreaterThan(0)
    expect(screen.getByTestId('score-delta')).toHaveTextContent(`+${total}`)
  })

  /** Three readings while playing, and the accuracy is not one of them. */
  it('keeps the session accuracy off the row until there is a pause to read it in', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    window.localStorage.setItem('fretboard-note-pool', '3')
    window.localStorage.setItem('fretboard-count-in', 'false')
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    await advance(INTO_A_NOTE_MS)
    play(calledPitchClass())
    await advance(300)

    expect(screen.queryByTestId('score-tally')).toBeNull()
    expect(screen.queryByTestId('score-summary')).toBeNull()

    await pause()

    expect(screen.queryByTestId('score-play')).toBeNull()
    expect(screen.getByTestId('score-summary')).toHaveTextContent('Paused — how it’s going')
    expect(screen.getByTestId('score-tally')).toHaveTextContent('50%')
    expect(screen.getByTestId('score-summary')).toHaveTextContent('1 of 2 hit')
  })

  it('scores a miss for a note that came and went unplayed', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    window.localStorage.setItem('fretboard-note-pool', '3')
    window.localStorage.setItem('fretboard-count-in', 'false')
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    // One whole note span with the guitar silent, and into the next call.
    await advance(INTO_A_NOTE_MS)

    // A miss earns nothing, so the play row has nothing to add beside the
    // total — it is the pause that says how many notes went by unanswered.
    expect(screen.getByTestId('score-points')).toHaveTextContent('0')
    expect(screen.queryByTestId('score-delta')).toBeNull()

    await pause()

    expect(screen.getByTestId('score-tally')).toHaveTextContent('0%')
    expect(screen.getByTestId('score-summary')).toHaveTextContent('0 of 1 hit')
  })

  /**
   * Off a challenge there is no board, so the summary has nothing to nudge
   * about — the whole feature stays invisible to everybody not invited to one.
   */
  it('leaves the board line out of a summary with no challenge behind it', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    window.localStorage.setItem('fretboard-note-pool', '3')
    window.localStorage.setItem('fretboard-count-in', 'false')
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    await advance(INTO_A_NOTE_MS)
    await pause()

    expect(screen.getByTestId('score-summary')).not.toBeNull()
    expect(screen.queryByTestId('score-nudge')).toBeNull()
  })

  it('holds the note it heard until the next one is called', async () => {
    window.localStorage.setItem('fretboard-mic-listen', 'true')
    window.localStorage.setItem('fretboard-note-pool', '3')
    window.localStorage.setItem('fretboard-count-in', 'false')
    installGetUserMedia(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream)
    render(<App />)

    await start()
    await advance(INTO_A_NOTE_MS)

    play(calledPitchClass())
    await advance(100)
    const heard = screen.getByTestId('heard-note').textContent

    // The string decays out of the detector long before the note is over. The
    // reading is the answer to a note still on screen, so it stays with it.
    hush()
    await advance(NOTE_MS / 2)
    expect(screen.getByTestId('heard-note')).toHaveTextContent(heard!)

    // ...and goes when the question does.
    await advance(NOTE_MS)
    expect(screen.getByTestId('heard-note')).toHaveTextContent('nothing yet')
  })
})
