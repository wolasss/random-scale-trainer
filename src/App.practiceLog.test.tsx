import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'
import { dayKey, shiftDays, type PracticeHistory } from './lib/history'

vi.mock('./lib/audio/engine', () => ({
  AudioEngine: class FakeAudioEngine {
    async ensureContext() {
      return {}
    }
    async loadNoteBuffers() {}
    hasBuffers() {
      return true
    }
    getCurrentTime() {
      return performance.now() / 1000
    }
    playClickAt() {}
    playNoteAt() {}
    playSessionEndChime() {}
    stopScheduledSounds() {}
  },
}))

// Default 72 BPM → 0.833s beats; count-in is 4 beats starting 50ms in.
const COUNT_IN_MS = 4 * (60_000 / 72) + 100

const stored = (): PracticeHistory | null => {
  const raw = window.localStorage.getItem(STORAGE_KEYS.practiceLog)

  return raw === null ? null : JSON.parse(raw)
}

const today = () => dayKey(new Date())

/** Plays for `ms` of practice time, past the count-in that starts the timer. */
const practiceFor = async (ms: number) => {
  fireEvent.click(screen.getByTestId('play-toggle'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 200)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('practice log', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
    // Mid-day local time, so advancing the clock mid-test never crosses midnight.
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts empty, and says so instead of inventing a streak', () => {
    render(<App />)

    expect(screen.getByTestId('practice-streak')).toHaveTextContent('0')
    expect(screen.getByTestId('practice-log-footer')).toHaveTextContent('Your first session lands here.')
    expect(screen.queryByTestId('practice-best')).toBeNull()
    expect(stored()).toBeNull()
  })

  it('draws 14 days of bars, the last one today', () => {
    render(<App />)

    const columns = screen.getByTestId('practice-bars').children
    expect(columns).toHaveLength(14)
    expect(columns[13].querySelector('.practice-log-weekday')?.className).toContain('is-today')
    expect(columns[12].querySelector('.practice-log-weekday')?.className).not.toContain('is-today')
    expect(columns[13].querySelector('.practice-log-bar')).toHaveAttribute('title', 'no practice')
  })

  it('banks seconds and notes every ten seconds of playing', async () => {
    render(<App />)
    await practiceFor(25_000)

    const day = stored()?.days[today()]
    expect(day?.sec).toBeGreaterThanOrEqual(20)
    expect(day?.notes).toBeGreaterThan(0)
  })

  it('holds the log still while playback is paused', async () => {
    render(<App />)
    await practiceFor(25_000)

    fireEvent.click(screen.getByTestId('play-toggle'))
    const atPause = stored()?.days[today()]?.sec ?? 0

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(stored()?.days[today()]?.sec).toBe(atPause)
  })

  it('writes the pending seconds on pause, not just on the ten-second beat', async () => {
    render(<App />)
    // Under one flush interval of practice, so only the pause can bank it.
    await practiceFor(6_000)
    expect(stored()).toBeNull()

    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(stored()?.days[today()]?.sec).toBeGreaterThanOrEqual(5)
  })

  it('shows the streak and the seven-day totals once a minute is on the board', async () => {
    render(<App />)
    await practiceFor(61_000)

    expect(screen.getByTestId('practice-streak')).toHaveTextContent('1')
    expect(screen.getByTestId('practice-log-footer')).toHaveTextContent(/Last 7 days: 1 min, \d+ notes/)
  })

  it('counts a run that ends yesterday, and names a longer best', () => {
    const days: PracticeHistory['days'] = {}
    for (const offset of [-1, -2, -5, -6, -7, -8, -9]) {
      days[dayKey(shiftDays(new Date(), offset))] = { sec: 900, notes: 100 }
    }
    window.localStorage.setItem(STORAGE_KEYS.practiceLog, JSON.stringify({ days }))

    render(<App />)

    expect(screen.getByTestId('practice-streak')).toHaveTextContent('2')
    expect(screen.getByTestId('practice-best')).toHaveTextContent('best 5')
  })

  it('says your best yet when the run is the longest one', () => {
    const days: PracticeHistory['days'] = {
      [dayKey(new Date())]: { sec: 900, notes: 100 },
      [dayKey(shiftDays(new Date(), -1))]: { sec: 900, notes: 100 },
    }
    window.localStorage.setItem(STORAGE_KEYS.practiceLog, JSON.stringify({ days }))

    render(<App />)

    expect(screen.getByTestId('practice-best')).toHaveTextContent('your best yet')
  })

  it('does not build a streak from a day under a minute', async () => {
    render(<App />)
    await practiceFor(30_000)

    expect(stored()?.days[today()]?.sec).toBeGreaterThan(0)
    expect(screen.getByTestId('practice-streak')).toHaveTextContent('0')
  })

  it('says what a short day is short of, rather than leaving a bar beside a zero', async () => {
    render(<App />)
    await practiceFor(30_000)

    expect(screen.getByTestId('practice-log-footer')).toHaveTextContent(
      /^\d+ sec today — a minute starts the streak$/,
    )
  })

  it('goes back to the totals once the day counts', async () => {
    render(<App />)
    await practiceFor(61_000)

    expect(screen.getByTestId('practice-log-footer')).toHaveTextContent(/^Last 7 days:/)
  })

  it('leaves the totals alone when today is untouched but earlier days counted', () => {
    window.localStorage.setItem(
      STORAGE_KEYS.practiceLog,
      JSON.stringify({ days: { [dayKey(shiftDays(new Date(), -1))]: { sec: 900, notes: 100 } } }),
    )

    render(<App />)

    expect(screen.getByTestId('practice-log-footer')).toHaveTextContent('Last 7 days: 15 min, 100 notes')
  })

  it('clears the session timer and leaves the practised days on the board', async () => {
    render(<App />)
    await practiceFor(25_000)
    fireEvent.click(screen.getByTestId('play-toggle'))
    const banked = stored()?.days[today()]?.sec ?? 0

    fireEvent.click(screen.getByTestId('practice-log-clear'))

    expect(screen.getByTestId('timer')).toHaveTextContent('00:00')
    expect(banked).toBeGreaterThan(0)
    expect(stored()?.days[today()]?.sec).toBeGreaterThanOrEqual(banked)
  })

  it('keeps the session running when the timer is cleared mid-play', async () => {
    render(<App />)
    await practiceFor(25_000)
    const banked = stored()?.days[today()]?.sec ?? 0
    const notesBefore = Number(screen.getByTestId('stat-notes').textContent)

    fireEvent.click(screen.getByTestId('practice-log-clear'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    // The clock restarted from zero and is counting again — five seconds of it,
    // not the twenty-five it had before.
    expect(screen.getByTestId('timer')).toHaveTextContent(/^00:0[1-9]$/)
    // Playback never stopped, so the notes kept coming rather than rewinding.
    expect(Number(screen.getByTestId('stat-notes').textContent)).toBeGreaterThanOrEqual(notesBefore)
    expect(notesBefore).toBeGreaterThan(0)
    expect(stored()?.days[today()]?.sec).toBeGreaterThanOrEqual(banked)
  })

  it('does not subtract from the log when the session timer is reset', async () => {
    render(<App />)
    await practiceFor(25_000)
    const banked = stored()?.days[today()]?.sec ?? 0

    fireEvent.click(screen.getByTestId('reset'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(screen.getByTestId('timer')).toHaveTextContent('00:00')
    expect(stored()?.days[today()]?.sec).toBeGreaterThanOrEqual(banked)
  })
})
