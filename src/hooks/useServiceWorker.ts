import { useEffect, useState } from 'react'

export type ServiceWorkerStatus = {
  /** A newer build has taken over the cache; the page is still running the old one. */
  updateReady: boolean
  /** Reload onto the new build. Only ever called by the user. */
  applyUpdate: () => void
  dismissUpdate: () => void
}

/**
 * Only bounds how often the browser is asked to re-fetch /sw.js. Tab switches
 * are frequent; a check on every one would be a request per glance at the app.
 */
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1_000

/**
 * Registers the worker and reports when a new build has activated.
 *
 * The worker calls skipWaiting(), so a new build takes over the cache as soon
 * as it installs — but the running page keeps its own already-loaded bundle
 * until the user reloads. That is the whole point: an automatic reload here
 * would kill a metronome mid-session.
 *
 * An installed standalone window is never really closed, so coming back to the
 * foreground is the only reliable moment to ask the browser to look for a new
 * build — without it the app can sit on the same one for days.
 */
export function useServiceWorker(): ServiceWorkerStatus {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined
    }

    const container = navigator.serviceWorker

    /*
      A controller change means a different build took over the cache. The very
      first one does not: on a first visit the page loads with no controller and
      is claimed a moment later by the build it is already running, and calling
      that an update would offer a reload to the version you are on.

      This has to be a running flag rather than a snapshot taken at mount. A page
      that loads while the previous worker is still activating starts life
      uncontrolled, and a snapshot would write that page off as a first install
      for as long as the tab stays open — so a genuine update, hours later, would
      pass in silence.
    */
    let controlled = container.controller !== null
    const onControllerChange = () => {
      if (controlled) {
        setUpdateReady(true)
        return
      }

      controlled = true
    }

    container.addEventListener('controllerchange', onControllerChange)

    let registration: ServiceWorkerRegistration | null = null
    // A failed registration is not something the user can act on, and the app
    // works without it. Stay quiet.
    container.register('/sw.js').then((result) => {
      registration = result
    }, () => undefined)

    // Zero rather than the mount time, so the first foreground does check.
    let lastCheckedAt = 0
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || registration === null) {
        return
      }

      const now = Date.now()
      if (now - lastCheckedAt < UPDATE_CHECK_INTERVAL_MS) {
        return
      }

      lastCheckedAt = now
      // Offline is the normal case for a PWA; a failed check is not news.
      void registration.update().catch(() => undefined)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      container.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return {
    updateReady,
    applyUpdate: () => window.location.reload(),
    dismissUpdate: () => setUpdateReady(false),
  }
}
