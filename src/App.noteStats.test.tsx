import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'
import { detectPitch } from './lib/audio/pitch'
import { FAKE_CLOCKS } from './test/fakeTimers'

// Only the detector is faked; the frequency-to-pitch-class arithmetic under it
// is the real one, exactly as in App.mic.test.tsx.
vi.mock('./lib/audio/pitch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/audio/pitch')>()),
  detectPitch: vi.fn(() => null),
}))

// The shared fake engine, plus the slice the microphone reads off it: a context
// to hang the analyser on, and the cue intervals that keep the app from
// scoring its own spoken note.
vi.mock('./lib/audio/engine', async () => {
  const { FakeAudioEngine } = await import('./test/fakeAudioEngine')

  return {
    AudioEngine: class MicFakeAudioEngine extends FakeAudioEngine {
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
      isWithinCue() {
        return false
      }
      getCueEndForBeat(): number | null {
        return null
      }
    },
  }
})

const installGetUserMedia = () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream) },
  })
}

const start = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('play-toggle'))
  })
}

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

const BEAT_MS = 60_000 / 72
const INTO_A_NOTE_MS = 4 * BEAT_MS + 100

/** The named pitch class, played in the fourth octave. */
const play = (pitchClass: number) => {
  vi.mocked(detectPitch).mockReturnValue({
    frequency: 440 * 2 ** ((60 + pitchClass - 69) / 12),
    clarity: 0.99,
  })
}

const hush = () => vi.mocked(detectPitch).mockReturnValue(null)

/** A stored record: `[scored, hits, responseMsTotal]` per pitch class. */
const seedStats = (entries: Record<number, [number, number, number]>) => {
  window.localStorage.setItem(
    STORAGE_KEYS.noteStats,
    JSON.stringify(Array.from({ length: 12 }, (_, pc) => entries[pc] ?? [0, 0, 0])),
  )
}

const pressedChips = () =>
  Array.from({ length: 12 }, (_, pc) => pc).filter(
    (pc) => screen.getByTestId(`note-chip-${pc}`).getAttribute('aria-pressed') === 'true',
  )

describe('note strengths', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS)
    hush()
    // Past the first run, so the setup cards are on the page.
    window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'mediaDevices')
    window.localStorage.clear()
  })

  it('is not on the page for a browser that has never listened', () => {
    render(<App />)

    expect(screen.queryByTestId('note-stats-card')).toBeNull()
  })

  it('keeps the note that was played', async () => {
    window.localStorage.setItem(STORAGE_KEYS.micListen, 'true')
    // One pitch class, and no count-in between rounds to sit through.
    window.localStorage.setItem(STORAGE_KEYS.notePool, '3')
    window.localStorage.setItem(STORAGE_KEYS.countIn, 'false')
    // One name per note, so the row reads the same on every run.
    window.localStorage.setItem(STORAGE_KEYS.spelling, 'flat')
    installGetUserMedia()
    render(<App />)

    expect(screen.getByTestId('note-stat-3')).toHaveTextContent('E♭ · not practised yet')

    await start()
    // The first call goes by in silence, so it closes as a miss...
    await advance(INTO_A_NOTE_MS)

    expect(screen.getByTestId('note-stat-3')).toHaveTextContent('E♭ · 1 note · no hits yet')

    // ...and the next one is held long enough to be one note rather than a
    // fluke frame, which is the sustain a hit needs.
    play(3)
    await advance(200)

    expect(screen.getByTestId('note-stat-3')).toHaveTextContent('50%')
    expect(screen.getByTestId('note-stat-3')).toHaveTextContent('E♭ · 2 notes ·')
    // ...and it outlives the tab it was played in.
    expect(window.localStorage.getItem(STORAGE_KEYS.noteStats)).toContain('[2,1,')
  })

  it('loads the weakest notes into the chips', async () => {
    // D♭ never found, F♯ found once in four: both below everything else, and
    // both worse than the C that is already in the pool.
    seedStats({ 1: [3, 0, 0], 6: [4, 1, 700], 0: [4, 4, 2000] })
    render(<App />)

    expect(screen.getByTestId('note-stats-card')).not.toBeNull()
    expect(pressedChips()).toHaveLength(12)

    await act(async () => {
      fireEvent.click(screen.getByTestId('note-stats-drill'))
    })

    expect(pressedChips()).toEqual([0, 1, 6])
  })

  it('takes two presses to forget the record', async () => {
    seedStats({ 1: [3, 0, 0] })
    window.localStorage.setItem(STORAGE_KEYS.micListen, 'true')
    window.localStorage.setItem(STORAGE_KEYS.spelling, 'flat')
    installGetUserMedia()
    render(<App />)

    const reset = screen.getByTestId('note-stats-reset')
    await act(async () => {
      fireEvent.click(reset)
    })

    expect(screen.getByTestId('note-stat-1')).toHaveTextContent('0%')
    expect(reset).toHaveAccessibleName('Reset? Press again to confirm')

    await act(async () => {
      fireEvent.click(reset)
    })

    expect(screen.getByTestId('note-stat-1')).toHaveTextContent('D♭ · not practised yet')
    expect(window.localStorage.getItem(STORAGE_KEYS.noteStats)).toBeNull()
  })
})
