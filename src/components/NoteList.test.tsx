import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PITCH_CLASSES } from '../lib/notes'
import { NoteList } from './NoteList'

const items = () => screen.getAllByTestId('note-list-item')
const names = () => items().map((item) => item.textContent)
type ListOverrides = Omit<
  ComponentProps<typeof NoteList>,
  'bpm' | 'metronomeEnabled' | 'beatsPerNote' | 'transport'
>
const list = (props: ListOverrides) => (
  <NoteList
    bpm={72}
    metronomeEnabled
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
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('12-note list')
    expect(screen.getByText('Metronome on · 72 BPM · accent every 4 beats')).toBeInTheDocument()
  })

  it('uses the selected pool rather than padding a short list with repeats', () => {
    render(list({ pool: [0, 4, 7], spelling: 'flat', random: () => 0.99 }))

    expect(names()).toEqual(['C', 'E', 'G'])
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('3-note list')
  })

  it('replaces irrelevant tempo detail when the metronome is off', () => {
    render(
      <NoteList
        pool={[0, 4, 7]}
        spelling="flat"
        bpm={72}
        metronomeEnabled={false}
        beatsPerNote={4}
        transport={<div data-testid="timer-slot">Timer</div>}
      />,
    )

    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('3-note list')
    expect(screen.getByText('Metronome off')).toBeInTheDocument()
    expect(screen.queryByText('72 BPM')).toBeNull()
  })

  it('keeps the timer and shuffle action together after the notes', () => {
    render(list({ pool: PITCH_CLASSES, spelling: 'sharp' }))

    const noteList = screen.getByTestId('note-list')
    const commandBar = screen.getByTestId('note-list-command-bar')
    const timer = screen.getByTestId('timer-slot')
    const newList = screen.getByRole('button', { name: 'Shuffle list' })

    expect(noteList.compareDocumentPosition(commandBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(commandBar).toContainElement(timer)
    expect(commandBar).toContainElement(newList)
    expect(timer.compareDocumentPosition(newList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps its order until Shuffle list is pressed', () => {
    let randomCalls = 0
    const random = () => (randomCalls++ < PITCH_CLASSES.length - 1 ? 0.99 : 0)
    const { rerender } = render(list({ pool: PITCH_CLASSES, spelling: 'sharp', random }))
    const firstOrder = names()

    rerender(list({ pool: PITCH_CLASSES, spelling: 'sharp', random }))
    expect(names()).toEqual(firstOrder)

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle list' }))
    expect(names()).not.toEqual(firstOrder)
    expect(names()).toHaveLength(12)
  })

  it('identifies pending setup edits until explicit regeneration applies them', () => {
    const { rerender } = render(list({ pool: [0, 4, 7], spelling: 'sharp', random: () => 0.99 }))
    expect(names()).toEqual(['C', 'E', 'G'])
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('3-note list')

    rerender(list({ pool: [2, 5, 9, 11], spelling: 'flat', random: () => 0.99 }))
    expect(names()).toEqual(['C', 'E', 'G'])
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('3-note list')
    expect(screen.getByTestId('note-list-pending')).toHaveTextContent(
      'Settings changed · shuffle to apply',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle list' }))
    expect(names()).toEqual(['D', 'F', 'A', 'B'])
    expect(screen.getByTestId('note-list-summary')).toHaveTextContent('4-note list')
    expect(screen.queryByTestId('note-list-pending')).toBeNull()
  })

  it('protects a running attempt without moving the list action slot', () => {
    const { rerender } = render(list({ pool: PITCH_CLASSES, spelling: 'sharp', random: () => 0.99 }))
    const actionSlot = document.querySelector('.note-list-action-slot')

    rerender(list({ pool: PITCH_CLASSES, spelling: 'sharp', locked: true, random: () => 0.99 }))

    expect(screen.queryByRole('button', { name: 'Shuffle list' })).toBeNull()
    expect(screen.getByTestId('note-list-lock')).toHaveTextContent('Shuffle unavailable')
    expect(document.querySelector('.note-list-action-slot')).toBe(actionSlot)
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

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle list' }))
    expect(onRegenerate).toHaveBeenCalledOnce()
  })
})
