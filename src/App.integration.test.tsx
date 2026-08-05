import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/audio/engine', () => ({
  AudioEngine: class FakeAudioEngine {
    async ensureContext() {
      return {}
    }
    async loadNoteBuffers() {}
    hasBuffers() {
      return true
    }
    playClick() {}
    playSessionEndChime() {}
    playNote() {}
  },
}))

const NOTE_PATTERN = /^[A-G](#|b)?$/

describe('App integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the idle state with defaults', () => {
    render(<App />)

    expect(screen.getByTestId('current-note')).toHaveTextContent('A♭')
    expect(screen.getByTestId('playback-message')).toHaveTextContent('Press play to start.')
    expect(screen.getByTestId('bpm-value')).toHaveTextContent('30')
    expect(screen.getByTestId('timer')).toHaveTextContent('00:00')
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Play')
    expect(screen.getByTestId('now-playing').className).toContain('idle')
    expect(document.getElementById('continuous-mode')).toHaveTextContent('On')
    expect(document.getElementById('speed-ramp-mode')).toHaveTextContent('Off')
  })

  it('toggles the theme and persists it', () => {
    render(<App />)

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    fireEvent.click(screen.getByTestId('theme-toggle'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(window.localStorage.getItem('fretboard-theme')).toBe('light')
  })

  it('hides and disables speed ramp when continuous mode turns off', () => {
    render(<App />)

    fireEvent.click(document.getElementById('speed-ramp-mode')!)
    expect(window.localStorage.getItem('fretboard-speed-ramp-mode')).toBe('true')

    fireEvent.click(document.getElementById('continuous-mode')!)
    expect(document.getElementById('speed-ramp-mode')).toBeNull()
    expect(window.localStorage.getItem('fretboard-continuous-mode')).toBe('false')
    expect(window.localStorage.getItem('fretboard-speed-ramp-mode')).toBe('false')
  })

  it('drives BPM value, cycle time, and storage from the slider', () => {
    render(<App />)

    fireEvent.change(document.getElementById('bpm-slider')!, { target: { value: '60' } })
    expect(screen.getByTestId('bpm-value')).toHaveTextContent('60')
    expect(document.querySelector('.target-time')).toHaveTextContent('00:12')
    expect(window.localStorage.getItem('fretboard-bpm')).toBe('60')
  })

  it('restores a clamped BPM from storage', () => {
    window.localStorage.setItem('fretboard-bpm', '999')
    render(<App />)

    expect(screen.getByTestId('bpm-value')).toHaveTextContent('100')
    expect(window.localStorage.getItem('fretboard-bpm')).toBe('100')
  })

  it('plays through count-in to notes and pauses', async () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByTestId('playback-message')).toHaveTextContent('Starting in 3...')
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')
    expect(screen.getByTestId('now-playing').className).toContain('active')

    // Finish the 3-beat count-in and land on the first note
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 650)
    })
    expect(screen.getByTestId('current-note').textContent).toMatch(NOTE_PATTERN)
    expect(screen.getByTestId('playback-message')).toHaveTextContent('')

    // Session timer is running now
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(screen.getByTestId('timer').textContent).not.toBe('00:00')

    fireEvent.click(screen.getByTestId('play-toggle'))
    expect(screen.getByTestId('playback-message')).toHaveTextContent('Paused')
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Play')
    expect(screen.getByTestId('now-playing').className).toContain('paused')
  })

  it('resets the timer and note display', async () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    // Count-in first; the session timer interval registers on the render after
    // the first real note, so it needs its own act block before advancing time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 650)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(screen.getByTestId('timer').textContent).not.toBe('00:00')

    fireEvent.click(screen.getByTestId('reset'))
    expect(screen.getByTestId('timer')).toHaveTextContent('00:00')
    expect(screen.getByTestId('current-note')).toHaveTextContent('A♭')
    expect(screen.getByTestId('playback-message')).toHaveTextContent('Press play to start.')
  })
})
