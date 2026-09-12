import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PITCH_CLASSES } from '../lib/notes'
import { NoteList } from './NoteList'

const items = () => screen.getAllByTestId('note-list-item')
const names = () => items().map((item) => item.textContent)
type ListOverrides = Omit<ComponentProps<typeof NoteList>, 'bpm' | 'beatsPerNote' | 'transport'>
const list = (props: ListOverrides) => (
  <NoteList
    bpm={72}
    beatsPerNote={4}
    transport={<div data-testid="timer-slot">Timer</div>}
    {...props}
  />
)

describe('NoteList', () => {
  it('deals every selected note exactly once with identical item styling', () => {
    render(list({ pool: PITCH_CLASSES, spelling: 'sharp', random: () => 0.99 }))

    expect(names()).toEqual(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'])
    expect(items()).toHaveLength(12)
    expect(items().every((item) => item.className === 'note-list-item')).toBe(true)
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent(
      '12-note workout · 72 BPM · accent every 4 beats',
    )
  })

  it('uses the selected pool rather than padding a short list with repeats', () => {
    render(list({ pool: [0, 4, 7], spelling: 'flat', random: () => 0.99 }))

    expect(names()).toEqual(['C', 'E', 'G'])
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('3-note workout')
  })

  it('keeps the list ahead of its timer and list action in the reading order', () => {
    render(list({ pool: PITCH_CLASSES, spelling: 'sharp' }))

    const noteList = screen.getByTestId('note-list')
    const timer = screen.getByTestId('timer-slot')
    const newList = screen.getByRole('button', { name: 'New shuffled list' })

    expect(noteList.compareDocumentPosition(timer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(timer.compareDocumentPosition(newList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps its order until New shuffled list is pressed', () => {
    let randomCalls = 0
    const random = () => (randomCalls++ < PITCH_CLASSES.length - 1 ? 0.99 : 0)
    const { rerender } = render(list({ pool: PITCH_CLASSES, spelling: 'sharp', random }))
    const firstOrder = names()

    rerender(list({ pool: PITCH_CLASSES, spelling: 'sharp', random }))
    expect(names()).toEqual(firstOrder)

    fireEvent.click(screen.getByRole('button', { name: 'New shuffled list' }))
    expect(names()).not.toEqual(firstOrder)
    expect(names()).toHaveLength(12)
  })

  it('identifies pending setup edits until explicit regeneration applies them', () => {
    const { rerender } = render(list({ pool: [0, 4, 7], spelling: 'sharp', random: () => 0.99 }))
    expect(names()).toEqual(['C', 'E', 'G'])
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('3-note workout')

    rerender(list({ pool: [2, 5, 9, 11], spelling: 'flat', random: () => 0.99 }))
    expect(names()).toEqual(['C', 'E', 'G'])
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('3-note workout')
    expect(screen.getByTestId('note-list-pending')).toHaveTextContent(
      'Settings changed · your next shuffled list will use them.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'New shuffled list' }))
    expect(names()).toEqual(['D', 'F', 'A', 'B'])
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('4-note workout')
    expect(screen.queryByTestId('note-list-pending')).toBeNull()
  })

  it('protects a running attempt with passive lock feedback', () => {
    render(list({ pool: PITCH_CLASSES, spelling: 'sharp', locked: true, random: () => 0.99 }))

    expect(screen.queryByRole('button', { name: 'New shuffled list' })).toBeNull()
    expect(screen.getByTestId('note-list-lock')).toHaveTextContent('List locked during attempt')
  })

  it('notifies the session before dealing a new list', () => {
    const onRegenerate = vi.fn()
    render(
      list({
        pool: PITCH_CLASSES,
        spelling: 'sharp',
        onRegenerate,
        random: () => 0.99,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'New shuffled list' }))
    expect(onRegenerate).toHaveBeenCalledOnce()
  })
})
