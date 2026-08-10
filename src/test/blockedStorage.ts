/**
 * Swap `window.localStorage` for `fake` until the returned restore function is
 * called (in a `finally` or `afterEach`).
 */
export const withFakeStorage = (fake: Storage): (() => void) => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')

  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake })

  return () => {
    if (original) {
      Object.defineProperty(window, 'localStorage', original)
    }
  }
}

/**
 * Swap `window.localStorage` for one that throws a `SecurityError` on every
 * operation — the way a privacy-locked or storage-disabled browser behaves.
 * Returns a restore function; call it (in a `finally` or `afterEach`) to hand
 * the real storage back.
 */
export const withBlockedStorage = (): (() => void) => {
  const boom = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }

  return withFakeStorage({
    get length(): number {
      return boom()
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  })
}
