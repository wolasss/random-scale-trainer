import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// The fake engine accepts every scheduled sound and reports the faked
// performance clock, so beats become due as the fake timers advance.
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

const NOTE_PATTERN = /^[A-G][♯♭]?$/

// Default 72 BPM → 0.833s beats; count-in is 4 beats starting 50ms in.
const COUNT_IN_MS = 4 * (60_000 / 72) + 100

describe('App integration', () => {
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
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the idle state with defaults', () => {
    render(<App />)

    expect(screen.queryByTestId('current-note')).toBeNull()
    expect(screen.getByTestId('playback-message')).toHaveTextContent('Press start — or hit Space.')
    expect(screen.getByTestId('bpm-value')).toHaveTextContent('72')
    expect(document.querySelector('.target-time')).toHaveTextContent('00:40')
    expect(screen.getByTestId('timer')).toHaveTextContent('00:00')
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')
    expect(screen.getByTestId('now-playing').className).toContain('idle')
    expect(document.getElementById('continuous-mode')).toHaveAttribute('aria-checked', 'true')
    expect(document.getElementById('speed-ramp-mode')).toHaveAttribute('aria-checked', 'false')
  })

  it('shows the ready hint and NEXT preview while idle, then beat dots while playing', async () => {
    render(<App />)

    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('next-note').textContent).toMatch(NOTE_PATTERN)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 100)
    })

    expect(screen.getByTestId('beat-dots').children).toHaveLength(4)
    expect(screen.getByTestId('cycle-position')).toHaveTextContent('note 1 of 12')
    expect(screen.getByTestId('next-note').textContent).toMatch(NOTE_PATTERN)
  })

  it('toggles the theme and persists it', () => {
    render(<App />)

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    fireEvent.click(screen.getByTestId('theme-toggle'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(window.localStorage.getItem('fretboard-theme')).toBe('light')
  })

  it('disables and forces off speed ramp when continuous mode turns off', () => {
    render(<App />)

    fireEvent.click(document.getElementById('speed-ramp-mode')!)
    expect(window.localStorage.getItem('fretboard-speed-ramp-mode')).toBe('true')

    fireEvent.click(document.getElementById('continuous-mode')!)
    expect(document.getElementById('speed-ramp-mode')).toHaveAttribute('aria-checked', 'false')
    expect(document.getElementById('speed-ramp-mode')).toBeDisabled()
    expect(window.localStorage.getItem('fretboard-continuous-mode')).toBe('false')
    expect(window.localStorage.getItem('fretboard-speed-ramp-mode')).toBe('false')
  })

  it('drives BPM value, cycle time, and storage from the slider', () => {
    render(<App />)

    fireEvent.change(document.getElementById('bpm-slider')!, { target: { value: '60' } })
    expect(screen.getByTestId('bpm-value')).toHaveTextContent('60')
    expect(document.querySelector('.target-time')).toHaveTextContent('00:48')
    expect(window.localStorage.getItem('fretboard-bpm')).toBe('60')
  })

  it('steps tempo with the − / + buttons and switches the note-change rate', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('bpm-up'))
    expect(screen.getByTestId('bpm-value')).toHaveTextContent('73')
    fireEvent.click(screen.getByTestId('bpm-down'))
    fireEvent.click(screen.getByTestId('bpm-down'))
    expect(screen.getByTestId('bpm-value')).toHaveTextContent('71')

    const noteEvery = screen.getByTestId('note-every')
    fireEvent.click(noteEvery.querySelector('[data-value="1"]')!)
    // 12 notes × 1 beat at 71 BPM ≈ 10.1s
    expect(document.querySelector('.target-time')).toHaveTextContent('00:10')
    expect(window.localStorage.getItem('fretboard-beats-per-note')).toBe('1')
  })

  it('averages tap-tempo taps into the BPM', () => {
    render(<App />)

    // 500ms between taps → 120 BPM; performance.now is faked, so advance it.
    const tap = () => fireEvent.click(screen.getByTestId('tap-tempo'))
    tap()
    act(() => vi.advanceTimersByTime(500))
    tap()
    act(() => vi.advanceTimersByTime(500))
    tap()

    expect(screen.getByTestId('bpm-value')).toHaveTextContent('120')
  })

  it('note pool chips drive the preset, the guarantee line, and storage', () => {
    render(<App />)

    expect(screen.getByTestId('pool-guarantee')).toHaveTextContent('you get all 12 before any repeats')
    expect(screen.getByTestId('preset-select')).toHaveValue('all')

    fireEvent.click(screen.getByTestId('note-chip-1'))
    expect(screen.getByTestId('preset-select')).toHaveValue('custom')
    expect(screen.getByTestId('pool-guarantee')).toHaveTextContent('you get all 11 before any repeats')
    expect(window.localStorage.getItem('fretboard-note-pool')).toBe('0,2,3,4,5,6,7,8,9,10,11')
  })

  it('presets apply to the chips and spelling drives the chip labels', () => {
    render(<App />)

    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: 'naturals' } })
    expect(screen.getByTestId('note-chip-0')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('note-chip-1')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('pool-guarantee')).toHaveTextContent('you get all 7 before any repeats')

    // Default mixed spelling shows both names, since the call can use either.
    expect(screen.getByTestId('note-chip-1')).toHaveTextContent('D♭/C♯')
    fireEvent.click(screen.getByTestId('spelling').querySelector('[data-value="sharp"]')!)
    expect(screen.getByTestId('note-chip-1')).toHaveTextContent(/^C♯$/)
  })

  it('restores a clamped BPM from storage', () => {
    window.localStorage.setItem('fretboard-bpm', '999')
    render(<App />)

    expect(screen.getByTestId('bpm-value')).toHaveTextContent('240')
    expect(window.localStorage.getItem('fretboard-bpm')).toBe('240')
  })

  it('the fretboard card can be hidden and the choice persists', () => {
    render(<App />)

    expect(screen.getByTestId('fretboard')).toBeInTheDocument()

    fireEvent.click(document.getElementById('show-fretboard')!)
    expect(screen.queryByTestId('fretboard')).toBeNull()
    expect(window.localStorage.getItem('fretboard-show-neck')).toBe('false')

    fireEvent.click(document.getElementById('show-fretboard')!)
    expect(screen.getByTestId('fretboard')).toBeInTheDocument()
  })

  it('lights up every fretboard position of the current pitch class', async () => {
    // Pool of one note (pc 4, E) makes the called note deterministic. E lives
    // at: open + 12th on both e strings, B-5, G-9, D-2, A-7 → 8 dots.
    window.localStorage.setItem('fretboard-note-pool', '4')
    render(<App />)

    expect(screen.queryAllByTestId('fret-dot')).toHaveLength(0)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 200)
    })

    expect(screen.getByTestId('current-note')).toHaveTextContent('E')
    expect(screen.queryAllByTestId('fret-dot')).toHaveLength(8)
  })

  it('plays through count-in to notes and pauses', async () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.getByTestId('current-note')).toHaveTextContent('4')
    expect(screen.getByTestId('playback-message')).toHaveTextContent('Counting in…')
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')
    expect(screen.getByTestId('now-playing').className).toContain('active')

    // Finish the 4-beat count-in and land on the first note
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS)
    })
    expect(screen.getByTestId('current-note').textContent).toMatch(NOTE_PATTERN)
    expect(screen.getByTestId('playback-message')).toHaveTextContent(
      'Find it on the neck before the next beat.',
    )

    // Session timer is running now
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(screen.getByTestId('timer').textContent).not.toBe('00:00')

    fireEvent.click(screen.getByTestId('play-toggle'))
    expect(screen.getByTestId('playback-message')).toHaveTextContent(
      'Paused — the timer stopped too.',
    )
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Resume')
    expect(screen.getByTestId('now-playing').className).toContain('paused')
  })

  it('tracks the session goal, progress, and stats', async () => {
    render(<App />)

    expect(screen.getByTestId('stat-notes')).toHaveTextContent('0')
    expect(screen.getByTestId('stat-cycles')).toHaveTextContent('0')
    expect(screen.getByTestId('session-progress')).toHaveAttribute('aria-valuenow', '0')

    fireEvent.click(screen.getByTestId('session-goal').querySelector('[data-value="5"]')!)
    expect(window.localStorage.getItem('fretboard-session-goal')).toBe('5')

    fireEvent.click(screen.getByTestId('play-toggle'))
    // Through the count-in to the first note; the timer interval registers on
    // the render after that pop, so it needs its own act block before the
    // long advance.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 200)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    // 10s at 72 BPM with a 4-beat span → 4 notes called; 10s of a 5min goal → 3%.
    expect(Number(screen.getByTestId('stat-notes').textContent)).toBeGreaterThanOrEqual(3)
    expect(Number(screen.getByTestId('session-progress').getAttribute('aria-valuenow'))).toBeGreaterThan(0)

    fireEvent.click(screen.getByTestId('reset'))
    expect(screen.getByTestId('stat-notes')).toHaveTextContent('0')
    expect(screen.getByTestId('session-progress')).toHaveAttribute('aria-valuenow', '0')
  })

  it('resets the timer and note display', async () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    // Count-in first; the session timer interval registers on the render after
    // the first real note, so it needs its own act block before advancing time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(screen.getByTestId('timer').textContent).not.toBe('00:00')

    fireEvent.click(screen.getByTestId('reset'))
    expect(screen.getByTestId('timer')).toHaveTextContent('00:00')
    expect(screen.queryByTestId('current-note')).toBeNull()
    expect(screen.getByTestId('playback-message')).toHaveTextContent('Press start — or hit Space.')
  })
})
