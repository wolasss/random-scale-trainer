import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoutineCard } from './RoutineCard'
import type { RoutineController } from '../hooks/useRoutine'
import type { Routine, RoutineBlock } from '../lib/routines'

const block = (name: string, overrides: Partial<RoutineBlock> = {}): RoutineBlock => ({
  name,
  poolKey: 'chromatic',
  pool: null,
  bpm: 72,
  beats: 4,
  acc: null,
  ramp: false,
  rampTo: 112,
  dur: 180,
  ...overrides,
})

const WORKOUT: Routine = {
  id: 'r-workout',
  name: 'Workout',
  blocks: [block('First', { dur: 240 }), block('Second'), block('Third', { dur: 120 })],
}

/** The card takes nothing but a controller, so the stub is the whole fixture. */
const renderCard = (selected: Routine, runtime: Partial<RoutineController> = {}) => {
  const controller: RoutineController = {
    routines: [selected],
    persisted: true,
    selected,
    blockIndex: 0,
    blockElapsedMs: 0,
    finished: false,
    adjusted: false,
    suggestedName: 'All 12 @ 72',
    select: vi.fn(),
    clear: vi.fn(),
    remove: vi.fn(),
    save: vi.fn(),
    duplicate: vi.fn(),
    addBlock: vi.fn(),
    removeBlock: vi.fn(),
    moveBlock: vi.fn(),
    setBlockDuration: vi.fn(),
    insertBlock: vi.fn(),
    skipBlock: vi.fn(),
    restart: vi.fn(),
    reset: vi.fn(),
    rebase: vi.fn(),
    tick: vi.fn(),
    notifyManualChange: vi.fn(),
    ...runtime,
  }

  render(<RoutineCard routine={controller} />)
  return controller
}

describe('RoutineCard block editing', () => {
  it('gives every block a named button for each edit', () => {
    renderCard(WORKOUT)

    for (const name of ['First', 'Second', 'Third']) {
      expect(screen.getByLabelText(`Move block ${name} earlier`)).toBeInTheDocument()
      expect(screen.getByLabelText(`Move block ${name} later`)).toBeInTheDocument()
      expect(screen.getByLabelText(`Shorten block ${name} by 30 seconds`)).toBeInTheDocument()
      expect(screen.getByLabelText(`Lengthen block ${name} by 30 seconds`)).toBeInTheDocument()
      expect(screen.getByLabelText(`Insert current settings before block ${name}`)).toBeInTheDocument()
    }
  })

  /** Nothing sits outside the sequence, so the outward moves are unavailable. */
  it('disables the moves that would run off either end', () => {
    renderCard(WORKOUT)

    expect(screen.getByLabelText('Move block First earlier')).toBeDisabled()
    expect(screen.getByLabelText('Move block First later')).toBeEnabled()
    expect(screen.getByLabelText('Move block Third later')).toBeDisabled()
    expect(screen.getByLabelText('Move block Third earlier')).toBeEnabled()
  })

  it('moves a block in either direction', () => {
    const controller = renderCard(WORKOUT)

    fireEvent.click(screen.getByLabelText('Move block Second earlier'))
    expect(controller.moveBlock).toHaveBeenCalledWith(1, -1)

    fireEvent.click(screen.getByLabelText('Move block Second later'))
    expect(controller.moveBlock).toHaveBeenCalledWith(1, 1)
  })

  it('retimes a block by a whole step in either direction', () => {
    const controller = renderCard(WORKOUT)

    fireEvent.click(screen.getByLabelText('Shorten block Second by 30 seconds'))
    expect(controller.setBlockDuration).toHaveBeenCalledWith(1, 150)

    fireEvent.click(screen.getByLabelText('Lengthen block Second by 30 seconds'))
    expect(controller.setBlockDuration).toHaveBeenCalledWith(1, 210)
  })

  /** A block already at the step has nothing left to give. */
  it('refuses to shorten a block below one step', () => {
    renderCard({ ...WORKOUT, blocks: [block('First'), block('Exam', { dur: 25 })] })

    expect(screen.getByLabelText('Shorten block Exam by 30 seconds')).toBeDisabled()
    expect(screen.getByLabelText('Lengthen block Exam by 30 seconds')).toBeEnabled()
  })

  it('inserts the current settings in front of the block that was asked', () => {
    const controller = renderCard(WORKOUT)

    fireEvent.click(screen.getByLabelText('Insert current settings before block Second'))
    expect(controller.insertBlock).toHaveBeenCalledWith(1)
  })

  /**
   * The armed index addresses a position, not a block — an edit that shuffles
   * positions has to disarm, or the tap that follows deletes a block the user
   * never armed.
   */
  it('disarms an armed delete before it edits the order', () => {
    renderCard(WORKOUT)

    fireEvent.click(screen.getByLabelText('Remove block Second'))
    expect(screen.getByText('Remove?')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Move block Second earlier'))
    expect(screen.queryByText('Remove?')).toBeNull()
  })

  it('disarms before an insert and before a retime too', () => {
    renderCard(WORKOUT)

    fireEvent.click(screen.getByLabelText('Remove block Second'))
    fireEvent.click(screen.getByLabelText('Insert current settings before block First'))
    expect(screen.queryByText('Remove?')).toBeNull()

    fireEvent.click(screen.getByLabelText('Remove block Second'))
    fireEvent.click(screen.getByLabelText('Lengthen block Third by 30 seconds'))
    expect(screen.queryByText('Remove?')).toBeNull()
  })
})

describe('RoutineCard lone-block timer', () => {
  const SETUP: Routine = { id: 'r-setup', name: 'Setup', blocks: [block('Only', { dur: null })] }
  const SINGLE: Routine = { id: 'r-single', name: 'Single', blocks: [block('Only', { dur: 540 })] }

  it('offers a timer to a saved setup, and nothing to reorder', () => {
    const controller = renderCard(SETUP)

    expect(screen.queryByTestId('routine-timeline')).toBeNull()
    expect(screen.queryByTestId('routine-remove-timer')).toBeNull()

    fireEvent.click(screen.getByTestId('routine-add-timer'))
    expect(controller.setBlockDuration).toHaveBeenCalledWith(0, 120)
  })

  it('lets a timed lone block be retimed or untimed — the trip back', () => {
    const controller = renderCard(SINGLE)

    expect(screen.queryByTestId('routine-add-timer')).toBeNull()

    fireEvent.click(screen.getByLabelText('Shorten block Only by 30 seconds'))
    expect(controller.setBlockDuration).toHaveBeenCalledWith(0, 510)

    fireEvent.click(screen.getByLabelText('Lengthen block Only by 30 seconds'))
    expect(controller.setBlockDuration).toHaveBeenCalledWith(0, 570)

    fireEvent.click(screen.getByTestId('routine-remove-timer'))
    expect(controller.setBlockDuration).toHaveBeenCalledWith(0, null)
  })

  /** Untimed inside a sequence stalls the routine, so it is never on offer. */
  it('never offers to remove a timer from a block that has neighbours', () => {
    renderCard(WORKOUT)

    expect(screen.queryByTestId('routine-remove-timer')).toBeNull()
    expect(screen.queryByTestId('routine-add-timer')).toBeNull()
  })
})
