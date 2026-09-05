import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { NOTE_LIST_LENGTH, STORAGE_KEYS } from './constants'
import { FAKE_CLOCKS_AND_FRAMES } from './test/fakeTimers'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

// Default 72 BPM → 0.833s beats; count-in is 4 beats starting 50ms in.
const COUNT_IN_MS = 4 * (60_000 / 72) + 100

// The setup cards stay folded away until the first run, so a test that reaches
// for a switch has to open them the way a first-time user would.
const revealSetup = () => fireEvent.click(screen.getByTestId('setup-reveal'))
const noteListSwitch = () => screen.getByRole('switch', { name: 'Note list' })
const chips = () => screen.getAllByTestId('note-queue-chip').map((chip) => chip.textContent)

describe('the note list', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers(FAKE_CLOCKS_AND_FRAMES)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is off until it is asked for', () => {
    render(<App />)
    revealSetup()

    expect(screen.queryByTestId('note-queue')).toBeNull()
    expect(noteListSwitch()).toHaveAttribute('aria-checked', 'false')
  })

  it('previews the coming notes as soon as it is switched on, before any start', () => {
    render(<App />)
    revealSetup()

    fireEvent.click(noteListSwitch())

    expect(screen.getByTestId('note-queue')).toBeInTheDocument()
    expect(chips()).toHaveLength(NOTE_LIST_LENGTH)
    // Nothing is being called yet, so the strip is all still to come and it
    // opens on the note the NEXT chip names.
    expect(document.querySelector('.note-queue-chip.current')).toBeNull()
    expect(chips()[0]).toBe(screen.getByTestId('next-note').textContent)
  })

  it('leads with the note being called and the one after it once playback starts', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 100)
    })

    expect(chips()[0]).toBe(screen.getByTestId('current-note').textContent)
    expect(chips()[1]).toBe(screen.getByTestId('next-note').textContent)
    expect(chips()).toHaveLength(NOTE_LIST_LENGTH)
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

    // What was second in the queue is now the note on the glyph.
    expect(chips()[0]).toBe(dealt[1])
    expect(chips()[0]).toBe(screen.getByTestId('current-note').textContent)
  })
})
