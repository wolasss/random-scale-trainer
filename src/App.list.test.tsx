import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { NOTE_LIST_LENGTH, STORAGE_KEYS } from './constants'
import { soundLog } from './test/fakeAudioEngine'
import { FAKE_CLOCKS_AND_FRAMES } from './test/fakeTimers'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

// Default 72 BPM → 0.833s beats; count-in is 4 beats starting 50ms in.
const COUNT_IN_MS = 4 * (60_000 / 72) + 100

// The setup cards stay folded away until the first run, so a test that reaches
// for a switch has to open them the way a first-time user would.
const revealSetup = () => fireEvent.click(screen.getByTestId('setup-reveal'))
const listOnlySwitch = () => screen.getByRole('switch', { name: 'List only' })
const chips = () => screen.getAllByTestId('note-queue-chip').map((chip) => chip.textContent)

describe('list-only mode', () => {
  beforeEach(() => {
    window.localStorage.clear()
    soundLog.record()
    vi.useFakeTimers(FAKE_CLOCKS_AND_FRAMES)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is off until it is asked for', () => {
    render(<App />)
    revealSetup()

    expect(screen.queryByTestId('note-queue')).toBeNull()
    expect(listOnlySwitch()).toHaveAttribute('aria-checked', 'false')
  })

  it('previews the coming notes as soon as it is switched on, before any start', () => {
    render(<App />)
    revealSetup()

    fireEvent.click(listOnlySwitch())

    expect(screen.getByTestId('note-queue')).toBeInTheDocument()
    expect(chips()).toHaveLength(NOTE_LIST_LENGTH)
    expect(screen.queryByTestId('current-note')).toBeNull()
    expect(screen.queryByTestId('next-note')).toBeNull()
  })

  it('shows only equally styled list items once playback starts', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 100)
    })

    expect(chips()).toHaveLength(NOTE_LIST_LENGTH)
    expect(screen.queryByTestId('current-note')).toBeNull()
    expect(screen.queryByTestId('next-note')).toBeNull()
    expect(screen.getAllByTestId('note-queue-chip').every((chip) => chip.className === 'note-queue-chip')).toBe(true)
  })

  it('keeps the metronome ticks but does not speak any note', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 100)
    })

    expect(soundLog.sounds.some((sound) => sound.kind === 'click')).toBe(true)
    expect(soundLog.sounds.some((sound) => sound.kind === 'note')).toBe(false)
  })

  it('moves the list along with the metronome', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    // One beat per note, so every beat calls the next one on the strip.
    window.localStorage.setItem(STORAGE_KEYS.beatsPerNote, '1')
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 100)
    })
    const dealt = chips()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000 / 72)
    })

    // What was second in the list moves to its head without gaining a current
    // style — position changes, visual weight does not.
    expect(chips()[0]).toBe(dealt[1])
    expect(screen.getAllByTestId('note-queue-chip')[0]).toHaveClass('note-queue-chip')
  })
})
