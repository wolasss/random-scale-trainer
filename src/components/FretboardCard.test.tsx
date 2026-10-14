import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FretboardCard } from './FretboardCard'
import { useKeyboardShortcuts, type KeyboardShortcutHandlers } from '../hooks/useKeyboardShortcuts'

const renderCard = (props: Partial<Parameters<typeof FretboardCard>[0]> = {}) =>
  render(
    <FretboardCard
      currentPc={null}
      currentDisplay={null}
      tuning="standard"
      leftHanded={false}
      onTuning={() => {}}
      onLeftHanded={() => {}}
      {...props}
    />,
  )

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
        leftHanded={false}
        onTuning={() => {}}
        onLeftHanded={() => {}}
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

  it('follows the tuning the neck is in', () => {
    renderCard({ currentPc: 0, currentDisplay: 'C', tuning: 'dropD' })

    // Only the dropped 6th string moves: C is two frets further up it.
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: C at 1st string (e) fret 8, 2nd string (B) fret 1, 3rd string (G) fret 5, ' +
        '4th string (D) fret 10, 5th string (A) fret 3, 6th string (D) fret 10',
    )
    expect(screen.getByTestId('tuning-select')).toHaveValue('dropD')
  })

  it('reads a left-handed neck from the 6th string down, and says so when idle', () => {
    renderCard({ currentPc: 0, currentDisplay: 'C', leftHanded: true })

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: C at 6th string (E) fret 8, 5th string (A) fret 3, 4th string (D) fret 10, ' +
        '3rd string (G) fret 5, 2nd string (B) fret 1, 1st string (e) fret 8',
    )
    // The row labels are drawn in that same order.
    expect(screen.getAllByText(/^[eEBGDA]♭?$/).map((node) => node.textContent)).toEqual([
      'E',
      'A',
      'D',
      'G',
      'B',
      'e',
    ])
  })

  it('names the tuning and the flip in the idle hint', () => {
    renderCard({ tuning: 'dadgad', leftHanded: true })

    expect(screen.getByText('Where each note lives — all six strings, DADGAD tuning, left-handed')).toBeVisible()
  })

  it('hands the chosen tuning and handedness back', async () => {
    const user = userEvent.setup()
    const onTuning = vi.fn()
    const onLeftHanded = vi.fn()
    renderCard({ onTuning, onLeftHanded })

    await user.selectOptions(screen.getByTestId('tuning-select'), 'openG')
    expect(onTuning).toHaveBeenCalledWith('openG')

    await user.click(screen.getByRole('radio', { name: 'Left' }))
    expect(onLeftHanded).toHaveBeenCalledWith(true)
  })

  it('puts the scrollable neck in the tab order', () => {
    renderCard({ currentPc: 0, currentDisplay: 'C' })

    const scroller = screen.getByRole('group', { name: 'Fretboard map, scrolls sideways' })

    expect(scroller).toHaveProperty('tabIndex', 0)
    expect(scroller).toContainElement(screen.getByRole('img'))
  })

  it('lists every string under a closed-by-default disclosure, and opens on click', async () => {
    const user = userEvent.setup()
    renderCard({ currentPc: 0, currentDisplay: 'C' })

    const disclosure = screen.getByTestId('fretboard-positions')
    expect(disclosure).not.toHaveAttribute('open')
    const summary = screen.getByText('Read fret positions')
    for (const entry of screen.getAllByRole('listitem')) {
      expect(entry).not.toBeVisible()
    }

    await user.click(summary)

    const entries = screen.getAllByRole('listitem')
    expect(entries.map((entry) => entry.textContent)).toEqual([
      '1st string (e) fret 8',
      '2nd string (B) fret 1',
      '3rd string (G) fret 5',
      '4th string (D) fret 10',
      '5th string (A) fret 3',
      '6th string (E) fret 8',
    ])
    // Opening the disclosure doesn't touch the map's own label.
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Fretboard map: C at 1st string (e) fret 8, 2nd string (B) fret 1, 3rd string (G) fret 5, ' +
        '4th string (D) fret 10, 5th string (A) fret 3, 6th string (E) fret 8',
    )
  })

  it('updates the disclosure entries when the called note changes', async () => {
    const user = userEvent.setup()
    const { rerender } = renderCard({ currentPc: 0, currentDisplay: 'C' })
    await user.click(screen.getByText('Read fret positions'))

    rerender(
      <FretboardCard
        currentPc={4}
        currentDisplay="E"
        tuning="standard"
        leftHanded={false}
        onTuning={() => {}}
        onLeftHanded={() => {}}
      />,
    )

    expect(screen.getAllByRole('listitem').map((entry) => entry.textContent)).toEqual([
      '1st string (e) open and fret 12',
      '2nd string (B) fret 5',
      '3rd string (G) fret 9',
      '4th string (D) fret 2',
      '5th string (A) fret 7',
      '6th string (E) open and fret 12',
    ])
  })

  it('reads the disclosure in the tuning the neck is in', async () => {
    const user = userEvent.setup()
    renderCard({ currentPc: 0, currentDisplay: 'C', tuning: 'dropD' })
    await user.click(screen.getByText('Read fret positions'))

    const entries = screen.getAllByRole('listitem')
    expect(entries[5].textContent).toBe('6th string (D) fret 10')
  })

  it('orders the disclosure 6th string first when left-handed', async () => {
    const user = userEvent.setup()
    renderCard({ currentPc: 0, currentDisplay: 'C', leftHanded: true })
    await user.click(screen.getByText('Read fret positions'))

    expect(screen.getAllByRole('listitem').map((entry) => entry.textContent)).toEqual([
      '6th string (E) fret 8',
      '5th string (A) fret 3',
      '4th string (D) fret 10',
      '3rd string (G) fret 5',
      '2nd string (B) fret 1',
      '1st string (e) fret 8',
    ])
  })

  it('shows the idle explanation in the disclosure when no note is called', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByText('Read fret positions'))

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByText('No note called — all six strings, standard tuning')).toBeVisible()
  })

  it('leaves Space and Enter on the disclosure summary alone, not the transport', async () => {
    const user = userEvent.setup()
    const handlers: KeyboardShortcutHandlers = {
      onSpace: vi.fn(),
      onTap: vi.fn(),
      onTempoUp: vi.fn(),
      onTempoDown: vi.fn(),
      onReset: vi.fn(),
    }

    function Wrapper() {
      useKeyboardShortcuts(handlers)
      return (
        <FretboardCard
          currentPc={0}
          currentDisplay="C"
          tuning="standard"
          leftHanded={false}
          onTuning={() => {}}
          onLeftHanded={() => {}}
        />
      )
    }

    render(<Wrapper />)
    const summary = screen.getByText('Read fret positions')

    for (let tabs = 0; tabs < 20 && document.activeElement !== summary; tabs += 1) {
      await user.tab()
    }
    expect(summary).toHaveFocus()

    await user.keyboard(' ')
    await user.keyboard('{Enter}')

    expect(handlers.onSpace).not.toHaveBeenCalled()
    expect(handlers.onTap).not.toHaveBeenCalled()
    expect(handlers.onTempoUp).not.toHaveBeenCalled()
    expect(handlers.onTempoDown).not.toHaveBeenCalled()
    expect(handlers.onReset).not.toHaveBeenCalled()
  })
})
