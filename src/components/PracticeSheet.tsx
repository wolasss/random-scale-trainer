import { useEffect, useRef, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

type PracticeSheetProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].join(', ')

/** The sheet's tab order, in document order and without anything opted out of it. */
function focusableWithin(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('hidden'),
  )
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
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) {
      return undefined
    }

    // Whatever opened the sheet — the setup button, on the stand layout — is
    // where a keyboard user expects to land again once it is gone.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      // aria-modal says nothing about the tab order, so the sheet has to hold
      // on to it itself — otherwise Tab walks out into the transport behind it.
      const sheet = sheetRef.current
      if (sheet === null) {
        return
      }

      const focusable = focusableWithin(sheet)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = active instanceof HTMLElement && sheet.contains(active)

      let next: HTMLElement | null = null
      if (!inside) {
        next = event.shiftKey ? last : first
      } else if (event.shiftKey && active === first) {
        next = last
      } else if (!event.shiftKey && active === last) {
        next = first
      }

      if (next !== null) {
        event.preventDefault()
        next.focus()
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

      if (opener !== null && opener.isConnected) {
        opener.focus()
      }
    }
  }, [open])

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
      <div className="sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label="Practice setup">
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
