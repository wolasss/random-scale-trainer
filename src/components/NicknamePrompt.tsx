import { useRef, useState, type FormEvent } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { MAX_NICKNAME_LENGTH, normalizeNickname } from '../lib/challenge'

type NicknamePromptProps = {
  /** The challenge being joined, named so the modal explains where it came from. */
  challenge: string
  onJoin: (nickname: string) => void
  onDismiss: () => void
}

/**
 * The one thing a shared challenge needs before it can put anybody on the
 * board: a name to list them under.
 *
 * It is dismissable on purpose. Arriving on a link somebody sent is not consent
 * to be listed, and the board is worth reading even if you would rather not be
 * on it — so Escape, the scrim and "Not now" all leave the challenge running
 * and the scoreboard visible, just without a row of your own.
 *
 * The modal furniture is the practice sheet's, minus the bottom-anchoring: this
 * is a question rather than a drawer, so it sits in the middle of the screen.
 */
export function NicknamePrompt({ challenge, onJoin, onDismiss }: NicknamePromptProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState('')

  useFocusTrap(dialogRef, true, onDismiss)

  // Submit is disabled on exactly what the hook would refuse, so the form never
  // looks broken: a name of nothing but spaces is not a name.
  const nickname = normalizeNickname(draft)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (nickname !== null) {
      onJoin(nickname)
    }
  }

  return (
    <div className="sheet-layer nickname-layer" data-testid="nickname-prompt">
      <button type="button" className="sheet-scrim" aria-label="Not now" tabIndex={-1} onClick={onDismiss} />

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
          Pick a name for the shared scoreboard. Your points go up whenever you pause or stop, and only your
          best session counts.
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
          />

          <div className="nickname-prompt-actions">
            <button type="button" className="ghost-button" onClick={onDismiss} data-testid="nickname-dismiss">
              Not now
            </button>
            <button
              type="submit"
              className="primary-button"
              data-testid="nickname-submit"
              disabled={nickname === null}
            >
              Join challenge
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
