import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'
import { FAKE_CLOCKS_AND_FRAMES } from './test/fakeTimers'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

// 72 BPM at one beat a note, no count-in: the first note lands 50ms in, then
// one every 833ms.
const BEAT_MS = 60_000 / 72
const FOURTHS_FROM_C = ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'B', 'E', 'A', 'D', 'G']

const orderRadio = (name: string) => screen.getByRole('radio', { name })
const listNotes = () => screen.getAllByTestId('note-list-item').map((item) => item.textContent)

/** The notes called over the first `count` beats, read off the hero. */
const callNotes = async (count: number) => {
  fireEvent.click(screen.getByTestId('play-toggle'))
  const called: string[] = []
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  for (let index = 0; index < count; index += 1) {
    called.push(screen.getByTestId('current-note').textContent ?? '')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS)
    })
  }

  return called
}

describe('note order', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(STORAGE_KEYS.setupRevealed, 'true')
    window.localStorage.setItem(STORAGE_KEYS.spelling, 'flat')
    window.localStorage.setItem(STORAGE_KEYS.beatsPerNote, '1')
    window.localStorage.setItem(STORAGE_KEYS.countIn, 'false')
    // Every random pick lands on the first pool note, C.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.useFakeTimers(FAKE_CLOCKS_AND_FRAMES)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('stores Fourths when picked and calls the notes round the circle', async () => {
    render(<App />)

    expect(orderRadio('Shuffled')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(orderRadio('Fourths'))

    expect(orderRadio('Fourths')).toHaveAttribute('aria-checked', 'true')
    expect(window.localStorage.getItem(STORAGE_KEYS.noteOrder)).toBe('fourths')
    expect(await callNotes(4)).toEqual(FOURTHS_FROM_C.slice(0, 4))
  })

  it('honours a stored Fourths on mount', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteOrder, 'fourths')
    render(<App />)

    expect(orderRadio('Fourths')).toHaveAttribute('aria-checked', 'true')
    expect(await callNotes(3)).toEqual(FOURTHS_FROM_C.slice(0, 3))
  })

  it('lists the notes in fourths order in list mode', () => {
    window.localStorage.setItem(STORAGE_KEYS.noteOrder, 'fourths')
    window.localStorage.setItem(STORAGE_KEYS.noteList, 'true')
    render(<App />)

    expect(listNotes()).toEqual(FOURTHS_FROM_C)
  })

  it('still shuffles in a challenge, whatever the stored order', async () => {
    window.localStorage.setItem(STORAGE_KEYS.noteOrder, 'fourths')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ scores: [] }) }) as unknown as Response),
    )
    window.history.replaceState({}, '', '/?challenge=demo')
    render(<App />)
    await act(async () => {})

    expect(await callNotes(3)).not.toEqual(FOURTHS_FROM_C.slice(0, 3))
  })
})
