import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  it('offers a 30 minute goal option', () => {
    const onGoal = vi.fn()
    render(
      <SessionCard elapsedMs={15 * 60_000} goalMin={30} onGoal={onGoal} notesCalled={0} cyclesCompleted={0} />,
    )

    const radios = within(screen.getByTestId('session-goal')).getAllByRole('radio')
    expect(radios).toHaveLength(4)
    const thirty = radios[3]
    expect(thirty).toHaveAccessibleName('30 min')
    expect(thirty).toBeChecked()

    expect(screen.getByText('goal 30 min')).toBeInTheDocument()

    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(progress).toHaveAttribute('aria-valuetext', '50% of the 30 min goal')
  })

  it('reports the newly selected goal when the 30 min option is clicked', () => {
    const onGoal = vi.fn()
    render(<SessionCard elapsedMs={0} goalMin={10} onGoal={onGoal} notesCalled={0} cyclesCompleted={0} />)

    const thirty = within(screen.getByTestId('session-goal')).getByRole('radio', { name: '30 min' })
    fireEvent.click(thirty)

    expect(onGoal).toHaveBeenCalledWith(30)
  })
})
