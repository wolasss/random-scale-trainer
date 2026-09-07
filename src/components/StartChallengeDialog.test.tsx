import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StartChallengeDialog } from './StartChallengeDialog'

/** Where the sharer is standing. Passed in so no test has to move window.location. */
const HERE = 'https://callnote.app/?src=pwa#stage'

const open = (onDismiss = vi.fn()) => {
  render(<StartChallengeDialog onDismiss={onDismiss} href={HERE} />)
  return onDismiss
}

/** The link the dialog should build from HERE for the name these tests type. */
const LINK = 'https://callnote.app/?challenge=summer+sprint'

const name = () => screen.getByTestId('challenge-invite-name')
const submit = () => screen.getByTestId('challenge-invite-submit')

const makeLink = (typed = 'Summer Sprint') => {
  fireEvent.change(name(), { target: { value: typed } })
  fireEvent.click(submit())
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'clipboard')
  document.body.style.overflow = ''
})

describe('StartChallengeDialog', () => {
  it('will not make a link out of something that is not a name', () => {
    open()

    expect(submit()).toBeDisabled()

    fireEvent.change(name(), { target: { value: '-nope' } })
    expect(submit()).toBeDisabled()

    fireEvent.change(name(), { target: { value: 'Summer Sprint' } })
    expect(submit()).toBeEnabled()
  })

  it('shows the link, on the canonical name and without the sharer’s own query', () => {
    open()

    expect(screen.queryByTestId('challenge-invite-link')).toBeNull()

    makeLink()

    expect(screen.getByTestId('challenge-invite-link')).toHaveValue(LINK)
    expect(screen.getByTestId('challenge-invite-open')).toHaveAttribute('href', LINK)
  })

  /** Retyping the name is how you change it: the old link cannot linger. */
  it('drops the link again the moment the name is edited', () => {
    open()
    makeLink()

    fireEvent.change(name(), { target: { value: 'summer sprint 2' } })

    expect(screen.queryByTestId('challenge-invite-link')).toBeNull()
  })

  it('hands the link to the browser’s share sheet where there is one', () => {
    const share = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })

    open()
    makeLink()

    // A share sheet lands in a conversation; a clipboard does not. Where both
    // are possible only the better one is offered.
    expect(screen.queryByTestId('challenge-invite-copy')).toBeNull()
    fireEvent.click(screen.getByTestId('challenge-invite-share'))

    expect(share).toHaveBeenCalledWith({ title: document.title, url: LINK })
  })

  it('copies to the clipboard where the browser cannot share, and says so', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    open()
    makeLink()

    expect(screen.queryByTestId('challenge-invite-share')).toBeNull()
    fireEvent.click(screen.getByTestId('challenge-invite-copy'))

    expect(writeText).toHaveBeenCalledWith(LINK)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Link copied.'))
  })

  /**
   * A refused clipboard is not worth a message, and definitely not worth a
   * console entry — the link is still on screen, readable and selectable.
   */
  it('leaves the link on screen when the clipboard refuses', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied')
    })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    open()
    makeLink()
    fireEvent.click(screen.getByTestId('challenge-invite-copy'))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.getByTestId('challenge-invite-link')).toHaveValue(LINK)
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('is a keyboard dialog: focus lands inside it and Escape closes it', () => {
    const onDismiss = open()

    expect(document.activeElement).toBe(name())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalled()
  })
})
