/**
 * localStorage access that survives a storage that is absent, blocked, or
 * throwing. Some browsers throw on the very first touch of `window.localStorage`
 * — Safari private mode, disabled cookies, hardened privacy settings — and a
 * full quota throws on write. In every one of those cases the app should keep
 * running on its in-memory state rather than crash on launch.
 *
 * Reads fall back to `null` (same as a missing key); writes are dropped silently.
 * `storageWorks` is the way to find out whether that silent drop is happening,
 * for the one caller that has to say so out loud.
 */
export const readRaw = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export const writeRaw = (key: string, value: string): void => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable or full — keep the in-memory value and move on.
  }
}

/** Never collides with a real key: nothing in `STORAGE_KEYS` looks like this. */
const PROBE_KEY = 'storage-probe'

/**
 * Whether a value written now would still be there after a reload. A store can
 * fail without throwing — a quota-full or private-mode browser may accept the
 * write and hand back nothing — so this writes a sentinel and reads it back
 * rather than trusting `setItem` alone. The sentinel never outlives the check.
 */
export const storageWorks = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    window.localStorage.setItem(PROBE_KEY, '1')
    try {
      return window.localStorage.getItem(PROBE_KEY) === '1'
    } finally {
      window.localStorage.removeItem(PROBE_KEY)
    }
  } catch {
    return false
  }
}
