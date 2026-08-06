import { useCallback, useEffect, useState } from 'react'
import { STORAGE_KEYS } from '../constants'
import { isIos } from './useDisplayMode'

/** Chromium's install event. Not in lib.dom, and not implemented anywhere else. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPrompt = {
  /** A real install prompt is available — show the header button. */
  canInstall: boolean
  install: () => void
  /**
   * iOS fires no install event and exposes no API, so the only thing left is
   * to say where the button is. Shown once, then remembered as dismissed.
   */
  showIosHint: boolean
  dismissIosHint: () => void
}

const hintDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.iosInstallHint) === 'dismissed'
  } catch {
    return false
  }
}

export function useInstallPrompt(standalone: boolean): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHintDismissed, setIosHintDismissed] = useState(hintDismissed)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress the browser's own bar; the header button replaces it.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => setDeferred(null)

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(() => {
    if (deferred === null) {
      return
    }

    // The event is single-use whatever the user chooses.
    setDeferred(null)
    void deferred.prompt()
  }, [deferred])

  const dismissIosHint = useCallback(() => {
    setIosHintDismissed(true)
    try {
      window.localStorage.setItem(STORAGE_KEYS.iosInstallHint, 'dismissed')
    } catch {
      // Private mode with storage denied: the hint just comes back next launch.
    }
  }, [])

  return {
    canInstall: !standalone && deferred !== null,
    install,
    showIosHint: !standalone && isIos() && !iosHintDismissed,
    dismissIosHint,
  }
}
