import { useEffect, useRef, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

type PracticeSheetProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * Everything that is a choice rather than the practice itself: tempo, the note
 * pool, the option switches, the routine.
 *
 * They are pre-flight decisions — made once, then left alone for twenty
 * minutes — so on a phone propped two metres away they have no business
 * competing with the note. Behind one button they cost nothing to reach and
 * nothing to ignore.
 */
export function PracticeSheet({ open, onClose, children }: PracticeSheetProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    // The sheet covers the whole screen; letting the page behind it scroll too
    // makes the note it is covering impossible to get back to.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="sheet-layer" data-testid="practice-sheet">
      <button
        type="button"
        className="sheet-scrim"
        aria-label="Close practice setup"
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Practice setup">
        <div className="sheet-header">
          <span className="sheet-grip" aria-hidden="true" />
          <h2 className="sheet-title">Practice setup</h2>
          <button
            type="button"
            ref={closeRef}
            className="sheet-close"
            onClick={onClose}
            data-testid="practice-sheet-close"
            aria-label="Close practice setup"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
