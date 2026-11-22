import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'
import { installMatchMedia } from './test/matchMedia'
import { FAKE_CLOCKS } from './test/fakeTimers'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))
vi.mock('./lib/audio/mic', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/audio/mic')>(),
  isMicSupported: () => false,
}))

const originalUrl = window.location.href
const originalState: unknown = window.history.state
const sharedQuery = 'pool=0,4,7&bpm=90&beats=2'
const visit = (query = sharedQuery) => window.history.replaceState({ entry: 'retained' }, '', `/practice?${query}&source=student#keep`)
const expectSettings = (shared: boolean) => {
  const selected = shared ? [0, 4, 7] : [2, 5]
  for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
    expect(screen.getByTestId(`note-chip-${pitchClass}`)).toHaveAttribute('aria-pressed', String(selected.includes(pitchClass)))
  }
  expect(screen.getByTestId('bpm-value')).toHaveTextContent(shared ? '90' : '120')
  expect(within(screen.getByTestId('note-every')).getByRole('radio', { checked: true })).toHaveAttribute('data-value', shared ? '2' : '4')
  expect(window.localStorage.getItem(STORAGE_KEYS.notePool)).toBe(shared ? '0,4,7' : '2,5')
  expect(window.localStorage.getItem(STORAGE_KEYS.bpm)).toBe(shared ? '90' : '120')
  expect(window.localStorage.getItem(STORAGE_KEYS.beatsPerNote)).toBe(shared ? '2' : '4')
}

beforeEach(() => {
  vi.useFakeTimers(FAKE_CLOCKS)
  installMatchMedia({})
  window.localStorage.setItem(STORAGE_KEYS.notePool, '2,5')
  window.localStorage.setItem(STORAGE_KEYS.bpm, '120')
  window.localStorage.setItem(STORAGE_KEYS.beatsPerNote, '4')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scores: [] }) })))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.history.replaceState(originalState, '', originalUrl)
})

describe('opening shared setups', () => {
  it.each(['Use this setup', 'Dismiss'])('handles %s only after a choice, without asking again on reload', async (choice) => {
    visit()
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { unmount } = render(<App />)
    expect(screen.getByText(/Shared setup:/).closest('[role="status"]')).not.toBeNull()
    expectSettings(false)
    expect(replaceState).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: choice }))
    expectSettings(choice === 'Use this setup')
    expect(screen.queryByText(/Shared setup:/)).toBeNull()
    expect(replaceState).toHaveBeenCalledExactlyOnceWith({ entry: 'retained' }, '', '/practice?source=student#keep')
    expect(window.history.state).toEqual({ entry: 'retained' })
    unmount()
    render(<App />)
    await act(async () => {})
    expect(screen.queryByText(/Shared setup:/)).toBeNull()
    expectSettings(choice === 'Use this setup')
  })

  it('shows the notice before first-run setup controls are revealed', () => {
    window.localStorage.removeItem(STORAGE_KEYS.setupRevealed)
    visit('pool=0&bpm=30&beats=1')
    render(<App />)
    expect(screen.getByText('Shared setup: 1 note, 30 BPM, a note every 1 beat')).toBeInTheDocument()
    expect(screen.queryByTestId('bpm-value')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share setup' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Use this setup' }))
    expect(window.localStorage.getItem(STORAGE_KEYS.notePool)).toBe('0')
    expect(window.localStorage.getItem(STORAGE_KEYS.bpm)).toBe('30')
    fireEvent.click(screen.getByTestId('setup-reveal'))
    expect(screen.getByRole('button', { name: 'Share setup' })).toBeInTheDocument()
  })

  it.each(['pool=12&bpm=90&beats=2', `${sharedQuery}&challenge=band`, `${sharedQuery}&challenge=`, `${sharedQuery}&challenge=%21%21%21`])('ignores %s', async (query) => {
    visit(query)
    const replaceState = vi.spyOn(window.history, 'replaceState')
    render(<App />)
    await act(async () => {})
    expect(screen.queryByText(/Shared setup:/)).toBeNull()
    expectSettings(false)
    expect(replaceState).not.toHaveBeenCalled()
  })
})
