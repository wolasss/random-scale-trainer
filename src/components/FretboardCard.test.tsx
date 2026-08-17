import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FretboardCard } from './FretboardCard'

describe('FretboardCard', () => {
  it('describes the neck as idle when no note is called', () => {
    render(<FretboardCard currentPc={null} currentDisplay={null} />)

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: no note called — all six strings, standard tuning',
    )
  })

  it('names the note and every lit position', () => {
    render(<FretboardCard currentPc={0} currentDisplay="C" />)

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: C at 1st string (e) fret 8, 2nd string (B) fret 1, 3rd string (G) fret 5, ' +
        '4th string (D) fret 10, 5th string (A) fret 3, 6th string (E) fret 8',
    )
    // The picture agrees with the reading: one dot per string, six in total.
    expect(screen.getAllByTestId('fret-dot')).toHaveLength(6)
  })

  it('rewrites the accessible name when the called note changes', () => {
    const { rerender } = render(<FretboardCard currentPc={0} currentDisplay="C" />)
    const before = screen.getByRole('img').getAttribute('aria-label')

    rerender(<FretboardCard currentPc={4} currentDisplay="E" />)
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
})
