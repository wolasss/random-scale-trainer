import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  it('waits for an explicit regeneration before applying setup edits', () => {
    const { rerender } = render(<NoteList pool={[0, 4, 7]} spelling="sharp" random={() => 0.99} />)
    expect(names()).toEqual(['C', 'E', 'G'])

    rerender(<NoteList pool={[2, 5, 9]} spelling="flat" random={() => 0.99} />)
    expect(names()).toEqual(['C', 'E', 'G'])

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate list' }))
    expect(names()).toEqual(['D', 'F', 'A'])
  })

  it('protects a running attempt from regeneration', () => {
    render(<NoteList pool={PITCH_CLASSES} spelling="sharp" locked random={() => 0.99} />)

    expect(screen.getByRole('button', { name: 'List locked while timing' })).toBeDisabled()
  })

  it('makes it explicit that a new list clears the held timer result', () => {
    const onRegenerate = vi.fn()
    render(
      <NoteList
        pool={PITCH_CLASSES}
        spelling="sharp"
        hasResult
        onRegenerate={onRegenerate}
        random={() => 0.99}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'New list · Reset timer' }))
    expect(onRegenerate).toHaveBeenCalledOnce()
  })
})
