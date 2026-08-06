import { useEffect, useState } from 'react'

export type ServiceWorkerStatus = {
  /** A newer build has taken over the cache; the page is still running the old one. */
  updateReady: boolean
  /** Reload onto the new build. Only ever called by the user. */
  applyUpdate: () => void
  dismissUpdate: () => void
}

/**
 * Registers the worker and reports when a new build has activated.
 *
 * The worker calls skipWaiting(), so a new build takes over the cache as soon
 * as it installs — but the running page keeps its own already-loaded bundle
 * until the user reloads. That is the whole point: an automatic reload here
 * would kill a metronome mid-session.
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
    // A failed registration is not something the user can act on, and the app
    // works without it. Stay quiet.
    container.register('/sw.js').catch(() => undefined)

    return () => container.removeEventListener('controllerchange', onControllerChange)
  }, [])

  return {
    updateReady,
    applyUpdate: () => window.location.reload(),
    dismissUpdate: () => setUpdateReady(false),
  }
}
