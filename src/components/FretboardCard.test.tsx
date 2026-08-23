import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FretboardCard } from './FretboardCard'
import type { TuningId } from '../lib/tuning'

const renderCard = (
  props: Partial<{
    currentPc: number | null
    currentDisplay: string | null
    tuning: TuningId
    capo: number
    onTuningChange: (value: TuningId) => void
    onCapoChange: (value: number) => void
  }> = {},
) =>
  render(
    <FretboardCard
      currentPc={null}
      currentDisplay={null}
      tuning="standard"
      capo={0}
      onTuningChange={() => {}}
      onCapoChange={() => {}}
      {...props}
    />,
  )

/** The string rows, without the row of fret numbers under them. */
const stringRows = () => document.querySelectorAll('.fret-row:not(.fret-numbers)')

describe('FretboardCard', () => {
  it('describes the neck as idle when no note is called', () => {
    renderCard()

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: no note called — all six strings, standard tuning',
    )
  })

  it('names the note and every lit position', () => {
    renderCard({ currentPc: 0, currentDisplay: 'C' })

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: C at 1st string (e) fret 8, 2nd string (B) fret 1, 3rd string (G) fret 5, ' +
        '4th string (D) fret 10, 5th string (A) fret 3, 6th string (E) fret 8',
    )
    // The picture agrees with the reading: one dot per string, six in total.
    expect(screen.getAllByTestId('fret-dot')).toHaveLength(6)
  })

  it('rewrites the accessible name when the called note changes', () => {
    const { rerender } = renderCard({ currentPc: 0, currentDisplay: 'C' })
    const before = screen.getByRole('img').getAttribute('aria-label')

    rerender(
      <FretboardCard
        currentPc={4}
        currentDisplay="E"
        tuning="standard"
        capo={0}
        onTuningChange={() => {}}
        onCapoChange={() => {}}
      />,
    )
    const after = screen.getByRole('img')

    expect(after.getAttribute('aria-label')).not.toBe(before)
    // The open strings that carry the note are called out as open, and the same
    // string's 12th fret dot is not left silent.
    expect(after).toHaveAccessibleName(
      'Fretboard map: E at 1st string (e) open and fret 12, 2nd string (B) fret 5, ' +
        '3rd string (G) fret 9, 4th string (D) fret 2, 5th string (A) fret 7, ' +
        '6th string (E) open and fret 12',
    )
  })

  it('moves the dropped string when the neck is in Drop D', () => {
    renderCard({ currentPc: 0, currentDisplay: 'C', tuning: 'drop-d' })

    const label = screen.getByRole('img').getAttribute('aria-label')
    expect(label).toContain('6th string (D) fret 10')
    // Nothing above the 6th string moves.
    expect(label).toContain('5th string (A) fret 3')
  })

  it('draws four rows for a four-string bass', () => {
    renderCard({ currentPc: 0, currentDisplay: 'C', tuning: 'bass-standard' })

    expect(stringRows()).toHaveLength(4)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: C at 1st string (G) fret 5, 2nd string (D) fret 10, ' +
        '3rd string (A) fret 3, 4th string (E) fret 8',
    )
  })

  it('starts the numbers at the capo and reads the neck from there', () => {
    renderCard({ currentPc: 0, currentDisplay: 'C', capo: 2 })

    const numbers = Array.from(document.querySelectorAll('.fret-number')).map((cell) => cell.textContent)
    expect(numbers[0]).toBe('2')
    expect(numbers[numbers.length - 1]).toBe('14')
    // The B string's C is behind the capo now, so it sounds an octave up.
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('2nd string (B) fret 13')
  })

  it('says which tuning and capo were picked', () => {
    const onTuningChange = vi.fn()
    const onCapoChange = vi.fn()
    renderCard({ onTuningChange, onCapoChange })

    fireEvent.change(screen.getByTestId('tuning-select'), { target: { value: 'dadgad' } })
    fireEvent.change(screen.getByTestId('capo-select'), { target: { value: '3' } })

    expect(onTuningChange).toHaveBeenCalledWith('dadgad')
    expect(onCapoChange).toHaveBeenCalledWith(3)
  })
})
