import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PracticeOptionsCard } from './PracticeOptionsCard'
import { isMicSupported } from '../lib/audio/mic'
import type { Settings } from '../hooks/useSettings'

// Support is read straight off the browser, so the capability check is the one
// thing faked here; the rest of the mic module is left alone.
vi.mock('../lib/audio/mic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/audio/mic')>()),
  isMicSupported: vi.fn(() => true),
}))

const SETTINGS: Settings = {
  bpm: 80,
  beatsPerNote: 4,
  continuousMode: true,
  countInEnabled: true,
  speakNotes: true,
  speedRampMode: false,
  rampTargetBpm: 120,
  showFretboard: true,
  micEnabled: false,
  spelling: 'flat',
  pool: [0, 2, 4, 5, 7, 9, 11],
  sessionGoalMin: 10,
  endSoundEnabled: true,
}

const renderCard = (overrides: Partial<Settings> = {}) => {
  const props = { settings: { ...SETTINGS, ...overrides }, onToggle: vi.fn() }

  return { ...render(<PracticeOptionsCard {...props} />), props }
}

describe('PracticeOptionsCard mic switch', () => {
  beforeEach(() => {
    vi.mocked(isMicSupported).mockReturnValue(true)
  })

  it('offers the switch when the browser can listen', () => {
    const { props } = renderCard()
    const micSwitch = screen.getByRole('switch', { name: 'Listen for my playing' })

    expect(micSwitch).toBeEnabled()
    expect(micSwitch).toHaveAccessibleDescription('The mic verifies each note you play, with instant feedback.')

    fireEvent.click(micSwitch)

    expect(props.onToggle).toHaveBeenCalledWith('micEnabled')
  })

  it('says why the switch is off when the browser cannot listen', () => {
    vi.mocked(isMicSupported).mockReturnValue(false)
    // Stored on from a browser that could listen: it still has to read as off.
    const { props } = renderCard({ micEnabled: true })
    const micSwitch = screen.getByRole('switch', { name: 'Listen for my playing' })

    expect(micSwitch).toBeDisabled()
    expect(micSwitch).toHaveAttribute('aria-checked', 'false')
    expect(micSwitch).toHaveAccessibleDescription('This browser has no microphone to listen with.')

    fireEvent.click(micSwitch)

    expect(props.onToggle).not.toHaveBeenCalled()
  })

  it('leaves the other switches working without a microphone', () => {
    vi.mocked(isMicSupported).mockReturnValue(false)
    const { props } = renderCard()

    for (const name of ['Keep going', 'Count in', 'Say the note', 'Fretboard map']) {
      fireEvent.click(screen.getByRole('switch', { name }))
    }

    expect(props.onToggle.mock.calls).toEqual([
      ['continuousMode'],
      ['countInEnabled'],
      ['speakNotes'],
      ['showFretboard'],
    ])
  })
})

describe('PracticeOptionsCard speak-notes switch', () => {
  it('renders checked from settings and reports its subtitle', () => {
    const { props } = renderCard({ speakNotes: false })
    const speakSwitch = screen.getByRole('switch', { name: 'Say the note' })

    expect(speakSwitch).toHaveAttribute('aria-checked', 'false')
    expect(speakSwitch).toHaveAccessibleDescription(
      'Off leaves the note on screen only — name it yourself before checking.',
    )

    fireEvent.click(speakSwitch)

    expect(props.onToggle).toHaveBeenCalledWith('speakNotes')
  })
})
