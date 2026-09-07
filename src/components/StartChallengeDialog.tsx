import { useRef, useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faShareNodes, faTrophy } from '@fortawesome/free-solid-svg-icons'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { challengeUrl, MAX_CHALLENGE_NAME_LENGTH, normalizeChallengeName } from '../lib/challenge'

type StartChallengeDialogProps = {
  onDismiss: () => void
  /** The page the link is built from. Injectable so a test needn't move window.location. */
  href?: string | undefined
}

/**
 * How a challenge starts: by naming one and sending the link.
 *
 * There is nothing to create at the other end — a challenge is a name in a
 * query parameter, and the board comes into being the first time somebody
 * scores on it. So this dialog only builds a URL; the Share button and the
 * clipboard are the whole feature, and the readonly field under them is the
 * fallback for a browser that has neither.
 *
 * The furniture is the bug report's, capture-phase trap included: on the stage
 * layout the footer renders inside the practice sheet, and without capture one
 * Escape would close both.
 */
export function StartChallengeDialog({ onDismiss, href }: StartChallengeDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  const [draft, setDraft] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useFocusTrap(dialogRef, true, onDismiss, { capture: true })

  const base = href ?? window.location.href
  const nameable = normalizeChallengeName(draft) !== null

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setCreated(challengeUrl(draft, base))
    setCopied(false)
  }

  // A share sheet is better than a clipboard where there is one, and on a phone
  // it is the only one of the two that lands in a conversation.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const onShare = (url: string) => {
    void navigator.share({ title: document.title, url }).catch(() => undefined)
  }

  // A refused clipboard is not worth a message: the link is on screen, readable
  // and selectable, which is what the copy was for.
  const onCopy = (url: string) => {
    void navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => undefined,
    )
  }

  return (
    <div className="sheet-layer nickname-layer" data-testid="challenge-invite">
      <button
        type="button"
        className="sheet-scrim"
        aria-label="Close"
        tabIndex={-1}
        onClick={onDismiss}
      />

      <div
        className="challenge-invite"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="challenge-invite-title"
      >
        <h2 className="challenge-invite-title" id="challenge-invite-title">
          <FontAwesomeIcon icon={faTrophy} /> Start a challenge
        </h2>

        <p className="challenge-invite-copy">
          A challenge is a link you send. Everyone who opens it practises against the same scoreboard.
        </p>

        <form className="challenge-invite-form" onSubmit={onSubmit}>
          <label className="challenge-invite-label" htmlFor="challenge-name">
            Name it
          </label>
          <input
            className="challenge-invite-input"
            id="challenge-name"
            data-testid="challenge-invite-name"
            value={draft}
            maxLength={MAX_CHALLENGE_NAME_LENGTH}
            autoComplete="off"
            onChange={(event) => {
              setDraft(event.target.value)
              setCreated(null)
              setCopied(false)
            }}
          />
          <p className="challenge-invite-hint">
            Letters and digits to start, then letters, digits, spaces, dashes or underscores — up to{' '}
            {MAX_CHALLENGE_NAME_LENGTH} characters.
          </p>

          <div className="challenge-invite-actions">
            <button type="button" className="ghost-button" onClick={onDismiss} data-testid="challenge-invite-cancel">
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              data-testid="challenge-invite-submit"
              disabled={!nameable}
            >
              Make the link
            </button>
          </div>
        </form>

        {created === null ? null : (
          <>
            <label className="challenge-invite-label" htmlFor="challenge-link">
              Send this
            </label>
            <input
              className="challenge-invite-input challenge-invite-link"
              id="challenge-link"
              data-testid="challenge-invite-link"
              readOnly
              value={created}
              onFocus={(event) => event.target.select()}
            />

            <div className="challenge-invite-actions">
              {canShare ? (
                <button
                  type="button"
                  className="ghost-button"
                  data-testid="challenge-invite-share"
                  onClick={() => onShare(created)}
                >
                  <FontAwesomeIcon icon={faShareNodes} /> Share
                </button>
              ) : (
                <button
                  type="button"
                  className="ghost-button"
                  data-testid="challenge-invite-copy"
                  onClick={() => onCopy(created)}
                >
                  <FontAwesomeIcon icon={faCopy} /> Copy link
                </button>
              )}
              <a className="primary-button" data-testid="challenge-invite-open" href={created}>
                Open the board
              </a>
            </div>

            <p className="challenge-invite-copied" role="status">
              {copied ? 'Link copied.' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
