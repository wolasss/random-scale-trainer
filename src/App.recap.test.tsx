/**
 * The session recap, end to end: a session played through the real app, stopped
 * every way a session can stop, and read back off the screen.
 *
 * Everything non-deterministic is pinned — the clocks and frames are fake, the
 * system time is fixed at midday so no test crosses midnight, the deck's
 * shuffle draws from a stubbed Math.random, and the audio engine is the fake
 * one. What is left is the wiring: which readings the recap takes, when there
 * is nothing worth reporting, and what Done leaves behind.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, STANDALONE_QUERY } from './hooks/useDisplayMode'
import type { Routine } from './lib/routines'
import { installMatchMedia } from './test/matchMedia'
import { FAKE_CLOCKS_AND_FRAMES } from './test/fakeTimers'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

const PHONE_PORTRAIT = {
  [STANDALONE_QUERY]: true,
  [COARSE_POINTER_QUERY]: true,
  [LANDSCAPE_QUERY]: false,
}

/** Two blocks of forty seconds, so a workout can run out inside a test. */
const WORKOUT: Routine = {
  id: 'r-recap-workout',
  name: 'Two short blocks',
  blocks: [
    { name: 'First', poolKey: 'naturals', pool: null, bpm: 60, beats: 4, acc: null, ramp: false, rampTo: 112, dur: 40 },
    {
      name: 'Second',
      poolKey: 'accidentals',
      pool: null,
      bpm: 60,
      beats: 4,
      acc: null,
      ramp: false,
      rampTo: 112,
      dur: 40,
    },
  ],
}

