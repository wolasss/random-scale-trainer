import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TOUCH_INPUT_QUERY, useHardwareKeyboard } from './useHardwareKeyboard'
import { installMatchMedia } from '../test/matchMedia'

/** jsdom's own matchMedia never matches anything, so each test says whether the
 * browser reports a touchscreen among its inputs. */
const installTouchInput = (touchInput: boolean) => installMatchMedia({ [TOUCH_INPUT_QUERY]: touchInput })

const pressKey = (init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', init))
  })
}

describe('useHardwareKeyboard', () => {
  it('trusts a browser with no touch input at all', () => {
    installTouchInput(false)

    const { result } = renderHook(() => useHardwareKeyboard())

    expect(result.current).toBe(true)
  })

  it('assumes the same where the browser cannot answer the query', () => {
    const { result } = renderHook(() => useHardwareKeyboard())

    expect(result.current).toBe(true)
  })

  it('waits for proof once a touchscreen is in the mix', () => {
    // A tablet with a mouse or a hover-capable stylus lands here: it can be
    // driven without ever having a keyboard attached.
    installTouchInput(true)

    const { result } = renderHook(() => useHardwareKeyboard())

    expect(result.current).toBe(false)
  })

  it('takes a pressed key as that proof', () => {
    installTouchInput(true)

    const { result } = renderHook(() => useHardwareKeyboard())
    pressKey({ code: 'KeyA', key: 'a' })

    expect(result.current).toBe(true)
  })

  it('is not fooled by an on-screen keyboard', () => {
    installTouchInput(true)

    const { result } = renderHook(() => useHardwareKeyboard())
    // Android reports the software keyboard with no code and no named key.
    pressKey({ code: '', key: 'Unidentified' })
    pressKey({ code: 'Unidentified', key: 'Unidentified' })

    expect(result.current).toBe(false)
  })

  it('drops its listener once the answer can no longer change', () => {
    installTouchInput(true)

    const { result, unmount } = renderHook(() => useHardwareKeyboard())
    pressKey({ code: 'Space', key: ' ' })
    expect(result.current).toBe(true)

    unmount()
    expect(() => pressKey({ code: 'KeyR', key: 'r' })).not.toThrow()
  })
})
