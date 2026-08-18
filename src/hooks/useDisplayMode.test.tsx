import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, STANDALONE_QUERY, useDisplayMode } from './useDisplayMode'

type FakeList = {
  matches: boolean
  listeners: (() => void)[]
}

/**
 * A controllable matchMedia. jsdom's own always reports false, which would make
 * every one of these tests pass for the wrong reason.
 */
const installMatchMedia = (initial: Record<string, boolean>) => {
  const lists = new Map<string, FakeList>()

  const listFor = (query: string): FakeList => {
    const existing = lists.get(query)
    if (existing) {
      return existing
    }

    // A comma-separated query list matches when any one of its parts does, so a
    // fixture can flag the whole list or a single mode inside it.
    const matches =
      initial[query] ?? query.split(',').some((part) => initial[part.trim()] === true)
    const created: FakeList = { matches, listeners: [] }
    lists.set(query, created)
    return created
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const list = listFor(query)
      return {
        get matches() {
          return list.matches
        },
        media: query,
        addEventListener: (_type: 'change', listener: () => void) => list.listeners.push(listener),
        removeEventListener: (_type: 'change', listener: () => void) => {
          const index = list.listeners.indexOf(listener)
          if (index >= 0) {
            list.listeners.splice(index, 1)
          }
        },
      }
    },
  })

  return {
    set: (query: string, matches: boolean) => {
      const list = listFor(query)
      list.matches = matches
      act(() => {
        list.listeners.forEach((listener) => listener())
      })
    },
  }
}

const PHONE_STANDALONE = {
  [STANDALONE_QUERY]: true,
  [COARSE_POINTER_QUERY]: true,
  [LANDSCAPE_QUERY]: false,
}

describe('useDisplayMode', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
    Reflect.deleteProperty(navigator, 'standalone')
  })

  it('is the plain browser reading on a desktop', () => {
    installMatchMedia({})
    const { result } = renderHook(() => useDisplayMode())

    expect(result.current).toMatchObject({ standalone: false, stage: false })
  })

  it('is the stand reading once installed on a touch device', () => {
    installMatchMedia(PHONE_STANDALONE)
    const { result } = renderHook(() => useDisplayMode())

    expect(result.current).toMatchObject({ standalone: true, stage: true, landscape: false })
  })

  it('never rearranges an installed desktop app', () => {
    installMatchMedia({ [STANDALONE_QUERY]: true, [COARSE_POINTER_QUERY]: false })
    const { result } = renderHook(() => useDisplayMode())

    // A mouse and a keyboard mean a desk, not a music stand.
    expect(result.current).toMatchObject({ standalone: true, stage: false })
  })

  it('is the stand reading when the home-screen launch lands in minimal-ui', () => {
    // Nothing matches (display-mode: standalone) here — only the minimal-ui
    // mode the browser fell back to — and it is still an installed launch.
    installMatchMedia({ '(display-mode: minimal-ui)': true, [COARSE_POINTER_QUERY]: true })
    const { result } = renderHook(() => useDisplayMode())

    expect(result.current).toMatchObject({ standalone: true, stage: true })
  })

  it('leaves a phone in a browser tab alone', () => {
    installMatchMedia({ [STANDALONE_QUERY]: false, [COARSE_POINTER_QUERY]: true })
    const { result } = renderHook(() => useDisplayMode())

    expect(result.current).toMatchObject({ standalone: false, stage: false })
  })

  it('trusts the iOS flag on versions with no display-mode query', () => {
    installMatchMedia({ [COARSE_POINTER_QUERY]: true })
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })

    const { result } = renderHook(() => useDisplayMode())
    expect(result.current).toMatchObject({ standalone: true, stage: true })
  })

  it('follows the phone as it is turned on the stand', () => {
    const media = installMatchMedia(PHONE_STANDALONE)
    const { result } = renderHook(() => useDisplayMode())

    expect(result.current.landscape).toBe(false)

    media.set(LANDSCAPE_QUERY, true)
    expect(result.current.landscape).toBe(true)
  })
})

describe('isIos', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recognises an iPad reporting itself as a Mac', async () => {
    const { isIos } = await import('./useDisplayMode')
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    })
    Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })

    // iPadOS has claimed to be a Mac since 13; the touch points give it away.
    expect(isIos()).toBe(true)
  })

  it('does not mistake a real Mac for one', async () => {
    const { isIos } = await import('./useDisplayMode')
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    })
    Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 0 })

    expect(isIos()).toBe(false)
  })
})
