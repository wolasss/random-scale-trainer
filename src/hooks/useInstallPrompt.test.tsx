import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useInstallPrompt } from './useInstallPrompt'
import { STORAGE_KEYS } from '../constants'

/** Chromium's beforeinstallprompt, which is not in lib.dom. */
const createInstallEvent = (prompt?: () => Promise<void>) => {
  // The real event is cancelable — without that, preventDefault is a no-op and
  // the test could not tell suppression from a missing call.
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn(prompt ?? (async () => undefined))
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const })
  return event
}

const setUserAgent = (userAgent: string) => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => userAgent })
}

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'

describe('useInstallPrompt', () => {
  afterEach(() => {
    setUserAgent(CHROME_ANDROID)
    window.localStorage.clear()
  })

  it('offers nothing until the browser says it can install', () => {
    setUserAgent(CHROME_ANDROID)
    const { result } = renderHook(() => useInstallPrompt(false))

    expect(result.current.canInstall).toBe(false)
  })

  it('captures the install event and suppresses the browser bar', () => {
    setUserAgent(CHROME_ANDROID)
    const { result } = renderHook(() => useInstallPrompt(false))

    const event = createInstallEvent()
    act(() => {
      window.dispatchEvent(event)
    })

    expect(result.current.canInstall).toBe(true)
    // Suppressed in favour of the quiet header button.
    expect(event.defaultPrevented).toBe(true)
  })

  it('prompts once and then has nothing left to offer', () => {
    setUserAgent(CHROME_ANDROID)
    const { result } = renderHook(() => useInstallPrompt(false))

    const event = createInstallEvent()
    act(() => {
      window.dispatchEvent(event)
    })
    act(() => {
      result.current.install()
    })

    expect(event.prompt).toHaveBeenCalledTimes(1)
    // The event is single-use whatever the user chose.
    expect(result.current.canInstall).toBe(false)
  })

  it('brings the offer back when the browser refuses the prompt', async () => {
    setUserAgent(CHROME_ANDROID)
    const { result } = renderHook(() => useInstallPrompt(false))

    const onUnhandledRejection = vi.fn()
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      const event = createInstallEvent(() => Promise.reject(new Error('not from a user gesture')))
      act(() => {
        window.dispatchEvent(event)
      })

      await act(async () => {
        result.current.install()
      })

      expect(onUnhandledRejection).not.toHaveBeenCalled()
      expect(result.current.canInstall).toBe(true)

      await act(async () => {
        result.current.install()
      })

      expect(event.prompt).toHaveBeenCalledTimes(2)
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('does not resurrect the offer when the app installed before the refusal landed', async () => {
    setUserAgent(CHROME_ANDROID)
    const { result } = renderHook(() => useInstallPrompt(false))

    let rejectPrompt!: (reason: unknown) => void
    const event = createInstallEvent(() => new Promise((_, reject) => { rejectPrompt = reject }))
    act(() => {
      window.dispatchEvent(event)
    })

    act(() => {
      result.current.install()
    })

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    await act(async () => {
      rejectPrompt(new Error('not from a user gesture'))
    })

    expect(result.current.canInstall).toBe(false)
  })

  it('offers nothing once the app is already installed', () => {
    setUserAgent(CHROME_ANDROID)
    const { result } = renderHook(() => useInstallPrompt(true))

    act(() => {
      window.dispatchEvent(createInstallEvent())
    })

    expect(result.current.canInstall).toBe(false)
  })

  it('drops the offer once the app has been installed', () => {
    setUserAgent(CHROME_ANDROID)
    const { result } = renderHook(() => useInstallPrompt(false))

    act(() => {
      window.dispatchEvent(createInstallEvent())
    })
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(result.current.canInstall).toBe(false)
  })

  it('shows the Share-sheet hint on iOS, which fires no install event', () => {
    setUserAgent(SAFARI_IOS)
    const { result } = renderHook(() => useInstallPrompt(false))

    expect(result.current.showIosHint).toBe(true)
    expect(result.current.canInstall).toBe(false)
  })

  it('remembers a dismissed hint across launches', () => {
    setUserAgent(SAFARI_IOS)
    const first = renderHook(() => useInstallPrompt(false))

    act(() => {
      first.result.current.dismissIosHint()
    })
    expect(first.result.current.showIosHint).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEYS.iosInstallHint)).toBe('dismissed')

    // A hint that comes back every launch is an advert.
    const relaunched = renderHook(() => useInstallPrompt(false))
    expect(relaunched.result.current.showIosHint).toBe(false)
  })

  it('never shows the hint inside the installed app', () => {
    setUserAgent(SAFARI_IOS)
    const { result } = renderHook(() => useInstallPrompt(true))

    expect(result.current.showIosHint).toBe(false)
  })

  it('does not show the iOS hint anywhere else', () => {
    setUserAgent(CHROME_ANDROID)
    const { result } = renderHook(() => useInstallPrompt(false))

    expect(result.current.showIosHint).toBe(false)
  })
})
