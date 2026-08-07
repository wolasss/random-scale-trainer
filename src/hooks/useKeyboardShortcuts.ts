import { useEffect, useRef } from 'react'

export type KeyboardShortcutHandlers = {
  onSpace: () => void
  onTempoUp: () => void
  onTempoDown: () => void
  onReset: () => void
}

const TEMPO_UP_CODES = new Set(['ArrowUp', 'ArrowRight'])
const TEMPO_DOWN_CODES = new Set(['ArrowDown', 'ArrowLeft'])

/**
 * Global keyboard shortcuts on a single mount-time listener. Handlers are
 * read through a ref so the freshest render's closures always run, and are
 * suppressed while typing, while a select has focus, or when a modifier key
 * is held.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isTypingContext =
        tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable

      if (isTypingContext || event.metaKey || event.ctrlKey || event.altKey) {
        return
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
