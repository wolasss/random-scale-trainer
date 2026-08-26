import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEYS } from './constants'

vi.mock('./lib/audio/engine', async () => ({
  AudioEngine: (await import('./test/fakeAudioEngine')).FakeAudioEngine,
}))

const { reload } = vi.hoisted(() => ({ reload: vi.fn() }))

vi.mock('./hooks/useServiceWorker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useServiceWorker')>()
  // The real hook, with one seam swapped: applying an update calls
  // location.reload(), which jsdom defines non-configurably and so cannot be
  // spied on. Everything the chip is judged by — whether it appears, and what
  // dismissing it does — is still the hook's own doing.
  const useServiceWorker = () => ({ ...actual.useServiceWorker(), applyUpdate: reload })
  return { ...actual, useServiceWorker }
})

/** Chromium's beforeinstallprompt, which is not in lib.dom. */
const createInstallEvent = () => {
  // The real event is cancelable — without that, preventDefault is a no-op and
  // the test could not tell suppression from a missing call.
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn(async () => undefined)
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const })
  return event
}

const setUserAgent = (userAgent: string) => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => userAgent })
}

const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0'

/** Stands in for navigator.serviceWorker, which jsdom does not implement. */
const installContainer = (initiallyControlled: boolean) => {
  const listeners: (() => void)[] = []
  const registration = { update: vi.fn(async () => undefined) }
  const container = {
    controller: initiallyControlled ? {} : null,
    register: vi.fn(async () => registration),
    addEventListener: (_type: 'controllerchange', listener: () => void) => listeners.push(listener),
    removeEventListener: (_type: 'controllerchange', listener: () => void) => {
      const index = listeners.indexOf(listener)
      if (index >= 0) {
        listeners.splice(index, 1)
      }
    },
  }

  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })

  return {
    /** A newer build calling clients.claim() over this page. */
    claim: () => {
      container.controller = {}
      act(() => listeners.forEach((listener) => listener()))
    },
  }
}

describe('the install button', () => {
  it('stays away until the browser offers an install', () => {
    render(<App />)

    expect(screen.queryByTestId('install-button')).toBeNull()
  })

  it('appears in the header once the browser offers one', () => {
    render(<App />)

    const event = createInstallEvent()
    act(() => {
      window.dispatchEvent(event)
    })

    expect(screen.getByTestId('install-button')).toBeInTheDocument()
    // The header button replaces the browser's own install bar.
    expect(event.defaultPrevented).toBe(true)
  })

  it('hands the click back to the browser and then has nothing left to offer', () => {
    render(<App />)

    const event = createInstallEvent()
    act(() => {
      window.dispatchEvent(event)
    })
    fireEvent.click(screen.getByTestId('install-button'))

    expect(event.prompt).toHaveBeenCalledTimes(1)
    // The event is single-use whatever the user chose.
    expect(screen.queryByTestId('install-button')).toBeNull()
  })
})

