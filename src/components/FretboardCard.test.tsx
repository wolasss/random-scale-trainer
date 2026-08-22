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

  it('narrows to the one string the call asks for', () => {
    render(<FretboardCard currentPc={0} currentDisplay="C" currentString={4} />)

    // C on the 5th string is one place only, and it is the only dot drawn.
    expect(screen.getAllByTestId('fret-dot')).toHaveLength(1)
    expect(screen.getByRole('img')).toHaveAccessibleName('Fretboard map: C at 5th string (A) fret 3')
    expect(screen.getByTestId('fretboard')).toHaveAttribute('data-string-called')

    const rows = document.querySelectorAll('.fret-row.target')
    expect(rows).toHaveLength(1)
    expect(rows[0].querySelector('.string-label')).toHaveTextContent('A')
  })

  it('names the called string in the hint above the neck', () => {
    render(<FretboardCard currentPc={4} currentDisplay="E" currentString={5} />)

    expect(screen.getByRole('heading', { name: 'On the neck' }).nextElementSibling).toHaveTextContent(
      'Every E on the 6th string (E)',
    )
    // Open and the 12th fret: the same string carries it twice.
    expect(screen.getAllByTestId('fret-dot')).toHaveLength(2)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: E at 6th string (E) open and fret 12',
    )
  })

  it('leaves the whole neck lit when no string is called', () => {
    render(<FretboardCard currentPc={0} currentDisplay="C" currentString={null} />)

    expect(screen.getAllByTestId('fret-dot')).toHaveLength(6)
    expect(screen.getByTestId('fretboard')).not.toHaveAttribute('data-string-called')
    expect(document.querySelectorAll('.fret-row.target')).toHaveLength(0)
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
