import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BEAT_SPAN_OPTIONS, SESSION_GOAL_OPTIONS } from '../../constants'
import type { BeatsPerNote, SessionGoalMin } from '../../hooks/useSettings'
import { SegmentedControl } from './SegmentedControl'

/** The tempo card's "New note every" group, wired to real state. */
function NoteEveryGroup() {
  const [beatsPerNote, setBeatsPerNote] = useState<BeatsPerNote>(4)

  return (
    <SegmentedControl
      ariaLabel="New note every"
      testId="note-every"
      options={BEAT_SPAN_OPTIONS.map((value) => ({
        value,
        label: value === 1 ? 'beat' : `${value} beats`,
      }))}
      value={beatsPerNote}
      onChange={setBeatsPerNote}
    />
  )
}

/** The session card's practice-goal group, wired to real state. */
function SessionGoalGroup() {
  const [goalMin, setGoalMin] = useState<SessionGoalMin>(10)

  return (
    <SegmentedControl
      className="loose"
      ariaLabel="Practice goal in minutes"
      testId="session-goal"
      options={SESSION_GOAL_OPTIONS.map((minutes) => ({ value: minutes, label: `${minutes} min` }))}
      value={goalMin}
      onChange={setGoalMin}
    />
  )
}

const options = (testId: string) => within(screen.getByTestId(testId)).getAllByRole('radio')

const press = (key: string) => fireEvent.keyDown(document.activeElement as HTMLElement, { key })

describe('SegmentedControl', () => {
  it('gives the group a single tab stop, on the checked option', () => {
    render(<NoteEveryGroup />)

    expect(options('note-every').map((option) => option.tabIndex)).toEqual([-1, -1, 0, -1, -1])
  })

  it('moves the selection and the focus with the arrow keys', () => {
    render(<NoteEveryGroup />)
    const [beat, twoBeats, fourBeats] = options('note-every')

    fourBeats.focus()
    press('ArrowLeft')

    expect(twoBeats).toHaveFocus()
    expect(twoBeats).toBeChecked()
    expect(fourBeats).not.toBeChecked()

    press('ArrowLeft')

    expect(beat).toHaveFocus()
    expect(beat).toBeChecked()
    // The tab stop travels with the selection, so Tab still lands here.
    expect(options('note-every').map((option) => option.tabIndex)).toEqual([0, -1, -1, -1, -1])
  })

  it('wraps around at both ends', () => {
    render(<NoteEveryGroup />)
    const all = options('note-every')
    const first = all[0]
    const last = all[all.length - 1]

    first.focus()
    press('ArrowLeft')

    expect(last).toHaveFocus()
    expect(last).toBeChecked()

    press('ArrowRight')

    expect(first).toHaveFocus()
    expect(first).toBeChecked()
  })

  it('jumps to the ends with Home and End', () => {
    render(<NoteEveryGroup />)
    const all = options('note-every')

    all[2].focus()
    press('End')

    expect(all[all.length - 1]).toHaveFocus()
    expect(all[all.length - 1]).toBeChecked()

    press('Home')

    expect(all[0]).toHaveFocus()
    expect(all[0]).toBeChecked()
  })

  it('steps a vertical-feeling group with ArrowDown and ArrowUp', () => {
    render(<SessionGoalGroup />)
    const [five, ten, twenty, thirty] = options('session-goal')

    ten.focus()
    press('ArrowDown')

    expect(twenty).toHaveFocus()
    expect(twenty).toBeChecked()

    press('ArrowDown')

    expect(thirty).toHaveFocus()
    expect(thirty).toBeChecked()

    press('ArrowDown')

    expect(five).toHaveFocus()
    expect(five).toBeChecked()

    press('ArrowUp')

    expect(thirty).toHaveFocus()
    expect(thirty).toBeChecked()
  })

  it('leaves other keys to whoever else is listening', () => {
    render(<SessionGoalGroup />)
    const [, ten] = options('session-goal')

    ten.focus()
    const handled = fireEvent.keyDown(ten, { key: ' ' })

    expect(handled).toBe(true)
    expect(ten).toBeChecked()
  })
})
