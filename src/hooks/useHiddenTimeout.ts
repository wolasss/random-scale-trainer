import { useEffect, useRef } from 'react'

/**
 * Calls `onExpire` once the page has been hidden for `delayMs` while `active`.
 *
 * A phone that goes into a pocket mid-session should not keep clicking, so this
 * is what stops the transport. It checks two ways because a backgrounded mobile
 * page is not reliably alive: the timer catches the case where the page keeps
 * running, and the elapsed-time check on return catches the case where it was
 * frozen and the timer never fired at all.
 */
export function useHiddenTimeout(active: boolean, delayMs: number, onExpire: () => void): void {
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    if (!active) {
      return undefined
    }

    let timeoutId: number | null = null
    let hiddenAt: number | null = null

    const clearTimer = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const expire = () => {
      clearTimer()
      hiddenAt = null
      onExpireRef.current()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        clearTimer()
        timeoutId = window.setTimeout(expire, delayMs)
        return
      }

      clearTimer()
      const wasHiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt
      hiddenAt = null
      if (wasHiddenFor >= delayMs) {
        onExpireRef.current()
      }
    }

    // Playback can be started from an already-hidden page (a keyboard shortcut
    // in a background window), so start counting from the current state.
    onVisibilityChange()

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [active, delayMs])
}
