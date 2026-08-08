import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RAMP_BPM_STEP } from '../constants'
import { TempoCard } from './TempoCard'

const renderCard = (rampAvailable: boolean) =>
  render(
    <TempoCard
      bpm={60}
      beatsPerNote={4}
      poolSize={12}
      rampEnabled={false}
      rampTarget={80}
      rampAvailable={rampAvailable}
      onBpmChange={() => {}}
      onNudge={() => {}}
      onTap={() => {}}
      onBeatsPerNoteChange={() => {}}
      onRampToggle={() => {}}
      onRampTargetNudge={() => {}}
    />,
  )

describe('TempoCard', () => {
  it('describes what the ramp does when it can be switched on', () => {
    renderCard(true)

    expect(
      screen.getByText(`Tempo climbs ${RAMP_BPM_STEP} BPM every time you get through all the notes.`),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Speed ramp' })).toBeEnabled()
  })

  it('names the missing prerequisite when the ramp is out of reach', () => {
    renderCard(false)

    expect(screen.getByText('Needs Keep going switched on — the ramp climbs between rounds.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Speed ramp' })).toBeDisabled()
  })
})
