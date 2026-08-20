import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

/** The setup cards, by the testid or element each is reachable through. */
const SETUP_CARDS = ['routine-card', 'preset-select', 'bpm-value', 'session-goal', 'practice-bars']

const setupIsOnScreen = () => SETUP_CARDS.every((testId) => screen.queryByTestId(testId) !== null)

describe('first run', () => {
  // The shared setup seeds a returning user; this file is about the other one.
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEYS.setupRevealed)
  })

  it('opens on the stage and one fold, with every setup card away', () => {
    render(<App />)

    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')
    expect(screen.getByTestId('setup-reveal')).toBeInTheDocument()

    for (const testId of SETUP_CARDS) {
      expect(screen.queryByTestId(testId)).toBeNull()
    }
  })

  it('opens the setup for good on the first start press', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))

    expect(setupIsOnScreen()).toBe(true)
    expect(screen.queryByTestId('setup-reveal')).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEYS.setupRevealed)).toBe('true')
  })

  it('opens the setup when the fold itself is tapped', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('setup-reveal'))

    expect(setupIsOnScreen()).toBe(true)
    expect(screen.queryByTestId('setup-reveal')).toBeNull()
  })

  it('stays open on the next launch', () => {
    const { unmount } = render(<App />)
    fireEvent.click(screen.getByTestId('setup-reveal'))
    unmount()

    render(<App />)

    expect(screen.queryByTestId('setup-reveal')).toBeNull()
    expect(setupIsOnScreen()).toBe(true)
  })
})
