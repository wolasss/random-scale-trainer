import { describe, expect, it } from 'vitest'
import { withBlockedStorage } from '../test/blockedStorage'
import { readRaw, removeRaw, writeRaw } from './storage'

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
  it('persists the value to storage', () => {
    writeRaw(KEY, 'written')
    expect(window.localStorage.getItem(KEY)).toBe('written')
  })

  it('drops the value without throwing when the write is refused', () => {
    const restore = withBlockedStorage()
    try {
      expect(() => {
        writeRaw(KEY, 'refused')
      }).not.toThrow()
    } finally {
      restore()
    }
    // Nothing was queued for later — the value is simply gone.
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })
})

describe('removeRaw', () => {
  it('clears a previously written key', () => {
    writeRaw(KEY, 'doomed')
    removeRaw(KEY)
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('does nothing instead of throwing when the store refuses', () => {
    const restore = withBlockedStorage()
    try {
      expect(() => {
        removeRaw(KEY)
      }).not.toThrow()
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
