import { useCallback, useEffect, useState } from 'react'
import { STORAGE_KEYS } from '../constants'
import { readRaw, writeRaw } from '../lib/storage'
import { isAndroid, isIos } from './useDisplayMode'

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
  /**
   * The same dead end on Android, in the browsers that never fire the install
   * event — Firefox, mostly. Installing there lives in the browser's own menu,
   * so the hint points at that instead of the share sheet.
   */
  showAndroidHint: boolean
  dismissAndroidHint: () => void
}

const hintDismissed = (key: string): boolean => readRaw(key) === 'dismissed'

/**
 * Whether this browser implements the install event at all — Chromium does,
 * whether or not one has fired yet. The property test is what keeps the
 * Android hint from flashing up in Chrome during the seconds before the real
 * event arrives, and from showing on a site Chrome has decided not to offer.
 */
const supportsInstallEvent = (): boolean => typeof window !== 'undefined' && 'onbeforeinstallprompt' in window

export function useInstallPrompt(standalone: boolean): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHintDismissed, setIosHintDismissed] = useState(() => hintDismissed(STORAGE_KEYS.iosInstallHint))
  const [androidHintDismissed, setAndroidHintDismissed] = useState(() =>
    hintDismissed(STORAGE_KEYS.androidInstallHint),
  )
  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress the browser's own bar; the header button replaces it.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setDeferred(null)
    }

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

    // The event is single-use whatever the browser decides — even a refusal
    // spends it, so there is nothing to hand back. Only a fresh
    // beforeinstallprompt event can offer it again.
    setDeferred(null)
    void deferred.prompt().catch(() => {
      // Chromium rejects when the prompt is re-used or called outside a
      // user gesture. Nothing was installed; swallow it so it doesn't
      // surface as an unhandled rejection.
    })
  }, [deferred])

  const dismissIosHint = useCallback(() => {
    setIosHintDismissed(true)
    // Private mode with storage denied drops the write: the hint just comes
    // back next launch.
    writeRaw(STORAGE_KEYS.iosInstallHint, 'dismissed')
  }, [])

  const dismissAndroidHint = useCallback(() => {
    setAndroidHintDismissed(true)
    writeRaw(STORAGE_KEYS.androidInstallHint, 'dismissed')
  }, [])

  return {
    canInstall: !standalone && deferred !== null,
    install,
    showIosHint: !standalone && isIos() && !iosHintDismissed,
    dismissIosHint,
    showAndroidHint: !standalone && isAndroid() && !supportsInstallEvent() && !androidHintDismissed,
    dismissAndroidHint,
  }
}
