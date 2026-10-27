import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_NOTE_STATS, recordNote, weakestPcs, type NoteStats } from '../lib/noteStats'
import type { SpellingPreference } from '../lib/notes'
import { NoteStatsCard } from './NoteStatsCard'

const hit = (responseMs: number) => ({ hit: true, responseMs }) as const
const miss = { hit: false, responseMs: null } as const

const fold = (stats: NoteStats, pc: number, verdicts: Array<ReturnType<typeof hit> | typeof miss>) =>
  verdicts.reduce<NoteStats>((next, verdict) => recordNote(next, pc, verdict), stats)

/** C: 2 of 3 at 0.6 s. A♯/B♭: called twice, never found. */
const PLAYED = fold(fold(EMPTY_NOTE_STATS, 0, [hit(400), hit(800), miss]), 10, [miss, miss])

const setup = ({
  stats = PLAYED,
  spelling = 'flat' as SpellingPreference,
}: { stats?: NoteStats; spelling?: SpellingPreference } = {}) => {
  const onDrill = vi.fn()
  const onReset = vi.fn()
  render(
    <NoteStatsCard
      stats={stats}
      spelling={spelling}
      weakest={weakestPcs(stats)}
      onDrill={onDrill}
      onReset={onReset}
    />,
  )

  return { onDrill, onReset, user: userEvent.setup() }
}

const row = (pc: number) => screen.getByTestId(`note-stat-${pc}`)

describe('NoteStatsCard', () => {
  it('shows all twelve notes, whether or not they have been played', () => {
    setup()

    expect(screen.getByTestId('note-stats-grid').children).toHaveLength(12)
    expect(row(0)).toHaveTextContent('67%')
    expect(row(0)).toHaveTextContent('C · 3 notes · 0.6 s avg')
  })

  it('says a note has not been practised rather than printing a zero it did not earn', () => {
    setup()

    expect(row(5)).toHaveTextContent('—')
    expect(row(5)).toHaveTextContent('F · not practised yet')
    expect(row(5)).toHaveAccessibleName('F: not practised yet')
  })

  it('reports a note that has been called and never found', () => {
    setup()

    expect(row(10)).toHaveTextContent('0%')
    expect(row(10)).toHaveTextContent('B♭ · 2 notes · no hits yet')
    expect(row(10)).toHaveAccessibleName('B♭: none of 2 notes hit yet')
  })

  it.each([
    ['flat' as const, 'B♭ ·'],
    ['sharp' as const, 'A♯ ·'],
    // Mixed asks for the same fret by either name, so the row carries both.
    ['mixed' as const, 'B♭/A♯ ·'],
  ])('names an accidental the way the chips do under %s spelling', (spelling, expected) => {
    setup({ spelling })

    expect(row(10)).toHaveTextContent(expected)
    // Naturals have one name under every preference.
    expect(row(0)).toHaveTextContent('C ·')
  })

  it('spells out the accuracy and the average in words', () => {
    setup()

    expect(row(0)).toHaveAccessibleName('C: 67 percent of 3 notes, 0.6 seconds on average')
  })

  describe('drilling the weakest', () => {
    it('is offered nothing to drill until something has been played', () => {
      setup({ stats: EMPTY_NOTE_STATS })

      expect(screen.getByTestId('note-stats-drill')).toBeDisabled()
      expect(screen.getByTestId('note-stats-drill')).toHaveAttribute(
        'title',
        'Play a few notes with the microphone on first',
      )
    })

    it('hands the weakest notes back on a press', async () => {
      const { onDrill, user } = setup()

      await user.click(screen.getByTestId('note-stats-drill'))

      expect(onDrill).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetting the record', () => {
    it('takes two presses, and says so in between', async () => {
      const { onReset, user } = setup()
      const button = screen.getByTestId('note-stats-reset')

      await user.click(button)
      expect(onReset).not.toHaveBeenCalled()
      expect(button).toHaveTextContent('Reset?')
      expect(button).toHaveAccessibleName('Reset? Press again to confirm')

      await user.click(button)
      expect(onReset).toHaveBeenCalledTimes(1)
      expect(button).toHaveAccessibleName('Reset note strengths')
    })

    it('disarms when it loses focus, so a press elsewhere is not a confirmation', async () => {
      const { onReset, user } = setup()
      const button = screen.getByTestId('note-stats-reset')

      await user.click(button)
      expect(button).toHaveTextContent('Reset?')

      await user.click(screen.getByTestId('note-stats-drill'))
      expect(button).toHaveAccessibleName('Reset note strengths')

      await user.click(button)
      expect(onReset).not.toHaveBeenCalled()
    })
  })

  it('reaches both controls by keyboard, each with a name', async () => {
    const { user } = setup()

    await user.tab()
    expect(screen.getByTestId('note-stats-drill')).toHaveFocus()
    expect(screen.getByTestId('note-stats-drill')).toHaveAccessibleName('Drill weakest')

    await user.tab()
    expect(screen.getByTestId('note-stats-reset')).toHaveFocus()
    expect(screen.getByTestId('note-stats-reset')).toHaveAccessibleName('Reset note strengths')
  })
})
