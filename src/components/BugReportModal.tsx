import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from './ui/Icon'
import { faBug } from '@fortawesome/free-solid-svg-icons'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  fetchBugReportConfig,
  loadTurnstile,
  MAX_DESCRIPTION_LENGTH,
  sendBugReport,
  type BugReportOutcome,
  type TurnstileApi,
} from '../lib/bugReport'

type BugReportModalProps = {
  /** What this build calls itself, so a report says which one it came from. */
  version: string
  onDismiss: () => void
  /** Injectable so a test can stand in for Cloudflare's script. */
  loadWidget?: (doc: Document) => Promise<TurnstileApi>
}

/**
 * Everything the form can be, in one word each. The two "can't" states are
 * separate on purpose: a deployment without keys is permanent and a browser
 * without a connection is not, and telling somebody to try again later is only
 * useful in one of them.
 */
type Status = 'loading' | 'ready' | 'sending' | 'sent' | 'not-configured' | 'offline'

/** One line per way a report can fail, and no jargon in any of them. */
const ERRORS: Record<Exclude<BugReportOutcome, 'ok'>, string> = {
  'captcha-failed': 'That spam check didn’t go through — give it another go?',
  'rate-limited': 'That’s a few reports in a row. Give it a few minutes.',
  unavailable: 'Reporting just went quiet at the other end. Try again later?',
  error: 'Couldn’t send that. Try again in a sec.',
}

const UNAVAILABLE: Record<'not-configured' | 'offline', string> = {
  'not-configured':
    'Reports aren’t switched on for this copy of callnote. The GitHub link in the footer is the other way to reach me.',
  offline: 'The spam check needs a connection, and there isn’t one right now. Try again once you’re back online.',
}

/**
 * A way to say something is broken without leaving the app to find one.
 *
 * A captcha is here because the alternative is an open mail relay with a Send
 * button on it: the token the widget produces is checked by the server against
 * a secret this page has never seen, so a form posted by anything that isn't a
 * browser with a person behind it gets a 403 and no mail.
 *
 * The furniture is the nickname prompt's, with one difference that matters: the
 * trap runs on the capture phase. On the stage layout the footer renders
 * *inside* the practice sheet, which has a trap of its own — without capture a
 * single Escape would close both, exactly as it would have for the practice
 * history view.
 */
export function BugReportModal({ version, onDismiss, loadWidget = loadTurnstile }: BugReportModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const captchaRef = useRef<HTMLDivElement | null>(null)
  const turnstileRef = useRef<TurnstileApi | null>(null)
  const widgetRef = useRef<string | undefined>(undefined)

  const [status, setStatus] = useState<Status>('loading')
  const [siteKey, setSiteKey] = useState('')
  const [token, setToken] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<Exclude<BugReportOutcome, 'ok'> | null>(null)

  useFocusTrap(dialogRef, true, onDismiss, { capture: true })

  // What the deployment can do is asked before a form is drawn: a textarea over
  // a route that answers 503 is a promise the page cannot keep.
  useEffect(() => {
    let live = true

    void fetchBugReportConfig().then((config) => {
      if (!live) {
        return
      }

      if (config === null) {
        setStatus('offline')
        return
      }

      if (config === 'unavailable') {
        setStatus('not-configured')
        return
      }

      setSiteKey(config.siteKey)
      setStatus('ready')
    })

    return () => {
      live = false
    }
  }, [])

  // The widget, once there is a key to render it with and a box to put it in.
  useEffect(() => {
    if (siteKey === '') {
      return undefined
    }

    let live = true

    void loadWidget(document).then(
      (turnstile) => {
        if (!live || captchaRef.current === null) {
          return
        }

        turnstileRef.current = turnstile
        widgetRef.current = turnstile.render(captchaRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (solved: string) => setToken(solved),
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        })
      },
      () => {
        if (live) {
          setStatus('offline')
        }
      },
    )

    return () => {
      live = false
      turnstileRef.current?.remove(widgetRef.current)
      turnstileRef.current = null
      widgetRef.current = undefined
    }
  }, [loadWidget, siteKey])

  const text = description.trim()
  const sendable = text !== '' && token !== '' && status === 'ready'

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!sendable) {
        return
      }

      setStatus('sending')
      setError(null)

      const outcome = await sendBugReport({ description: text, email: email.trim(), token, version })
      if (outcome === 'ok') {
        setStatus('sent')
        return
      }

      // The token is spent either way — a refused one is worthless and an
      // accepted one is single-use — so the widget starts over for a retry.
      setToken('')
      turnstileRef.current?.reset(widgetRef.current)
      setError(outcome)
      setStatus('ready')
    },
    [email, sendable, text, token, version],
  )

  const unavailable = status === 'not-configured' || status === 'offline'

  return (
    <div className="sheet-layer nickname-layer" data-testid="bug-report-modal">
      <button type="button" className="sheet-scrim" aria-label="Close bug report" tabIndex={-1} onClick={onDismiss} />

      <div
        className="bug-report"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
      >
        <h2 className="bug-report-title" id="bug-report-title">
          <Icon icon={faBug} /> Report a bug
        </h2>

        {status === 'sent' ? (
          <>
            <p className="bug-report-copy" data-testid="bug-sent">
              Thanks — that’s on its way to me. If you left an address I’ll write back.
            </p>
            <div className="bug-report-actions">
              <button type="button" className="primary-button" onClick={onDismiss} data-testid="bug-close">
                Close
              </button>
            </div>
          </>
        ) : unavailable ? (
          <>
            <p className="bug-report-copy" data-testid="bug-unavailable">
              {UNAVAILABLE[status]}
            </p>
            <div className="bug-report-actions">
              <button type="button" className="primary-button" onClick={onDismiss} data-testid="bug-close">
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="bug-report-copy">
              Tell me what happened and what you expected instead. What you were practising when it went wrong is
              usually the useful bit.
            </p>

            <form
              className="bug-report-form"
              onSubmit={(event) => {
                void onSubmit(event)
              }}
            >
              <label className="bug-report-label" htmlFor="bug-description">
                What went wrong
              </label>
              <textarea
                className="bug-report-input bug-report-textarea"
                id="bug-description"
                data-testid="bug-description"
                rows={4}
                value={description}
                maxLength={MAX_DESCRIPTION_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
                disabled={status === 'sending'}
              />

              <label className="bug-report-label" htmlFor="bug-email">
                Your email — optional, and only so I can reply
              </label>
              <input
                className="bug-report-input"
                id="bug-email"
                data-testid="bug-email"
                type="email"
                value={email}
                maxLength={254}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                disabled={status === 'sending'}
              />

              {/* Cloudflare renders its own widget in here; it is the only
                  third-party thing on the page, and only once this is open. */}
              <div className="bug-report-captcha" ref={captchaRef} data-testid="bug-captcha" />

              {error === null ? null : (
                <p className="bug-report-error" data-testid="bug-error" role="alert">
                  {ERRORS[error]}
                </p>
              )}

              <div className="bug-report-actions">
                <button type="button" className="ghost-button" onClick={onDismiss} data-testid="bug-cancel">
                  Cancel
                </button>
                <button type="submit" className="primary-button" data-testid="bug-submit" disabled={!sendable}>
                  {status === 'sending' ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
