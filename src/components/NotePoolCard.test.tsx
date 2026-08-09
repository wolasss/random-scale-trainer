import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotePoolCard } from './NotePoolCard'

const LOCKED_TITLE = 'The last note stays selected — add another to remove this one'

const renderCard = (pool: number[]) =>
  render(
    <NotePoolCard
      pool={pool}
      spelling="sharp"
      onTogglePc={() => {}}
      onPreset={() => {}}
      onSpelling={() => {}}
    />,
  )

describe('NotePoolCard', () => {
  it('counts the notes you get before a repeat', () => {
    renderCard([0, 4, 7])

    expect(screen.getByTestId('pool-guarantee')).toHaveTextContent('Shuffled — you get all 3 before any repeats.')
    expect(screen.getByTestId('note-chip-0')).not.toHaveAttribute('aria-disabled')
  })

  it('says a single note just repeats', () => {
    renderCard([0])

    expect(screen.getByTestId('pool-guarantee')).toHaveTextContent('One note — it repeats until you add another.')
  })

  it('marks the last remaining chip as locked', () => {
    renderCard([0])

    const last = screen.getByTestId('note-chip-0')
    expect(last).toHaveAttribute('aria-disabled', 'true')
    expect(last).toHaveAttribute('title', LOCKED_TITLE)

    const unselected = screen.getByTestId('note-chip-4')
    expect(unselected).not.toHaveAttribute('aria-disabled')
    expect(unselected).not.toHaveAttribute('title')
  })
})
