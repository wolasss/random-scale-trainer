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
    playReferencePitchAt() {}
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
    expect(document.querySelector('.target-time')).toHaveTextContent('≈ 0:40')
    expect(screen.getByTestId('timer')).toHaveTextContent('00:00')
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Play')
    expect(screen.getByTestId('now-playing').className).toContain('idle')
    expect(document.getElementById('continuous-mode')).toHaveAttribute('aria-checked', 'true')
    expect(document.getElementById('speed-ramp-mode')).toHaveAttribute('aria-checked', 'false')
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
    expect(document.querySelector('.target-time')).toHaveTextContent('≈ 0:48')
    expect(window.localStorage.getItem('fretboard-bpm')).toBe('60')
  })

  it('restores a clamped BPM from storage', () => {
    window.localStorage.setItem('fretboard-bpm', '999')
    render(<App />)

    expect(screen.getByTestId('bpm-value')).toHaveTextContent('240')
    expect(window.localStorage.getItem('fretboard-bpm')).toBe('240')
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
      'Paused — the session timer is paused too.',
    )
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Play')
    expect(screen.getByTestId('now-playing').className).toContain('paused')
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
