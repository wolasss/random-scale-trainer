import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts, type KeyboardShortcutHandlers } from './useKeyboardShortcuts'

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
})
