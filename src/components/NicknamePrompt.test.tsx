import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NicknamePrompt } from './NicknamePrompt'

type Extras = Partial<Pick<Parameters<typeof NicknamePrompt>[0], 'prefill' | 'pending' | 'error'>>

const renderPrompt = (extras: Extras = {}) => {
  const onJoin = vi.fn()
  const onDismiss = vi.fn()
  const rendered = render(
    <NicknamePrompt challenge="demo" onJoin={onJoin} onDismiss={onDismiss} {...extras} />,
  )

  return { ...rendered, onJoin, onDismiss }
}

const type = (value: string) => fireEvent.change(screen.getByTestId('nickname-input'), { target: { value } })

afterEach(() => {
  document.body.style.overflow = ''
})

describe('NicknamePrompt', () => {
  it('is a modal dialog named after the challenge it joins', () => {
    renderPrompt()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Join “demo”')
  })

  it('opens with focus in the field, so a keyboard user can just type', () => {
    renderPrompt()

    expect(document.activeElement).toBe(screen.getByTestId('nickname-input'))
  })

  it('will not submit a name that is not one', () => {
    const { onJoin } = renderPrompt()

    expect(screen.getByTestId('nickname-submit')).toBeDisabled()

    type('   ')
    expect(screen.getByTestId('nickname-submit')).toBeDisabled()

    type('ada')
    expect(screen.getByTestId('nickname-submit')).toBeEnabled()
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('hands the name over on submit', () => {
    const { onJoin } = renderPrompt()

    type('  ada  ')
    fireEvent.click(screen.getByTestId('nickname-submit'))

    expect(onJoin).toHaveBeenCalledWith('ada')
  })

  it('submits on Enter, as a one-field form should', () => {
    const { onJoin } = renderPrompt()

    type('ada')
    fireEvent.submit(screen.getByTestId('nickname-input').closest('form')!)

    expect(onJoin).toHaveBeenCalledWith('ada')
  })

  /** Arriving on a link somebody sent is not consent to be listed. */
  it('can be left behind three ways, and joins on none of them', () => {
    const { onJoin, onDismiss, unmount } = renderPrompt()

    fireEvent.click(screen.getByTestId('nickname-dismiss'))
    fireEvent.click(document.querySelector('.sheet-scrim')!)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledTimes(3)
    expect(onJoin).not.toHaveBeenCalled()
    unmount()
  })

  it('holds Tab inside itself rather than letting it walk into the transport', () => {
    renderPrompt()
    // With no name typed, submit is disabled and out of the tab order entirely.
    type('ada')

    const focusable = Array.from(
      screen.getByRole('dialog').querySelectorAll<HTMLElement>('input, button:not([disabled])'),
    ).filter((element) => element.tabIndex >= 0)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    expect(first).toBe(screen.getByTestId('nickname-input'))

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('caps what can be typed at the length the board will keep', () => {
    renderPrompt()

    expect(screen.getByTestId('nickname-input')).toHaveAttribute('maxlength', '20')
  })
})

describe('reserving the name', () => {
  it('opens on the name this browser used last, so re-claiming it is one tap', () => {
    renderPrompt({ prefill: 'ada' })

    expect(screen.getByTestId('nickname-input')).toHaveValue('ada')
    expect(screen.getByTestId('nickname-submit')).toBeEnabled()
  })

  /** A claim is a round trip, and a button that looks idle invites a second one. */
  it('says it is working while the claim is in flight, and takes no second try', () => {
    const { onJoin } = renderPrompt({ prefill: 'ada', pending: true })

    expect(screen.getByTestId('nickname-submit')).toHaveTextContent('Reserving…')
    expect(screen.getByTestId('nickname-submit')).toBeDisabled()
    expect(screen.getByTestId('nickname-input')).toBeDisabled()

    fireEvent.submit(screen.getByTestId('nickname-input').closest('form')!)
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('says why a claim was refused, in each of the three ways it can be', () => {
    for (const [error, text] of [
      ['taken', 'already has that name'],
      ['rate-limited', 'Too many tries'],
      ['error', 'could not be reached'],
    ] as const) {
      const { unmount } = renderPrompt({ error })

      const message = screen.getByTestId('nickname-error')
      expect(message).toHaveTextContent(text)
      expect(message).toHaveAttribute('role', 'alert')
      unmount()
    }
  })

  it('says nothing at all when there is nothing wrong', () => {
    renderPrompt()

    expect(screen.queryByTestId('nickname-error')).toBeNull()
  })
})
