import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from './ui/Icon'
import { faMicrophone } from '@fortawesome/free-solid-svg-icons/faMicrophone'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { MAX_NICKNAME_LENGTH, normalizeNickname } from '../lib/challenge'

type NicknamePromptProps = {
  /** The challenge being joined, named so the modal explains where it came from. */
  challenge: string
  /** The name this browser used last. A prefill, never a claim on its own. */
  prefill?: string
  /** A claim is a round trip, and the button has to say so while it runs. */
  pending?: boolean
  /** Why the last attempt did not join, if it did not. */
  error?: 'taken' | 'rate-limited' | 'error' | null
  onJoin: (nickname: string) => void
  onDismiss: () => void
  /** Fired once this has painted, so a caller can wait for it before asking
   *  for anything the explanation on screen is meant to precede. */
  onReady?: () => void
}

/** One line per way a claim can fail, and no jargon in any of them. */
const ERRORS: Record<'taken' | 'rate-limited' | 'error', string> = {
  taken: 'Somebody already has that name — try another?',
  'rate-limited': 'Whoa — a little too fast. Give it a moment.',
  error: 'Couldn’t reach the board. Try again in a sec.',
}

/**
 * The one thing a shared challenge needs before it can put anybody on the
 * board: a name to list them under.
 *
 * It is dismissable on purpose. Arriving on a link somebody sent is not consent
 * to be listed, and the board is worth reading even if you would rather not be
 * on it — so Escape, the scrim and "Just watch" all leave the challenge running
 * and the scoreboard visible, just without a row of your own.
 *
 * The modal furniture is the practice sheet's, minus the bottom-anchoring: this
 * is a question rather than a drawer, so it sits in the middle of the screen.
 */
export function NicknamePrompt({
  challenge,
  prefill = '',
  pending = false,
  error = null,
  onJoin,
  onDismiss,
  onReady,
}: NicknamePromptProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState(prefill)

  useFocusTrap(dialogRef, true, onDismiss)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once, on the paint that puts this on screen
  useEffect(() => onReady?.(), [])

  // Submit is disabled on exactly what the hook would refuse, so the form never
  // looks broken: a name of nothing but spaces is not a name.
  const nickname = normalizeNickname(draft)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (nickname !== null && !pending) {
      onJoin(nickname)
    }
  }

  return (
    <div className="sheet-layer nickname-layer" data-testid="nickname-prompt">
      <button type="button" className="sheet-scrim" aria-label="Just watch" tabIndex={-1} onClick={onDismiss} />

      <div
        className="nickname-prompt"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-prompt-title"
      >
        <h2 className="nickname-prompt-title" id="nickname-prompt-title">
          Join “{challenge}”
        </h2>
        <p className="nickname-prompt-copy">
          It’s a shared challenge. Pick a name, press start, and every note your mic hears banks points —
          only your best session counts.
        </p>

        {/* Said here rather than discovered at the browser’s own dialog: the
            permission is asked for the moment a challenge opens, and a request
            nobody explained is one people refuse. */}
        <p className="nickname-prompt-mic">
          <Icon icon={faMicrophone} />
          We’ll ask for your microphone — that’s how notes become points.
        </p>

        <form className="nickname-prompt-form" onSubmit={onSubmit}>
          <label className="nickname-prompt-label" htmlFor="challenge-nickname">
            Your name
          </label>
          <input
            className="nickname-prompt-input"
            id="challenge-nickname"
            data-testid="nickname-input"
            type="text"
            value={draft}
            maxLength={MAX_NICKNAME_LENGTH}
            autoComplete="nickname"
            onChange={(event) => setDraft(event.target.value)}
            disabled={pending}
          />

          {error === null ? null : (
            <p className="nickname-prompt-error" data-testid="nickname-error" role="alert">
              {ERRORS[error]}
            </p>
          )}

          <div className="nickname-prompt-actions">
            <button type="button" className="ghost-button" onClick={onDismiss} data-testid="nickname-dismiss">
              Just watch
            </button>
            <button
              type="submit"
              className="primary-button"
              data-testid="nickname-submit"
              disabled={nickname === null || pending}
            >
              {pending ? 'Reserving…' : 'Put me on the board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NicknamePrompt
