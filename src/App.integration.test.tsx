import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { dayKey, readHistory, serializeBackup } from './lib/history'
import { withBlockedStorage, withFakeStorage } from './test/blockedStorage'
import { FAKE_CLOCKS_AND_FRAMES } from './test/fakeTimers'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

const NOTE_PATTERN = /^[A-G][♯♭]?$/

/**
 * A store carrying everything it holds today with no room to grow: a key can be
 * rewritten at its current size or smaller, never larger. The quota-full case,
 * where reads and modest writes all work and only the bigger value is refused.
 */
const withCappedStorage = (): (() => void) => {
  const entries = new Map<string, string>()
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key !== null) {
      entries.set(key, window.localStorage.getItem(key) ?? '')
    }
  }

  return withFakeStorage({
    get length(): number {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key)
    },
    setItem: (key, value) => {
      const existing = entries.get(key)
      if (existing !== undefined && value.length > existing.length) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
      entries.set(key, value)
    },
  })
}

/** A well-formed backup, so only the store can be what turns a restore away. */
const backupFile = () =>
  new File([serializeBackup({ days: { '2026-02-01': { sec: 600, notes: 12 } } }, new Date())], 'backup.json', {
    type: 'application/json',
  })

// Default 72 BPM → 0.833s beats; count-in is 4 beats starting 50ms in.
const COUNT_IN_MS = 4 * (60_000 / 72) + 100

