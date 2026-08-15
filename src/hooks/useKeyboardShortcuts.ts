import { useEffect, useRef } from 'react'

export type KeyboardShortcutHandlers = {
  onSpace: () => void
  onTap: () => void
  onTempoUp: () => void
  onTempoDown: () => void
  onReset: () => void
}

const TEMPO_UP_CODES = new Set(['ArrowUp', 'ArrowRight'])
const TEMPO_DOWN_CODES = new Set(['ArrowDown', 'ArrowLeft'])

const TYPING_TAGS = new Set(['input', 'textarea', 'select'])
const INTERACTIVE_ROLES = new Set(['button', 'radio', 'switch', 'tab'])

/**
 * True when the event target is a control that owns its own key handling —
 * a button that responds to Space, a radio group that moves the selection
 * with the arrow keys, and so on. Anything explicitly placed in the tab
 * order counts too, since it can be focused and is presumably interactive.
 */
function isInteractiveTarget(target: HTMLElement) {
  if (target === document.body) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  if (tagName === 'button' || (tagName === 'a' && target.hasAttribute('href'))) {
    return true
  }

  const role = target.getAttribute('role')
  if (role !== null && INTERACTIVE_ROLES.has(role)) {
    return true
  }

  const tabIndex = target.getAttribute('tabindex')
  return tabIndex !== null && Number.parseInt(tabIndex, 10) >= 0
}

/**
 * Global keyboard shortcuts on a single mount-time listener. Handlers are
 * read through a ref so the freshest render's closures always run, and are
 * suppressed while typing, while a focused control handles the key itself,
 * or when a modifier key is held.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const target = event.target instanceof HTMLElement ? event.target : null
      if (target !== null) {
        const isTypingContext = TYPING_TAGS.has(target.tagName.toLowerCase()) || target.isContentEditable
        if (isTypingContext || isInteractiveTarget(target)) {
          return
        }
      }

      if (event.code === 'Space') {
        event.preventDefault()
        handlersRef.current.onSpace()
        return
      }

      if (TEMPO_UP_CODES.has(event.code)) {
        event.preventDefault()
        handlersRef.current.onTempoUp()
        return
      }

      if (TEMPO_DOWN_CODES.has(event.code)) {
        event.preventDefault()
        handlersRef.current.onTempoDown()
        return
      }

      if (event.code === 'KeyT') {
        event.preventDefault()
        // Auto-repeat from a held key is not a tap: the intervals it feeds in
        // are the keyboard's, not the player's, and they would drag the
        // measured tempo along with them. Holding the arrows to sweep the
        // tempo is still fair game, so the guard stays on this branch.
        if (!event.repeat) {
          handlersRef.current.onTap()
        }
        return
      }

      if (event.code === 'KeyR') {
        event.preventDefault()
        handlersRef.current.onReset()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
