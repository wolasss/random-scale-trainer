/**
 * One number, checked from both ends.
 *
 * The readout under the play button and the row on the shared board are worked
 * out twice — once in src/lib/scoring.ts from what the microphone heard, and
 * once in src/server/session-scoring.js from the events that were reported —
 * and a player reads them side by side. session-scoring.test.ts holds the two
 * pricing functions to each other; this holds the two *totals* to each other,
 * over a session played through the real app against the real service, which is
 * the only place a difference in what is reported rather than in how it is
 * priced can show up at all.
 *
 * Deliberately played under settings that are not the flat rate on any factor:
 * mixed spelling, the fretboard put away, a tempo above the default and a pool
 * narrower than the octave. A parity test at ×1 would pass with the multiplier
 * missing from either end, which is exactly the bug this file exists to catch.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { detectPitch } from './lib/audio/pitch'
import { STORAGE_KEYS } from './constants'
import { PRACTICE_MILESTONES } from './lib/scoring'
import { FAKE_CLOCKS } from './test/fakeTimers'
import { createStore, handleRequest, topScores } from './server/scoreboard.js'

vi.mock('./lib/audio/pitch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/audio/pitch')>()),
  detectPitch: vi.fn(() => null),
}))

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

const NICKNAME = 'Ada'
const CHALLENGE = 'demo'
const BPM = 96

/** The service itself, behind the app's `fetch`. Nothing about it is faked. */
const installServer = () => {
  const store = createStore()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const answer = handleRequest(store, {
        method: init?.method ?? 'GET',
        pathname: new URL(String(url), 'http://localhost').pathname,
        body: typeof init?.body === 'string' ? init.body : '',
        headers: Object.fromEntries(
          Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [
            key.toLowerCase(),
            value,
          ]),
        ),
        client: 'parity-test',
      })

      return { ok: answer.status < 400, status: answer.status, json: async () => answer.json } as unknown as Response
    }),
  )

  return store
}

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

const toggle = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('play-toggle'))
  })
}

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

/** What the player reads under the play button. */
const readoutPoints = () => Number(/(\d+)/.exec(screen.getByTestId('score-points').textContent ?? '')?.[1])

const NOTE_MS = (4 * 60_000) / BPM

/** Plays `count` notes, getting every third one wrong so runs start and break. */
const playNotes = async (count: number) => {
  for (let index = 0; index < count; index += 1) {
    await advance(NOTE_MS)
    if (index % 3 === 2) {
      hush()
      continue
    }

    play(calledPitchClass())
    // Enough for the window to open past the cue and two frames to confirm.
    await advance(300)
    hush()
  }
}

beforeEach(() => {
  vi.useFakeTimers(FAKE_CLOCKS)
  hush()
  window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
  window.localStorage.setItem(STORAGE_KEYS.countIn, 'false')
  // Five of the twelve, two of them with a sharp name and a flat one: a pool
  // that prices below the whole octave and gives mixed spelling something to be
  // about. Both are factors the board has to have been told about.
  window.localStorage.setItem(STORAGE_KEYS.notePool, '0,1,3,5,8')
  window.localStorage.setItem(STORAGE_KEYS.bpm, String(BPM))
  // The two factors a player chooses, both at their harder setting.
  window.localStorage.setItem(STORAGE_KEYS.spelling, '"mixed"')
  window.localStorage.setItem(STORAGE_KEYS.showFretboard, 'false')
  window.history.replaceState({}, '', `/?challenge=${CHALLENGE}`)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop() {}, addEventListener() {}, removeEventListener() {} }] }) as unknown as MediaStream) },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('the board and the readout', () => {
  it('reach the same total over a session played at a priced difficulty', async () => {
    const store = installServer()
    render(<App />)
    await act(async () => {})

    fireEvent.change(screen.getByTestId('nickname-input'), { target: { value: NICKNAME } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('nickname-submit'))
    })

    await toggle()
    await playNotes(12)
    await toggle()

    // Everything queued has to have left the browser before the board can be
    // held to it — a pause flushes, so this is only the promise settling.
    await act(async () => {})

    const readout = readoutPoints()
    const board = topScores(store, CHALLENGE)

    expect(readout).toBeGreaterThan(0)
    expect(board).toEqual([{ nickname: NICKNAME, points: readout }])
  })

  /**
   * The clock's own bonus, which belongs to no note: the app credits it to the
   * readout and reports it, and the server pays it only if its own clock agrees
   * the session has run that long. Ten minutes of beats, most of them left
   * unplayed — what is being checked is the milestone, not the notes.
   */
  it('reach the same total across a milestone', async () => {
    const store = installServer()
    render(<App />)
    await act(async () => {})

    fireEvent.change(screen.getByTestId('nickname-input'), { target: { value: NICKNAME } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('nickname-submit'))
    })

    await toggle()
    await playNotes(4)
    const beforeMilestone = readoutPoints()

    // Ten minutes in the chair, in the stretches a practice session actually
    // comes in: two minutes at a time with a breather between them, which is
    // also what sends what has been played so far.
    for (let stretch = 0; stretch < 5; stretch += 1) {
      await advance(2 * 60_000)
      await toggle()
      await act(async () => {})
      await toggle()
    }

    await toggle()
    await act(async () => {})

    expect(readoutPoints()).toBe(beforeMilestone + PRACTICE_MILESTONES[0].points)
    expect(topScores(store, CHALLENGE)).toEqual([{ nickname: NICKNAME, points: readoutPoints() }])
  })

  it('reach the same total again when the tempo moves under the session', async () => {
    const store = installServer()
    render(<App />)
    await act(async () => {})

    fireEvent.change(screen.getByTestId('nickname-input'), { target: { value: NICKNAME } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('nickname-submit'))
    })

    await toggle()
    await playNotes(6)

    // A hand on the tempo mid-session: every note called from here is worth
    // more, and the notes already played are not repriced by it. A board that
    // priced a whole session by one declared config would part company here.
    await act(async () => {
      fireEvent.click(screen.getByTestId('bpm-up'))
    })
    await playNotes(6)
    await toggle()
    await act(async () => {})

    expect(topScores(store, CHALLENGE)).toEqual([{ nickname: NICKNAME, points: readoutPoints() }])
  })
})
