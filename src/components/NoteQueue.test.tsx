import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NoteQueue } from './NoteQueue'
import type { NoteCall } from '../lib/notes'

const note = (display: string, cycleStart = false): NoteCall => ({
  pc: 0,
  display,
  audioKey: 'C',
  cycleStart,
  bagSize: 3,
})

const chips = () => screen.getAllByTestId('note-queue-chip').map((chip) => chip.textContent)

describe('NoteQueue', () => {
  it('reads the called note first and the queue behind it', () => {
    render(<NoteQueue current={note('C')} upcoming={[note('E♭'), note('G')]} />)

    expect(chips()).toEqual(['C', 'E♭', 'G'])
    expect(screen.getAllByTestId('note-queue-chip')[0].className).toContain('current')
  })

  it('shows only the queue while nothing is being called', () => {
    // Idle and count-in both land here: there is no note on the glyph yet, so
    // the strip must not highlight one.
    render(<NoteQueue current={null} upcoming={[note('E♭'), note('G')]} />)

    expect(chips()).toEqual(['E♭', 'G'])
    expect(screen.getAllByTestId('note-queue-chip')[0].className).not.toContain('current')
  })

  it('marks where the next round begins', () => {
    render(<NoteQueue current={note('C')} upcoming={[note('G'), note('A', true), note('D')]} />)

    const marked = screen.getAllByTestId('note-queue-chip').map((chip) => chip.className.includes('cycle-start'))
    expect(marked).toEqual([false, false, true, false])
  })

  /** The head of a fresh bag is where the strip starts, not a boundary in it. */
  it('never marks the head of the strip as a boundary', () => {
    render(<NoteQueue current={note('C', true)} upcoming={[note('G')]} />)

    expect(screen.getAllByTestId('note-queue-chip')[0].className).not.toContain('cycle-start')
  })

  it('renders an empty strip when there is nothing queued', () => {
    render(<NoteQueue current={null} upcoming={[]} />)

    expect(screen.getByTestId('note-queue')).toBeEmptyDOMElement()
  })
})
