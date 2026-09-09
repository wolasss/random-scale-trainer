import { useEffect, useRef } from 'react'

/** Minimal shape of the Storage Manager API — absent on older WebKit. */
type StorageManagerLike = {
  persisted: () => Promise<boolean>
  persist: () => Promise<boolean>
}

/**
 * Asks the browser to make the origin's storage persistent, so the Cache
 * Storage precache and the localStorage-backed practice log are not sitting in
 * 'best-effort' storage the browser can evict under disk pressure.
 *
 * There is nothing useful to tell the user on refusal — browsers grant this
 * automatically for installed apps anyway — so every failure is swallowed.
 */
export function usePersistentStorage(): void {
  const requested = useRef(false)

  useEffect(() => {
    // StrictMode runs this effect twice, and both runs would reach
    // `persisted()` before either resolved without this guard.
    if (requested.current) return undefined

    // `navigator.storage` is typed as non-optional by lib.dom, but the API is
    // absent on older WebKit; the assertion models that real-world absence.
    const storage = navigator.storage as StorageManagerLike | undefined
    if (typeof storage?.persist !== 'function' || typeof storage.persisted !== 'function') {
      return undefined
    }

    requested.current = true

    void (async () => {
      try {
        if (await storage.persisted()) return
        await storage.persist()
      } catch {
        // Nothing to tell the user on refusal.
      }
    })()

    return undefined
  }, [])
}
