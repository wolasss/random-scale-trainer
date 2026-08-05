import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePersistentState } from './usePersistentState'

const KEY = 'test-key'

const booleanOptions = {
  defaultValue: true,
  deserialize: (raw: string) => raw === 'true',
}

describe('usePersistentState', () => {
  it('uses the default when the key is absent', () => {
    const { result } = renderHook(() => usePersistentState(KEY, booleanOptions))
    expect(result.current[0]).toBe(true)
  })

  it('reads the stored value', () => {
    window.localStorage.setItem(KEY, 'false')
    const { result } = renderHook(() => usePersistentState(KEY, booleanOptions))
    expect(result.current[0]).toBe(false)
  })

  it('falls back to the default when deserialize rejects the raw value', () => {
    window.localStorage.setItem(KEY, 'garbage')
    const { result } = renderHook(() =>
      usePersistentState<'light' | 'dark'>(KEY, {
        defaultValue: 'dark',
        deserialize: (raw) => (raw === 'light' || raw === 'dark' ? raw : undefined),
      }),
    )
    expect(result.current[0]).toBe('dark')
  })

  it('writes the initial value back on mount', () => {
    renderHook(() => usePersistentState(KEY, booleanOptions))
    expect(window.localStorage.getItem(KEY)).toBe('true')
  })

  it('persists on set', () => {
    const { result } = renderHook(() => usePersistentState(KEY, booleanOptions))
    act(() => {
      result.current[1](false)
    })
    expect(result.current[0]).toBe(false)
    expect(window.localStorage.getItem(KEY)).toBe('false')
  })

  it('supports functional updates', () => {
    const { result } = renderHook(() =>
      usePersistentState<number>(KEY, { defaultValue: 1, deserialize: Number }),
    )
    act(() => {
      result.current[1]((current) => current + 1)
    })
    expect(result.current[0]).toBe(2)
    expect(window.localStorage.getItem(KEY)).toBe('2')
  })

  it('normalizes stored values through deserialize (BPM-style clamp)', () => {
    window.localStorage.setItem(KEY, '400.7')
    const { result } = renderHook(() =>
      usePersistentState<number>(KEY, {
        defaultValue: 30,
        deserialize: (raw) => {
          const stored = Number(raw)
          return Number.isFinite(stored) ? Math.min(100, Math.max(10, Math.round(stored))) : undefined
        },
      }),
    )
    expect(result.current[0]).toBe(100)
    // The mount write-back persists the normalized value
    expect(window.localStorage.getItem(KEY)).toBe('100')
  })

  it('uses a custom serializer', () => {
    const { result } = renderHook(() =>
      usePersistentState<string[]>(KEY, {
        defaultValue: [],
        deserialize: (raw) => raw.split(','),
        serialize: (value) => value.join(','),
      }),
    )
    act(() => {
      result.current[1](['a', 'b'])
    })
    expect(window.localStorage.getItem(KEY)).toBe('a,b')
  })
})
