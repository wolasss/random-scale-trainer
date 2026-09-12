import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'
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
const metronomeSwitch = () => screen.getByRole('switch', { name: 'Metronome' })
const notes = () => screen.getAllByTestId('note-list-item').map((item) => item.textContent)

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

    expect(screen.queryByTestId('note-list')).toBeNull()
    expect(listOnlySwitch()).toHaveAttribute('aria-checked', 'false')
  })

  it('previews the coming notes as soon as it is switched on, before any start', () => {
    render(<App />)
    revealSetup()

    fireEvent.click(listOnlySwitch())

    expect(screen.getByTestId('note-list')).toBeInTheDocument()
    expect(notes()).toHaveLength(12)
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent(
      '12-note workout · 72 BPM · accent every 4 beats',
    )
    expect(screen.getByRole('button', { name: 'New shuffled list' })).toBeEnabled()
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeEnabled()
    expect(screen.queryByTestId('beat-dots')).toBeNull()
    expect(document.querySelector('.transport-bar')).toBeNull()
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

    expect(notes()).toHaveLength(12)
    expect(screen.queryByTestId('current-note')).toBeNull()
    expect(screen.queryByTestId('next-note')).toBeNull()
    expect(screen.getAllByTestId('note-list-item').every((item) => item.className === 'note-list-item')).toBe(true)
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

  it('runs the stopwatch silently when its metronome is switched off', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
    render(<App />)

    fireEvent.click(metronomeSwitch())
    expect(metronomeSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(window.localStorage.getItem(STORAGE_KEYS.listMetronome)).toBe('false')
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('12-note workout · Metronome off')

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 1_200)
    })

    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:01')
    expect(screen.getByText('Metronome off')).toBeInTheDocument()
    expect(soundLog.sounds).toEqual([])
  })

  it('hides incompatible controls and content without changing their saved preferences', () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
    window.localStorage.setItem(STORAGE_KEYS.micListen, 'true')
    window.localStorage.setItem(STORAGE_KEYS.showFretboard, 'true')
    render(<App />)

    expect(screen.queryByRole('switch', { name: 'Listen for my playing' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Fretboard map' })).toBeNull()
    expect(screen.queryByTestId('fretboard')).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEYS.micListen)).toBe('true')
    expect(window.localStorage.getItem(STORAGE_KEYS.showFretboard)).toBe('true')

    fireEvent.click(listOnlySwitch())

    expect(screen.getByRole('switch', { name: 'Listen for my playing' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Fretboard map' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('fretboard')).toBeInTheDocument()
  })

  it('keeps the generated list unchanged while the metronome runs', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    // One beat per note used to shift the queue on every click, so it is the
    // strongest regression case for a list that must now remain fixed.
    window.localStorage.setItem(STORAGE_KEYS.beatsPerNote, '1')
    render(<App />)
    const generated = notes()

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 3 * (60_000 / 72))
    })

    expect(notes()).toEqual(generated)
    expect(notes()).toHaveLength(12)
  })

  it('starts, stops and resets the workout beside the fixed list', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }))
    await act(async () => {})
    expect(screen.getByText('Starting in 4')).toBeInTheDocument()
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
    expect(screen.getByTestId('note-list-lock')).toHaveTextContent('List locked during attempt')
    expect(screen.queryByRole('button', { name: 'New shuffled list' })).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 1_200)
    })

    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:01')
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    const stoppedAt = screen.getByTestId('list-workout-time').textContent

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(screen.getByTestId('list-workout-time')).toHaveTextContent(stoppedAt ?? '')
    expect(screen.getByText('Finished in')).toBeInTheDocument()
    expect(screen.getByText('Result ready to note down')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry same list' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Continue attempt' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'New shuffled list' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Reset timer' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'New shuffled list' }))
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeEnabled()
  })

  it('starts a fresh timed attempt from a held result', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 1_200)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:01')

    fireEvent.click(screen.getByRole('button', { name: 'Retry same list' }))
    await act(async () => {})

    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
    expect(screen.getByText('Starting in 4')).toBeInTheDocument()
    expect(screen.getByTestId('note-list-lock')).toHaveTextContent('List locked during attempt')
  })

  it('makes Space follow the visible primary action after a result', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNT_IN_MS + 1_200)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByRole('button', { name: 'Retry same list' })).toBeEnabled()

    fireEvent.keyDown(window, { code: 'Space' })
    await act(async () => {})

    expect(screen.getByTestId('list-workout-time')).toHaveTextContent('00:00')
    expect(screen.getByText('Starting in 4')).toBeInTheDocument()
    expect(screen.getByTestId('note-list-lock')).toHaveTextContent('List locked during attempt')
  })
})
