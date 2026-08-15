import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionCard } from './SessionCard'

const renderCard = (elapsedMs: number) =>
  render(<SessionCard elapsedMs={elapsedMs} goalMin={10} onGoal={() => {}} notesCalled={0} cyclesCompleted={0} />)

describe('SessionCard', () => {
  it('keeps the announcement region silent while the goal is still ahead', () => {
    renderCard(5 * 60_000)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByTestId('session-progress-fill')).not.toHaveClass('done')

    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(progress).toHaveAttribute('aria-valuetext', expect.stringContaining('50%'))
  })

  it('announces the goal the moment the elapsed time meets it', () => {
    renderCard(10 * 60_000)

    expect(screen.getByRole('status')).toHaveTextContent('goal reached')
    expect(screen.getByTestId('session-progress-fill')).toHaveClass('done')

    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '100')
    expect(progress).toHaveAttribute('aria-valuetext', 'Practice goal of 10 min reached')
  })

  it('stays in the reached state once practice runs past the goal', () => {
    renderCard(12 * 60_000)

    expect(screen.getByRole('status')).toHaveTextContent('goal reached')
    expect(screen.getByTestId('session-progress-fill')).toHaveClass('done')

    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '100')
    expect(progress).toHaveAttribute('aria-valuetext', 'Practice goal of 10 min reached')
  })
})
