import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Footer } from './Footer'
import { PracticeSheet } from './PracticeSheet'

/**
 * The modal asks the server what it can do the moment it opens. Here it is
 * always "nothing" — what these tests are about is the button and the layer it
 * opens, and BugReportModal.test.tsx covers the form itself.
 */
const stubFetch = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ status: 503, ok: false, json: async () => ({ error: 'not_configured' }) })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.style.overflow = ''
})

describe('Footer', () => {
  it('offers a way to report a bug, named for screen readers rather than by an icon alone', () => {
    stubFetch()
    render(<Footer skin="glass" onSkinChange={vi.fn()} />)

    const button = screen.getByTestId('report-bug-button')
    expect(button).toHaveAccessibleName('Report a bug')
    expect(button).toHaveAttribute('type', 'button')
    // Icon-only, beside the links: nothing here should widen the footer row.
    expect(button).toHaveClass('social-link')
    expect(button.textContent).toBe('')
  })

  it('opens the report modal on a click, and not before one', async () => {
    stubFetch()
    render(<Footer skin="glass" onSkinChange={vi.fn()} />)

    expect(screen.queryByTestId('bug-report-modal')).toBeNull()

    fireEvent.click(screen.getByTestId('report-bug-button'))

    expect(screen.getByTestId('bug-report-modal')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('bug-unavailable')).toBeInTheDocument())
  })

  it('closes again on Escape', async () => {
    stubFetch()
    render(<Footer skin="glass" onSkinChange={vi.fn()} />)

    fireEvent.click(screen.getByTestId('report-bug-button'))
    await waitFor(() => expect(screen.getByTestId('bug-unavailable')).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('bug-report-modal')).toBeNull()
  })

  /**
   * On the stage layout the footer lives inside the practice sheet, which is a
   * focus trap of its own. Without the modal trapping on the capture phase one
   * Escape would close both — the sheet would vanish out from under the report
   * that was being written in it.
   */
  it('takes one Escape and not the sheet it is rendered inside', async () => {
    stubFetch()
    const onClose = vi.fn()
    render(
      <PracticeSheet open onClose={onClose}>
        <Footer skin="glass" onSkinChange={vi.fn()} />
      </PracticeSheet>,
    )

    fireEvent.click(screen.getByTestId('report-bug-button'))
    await waitFor(() => expect(screen.getByTestId('bug-unavailable')).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('bug-report-modal')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('practice-sheet')).toBeInTheDocument()
  })
})
