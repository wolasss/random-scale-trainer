import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

const QUERY = '(orientation: landscape)'

/**
 * jsdom's own matchMedia never matches anything and never fires, so each test
 * hands the hook exactly the MediaQueryList it should see.
 */
const installMatchMedia = (build: (query: string) => unknown) => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: build })
}

const createList = (initial: boolean) => {
  const listeners = new Set<() => void>()
  const list = {
    matches: initial,
    addEventListener: vi.fn((_type: 'change', listener: () => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: 'change', listener: () => void) => {
      listeners.delete(listener)
    }),
  }

  return {
    list,
    listenerCount: () => listeners.size,
    change: (matches: boolean) => {
      list.matches = matches
      act(() => {
        listeners.forEach((listener) => listener())
      })
    },
  }
}

describe('useMediaQuery', () => {
  afterEach(() => {
    // Drops the own property, leaving jsdom's implementation in place.
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('reports false in a browser with no matchMedia', () => {
    installMatchMedia(undefined as unknown as () => unknown)

    const { result } = renderHook(() => useMediaQuery(QUERY))

    expect(result.current).toBe(false)
  })

  it('reads the query on mount', () => {
    const media = createList(true)
    installMatchMedia(() => media.list)

    const { result } = renderHook(() => useMediaQuery(QUERY))

    expect(result.current).toBe(true)
  })

  it('follows the query as it changes', () => {
    const media = createList(false)
    installMatchMedia(() => media.list)

    const { result } = renderHook(() => useMediaQuery(QUERY))
    expect(result.current).toBe(false)

    media.change(true)
    expect(result.current).toBe(true)

    media.change(false)
    expect(result.current).toBe(false)
  })

  it('re-reads a query that flipped between the render and the effect', () => {
    // The phone is turned while React is still mounting, so the value read
    // during render is already stale by the time the effect subscribes.
    let reads = 0
    installMatchMedia(() => ({
      get matches() {
        reads += 1
        return reads > 1
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    }))

    const { result } = renderHook(() => useMediaQuery(QUERY))

    expect(reads).toBeGreaterThan(1)
    expect(result.current).toBe(true)
  })

  it('still reports the query where the list cannot be subscribed to', () => {
    // Safari below 14 only offers the deprecated addListener.
    installMatchMedia(() => ({ matches: true }))

    const { result, unmount } = renderHook(() => useMediaQuery(QUERY))

    expect(result.current).toBe(true)
    expect(() => unmount()).not.toThrow()
  })

  it('drops its listener on unmount', () => {
    const media = createList(false)
    installMatchMedia(() => media.list)

    const { unmount } = renderHook(() => useMediaQuery(QUERY))
    expect(media.listenerCount()).toBe(1)

    unmount()

    expect(media.list.removeEventListener).toHaveBeenCalledWith('change', media.list.addEventListener.mock.calls[0][1])
    expect(media.listenerCount()).toBe(0)
  })
})
