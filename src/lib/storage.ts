/**
 * localStorage access that survives a storage that is absent, blocked, or
 * throwing. Some browsers throw on the very first touch of `window.localStorage`
 * — Safari private mode, disabled cookies, hardened privacy settings — and a
 * full quota throws on write. In every one of those cases the app should keep
 * running on its in-memory state rather than crash on launch.
 *
 * Reads fall back to `null` (same as a missing key); writes are dropped silently
 * but say so in their return value, for the one caller that has to pass that on.
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

/**
 * Returns whether this exact value would still be there after a reload. A store
 * can fail without throwing — a quota-full or private-mode browser may accept
 * the write and hand back nothing — so the value is read back rather than
 * `setItem` alone being trusted. Reading back the real write, rather than
 * probing with a sentinel, is what makes the answer true of *this* value: a
 * store with room for a flag may still have none for a serialized routine list.
 */
export const writeRaw = (key: string, value: string): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    window.localStorage.setItem(key, value)
    return window.localStorage.getItem(key) === value
  } catch {
    // Storage unavailable or full — keep the in-memory value and move on.
    return false
  }
}
