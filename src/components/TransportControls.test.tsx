import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { GoalReadout } from './TransportControls'
import { STORAGE_KEYS } from '../constants'

const readout = () => screen.getByTestId('transport-readout')

beforeEach(() => {
  localStorage.clear()
})

describe('GoalReadout', () => {
  it('counts up until it is tapped, then counts down, then back', async () => {
    const user = userEvent.setup()
    render(<GoalReadout elapsedMs={0} goalMin={10} />)

    expect(readout()).toHaveTextContent('00:00 of 10 min')

    await user.click(readout())
    expect(readout()).toHaveTextContent('10:00 left')

    await user.click(readout())
    expect(readout()).toHaveTextContent('00:00 of 10 min')
  })

  it('subtracts the elapsed time from the goal', async () => {
    const user = userEvent.setup()
    render(<GoalReadout elapsedMs={192_000} goalMin={20} />)

    expect(readout()).toHaveTextContent('03:12 of 20 min')

    await user.click(readout())
    expect(readout()).toHaveTextContent('16:48 left')
  })

  it('clamps at zero once practice runs past the goal', async () => {
    const user = userEvent.setup()
    render(<GoalReadout elapsedMs={25 * 60_000} goalMin={20} />)

    await user.click(readout())
    expect(readout()).toHaveTextContent('00:00 left')
    expect(readout().textContent).not.toContain('-')
  })

  it('names the reading on screen before it names the tap', async () => {
    const user = userEvent.setup()
    render(<GoalReadout elapsedMs={192_000} goalMin={20} />)

    expect(readout()).toHaveAccessibleName(
      'Elapsed time, 03:12 of 20 min — tap to show remaining time',
    )

    await user.click(readout())
    expect(readout()).toHaveAccessibleName('Remaining time, 16:48 left — tap to show elapsed time')
  })

  it('remembers the choice across a remount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<GoalReadout elapsedMs={192_000} goalMin={20} />)

    await user.click(readout())
    expect(readout()).toHaveTextContent('16:48 left')
    unmount()

    render(<GoalReadout elapsedMs={192_000} goalMin={20} />)
    expect(readout()).toHaveTextContent('16:48 left')
  })

  it('counts up when the stored value is not one of the two modes', () => {
    localStorage.setItem(STORAGE_KEYS.goalCountdown, 'nonsense')
    render(<GoalReadout elapsedMs={192_000} goalMin={20} />)

    expect(readout()).toHaveTextContent('03:12 of 20 min')
  })
})
