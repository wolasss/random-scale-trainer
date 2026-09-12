import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PITCH_CLASSES } from '../lib/notes'
import { NoteList } from './NoteList'

const items = () => screen.getAllByTestId('note-list-item')
const names = () => items().map((item) => item.textContent)

describe('NoteList', () => {
  it('deals every selected note exactly once with identical item styling', () => {
    render(<NoteList pool={PITCH_CLASSES} spelling="sharp" random={() => 0.99} />)

    expect(names()).toEqual(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'])
    expect(items()).toHaveLength(12)
    expect(items().every((item) => item.className === 'note-list-item')).toBe(true)
  })

  it('uses the selected pool rather than padding a short list with repeats', () => {
    render(<NoteList pool={[0, 4, 7]} spelling="flat" random={() => 0.99} />)

    expect(names()).toEqual(['C', 'E', 'G'])
  })

  it('keeps its order until Regenerate list is pressed', () => {
    let randomCalls = 0
    const random = () => (randomCalls++ < PITCH_CLASSES.length - 1 ? 0.99 : 0)
    const { rerender } = render(<NoteList pool={PITCH_CLASSES} spelling="sharp" random={random} />)
    const firstOrder = names()

    rerender(<NoteList pool={PITCH_CLASSES} spelling="sharp" random={random} />)
    expect(names()).toEqual(firstOrder)

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate list' }))
    expect(names()).not.toEqual(firstOrder)
    expect(names()).toHaveLength(12)
  })
})