/** Plays for `ms` of practice time, past the count-in that starts the timer. */
const practiceFor = async (ms: number, bpm = 72) => {
  fireEvent.click(screen.getByTestId('play-toggle'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4 * (60_000 / bpm) + 100 + 200)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const text = (testId: string) => screen.getByTestId(testId).textContent

describe('the session recap', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS_AND_FRAMES)
    // Mid-day local time, so advancing the clock mid-test never crosses midnight.
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))
    // The deck shuffles; a fixed draw makes the note order the same every run.
    vi.spyOn(Math, 'random').mockReturnValue(0.42)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'matchMedia')
    document.documentElement.removeAttribute('data-stage')
    document.documentElement.removeAttribute('data-theme')
    window.localStorage.clear()
  })

  it('reports the session a hand on pause just ended', async () => {
    render(<App />)
    await practiceFor(61_000)

    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(screen.getByTestId('session-recap')).toBeInTheDocument()
    // The same figures the session card is showing, read off a session that
    // has stopped rather than counted a second time.
    expect(text('recap-time')).toBe(text('timer'))
    expect(text('recap-notes')).toBe(text('stat-notes'))
    expect(text('recap-rounds')).toBe(text('stat-cycles'))
    expect(Number(text('recap-notes'))).toBeGreaterThan(0)
    expect(screen.getByTestId('recap-setup')).toHaveTextContent('All 12 chromatic')
    expect(screen.getByTestId('recap-day')).toHaveTextContent('Today: 1 min · 1-day streak')
  })

  it('banks the seconds since the last tick into the day it reports', async () => {
    render(<App />)
    // Two halves either side of a pause, the second crossing the minute
    // somewhere between two of the clock's two-hundred-millisecond ticks. The
    // day the recap places the session against is only a practice day if the
    // stop banked that last slice too.
    await practiceFor(30_050)
    fireEvent.click(screen.getByTestId('play-toggle'))
    fireEvent.click(screen.getByTestId('play-toggle'))
    await advance(30_000)

    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(text('recap-time')).toBe(text('timer'))
    expect(screen.getByTestId('recap-day')).toHaveTextContent('Today: 1 min · 1-day streak')
  })

  it('says a tempo that never moved once, and both ends of one that did', async () => {
    render(<App />)
    await practiceFor(40_000)

    // Four up and two back down: the session ends above where it opened, and
    // higher than either end in between.
    for (let click = 0; click < 4; click += 1) {
      fireEvent.click(screen.getByTestId('bpm-up'))
    }
    for (let click = 0; click < 2; click += 1) {
      fireEvent.click(screen.getByTestId('bpm-down'))
    }
    await advance(30_000)
    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(screen.getByTestId('recap-tempo')).toHaveTextContent('72 → 74')
    expect(screen.getByTestId('session-recap')).toHaveTextContent('BPM, peaked at 76')
  })

  it('holds a tempo nobody touched at one number', async () => {
    render(<App />)
    await practiceFor(61_000)

    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(screen.getByTestId('recap-tempo')).toHaveTextContent('72')
    expect(screen.getByTestId('session-recap')).toHaveTextContent('BPM held')
  })

  it('leaves a tempo dialled back before the first note out of the peak', async () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('play-toggle'))
    // Far enough in for the buffers to be loaded and the count-in to be
    // running, and nowhere near the first note: the session clock is still at
    // zero, so nothing here has been practised at any tempo yet.
    await advance(300)

    for (let click = 0; click < 4; click += 1) {
      fireEvent.click(screen.getByTestId('bpm-down'))
    }
    await advance(4 * (60_000 / 68) + 300 + 61_000)
    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(screen.getByTestId('recap-tempo')).toHaveTextContent('68')
    expect(screen.getByTestId('session-recap')).toHaveTextContent('BPM held')
  })

  it('counts the closing round of a run that ended itself', async () => {
    // One pass of twelve notes, four beats each at 30 BPM — about 96 seconds,
    // and then the run is out of notes and stops on its own.
    window.localStorage.setItem(STORAGE_KEYS.continuousMode, 'false')
    window.localStorage.setItem(STORAGE_KEYS.bpm, '30')
    render(<App />)

    await practiceFor(100_000, 30)

    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')
    expect(text('recap-rounds')).toBe(text('stat-cycles'))
    // The closing round is added by the stop itself, after the pause handler —
    // a summary taken any earlier would be one short.
    expect(Number(text('recap-rounds'))).toBeGreaterThanOrEqual(1)
  })

  it('names the workout that just ran out', async () => {
    window.localStorage.setItem(STORAGE_KEYS.routines, JSON.stringify([WORKOUT]))
    window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
    render(<App />)

    fireEvent.click(screen.getByTestId(`routine-chip-${WORKOUT.id}`).querySelector('.routine-chip-body')!)
    await practiceFor(82_000, 60)

    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Restart workout')
    expect(screen.getByTestId('recap-setup')).toHaveTextContent('Two short blocks')
    expect(text('recap-time')).toBe(text('timer'))
  })

  it('ends the session at the goal, and reports it', async () => {
    window.localStorage.setItem(STORAGE_KEYS.sessionGoal, '5')
    render(<App />)

    await practiceFor(5 * 60_000 + 1_000)

    // Nobody pressed anything — the goal stopped it.
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')
    expect(screen.getByTestId('playback-message')).toHaveTextContent('5 min goal reached')
    expect(screen.getByTestId('session-recap')).toBeInTheDocument()
    expect(screen.getByTestId('recap-time')).toHaveTextContent('05:0')
  })

  it('lets a second start run on past a goal it already stopped for', async () => {
    window.localStorage.setItem(STORAGE_KEYS.sessionGoal, '5')
    render(<App />)
    await practiceFor(5 * 60_000 + 1_000)

    await practiceFor(30_000)

    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')
    expect(screen.getByTestId('timer')).toHaveTextContent(/^05:3/)
  })

  it('has nothing to report about half a minute', async () => {
    render(<App />)
    await practiceFor(30_000)

    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(screen.queryByTestId('session-recap')).toBeNull()
  })

  it('says nothing on a reset either, which zeroes the clock as it stops', async () => {
    render(<App />)
    await practiceFor(61_000)

    fireEvent.click(screen.getByTestId('reset'))

    expect(screen.queryByTestId('session-recap')).toBeNull()
  })

  it('starts the next session fresh when Done is pressed', async () => {
    render(<App />)
    await practiceFor(61_000)
    fireEvent.click(screen.getByTestId('play-toggle'))

    fireEvent.click(screen.getByTestId('recap-done'))

    expect(screen.queryByTestId('session-recap')).toBeNull()
    expect(screen.getByTestId('timer')).toHaveTextContent('00:00')
    expect(screen.getByTestId('stat-notes')).toHaveTextContent('0')
    // Done is the fresh start, so the transport offers a start and not a resume.
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')
  })

  it('clears the recap again on the next start', async () => {
    render(<App />)
    await practiceFor(61_000)
    fireEvent.click(screen.getByTestId('play-toggle'))
    expect(screen.getByTestId('session-recap')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(screen.queryByTestId('session-recap')).toBeNull()
  })

  it('lands below the transport on the stand, and clears from there too', async () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)
    await practiceFor(61_000)

    fireEvent.click(screen.getByTestId('play-toggle'))

    const stage = document.querySelector('.stage')!
    const order = Array.from(stage.children).map((child) => child.className.split(' ')[0])
    expect(order).toEqual(['stage-hero', 'stage-foot', 'session-recap'])

    fireEvent.click(screen.getByTestId('recap-done'))

    expect(screen.queryByTestId('session-recap')).toBeNull()
    expect(Array.from(stage.children).map((child) => child.className.split(' ')[0])).toEqual([
      'stage-hero',
      'stage-foot',
    ])
  })
})