describe('the iOS install hint', () => {
  beforeEach(() => {
    setUserAgent(SAFARI_IOS)
  })

  afterEach(() => {
    // Restores jsdom's own userAgent, which lives on the prototype.
    Reflect.deleteProperty(navigator, 'userAgent')
  })

  it('points at the Share sheet, since iOS fires no install event', () => {
    render(<App />)

    expect(screen.getByTestId('ios-install-hint')).toBeInTheDocument()
    expect(screen.queryByTestId('install-button')).toBeNull()
  })

  it('keeps Share as plain words where the browser cannot share from script', () => {
    // jsdom has no navigator.share, which stands in for any such browser: the
    // printed route through the toolbar is all the hint has to offer there.
    render(<App />)

    expect(screen.queryByTestId('ios-share-button')).toBeNull()
    expect(screen.getByTestId('ios-install-hint')).toHaveTextContent('Share → Add to Home Screen')
  })

  it('opens the share sheet on this page when Share is tapped', () => {
    const share = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    try {
      render(<App />)

      fireEvent.click(screen.getByTestId('ios-share-button'))

      expect(share).toHaveBeenCalledWith({ title: document.title, url: window.location.href })
      // Sharing is a step of the instructions, not a way of finishing with
      // them — the hint stays for the tap the sheet asks for next.
      expect(screen.getByTestId('ios-install-hint')).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(navigator, 'share')
    }
  })

  it('is not shown anywhere else', () => {
    Reflect.deleteProperty(navigator, 'userAgent')
    render(<App />)

    expect(screen.queryByTestId('ios-install-hint')).toBeNull()
  })

  it('stays gone once it has been dismissed', () => {
    const { unmount } = render(<App />)

    fireEvent.click(screen.getByLabelText('Dismiss install hint'))
    expect(screen.queryByTestId('ios-install-hint')).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEYS.iosInstallHint)).toBe('dismissed')

    // A hint that comes back every launch is an advert.
    unmount()
    render(<App />)

    expect(screen.queryByTestId('ios-install-hint')).toBeNull()
  })
})

describe('the Android install hint', () => {
  beforeEach(() => {
    setUserAgent(FIREFOX_ANDROID)
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'userAgent')
    Reflect.deleteProperty(window, 'onbeforeinstallprompt')
  })

  it('points at the browser menu where no install event will ever fire', () => {
    // jsdom has no onbeforeinstallprompt, exactly like Firefox on Android.
    render(<App />)

    expect(screen.getByTestId('android-install-hint')).toBeInTheDocument()
    expect(screen.getByTestId('android-install-hint')).toHaveTextContent('browser menu → Add to Home screen')
    expect(screen.queryByTestId('ios-install-hint')).toBeNull()
  })

  it('stays away in a browser that implements the install event', () => {
    // Chromium exposes the handler property from the first moment, well before
    // any event fires — the hint must not flash up while the real one loads.
    Object.defineProperty(window, 'onbeforeinstallprompt', { configurable: true, value: null })
    render(<App />)

    expect(screen.queryByTestId('android-install-hint')).toBeNull()
  })

  it('stays gone once it has been dismissed', () => {
    const { unmount } = render(<App />)

    fireEvent.click(screen.getByLabelText('Dismiss install hint'))
    expect(screen.queryByTestId('android-install-hint')).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEYS.androidInstallHint)).toBe('dismissed')

    unmount()
    render(<App />)

    expect(screen.queryByTestId('android-install-hint')).toBeNull()
  })
})

describe('the update chip', () => {
  beforeEach(() => {
    // The worker is only registered in a real build.
    vi.stubEnv('PROD', true)
    reload.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  /** Renders with a new build already in charge of the cache. */
  const renderWithUpdate = async () => {
    const worker = installContainer(true)
    render(<App />)
    // Let the registration settle; nothing depends on it, but a floating
    // promise here would surface in the next test.
    await act(async () => {})

    expect(screen.queryByTestId('update-chip')).toBeNull()
    worker.claim()
  }

  it('says nothing while the page is running the current build', async () => {
    installContainer(true)
    render(<App />)
    await act(async () => {})

    expect(screen.queryByTestId('update-chip')).toBeNull()
  })

  it('offers the reload when a new build takes over the cache', async () => {
    await renderWithUpdate()

    expect(screen.getByTestId('update-chip')).toBeInTheDocument()
  })

  it('reloads onto the new build when asked', async () => {
    await renderWithUpdate()

    fireEvent.click(screen.getByRole('button', { name: /update ready/i }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('can be waved away without reloading', async () => {
    await renderWithUpdate()

    fireEvent.click(screen.getByLabelText('Dismiss update notice'))

    expect(screen.queryByTestId('update-chip')).toBeNull()
    // Nothing here is urgent enough to interrupt a session over.
    expect(reload).not.toHaveBeenCalled()
  })
})
