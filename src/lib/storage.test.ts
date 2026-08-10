import { describe, expect, it } from 'vitest'
import { withBlockedStorage, withFakeStorage } from '../test/blockedStorage'
import { readRaw, writeRaw } from './storage'

const KEY = 'storage-test-key'

describe('readRaw', () => {
  it('returns null for a key that was never written', () => {
    expect(readRaw(KEY)).toBeNull()
  })

  it('returns the stored value', () => {
    window.localStorage.setItem(KEY, 'stored')
    expect(readRaw(KEY)).toBe('stored')
  })

  it('returns null instead of throwing when storage access throws', () => {
    const restore = withBlockedStorage()
    try {
      expect(readRaw(KEY)).toBeNull()
    } finally {
      restore()
    }
  })
})

describe('writeRaw', () => {
  it('persists the value to storage and reports that it stuck', () => {
    expect(writeRaw(KEY, 'written')).toBe(true)
    expect(window.localStorage.getItem(KEY)).toBe('written')
  })

  it('drops the value without throwing when the write is refused', () => {
    const restore = withBlockedStorage()
    try {
      expect(writeRaw(KEY, 'refused')).toBe(false)
    } finally {
      restore()
    }
    // Nothing was queued for later — the value is simply gone.
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('reports a dropped write when the value is accepted but never comes back', () => {
    // The quiet failure mode: no throw, no value. Only reading the value back
    // catches it.
    const restore = withFakeStorage({
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    })

    try {
      expect(writeRaw(KEY, 'forgotten')).toBe(false)
    } finally {
      restore()
    }
  })

  it('reports a dropped write when the store has room for small values but not this one', () => {
    // The reason this asks about the real value rather than a sentinel: a
    // store can be roomy enough for a flag and still full for a big one.
    const entries = new Map<string, string>()
    const restore = withFakeStorage({
      length: 0,
      clear: () => entries.clear(),
      getItem: (key) => entries.get(key) ?? null,
      key: () => null,
      removeItem: (key) => {
        entries.delete(key)
      },
      setItem: (key, value) => {
        if (value.length > 8) {
          throw new DOMException('Quota exceeded.', 'QuotaExceededError')
        }
        entries.set(key, value)
      },
    })

    try {
      expect(writeRaw(KEY, 'small')).toBe(true)
      expect(writeRaw(KEY, 'a value far too long for this store')).toBe(false)
    } finally {
      restore()
    }
  })
})

describe('round trip', () => {
  it('reads back what it wrote', () => {
    writeRaw(KEY, 'hello')
    expect(readRaw(KEY)).toBe('hello')
  })

  it('overwrites an existing value', () => {
    writeRaw(KEY, 'first')
    writeRaw(KEY, 'second')
    expect(readRaw(KEY)).toBe('second')
  })
})
