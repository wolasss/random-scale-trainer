import { useEffect } from 'react'

/** Minimal shape of the Screen Wake Lock API — absent on iOS before 16.4. */
type WakeLockSentinelLike = {
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

/**
 * Holds the screen awake while `active`.
 *
 * A metronome that dims out after thirty seconds is broken, so the lock is
 * taken for the whole of playback. The OS drops it whenever the page is
 * backgrounded — that is fine and expected — so becoming visible again while
 * still playing re-takes it.
 *
 * Everything here fails silently: no browser is required to support this, and
 * there is nothing useful to tell the user if it does not.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const api = (navigator as WakeLockNavigator).wakeLock
    if (api === undefined) {
      return undefined
    }

    let disposed = false
    let sentinel: WakeLockSentinelLike | null = null

    const release = () => {
      const current = sentinel
      sentinel = null
      void current?.release().catch(() => undefined)
    }

    const acquire = async () => {
      if (disposed || !active || sentinel !== null || document.visibilityState !== 'visible') {
        return
      }

      try {
        const next = await api.request('screen')
        // Playback may have stopped while the request was in flight.
        if (disposed || !active) {
          void next.release().catch(() => undefined)
          return
        }

        // The OS releases the lock on its own when the page is backgrounded;
        // clearing the handle is what lets the next acquire() take a new one.
        next.addEventListener('release', () => {
          if (sentinel === next) {
            sentinel = null
          }
        })
        sentinel = next
      } catch {
        // Denied, or unsupported despite the API being present.
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquire()
      } else {
        release()
      }
    }

    if (active) {
      void acquire()
    } else {
      release()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      release()
    }
  }, [active])
}
