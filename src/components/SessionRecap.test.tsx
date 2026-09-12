import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '../lib/session'
import { SessionRecap } from './SessionRecap'

const SUMMARY: SessionSummary = {
  elapsedMs: 12 * 60_000 + 34_000,
  notesCalled: 96,
  cyclesCompleted: 8,
  startBpm: 72,
  endBpm: 72,
  peakBpm: 72,
  setup: 'Naturals only (7)',
}

const renderRecap = (summary: Partial<SessionSummary> = {}, day = { todaySec: 930, streak: 4 }) => {
  const onDismiss = vi.fn()
  render(<SessionRecap summary={{ ...SUMMARY, ...summary }} day={day} onDismiss={onDismiss} />)

  return onDismiss
}

describe('SessionRecap', () => {
  it('reports the session in four readings', () => {
    renderRecap()

    expect(screen.getByTestId('recap-time')).toHaveTextContent('12:34')
    expect(screen.getByTestId('recap-notes')).toHaveTextContent('96')
    expect(screen.getByTestId('recap-rounds')).toHaveTextContent('8')
    expect(screen.getByTestId('session-recap')).toHaveTextContent('What you just practised')
  })

  it('names what was running and where the day stands', () => {
    renderRecap()

    expect(screen.getByTestId('recap-setup')).toHaveTextContent('Naturals only (7)')
    expect(screen.getByTestId('recap-day')).toHaveTextContent('Today: 16 min · 4-day streak')
  })

  it('says a tempo once when it never moved', () => {
    renderRecap()

    expect(screen.getByTestId('recap-tempo')).toHaveTextContent('72')
    expect(screen.getByTestId('session-recap')).toHaveTextContent('BPM held')
  })

  it('shows both ends when the tempo moved under the session', () => {
    renderRecap({ startBpm: 72, endBpm: 88, peakBpm: 88 })

    expect(screen.getByTestId('recap-tempo')).toHaveTextContent('72 → 88')
    expect(screen.getByTestId('session-recap')).toHaveTextContent('BPM, start to finish')
  })

  it('names a peak that beat both ends rather than hiding it', () => {
    renderRecap({ startBpm: 72, endBpm: 74, peakBpm: 96 })

    expect(screen.getByTestId('recap-tempo')).toHaveTextContent('72 → 74')
    expect(screen.getByTestId('session-recap')).toHaveTextContent('BPM, peaked at 96')
  })

  it('drops the streak clause rather than reporting a run of none', () => {
    renderRecap({}, { todaySec: 90, streak: 0 })

    expect(screen.getByTestId('recap-day')).toHaveTextContent('Today: 2 min')
    expect(screen.getByTestId('recap-day')).not.toHaveTextContent('streak')
  })

  it('says a day under a minute is under a minute', () => {
    renderRecap({}, { todaySec: 20, streak: 0 })

    expect(screen.getByTestId('recap-day')).toHaveTextContent('Today: under a minute')
  })

  it('hands Done straight back to the caller', () => {
    const onDismiss = renderRecap()

    fireEvent.click(screen.getByTestId('recap-done'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
