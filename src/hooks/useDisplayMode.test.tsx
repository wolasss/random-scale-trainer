import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, STANDALONE_QUERY, useDisplayMode } from './useDisplayMode'
import { installMatchMedia } from '../test/matchMedia'

const PHONE_STANDALONE = {
  [STANDALONE_QUERY]: true,
  [COARSE_POINTER_QUERY]: true,
  [LANDSCAPE_QUERY]: false,
}

describe('useDisplayMode', () => {
  afterEach(() => {
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

  it('does not mistake a fullscreened browser tab for an installed app', () => {
    // F11, or any video going fullscreen, flips (display-mode: fullscreen) on a
    // page that was never installed. It must not silence the install offer.
    installMatchMedia({ '(display-mode: fullscreen)': true, [COARSE_POINTER_QUERY]: true })
    const { result } = renderHook(() => useDisplayMode())

    expect(result.current).toMatchObject({ standalone: false, stage: false })
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
