import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '../hooks/useSettings'
import { PracticeOptionsCard } from './PracticeOptionsCard'

const baseSettings = (): Settings => ({
  bpm: 72,
  beatsPerNote: 4,
  continuousMode: true,
  countInEnabled: true,
  speedRampMode: false,
  rampTargetBpm: 112,
  showFretboard: true,
  micEnabled: false,
  spelling: 'mixed',
  pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  sessionGoalMin: 10,
  endSoundEnabled: true,
})

const renderCard = (overrides: Partial<Settings> = {}) => {
  const onToggle = vi.fn()

  return {
    ...render(<PracticeOptionsCard settings={{ ...baseSettings(), ...overrides }} onToggle={onToggle} />),
    onToggle,
  }
}

describe('PracticeOptionsCard', () => {
  it('shows the end chime switch as on', () => {
    renderCard()

    expect(screen.getByRole('switch', { name: 'End chime' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows the end chime switch as off once it is turned off', () => {
    renderCard({ endSoundEnabled: false })

    expect(screen.getByRole('switch', { name: 'End chime' })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles the end chime setting', () => {
    const { onToggle } = renderCard()

    fireEvent.click(screen.getByRole('switch', { name: 'End chime' }))

    expect(onToggle).toHaveBeenCalledWith('endSoundEnabled')
  })
})
