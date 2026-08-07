/**
 * Swap `window.localStorage` for one that throws a `SecurityError` on every
 * operation — the way a privacy-locked or storage-disabled browser behaves.
 * Returns a restore function; call it (in a `finally` or `afterEach`) to hand
 * the real storage back.
 */
export const withBlockedStorage = (): (() => void) => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
  const boom = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  const blocked: Storage = {
    get length(): number {
      return boom()
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  }

  Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })

  return () => {
    if (original) {
      Object.defineProperty(window, 'localStorage', original)
    }
  }
}
