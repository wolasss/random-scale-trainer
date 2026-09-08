import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'
import { PITCH_CLASSES } from './lib/notes'
import { installMatchMedia } from './test/matchMedia'
import { FAKE_CLOCKS_AND_FRAMES } from './test/fakeTimers'
import { withBlockedStorage } from './test/blockedStorage'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

/** The default all-12 pool with one chip off — no shipped preset owns this. */
const CUSTOM = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** Opens the save form, types a name and submits it. */
const savePool = (name: string) => {
  fireEvent.click(screen.getByTestId('preset-save'))
  fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: name } })
  fireEvent.submit(screen.getByTestId('preset-save-form'))
}

const savedOptions = () => {
  const group = screen.getByTestId('preset-select').querySelector('optgroup[label="Saved"]')
  return group ? [...group.querySelectorAll('option')].map((option) => option.textContent) : []
}

const pooled = () =>
  PITCH_CLASSES.filter((pc) => screen.getByTestId(`note-chip-${pc}`).getAttribute('aria-pressed') === 'true')

const stored = (): unknown => JSON.parse(window.localStorage.getItem(STORAGE_KEYS.savedPresets) ?? 'null')

describe('Saved note-pool presets', () => {
  beforeEach(() => {
    installMatchMedia({})
    vi.useFakeTimers(FAKE_CLOCKS_AND_FRAMES)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the saved pool under its storage key', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('note-chip-1'))
    savePool('No C sharp')

    expect(stored()).toEqual([{ name: 'No C sharp', pcs: CUSTOM }])
    expect(screen.getByTestId('preset-select')).toHaveValue('saved:No C sharp')
  })

  it('comes back next session and applies exactly the pool it saved', () => {
    const { unmount } = render(<App />)

    fireEvent.click(screen.getByTestId('note-chip-1'))
    savePool('No C sharp')
    unmount()

    render(<App />)

    expect(savedOptions()).toEqual(['No C sharp'])

    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: 'all' } })
    expect(pooled()).toHaveLength(12)

    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: 'saved:No C sharp' } })
    expect(pooled()).toEqual(CUSTOM)
    expect(screen.getByTestId('pool-guarantee')).toHaveTextContent('all 11')
  })

  it('deleting drops it from the selector and from storage', () => {
    const { unmount } = render(<App />)

    fireEvent.click(screen.getByTestId('note-chip-1'))
    savePool('No C sharp')
    unmount()

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete “No C sharp”' }))

    expect(savedOptions()).toEqual([])
    expect(screen.getByTestId('preset-select')).toHaveValue('custom')
    expect(stored()).toEqual([])
    expect(pooled()).toEqual(CUSTOM)
  })

  it('salvages a stored list it cannot fully read', () => {
    window.localStorage.setItem(
      STORAGE_KEYS.savedPresets,
      JSON.stringify([
        { name: 'Blues', pcs: [0, 3, 6] },
        { name: 'blues', pcs: [1, 4] },
        { name: 'Copy', pcs: [0, 3, 6] },
        { name: 'Broken', pcs: [0, 0] },
        'nonsense',
      ]),
    )

    render(<App />)

    expect(savedOptions()).toEqual(['Blues'])
    expect(screen.getByTestId('note-chip-0')).toBeInTheDocument()
    expect(stored()).toEqual([{ name: 'Blues', pcs: [0, 3, 6] }])
  })

  it('salvages an unparseable stored value', () => {
    window.localStorage.setItem(STORAGE_KEYS.savedPresets, 'not json')

    render(<App />)

    expect(savedOptions()).toEqual([])
    expect(screen.getByTestId('preset-select')).toHaveValue('all')
    expect(stored()).toEqual([])
  })

  it('keeps working for the session when writes are refused', () => {
    const restore = withBlockedStorage()
    try {
      render(<App />)

      fireEvent.click(screen.getByTestId('setup-reveal'))
      fireEvent.click(screen.getByTestId('note-chip-1'))

      expect(() => savePool('Ephemeral pool')).not.toThrow()

      expect(screen.getByTestId('preset-ephemeral-notice')).toBeInTheDocument()
      expect(savedOptions()).toEqual(['Ephemeral pool'])

      fireEvent.change(screen.getByTestId('preset-select'), { target: { value: 'all' } })
      fireEvent.change(screen.getByTestId('preset-select'), { target: { value: 'saved:Ephemeral pool' } })
      expect(pooled()).toEqual(CUSTOM)
    } finally {
      restore()
    }
  })
})
