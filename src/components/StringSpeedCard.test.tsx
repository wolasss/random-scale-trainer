import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StringSpeedCard } from './StringSpeedCard'
import { EMPTY_STRING_SPEED, recordEarlyAdvance, type StringSpeedLog } from '../lib/stringSpeed'

describe('StringSpeedCard', () => {
  it('renders nothing without a single reading', () => {
    const { container } = render(<StringSpeedCard log={EMPTY_STRING_SPEED} tuning="standard" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a tile per recorded string, best time and count', () => {
    let log = recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 1900)
    log = recordEarlyAdvance(log, 'standard:40', 1200)
    render(<StringSpeedCard log={log} tuning="standard" />)

    expect(screen.getByTestId('string-speed-standard:40')).toBeInTheDocument()
    expect(screen.getByText('1.2s')).toBeInTheDocument()
    expect(screen.getByText('Standard · 6th string (E) · 2 times')).toBeInTheDocument()
  })

  it("puts the current tuning's strings first, then sorts the rest by best time", () => {
    let log = recordEarlyAdvance(EMPTY_STRING_SPEED, 'dropD:38', 500)
    log = recordEarlyAdvance(log, 'standard:45', 2000)
    log = recordEarlyAdvance(log, 'standard:40', 900)
    render(<StringSpeedCard log={log} tuning="standard" />)

    const order = within(screen.getByTestId('string-speed-grid'))
      .getAllByRole('img')
      .map((el) => el.getAttribute('data-testid'))
    expect(order).toEqual(['string-speed-standard:40', 'string-speed-standard:45', 'string-speed-dropD:38'])
  })

  it('says "1 time" in the singular', () => {
    const log = recordEarlyAdvance(EMPTY_STRING_SPEED, 'standard:40', 900)
    render(<StringSpeedCard log={log} tuning="standard" />)

    expect(screen.getByText('Standard · 6th string (E) · 1 time')).toBeInTheDocument()
  })

  it('skips an entry whose MIDI note is not a real string in its tuning', () => {
    const log: StringSpeedLog = { 'standard:999': { count: 1, bestMs: 900, lastMs: 900 } }
    render(<StringSpeedCard log={log} tuning="standard" />)

    expect(screen.getByTestId('string-speed-grid')).toBeEmptyDOMElement()
  })
})
