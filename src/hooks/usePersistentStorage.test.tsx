import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePersistentStorage } from './usePersistentStorage'

const installStorage = (overrides: { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> } = {}) => {
  const persisted = vi.fn(overrides.persisted ?? (async () => false))
  const persist = vi.fn(overrides.persist ?? (async () => true))

  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persisted, persist },
  })

  return { persisted, persist }
}

/** Same, but `persisted()` stays pending until the test resolves it by hand. */
const installDeferredStorage = () => {
  const persist = vi.fn(async () => true)
  let resolvePersisted: (value: boolean) => void = () => undefined
  const persisted = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolvePersisted = resolve
      }),
  )

  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persisted, persist },
  })

  return { persisted, persist, resolvePersisted: (value: boolean) => resolvePersisted(value) }
}

const removeStorage = () => {
  Reflect.deleteProperty(navigator, 'storage')
}

describe('usePersistentStorage', () => {
  afterEach(() => {
    removeStorage()
  })

  it('requests persistence when the origin is not already persisted', async () => {
    const { persisted, persist } = installStorage({ persisted: async () => false })

    await act(async () => {
      renderHook(() => usePersistentStorage())
    })

    expect(persisted).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('does not request it when already persisted', async () => {
    const { persisted, persist } = installStorage({ persisted: async () => true })

    await act(async () => {
      renderHook(() => usePersistentStorage())
    })

    expect(persisted).toHaveBeenCalledTimes(1)
    expect(persist).not.toHaveBeenCalled()
  })

  it('asks exactly once under StrictMode', async () => {
    const { persisted, persist, resolvePersisted } = installDeferredStorage()

    renderHook(() => usePersistentStorage(), { wrapper: StrictMode })

    await act(async () => {
      resolvePersisted(false)
    })

    expect(persisted).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('does nothing when navigator.storage is absent', async () => {
    removeStorage()

    await expect(
      act(async () => {
        renderHook(() => usePersistentStorage())
      }),
    ).resolves.not.toThrow()
  })

  it('does nothing when persist is missing from an otherwise present storage', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: vi.fn(async () => false) },
    })

    await expect(
      act(async () => {
        renderHook(() => usePersistentStorage())
      }),
    ).resolves.not.toThrow()
  })

  it('stays silent when persist() rejects', async () => {
    installStorage({ persisted: async () => false, persist: async () => Promise.reject(new Error('denied')) })

    await expect(
      act(async () => {
        renderHook(() => usePersistentStorage())
      }),
    ).resolves.not.toThrow()
  })

  it('stays silent when persisted() rejects', async () => {
    installStorage({ persisted: async () => Promise.reject(new Error('denied')) })

    await expect(
      act(async () => {
        renderHook(() => usePersistentStorage())
      }),
    ).resolves.not.toThrow()
  })
})
