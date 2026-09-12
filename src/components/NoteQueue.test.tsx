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
  it('reads the head note first and gives every item the same style', () => {
    render(<NoteQueue current={note('C')} upcoming={[note('E♭'), note('G')]} />)

    expect(chips()).toEqual(['C', 'E♭', 'G'])
    expect(screen.getAllByTestId('note-queue-chip').map((chip) => chip.className)).toEqual([
      'note-queue-chip',
      'note-queue-chip',
      'note-queue-chip',
    ])
  })

  it('shows only the queue while nothing is being called', () => {
    // Idle and count-in both land here: the full strip is still to come.
    render(<NoteQueue current={null} upcoming={[note('E♭'), note('G')]} />)

    expect(chips()).toEqual(['E♭', 'G'])
    expect(screen.getAllByTestId('note-queue-chip')[0]).toHaveClass('note-queue-chip')
  })

  it('renders an empty strip when there is nothing queued', () => {
    render(<NoteQueue current={null} upcoming={[]} />)

    expect(screen.getByTestId('note-queue')).toBeEmptyDOMElement()
  })
})
