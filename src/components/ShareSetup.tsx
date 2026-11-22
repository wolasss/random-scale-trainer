import { useId, useRef, useState } from 'react'
import { encodeSharedSetup, type SharedSetup } from '../lib/sharedSetup'

export function ShareSetup({ setup }: { setup: SharedSetup }) {
  const query = encodeSharedSetup(setup)
  return <ShareSetupAction key={query} query={query} />
}

function ShareSetupAction({ query }: { query: string }) {
  const [feedback, setFeedback] = useState<{ link: string; result: 'copied' | 'fallback' } | null>(null)
  const request = useRef(0)
  const inputId = useId()
  const statusId = useId()

  const share = async () => {
    const currentRequest = ++request.current
    const link = `${window.location.origin}${window.location.pathname}?${query}`
    setFeedback(null)
    try {
      await navigator.clipboard.writeText(link)
      if (request.current === currentRequest) {
        setFeedback({ link, result: 'copied' })
      }
    } catch {
      if (request.current === currentRequest) {
        setFeedback({ link, result: 'fallback' })
      }
    }
  }

  return (
    <div className="share-setup">
      <div className="shared-setup-actions">
        <button type="button" className="ghost-button" onClick={() => void share()}>
          Share setup
        </button>
        <span id={statusId} role="status">
          {feedback?.result === 'copied'
            ? 'Link copied'
            : feedback?.result === 'fallback'
              ? 'Copy this link to share your setup.'
              : ''}
        </span>
      </div>
      {feedback?.result === 'fallback' ? (
        <div className="share-setup-fallback">
          <label htmlFor={inputId}>Setup link</label>
          <input
            id={inputId}
            className="share-setup-input"
            type="text"
            readOnly
            value={feedback.link}
            aria-describedby={statusId}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </div>
  )
}
