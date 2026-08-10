import { describe, expect, it } from 'vitest'
import { withBlockedStorage } from '../test/blockedStorage'
import { readRaw, storageWorks, writeRaw } from './storage'

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

describe('storageWorks', () => {
  it('reports a working store and cleans up after itself', () => {
    expect(storageWorks()).toBe(true)
    expect(window.localStorage.getItem('storage-probe')).toBeNull()
  })

  it('reports a dead store instead of throwing when every operation is refused', () => {
    const restore = withBlockedStorage()
    try {
      expect(storageWorks()).toBe(false)
    } finally {
      restore()
    }
  })

  it('reports a dead store when a write is accepted but never comes back', () => {
    // The quiet failure mode: no throw, no value. Only reading the sentinel
    // back catches it.
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    const forgetful: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    }
    Object.defineProperty(window, 'localStorage', { configurable: true, value: forgetful })

    try {
      expect(storageWorks()).toBe(false)
    } finally {
      if (original) {
        Object.defineProperty(window, 'localStorage', original)
      }
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
