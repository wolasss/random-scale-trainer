import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PracticeLogCard } from './PracticeLogCard'
import { type PracticeHistory } from '../lib/history'

/** Saturday 14 Feb 2026, so the fortnight of bars runs 2026-02-01 … 2026-02-14. */
const TODAY = new Date(2026, 1, 14, 12)

/**
 * Days are written out as literal keys rather than derived through `dayKey` and
 * `shiftDays`, so the expectations below don't lean on the same helpers the card
 * is being read through.
 */
const RUNNING: PracticeHistory = {
  days: {
    '2026-01-20': { sec: 10 * 60, notes: 40 },
    '2026-01-21': { sec: 10 * 60, notes: 40 },
    '2026-01-22': { sec: 10 * 60, notes: 40 },
    '2026-01-23': { sec: 10 * 60, notes: 40 },
    '2026-02-12': { sec: 10 * 60, notes: 40 },
    '2026-02-13': { sec: 10 * 60, notes: 40 },
    '2026-02-14': { sec: 10 * 60, notes: 40 },
  },
}

/** Practised today, but not for long enough to count toward the streak. */
const SHORT_TODAY: PracticeHistory = { days: { '2026-02-14': { sec: 20, notes: 2 } } }

const renderCard = (history: PracticeHistory, overrides: Partial<Parameters<typeof PracticeLogCard>[0]> = {}) => {
  const props = {
    history,
    persisted: true,
    onClear: vi.fn(),
    getBackup: vi.fn(() => 'BACKUP-FILE-TEXT'),
    onImportBackup: vi.fn(() => true),
    today: TODAY,
    ...overrides,
  }

  return { ...render(<PracticeLogCard {...props} />), props }
}

describe('PracticeLogCard', () => {
  it('counts the run up to today and names the longest one behind it', () => {
    renderCard(RUNNING)

    expect(screen.getByTestId('practice-streak')).toHaveTextContent('3')
    expect(screen.getByText('days in a row')).toBeInTheDocument()
    expect(screen.getByTestId('practice-best')).toHaveTextContent('best 4')
  })

  it('says day, not days, on the first one', () => {
    renderCard({ days: { '2026-02-14': { sec: 10 * 60, notes: 40 } } })

    expect(screen.getByTestId('practice-streak')).toHaveTextContent('1')
    expect(screen.getByText('day in a row')).toBeInTheDocument()
    expect(screen.getByTestId('practice-best')).toHaveTextContent('your best yet')
  })

  it('keeps quiet about a best of zero', () => {
    renderCard(SHORT_TODAY)

    expect(screen.getByTestId('practice-streak')).toHaveTextContent('0')
    expect(screen.queryByTestId('practice-best')).toBeNull()
  })

  it('names all fourteen days, practised or not', () => {
    renderCard(RUNNING)

    const bars = within(screen.getByTestId('practice-bars')).getAllByRole('img')

    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
      '2026-02-01: no practice',
      '2026-02-02: no practice',
      '2026-02-03: no practice',
      '2026-02-04: no practice',
      '2026-02-05: no practice',
      '2026-02-06: no practice',
      '2026-02-07: no practice',
      '2026-02-08: no practice',
      '2026-02-09: no practice',
      '2026-02-10: no practice',
      '2026-02-11: no practice',
      '2026-02-12: 10 min',
      '2026-02-13: 10 min',
      '2026-02-14: 10 min',
    ])
  })

  it('totals the last seven days once there is something to total', () => {
    renderCard(RUNNING)

    expect(screen.getByTestId('practice-log-footer')).toHaveTextContent('Last 7 days: 30 min, 120 notes')
  })

  it('invites a first session rather than reporting an empty week', () => {
    renderCard({ days: {} })

    expect(screen.getByTestId('practice-log-footer')).toHaveTextContent('Your first session lands here.')
  })

  it('explains the drawn-but-uncounted bar a short day leaves behind', () => {
    renderCard(SHORT_TODAY)

    expect(screen.getByLabelText('2026-02-14: under a minute')).toBeInTheDocument()
    expect(screen.getByTestId('practice-log-footer')).toHaveTextContent('20 sec today — a minute starts the streak')
  })

  it('says nothing about the store while the log is being saved', () => {
    renderCard(RUNNING)

    expect(screen.queryByTestId('practice-log-ephemeral-notice')).toBeNull()
  })

  it('warns that the practice on screen is not being saved', () => {
    renderCard(RUNNING, { persisted: false })

    expect(screen.getByTestId('practice-log-ephemeral-notice')).toHaveTextContent('blocking saved data')
    // The bars are still drawn — the warning is what stops them from lying.
    expect(screen.getByTestId('practice-streak')).toHaveTextContent('3')
  })

  it('hands the reset straight to its owner', () => {
    const { props } = renderCard(RUNNING)

    fireEvent.click(screen.getByTestId('practice-log-clear'))

    expect(props.onClear).toHaveBeenCalledTimes(1)
  })
})
