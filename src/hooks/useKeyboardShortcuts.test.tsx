import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useKeyboardShortcuts, type KeyboardShortcutHandlers } from './useKeyboardShortcuts'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, STANDALONE_QUERY } from './useDisplayMode'
import { installMatchMedia } from '../test/matchMedia'
import { FAKE_CLOCKS } from '../test/fakeTimers'

vi.mock('../lib/audio/engine', async () => ({
  AudioEngine: (await import('../test/fakeAudioEngine')).FakeAudioEngine,
}))

const PHONE_PORTRAIT = {
  [STANDALONE_QUERY]: true,
  [COARSE_POINTER_QUERY]: true,
  [LANDSCAPE_QUERY]: false,
}

const createHandlers = (): KeyboardShortcutHandlers => ({
  onSpace: vi.fn(),
  onTap: vi.fn(),
  onTempoUp: vi.fn(),
  onTempoDown: vi.fn(),
  onReset: vi.fn(),
})

const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('useKeyboardShortcuts', () => {
  let handlers: KeyboardShortcutHandlers

  beforeEach(() => {
    handlers = createHandlers()
  })

  it.each([
    ['Space', 'onSpace'],
    ['KeyT', 'onTap'],
    ['ArrowUp', 'onTempoUp'],
    ['ArrowRight', 'onTempoUp'],
    ['ArrowDown', 'onTempoDown'],
    ['ArrowLeft', 'onTempoDown'],
    ['KeyR', 'onReset'],
  ] as const)('dispatches %s to %s and prevents default', (code, handlerName) => {
    renderHook(() => useKeyboardShortcuts(handlers))

    const event = press(code)
    expect(handlers[handlerName]).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not tap on auto-repeat from a held T, but still repeats the tempo keys', () => {
    renderHook(() => useKeyboardShortcuts(handlers))

    const event = press('KeyT', { repeat: true })
    expect(handlers.onTap).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    press('ArrowUp', { repeat: true })
    expect(handlers.onTempoUp).toHaveBeenCalledTimes(1)
  })

  it('ignores unrelated keys', () => {
    renderHook(() => useKeyboardShortcuts(handlers))

    press('KeyA')
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled()
    }
  })

  it.each([['metaKey'], ['ctrlKey'], ['altKey']] as const)('ignores shortcuts with %s held', (modifier) => {
    renderHook(() => useKeyboardShortcuts(handlers))

    press('Space', { [modifier]: true })
    expect(handlers.onSpace).not.toHaveBeenCalled()

    press('KeyT', { [modifier]: true })
    expect(handlers.onTap).not.toHaveBeenCalled()
  })

  it.each([['input'], ['textarea'], ['select']] as const)(
    'ignores shortcuts while focus is in a %s',
    (tag) => {
      renderHook(() => useKeyboardShortcuts(handlers))

      const element = document.createElement(tag)
      document.body.appendChild(element)
      press('Space', {}, element)
      expect(handlers.onSpace).not.toHaveBeenCalled()
      press('KeyT', {}, element)
      expect(handlers.onTap).not.toHaveBeenCalled()
      element.remove()
    },
  )

  it.each([
    ['a button', () => document.createElement('button')],
    [
      'a role="radio" element',
      () => {
        const element = document.createElement('button')
        element.setAttribute('role', 'radio')
        return element
      },
    ],
    [
      'a link',
      () => {
        const element = document.createElement('a')
        element.setAttribute('href', '#somewhere')
        return element
      },
    ],
    [
      'a tabbable element',
      () => {
        const element = document.createElement('div')
        element.setAttribute('tabindex', '0')
        return element
      },
    ],
  ] as const)('leaves keys alone while focus is on %s', (_name, create) => {
    renderHook(() => useKeyboardShortcuts(handlers))

    const element = create()
    document.body.appendChild(element)

    for (const code of ['Space', 'ArrowRight', 'KeyT'] as const) {
      const event = press(code, {}, element)
      expect(event.defaultPrevented).toBe(false)
    }
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled()
    }

    element.remove()
  })

  it('still handles shortcuts when the body has focus', () => {
    renderHook(() => useKeyboardShortcuts(handlers))

    const event = press('Space', {}, document.body)
    expect(handlers.onSpace).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores shortcuts inside contentEditable elements', () => {
    renderHook(() => useKeyboardShortcuts(handlers))

    const element = document.createElement('div')
    // jsdom does not compute isContentEditable from the attribute alone
    Object.defineProperty(element, 'isContentEditable', { value: true })
    document.body.appendChild(element)
    press('KeyR', {}, element)
    expect(handlers.onReset).not.toHaveBeenCalled()
    element.remove()
  })

  it('always calls the freshest handlers', () => {
    const replacement = vi.fn()
    const { rerender } = renderHook(({ onSpace }) => useKeyboardShortcuts({ ...handlers, onSpace }), {
      initialProps: { onSpace: handlers.onSpace },
    })

    rerender({ onSpace: replacement })
    press('Space')
    expect(handlers.onSpace).not.toHaveBeenCalled()
    expect(replacement).toHaveBeenCalledTimes(1)
  })

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts(handlers))

    unmount()
    press('Space')
    expect(handlers.onSpace).not.toHaveBeenCalled()
  })

  describe('with an open modal in the document', () => {
    let dialog: HTMLDivElement

    beforeEach(() => {
      dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      document.body.appendChild(dialog)
    })

    afterEach(() => {
      dialog.remove()
    })

    it('ignores every shortcut while focus has dropped to the body', () => {
      renderHook(() => useKeyboardShortcuts(handlers))

      for (const code of ['Space', 'KeyR', 'KeyT', 'ArrowUp'] as const) {
        const event = press(code, {}, document.body)
        expect(event.defaultPrevented).toBe(false)
      }
      for (const handler of Object.values(handlers)) {
        expect(handler).not.toHaveBeenCalled()
      }
    })

    it('ignores a shortcut targeted at an element inside the modal', () => {
      renderHook(() => useKeyboardShortcuts(handlers))

      const heading = document.createElement('h2')
      dialog.appendChild(heading)

      const event = press('Space', {}, heading)
      expect(event.defaultPrevented).toBe(false)
      expect(handlers.onSpace).not.toHaveBeenCalled()
    })

    it('resumes handling shortcuts once the modal is gone', () => {
      renderHook(() => useKeyboardShortcuts(handlers))

      press('Space', {}, document.body)
      expect(handlers.onSpace).not.toHaveBeenCalled()

      dialog.remove()
      press('Space', {}, document.body)
      expect(handlers.onSpace).toHaveBeenCalledTimes(1)
    })
  })
})

describe('behind an open sheet', () => {
  beforeEach(() => {
    vi.useFakeTimers(FAKE_CLOCKS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('leaves the transport and the session alone once focus has dropped to the body', () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    fireEvent.click(screen.getByTestId('open-setup'))
    expect(screen.getByTestId('practice-sheet')).toBeInTheDocument()

    ;(document.activeElement as HTMLElement | null)?.blur()

    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Start practice')

    fireEvent.keyDown(window, { code: 'KeyR' })
    expect(screen.queryByTestId('reset')).toBeNull()
  })

  it('does not stop playback or wipe the session clock behind the sheet', async () => {
    installMatchMedia(PHONE_PORTRAIT)
    render(<App />)

    fireEvent.click(screen.getByTestId('play-toggle'))
    await act(async () => {})
    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')

    fireEvent.click(screen.getByTestId('open-setup'))
    expect(screen.getByTestId('practice-sheet')).toBeInTheDocument()

    ;(document.activeElement as HTMLElement | null)?.blur()

    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyDown(window, { code: 'KeyR' })

    expect(screen.getByTestId('play-toggle')).toHaveTextContent('Pause')
    expect(screen.getByTestId('reset')).toBeInTheDocument()
  })
})
