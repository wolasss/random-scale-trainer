import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TunerPanel } from './TunerPanel'
import { STANDARD_TUNING, type TunerReading } from '../hooks/useTuner'

const A_STRING = STANDARD_TUNING[1]

const reading = (overrides: Partial<TunerReading> = {}): TunerReading => ({
  string: A_STRING,
  cents: 0,
  status: 'in-tune',
  note: 'A2',
  frequency: 110,
  ...overrides,
})

describe('TunerPanel', () => {
  it('renders nothing at all while it is closed', () => {
    render(<TunerPanel open={false} onClose={() => {}} status="listening" reading={reading()} />)

    expect(screen.queryByTestId('tuner-panel')).toBeNull()
  })

  it('names the string, the note heard, and reads out in tune', () => {
    render(<TunerPanel open onClose={() => {}} status="listening" reading={reading({ cents: 2 })} />)

    expect(screen.getByTestId('tuner-string')).toHaveTextContent('5th string')
    expect(screen.getByTestId('tuner-string')).toHaveTextContent('A')
    expect(screen.getByTestId('tuner-note')).toHaveTextContent('A2')
    expect(screen.getByTestId('tuner-reading')).toHaveTextContent('5th string A — in tune')
    expect(screen.getByTestId('tuner-meter')).toHaveAttribute('data-state', 'in-tune')
  })

  /**
   * The needle is a picture; the line beside it is the reading. Anyone who
   * cannot see the one still gets the other, and gets it announced.
   */
  it('puts the whole reading in a live region', () => {
    render(<TunerPanel open onClose={() => {}} status="listening" reading={reading({ cents: -12, status: 'flat' })} />)

    const live = screen.getByTestId('tuner-reading')
    expect(live).toHaveAttribute('aria-live', 'polite')
    // Rounded to five: an exact figure re-announced twenty times a second is
    // no use to anybody.
    expect(live).toHaveTextContent('5th string A — 10 cents flat')
    // ...and the needle itself is not read out twice.
    expect(screen.getByTestId('tuner-meter')).toHaveAttribute('aria-hidden', 'true')
  })

  it('says which way a sharp string is out', () => {
    render(<TunerPanel open onClose={() => {}} status="listening" reading={reading({ cents: 24, status: 'sharp' })} />)

    expect(screen.getByTestId('tuner-reading')).toHaveTextContent('5th string A — 25 cents sharp')
    expect(screen.getByTestId('tuner-meter')).toHaveAttribute('data-state', 'sharp')
  })

  it('asks for a string when it has heard nothing yet', () => {
    render(<TunerPanel open onClose={() => {}} status="listening" reading={null} />)

    expect(screen.getByTestId('tuner-reading')).toHaveTextContent('Play a string.')
    expect(screen.queryByTestId('tuner-message')).toBeNull()
  })

  it('says so when the microphone is blocked', () => {
    render(<TunerPanel open onClose={() => {}} status="denied" reading={null} />)

    expect(screen.getByTestId('tuner-message')).toHaveTextContent('Mic blocked')
    expect(screen.queryByTestId('tuner-meter')).toBeNull()
  })

  it('says so when the browser has no microphone at all', () => {
    render(<TunerPanel open onClose={() => {}} status="unsupported" reading={null} />)

    expect(screen.getByTestId('tuner-message')).toHaveTextContent('This browser has no microphone to listen with.')
    expect(screen.queryByTestId('tuner-meter')).toBeNull()
  })

  it('closes on the button and on Escape', () => {
    const onClose = vi.fn()
    render(<TunerPanel open onClose={onClose} status="listening" reading={reading()} />)

    fireEvent.click(screen.getByTestId('tuner-close'))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('opens with focus on the way out', () => {
    render(<TunerPanel open onClose={() => {}} status="listening" reading={reading()} />)

    expect(document.activeElement).toBe(screen.getByTestId('tuner-close'))
  })
})
