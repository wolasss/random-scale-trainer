import userEvent from '@testing-library/user-event'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PITCH_CLASSES } from '../lib/notes'
import { NoteList } from './NoteList'

const items = () => screen.getAllByTestId('note-list-item')
const names = () => items().map((item) => item.textContent)
const noteList = () => within(screen.getByRole('list', { name: 'Practice note order' }))
const expectFound = (count: number, total: number) => {
  expect(noteList().queryAllByRole('button', { pressed: true })).toHaveLength(count)
  expect(noteList().queryAllByRole('button', { pressed: false })).toHaveLength(total - count)
  expect(screen.getByTestId('note-list-summary')).toHaveTextContent(
    `${total}-note list · ${count} of ${total} found`,
  )
}
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

  it.each([0, 0.99])('clears marks on shuffle with random %s, even for the same order', (nextRandom) => {
    const random = vi.fn(() => 0.99)
    const { rerender } = render(list({ pool: [0, 3, 7], spelling: 'flat', random }))
    const firstOrder = names()
    fireEvent.click(noteList().getByRole('button', { name: 'C, not found' }))
    fireEvent.click(noteList().getByRole('button', { name: 'E♭, not found' }))
    expectFound(2, 3)

    rerender(list({ pool: [0, 3, 7], spelling: 'flat', random }))
    expect(names()).toEqual(firstOrder)
    expectFound(2, 3)

    random.mockReturnValue(nextRandom)
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle list' }))
    expect(names()).toEqual(nextRandom === 0 ? ['E♭', 'G', 'C'] : firstOrder)
    expectFound(0, 3)
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
    const onRegenerate = vi.fn(() => {
      expectFound(1, 12)
    })
    render(
      list({
        pool: PITCH_CLASSES,
        spelling: 'sharp',
        onRegenerate,
        random: () => 0.99,
      }),
    )

    fireEvent.click(noteList().getByRole('button', { name: 'C, not found' }))
    expect(onRegenerate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle list' }))
    expect(onRegenerate).toHaveBeenCalledOnce()
    expectFound(0, 12)
  })

  it('toggles notes independently, including undo and finding the whole list', () => {
    const random = vi.fn(() => 0.99)
    render(list({ pool: [0, 3, 7], spelling: 'flat', random }))
    const firstOrder = names()
    random.mockClear()
    expectFound(0, 3)
    const flatNote = noteList().getByRole('button', { name: 'E♭, not found', pressed: false })

    fireEvent.click(flatNote)
    expectFound(1, 3)
    expect(flatNote).toHaveAccessibleName('E♭, found')
    fireEvent.click(noteList().getByRole('button', { name: 'C, not found' }))
    expectFound(2, 3)
    fireEvent.click(flatNote)
    expectFound(1, 3)
    expect(flatNote).toHaveAccessibleName('E♭, not found')
    expect(noteList().getByRole('button', { name: 'C, found', pressed: true })).toBeInTheDocument()
    fireEvent.click(flatNote)
    fireEvent.click(noteList().getByRole('button', { name: 'G, not found' }))
    expectFound(3, 3)
    for (const button of noteList().getAllByRole('button')) {
      expect(button).toHaveAccessibleName(`${button.textContent}, found`)
    }
    expect(names()).toEqual(firstOrder)
    expect(random).not.toHaveBeenCalled()
  })

  it.each([
    { setting: 'pool', pool: [2, 5, 9, 11], spelling: 'sharp' as const, expected: ['D', 'F', 'A', 'B'] },
    { setting: 'spelling', pool: [0, 3, 7], spelling: 'flat' as const, expected: ['C', 'E♭', 'G'] },
  ])('keeps marks through pending $setting edits until shuffle applies them', ({ pool, spelling, expected }) => {
    const { rerender } = render(list({ pool: [0, 3, 7], spelling: 'sharp', random: () => 0.99 }))
    fireEvent.click(noteList().getByRole('button', { name: 'D♯, not found' }))

    rerender(list({ pool, spelling, random: () => 0.99 }))
    expect(names()).toEqual(['C', 'D♯', 'G'])
    expectFound(1, 3)
    expect(noteList().getByRole('button', { name: 'D♯, found', pressed: true })).toBeInTheDocument()
    expect(screen.getByTestId('note-list-pending')).toHaveTextContent('shuffle to apply')

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle list' }))
    expect(names()).toEqual(expected)
    expectFound(0, expected.length)
    expect(screen.queryByTestId('note-list-pending')).toBeNull()
  })

  it('preserves marks across timing and lock changes and allows toggling while locked', () => {
    const props = { pool: [0, 3, 7], spelling: 'flat' as const, random: () => 0.99 }
    const { rerender } = render(list(props))
    fireEvent.click(noteList().getByRole('button', { name: 'E♭, not found' }))

    rerender(<NoteList {...props} pool={[0, 3, 7]} bpm={120} metronomeEnabled={false}
      beatsPerNote={2} transport={<div>Running timer</div>} locked />)
    expectFound(1, 3)
    expect(screen.queryByTestId('note-list-pending')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Shuffle list' })).toBeNull()
    expect(screen.getByTestId('note-list-lock')).toHaveTextContent('Shuffle unavailable')
    expect(noteList().getAllByRole('button').every((button) => !button.hasAttribute('disabled'))).toBe(true)
    fireEvent.click(noteList().getByRole('button', { name: 'C, not found' }))
    expectFound(2, 3)
    fireEvent.click(noteList().getByRole('button', { name: 'E♭, found' }))
    expectFound(1, 3)

    rerender(list(props))
    expectFound(1, 3)
    expect(noteList().getByRole('button', { name: 'C, found', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shuffle list' })).toBeEnabled()
    expect(names()).toEqual(['C', 'E♭', 'G'])
  })

  it('starts a remounted list with no marks', () => {
    const props = { pool: [0, 3, 7], spelling: 'flat' as const, random: () => 0.99 }
    const { unmount } = render(list(props))
    fireEvent.click(noteList().getByRole('button', { name: 'E♭, not found' }))
    expectFound(1, 3)
    unmount()

    render(list(props))
    expectFound(0, 3)
  })

  it('keeps ordered-list semantics and native keyboard activation for every note', async () => {
    const user = userEvent.setup()
    render(list({ pool: [0, 3, 7], spelling: 'flat', random: () => 0.99 }))
    expect(screen.getByRole('list')).toHaveProperty('tagName', 'OL')
    const listItems = noteList().getAllByRole('listitem')
    expect(listItems).toHaveLength(3)

    for (const item of listItems) {
      expect(item).toHaveProperty('tagName', 'LI')
      const button = within(item).getByRole('button', { pressed: false })
      expect(button).toHaveProperty('tagName', 'BUTTON')
      expect(button).toHaveAttribute('type', 'button')
      await user.tab()
      expect(button).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(button).toHaveFocus()
      expectFound(1, 3)
      await user.keyboard(' ')
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(button).toHaveFocus()
      expectFound(0, 3)
    }
    await user.tab()
    expect(screen.getByRole('button', { name: 'Shuffle list' })).toHaveFocus()
  })
})
