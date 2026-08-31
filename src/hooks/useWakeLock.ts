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
 * How many times in a row a dropped lock is taken back on its own. A browser
 * that releases every lock the instant it grants one would otherwise spin.
 */
const MAX_AUTO_RETAKES = 3

/**
 * Holds the screen awake while `active`.
 *
 * A metronome that dims out after thirty seconds is broken, so the lock is
 * taken for the whole of playback. The OS drops it whenever the page is
 * backgrounded — that is fine and expected — so becoming visible again while
 * still playing re-takes it. It also drops it while the page stays visible (a
 * notification shade, a call banner, battery saver), and a new one is taken
 * straight away in that case.
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
    let pending: Promise<WakeLockSentinelLike> | null = null
    // Reset by a fresh visible transition, and by the effect re-running when
    // `active` changes.
    let retakes = 0

    const release = () => {
      const current = sentinel
      sentinel = null
      // A request still in flight sees it was superseded and releases the lock
      // it ends up with, rather than leaving it held forever.
      pending = null
      void current?.release().catch(() => undefined)
    }

    const acquire = async () => {
      if (
        disposed ||
        !active ||
        sentinel !== null ||
        pending !== null ||
        document.visibilityState !== 'visible'
      ) {
        return
      }

      const request = api.request('screen')
      pending = request

      try {
        const next = await request
        // Playback may have stopped, or another acquire() taken over, while the
        // request was in flight.
        if (disposed || !active || pending !== request) {
          void next.release().catch(() => undefined)
          return
        }
        pending = null

        // The OS releases the lock on its own when the page is backgrounded;
        // clearing the handle is what lets the next acquire() take a new one.
        // A drop while the page is still visible is a different story — nothing
        // will come along to re-take it, so the screen would sleep mid-session.
        next.addEventListener('release', () => {
          if (sentinel !== next) {
            return
          }
          sentinel = null
          if (!disposed && active && document.visibilityState === 'visible' && retakes < MAX_AUTO_RETAKES) {
            retakes += 1
            void acquire()
          }
        })
        sentinel = next
      } catch {
        // Denied, or unsupported despite the API being present.
        if (pending === request) {
          pending = null
        }
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        retakes = 0
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
