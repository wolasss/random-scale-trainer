import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].join(', ')

/** The container's tab order, in document order and without anything opted out of it. */
function focusableWithin(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('hidden'),
  )
}

/**
 * Holds keyboard focus inside `ref` for as long as `open`, and calls `onClose`
 * on Escape.
 *
 * This is the rest of what a modal owes a keyboard user beyond the aria
 * attributes: focus starts inside, Tab cycles rather than escapes, the page
 * behind cannot scroll away, and whatever opened it gets focus back on close.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
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
    if (ref.current !== null) {
      focusableWithin(ref.current)[0]?.focus()
    }

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
      const sheet = ref.current
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
  }, [open, ref])
}
