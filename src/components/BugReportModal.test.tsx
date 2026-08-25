import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TurnstileApi, TurnstileWidgetOptions } from '../lib/bugReport'
import { BugReportModal } from './BugReportModal'

/**
 * Cloudflare's widget, standing still: it renders into the box it is handed and
 * hands a token back the moment the fake says the check passed.
 */
const stubTurnstile = () => {
  let solve: ((token: string) => void) | undefined
  const api: TurnstileApi = {
    render: vi.fn((container: HTMLElement, options: TurnstileWidgetOptions) => {
      container.dataset.rendered = options.sitekey
      solve = options.callback
      return 'widget-1'
    }),
    reset: vi.fn(() => {
      solve?.('token-again')
    }),
    remove: vi.fn(),
  }

  return { api, solveCaptcha: () => solve?.('solved-token') }
}

type Answers = { config?: () => Response; post?: () => Response }

const answer = (status: number, payload: unknown = {}) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => payload }) as unknown as Response

const stubFetch = ({ config = () => answer(200, { siteKey: 'site-key' }), post = () => answer(202, { ok: true }) }: Answers = {}) => {
  const posted: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/config')) {
        return config()
      }

      posted.push(JSON.parse(String(init?.body ?? '{}')))
      return post()
    }),
  )

  return posted
}

const renderModal = (loadWidget: () => Promise<TurnstileApi>) => {
  const onDismiss = vi.fn()
  const rendered = render(<BugReportModal version="1.26.1" onDismiss={onDismiss} loadWidget={loadWidget} />)

  return { ...rendered, onDismiss }
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.style.overflow = ''
})

describe('BugReportModal', () => {
  it('is a modal dialog named after what it does', async () => {
    stubFetch()
    const { api } = stubTurnstile()
    renderModal(async () => api)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Report a bug')

    await waitFor(() => expect(api.render).toHaveBeenCalled())
  })

  it('renders the widget against the site key the server handed out', async () => {
    stubFetch()
    const { api } = stubTurnstile()
    renderModal(async () => api)

    await waitFor(() => expect(screen.getByTestId('bug-captcha').dataset.rendered).toBe('site-key'))
  })

  it('sends nothing until there is both a description and a solved check', async () => {
    stubFetch()
    const { api, solveCaptcha } = stubTurnstile()
    renderModal(async () => api)

    await waitFor(() => expect(api.render).toHaveBeenCalled())
    expect(screen.getByTestId('bug-submit')).toBeDisabled()

    fireEvent.change(screen.getByTestId('bug-description'), { target: { value: 'The metronome drifts.' } })
    expect(screen.getByTestId('bug-submit')).toBeDisabled()

    solveCaptcha()
    await waitFor(() => expect(screen.getByTestId('bug-submit')).toBeEnabled())
  })

  it('posts the report and swaps the form for a thank-you', async () => {
    const posted = stubFetch()
    const { api, solveCaptcha } = stubTurnstile()
    renderModal(async () => api)

    await waitFor(() => expect(api.render).toHaveBeenCalled())
    fireEvent.change(screen.getByTestId('bug-description'), { target: { value: '  The metronome drifts.  ' } })
    fireEvent.change(screen.getByTestId('bug-email'), { target: { value: 'ada@example.com' } })
    solveCaptcha()

    await waitFor(() => expect(screen.getByTestId('bug-submit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('bug-submit'))

    await waitFor(() => expect(screen.getByTestId('bug-sent')).toBeInTheDocument())
    expect(posted).toEqual([
      {
        description: 'The metronome drifts.',
        email: 'ada@example.com',
        token: 'solved-token',
        version: '1.26.1',
      },
    ])
    expect(screen.queryByTestId('bug-description')).toBeNull()
  })

  /** A spent token is worthless, so a retry needs a fresh one — not the old one. */
  it('says a refused check was refused, and starts the widget over', async () => {
    stubFetch({ post: () => answer(403, { error: 'captcha_failed' }) })
    const { api, solveCaptcha } = stubTurnstile()
    renderModal(async () => api)

    await waitFor(() => expect(api.render).toHaveBeenCalled())
    fireEvent.change(screen.getByTestId('bug-description'), { target: { value: 'Something broke.' } })
    solveCaptcha()

    await waitFor(() => expect(screen.getByTestId('bug-submit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('bug-submit'))

    await waitFor(() => expect(screen.getByTestId('bug-error')).toHaveTextContent('spam check didn’t go through'))
    expect(screen.getByTestId('bug-error')).toHaveAttribute('role', 'alert')
    expect(api.reset).toHaveBeenCalledWith('widget-1')
    // What was typed survives the refusal — nobody should retype a report.
    expect(screen.getByTestId('bug-description')).toHaveValue('Something broke.')
  })

  it('says why in each of the other three ways a send can fail', async () => {
    for (const [status, text] of [
      [429, 'few reports in a row'],
      [503, 'went quiet at the other end'],
      [502, 'Couldn’t send that'],
    ] as const) {
      stubFetch({ post: () => answer(status, {}) })
      const { api, solveCaptcha } = stubTurnstile()
      const { unmount } = renderModal(async () => api)

      await waitFor(() => expect(api.render).toHaveBeenCalled())
      fireEvent.change(screen.getByTestId('bug-description'), { target: { value: 'Something broke.' } })
      solveCaptcha()
      await waitFor(() => expect(screen.getByTestId('bug-submit')).toBeEnabled())
      fireEvent.click(screen.getByTestId('bug-submit'))

      await waitFor(() => expect(screen.getByTestId('bug-error')).toHaveTextContent(text))
      unmount()
      vi.unstubAllGlobals()
    }
  })

  it('offers no form at all where reporting is not set up', async () => {
    stubFetch({ config: () => answer(503, { error: 'not_configured' }) })
    const { api } = stubTurnstile()
    renderModal(async () => api)

    await waitFor(() => expect(screen.getByTestId('bug-unavailable')).toHaveTextContent('aren’t switched on'))
    expect(screen.queryByTestId('bug-description')).toBeNull()
    expect(api.render).not.toHaveBeenCalled()
  })

  /** Offline-first app, third-party script: this is the ordinary case, not an edge one. */
  it('says so when the widget script cannot be loaded', async () => {
    stubFetch()
    renderModal(async () => {
      throw new Error('offline')
    })

    await waitFor(() => expect(screen.getByTestId('bug-unavailable')).toHaveTextContent('needs a connection'))
    expect(screen.queryByTestId('bug-description')).toBeNull()
  })

  it('can be left three ways, and sends on none of them', async () => {
    const posted = stubFetch()
    const { api } = stubTurnstile()
    const { onDismiss, unmount } = renderModal(async () => api)

    await waitFor(() => expect(api.render).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('bug-cancel'))
    fireEvent.click(document.querySelector('.sheet-scrim')!)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledTimes(3)
    expect(posted).toEqual([])
    unmount()
  })

  it('caps what can be typed at the length the server will take', async () => {
    stubFetch()
    const { api } = stubTurnstile()
    renderModal(async () => api)

    await waitFor(() => expect(api.render).toHaveBeenCalled())
    expect(screen.getByTestId('bug-description')).toHaveAttribute('maxlength', '1000')
  })
})