describe('App integration', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS_AND_FRAMES)
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
    // Nothing on the clock yet: no reset button with nothing to reset, and no
    // goal readout adding a second number to an idle screen.
    expect(screen.queryByTestId('reset')).toBeNull()
    expect(screen.queryByTestId('transport-readout')).toBeNull()
  })

  it('still renders the idle state when localStorage is blocked', () => {
    const restore = withBlockedStorage()
    try {
      expect(() => render(<App />)).not.toThrow()

      expect(screen.getByTestId('playback-message')).toHaveTextContent('Press start — or hit Space.')
      expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')

      // Blocked storage reads as a first run every time, so the setup is folded
      // — but the fold still has to open, or the controls are unreachable for
      // the whole session rather than just the first screen of it.
      fireEvent.click(screen.getByTestId('setup-reveal'))
      expect(screen.getByTestId('bpm-value')).toHaveTextContent('72')
    } finally {
      restore()
    }
  })

  it('saves a setup but warns it is gone at closing time when localStorage is blocked', () => {
    const restore = withBlockedStorage()
    try {
      render(<App />)

      // Blocked storage reads as a first run, so the setup cards are folded away.
      fireEvent.click(screen.getByTestId('setup-reveal'))
      fireEvent.click(screen.getByTestId('routine-save'))
      fireEvent.change(screen.getByTestId('routine-name-input'), { target: { value: 'Ephemeral test' } })
      fireEvent.click(screen.getByTestId('routine-save-confirm'))

      // The save still happens — it just lives in memory for this session only.
      expect(screen.getByTestId('routine-shelf')).toHaveTextContent('Ephemeral test')
      expect(screen.getByTestId('routine-ephemeral-notice')).toHaveTextContent('close the tab')
    } finally {
      restore()
    }
  })

  it('warns when the store held the old shelf but has no room for the new setup', () => {
    // The failure a sentinel-sized probe would sail straight through: reads
    // fine, small writes fine, and only the grown routine list is refused.
    const restore = withCappedStorage()
    try {
      render(<App />)

      fireEvent.click(screen.getByTestId('routine-save'))
      // Nothing has been asked of the store yet, so nothing to say yet either.
      expect(screen.queryByTestId('routine-ephemeral-notice')).toBeNull()

      fireEvent.change(screen.getByTestId('routine-name-input'), { target: { value: 'Too big to keep' } })
      fireEvent.click(screen.getByTestId('routine-save-confirm'))

      expect(screen.getByTestId('routine-shelf')).toHaveTextContent('Too big to keep')
      expect(screen.getByTestId('routine-ephemeral-notice')).toHaveTextContent('close the tab')
    } finally {
      restore()
    }
  })

  it('says nothing about closing the tab when storage works', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('routine-save'))
    fireEvent.change(screen.getByTestId('routine-name-input'), { target: { value: 'Persistent test' } })
    fireEvent.click(screen.getByTestId('routine-save-confirm'))

    expect(screen.getByTestId('routine-shelf')).toHaveTextContent('Persistent test')
    expect(screen.queryByTestId('routine-ephemeral-notice')).toBeNull()
  })

  it('says a restore could not be saved rather than reloading into a log without it', async () => {
    const reload = vi.fn()
    const restore = withBlockedStorage()
    try {
      render(<App reload={reload} />)

      // Blocked storage reads as a first run, so the log card is behind the fold.
      fireEvent.click(screen.getByTestId('setup-reveal'))
      fireEvent.click(screen.getByTestId('practice-log-history'))

      fireEvent.change(screen.getByTestId('history-file'), { target: { files: [backupFile()] } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.getByTestId('history-import-error')).toHaveTextContent('blocking saved data')
      // Reloading would come back to the very log the restore was meant to
      // repair, with the restored days gone and the reload reading as a success.
      expect(reload).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('reloads onto the merged log once the restore is really stored', async () => {
    const reload = vi.fn()
    render(<App reload={reload} />)

    fireEvent.click(screen.getByTestId('practice-log-history'))
    fireEvent.change(screen.getByTestId('history-file'), { target: { files: [backupFile()] } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.queryByTestId('history-import-error')).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(readHistory().days['2026-02-01']).toEqual({ sec: 600, notes: 12 })
  })

  it('warns that practice is not being saved when the store refuses the log', async () => {
    const restore = withBlockedStorage()
    try {
      render(<App reload={vi.fn()} />)

      fireEvent.click(screen.getByTestId('setup-reveal'))
      // Nothing has been written yet, so nothing to say yet either.
      expect(screen.queryByTestId('practice-log-ephemeral-notice')).toBeNull()

      fireEvent.click(screen.getByTestId('play-toggle'))
      // Through the count-in first: the session timer's interval only registers
      // on the render after the first real note.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 200)
      })
      // Past the ten-second beat, so the log has had a write refused.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000)
      })

      expect(screen.getByTestId('practice-log-ephemeral-notice')).toHaveTextContent('blocking saved data')
    } finally {
      restore()
    }
  })

  it('says nothing about the practice log when the store keeps it', async () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 200)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000)
    })

    expect(screen.queryByTestId('practice-log-ephemeral-notice')).toBeNull()
    expect(readHistory().days[dayKey(new Date())]?.sec).toBeGreaterThan(0)
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

  it('names every keyboard shortcut in the header, screen readers included', () => {
    render(<App />)

    const hints = document.querySelector('.key-hints')!
    expect(hints).toHaveTextContent('Space play / pause')
    expect(hints).toHaveTextContent('R reset')
    expect(hints).not.toHaveAttribute('aria-hidden')
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

  /** The ceiling turns the ramp from a treadmill into a goal, so it is only
      ever presented alongside the arithmetic that reaches it. */
  it('reveals the climb-to target under the ramp switch, and does the arithmetic', () => {
    render(<App />)

    expect(screen.queryByTestId('ramp-target')).toBeNull()

    fireEvent.click(document.getElementById('speed-ramp-mode')!)
    expect(screen.getByTestId('ramp-target-value')).toHaveTextContent('112')
    expect(screen.getByTestId('ramp-helper')).toHaveTextContent('20 rounds from 72, then it holds.')

    fireEvent.click(screen.getByTestId('ramp-target-up'))
    expect(screen.getByTestId('ramp-target-value')).toHaveTextContent('117')
    expect(window.localStorage.getItem('fretboard-ramp-target')).toBe('117')
    expect(screen.getByTestId('ramp-helper')).toHaveTextContent('23 rounds from 72, then it holds.')

    // The switch lives in the Tempo card now — under the number it moves.
    expect(document.querySelector('.tempo-card')!.contains(document.getElementById('speed-ramp-mode'))).toBe(true)
  })

  it('will not let the target be set below the tempo already reached', () => {
    render(<App />)

    // Past the stored 112, so switching on has to hand out a reachable goal.
    fireEvent.change(document.getElementById('bpm-slider')!, { target: { value: '130' } })
    fireEvent.click(document.getElementById('speed-ramp-mode')!)
    expect(screen.getByTestId('ramp-target-value')).toHaveTextContent('170')

    for (let step = 0; step < 20; step++) {
      fireEvent.click(screen.getByTestId('ramp-target-down'))
    }

    expect(screen.getByTestId('ramp-target-value')).toHaveTextContent('132')
    expect(screen.getByTestId('ramp-helper')).toHaveTextContent('1 round from 130, then it holds.')
  })

  /**
   * The ceiling's whole job: the climb stops on the number the player chose and
   * playback carries on there. Reaching it must never end the session.
   */
  it('climbs to the target while playing and then holds, still running', async () => {
    window.localStorage.setItem('fretboard-note-pool', '0,1')
    window.localStorage.setItem('fretboard-bpm', '60')
    window.localStorage.setItem('fretboard-beats-per-note', '1')

    render(<App />)

    fireEvent.click(document.getElementById('speed-ramp-mode')!)
    for (let step = 0; step < 12; step++) {
      fireEvent.click(screen.getByTestId('ramp-target-down'))
    }
    expect(screen.getByTestId('ramp-target-value')).toHaveTextContent('62')

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    // Looping re-counts in between cycles, so land the read on a note beat
    // rather than on whichever digit 30s happened to stop at.
    for (let step = 0; step < 40 && screen.getByTestId('playback-message').textContent === 'Counting in…'; step++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
    }

    expect(screen.getByTestId('bpm-value')).toHaveTextContent('62')
    expect(screen.getByTestId('ramp-helper')).toHaveTextContent('Target reached — holding here.')
    expect(screen.getByTestId('playback-message')).toHaveTextContent('At your target tempo — holding 62 BPM.')
    expect(screen.getByTestId('now-playing').className).toContain('active')
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

  it('averages tap-tempo taps into the BPM', async () => {
    render(<App />)

    // 500ms between taps → 120 BPM; performance.now is faked, so advance it.
    const tap = () => fireEvent.click(screen.getByTestId('tap-tempo'))
    tap()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    tap()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
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

  it('the fretboard card can be shown and the choice persists', () => {
    render(<App />)

    // Hidden out of the box: the map is an aid you reach for, not the default.
    expect(screen.queryByTestId('fretboard')).toBeNull()

    fireEvent.click(document.getElementById('show-fretboard')!)
    expect(screen.getByTestId('fretboard')).toBeInTheDocument()
    expect(window.localStorage.getItem('fretboard-show-neck')).toBe('true')

    fireEvent.click(document.getElementById('show-fretboard')!)
    expect(screen.queryByTestId('fretboard')).toBeNull()
  })

  it('keeps the neck in the practice stage and pairs the setup cards two up', () => {
    // The map defaults to hidden; this test is about where it lives when shown.
    window.localStorage.setItem('fretboard-show-neck', 'true')
    render(<App />)

    // The neck answers the question the note asks, so the two share one card.
    const stage = document.querySelector('.practice-stage')!
    expect(stage.querySelector('[data-testid="fretboard"]')).not.toBeNull()
    expect(stage.querySelector('.routine-strip')).toBeNull()
    expect(stage.querySelector('.transport-bar')).not.toBeNull()
    expect(document.querySelector('.practice-stage-view')).toHaveClass('with-neck')

    // With the map off the note simply takes the whole stage.
    fireEvent.click(document.getElementById('show-fretboard')!)
    expect(document.querySelector('.practice-stage-view')).not.toHaveClass('with-neck')

    // Each two-up band holds real siblings — a card nested inside its
    // neighbour still looks plausible but renders as a card in a card.
    const rows = [...document.querySelectorAll('.card-row')]
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.children).toHaveLength(2)
      for (const card of row.children) expect(card.parentElement).toBe(row)
    }
  })

  it('reads the session out in the transport, so the timer can live at the foot', async () => {
    render(<App />)

    // The readout and the reset both wait for the first press.
    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByTestId('reset')).toBeInTheDocument()
    expect(screen.getByTestId('transport-readout')).toHaveTextContent('00:00 of 10 min')

    fireEvent.click(screen.getByTestId('session-goal').querySelector('[data-value="5"]')!)
    expect(screen.getByTestId('transport-readout')).toHaveTextContent('00:00 of 5 min')
  })

  it('lights up every fretboard position of the current pitch class', async () => {
    // Pool of one note (pc 4, E) makes the called note deterministic. E lives
    // at: open + 12th on both e strings, B-5, G-9, D-2, A-7 → 8 dots.
    window.localStorage.setItem('fretboard-note-pool', '4')
    window.localStorage.setItem('fretboard-show-neck', 'true')
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
