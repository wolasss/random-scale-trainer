import { useEffect, useRef } from 'react'

export type KeyboardShortcutHandlers = {
  onSpace: () => void
  onArrowUp: () => void
  onArrowDown: () => void
  onReset: () => void
}

/**
 * Global keyboard shortcuts on a single mount-time listener. Handlers are
 * read through a ref so the freshest render's closures always run, and are
 * suppressed while typing or when a modifier key is held.
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
      const isTypingContext = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable

      if (isTypingContext || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        handlersRef.current.onSpace()
        return
      }

      if (event.code === 'ArrowUp') {
        event.preventDefault()
        handlersRef.current.onArrowUp()
        return
      }

      if (event.code === 'ArrowDown') {
        event.preventDefault()
        handlersRef.current.onArrowDown()
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
