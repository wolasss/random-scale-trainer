import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { readRaw, writeRaw } from '../lib/storage'

export type PersistentStateOptions<T> = {
  defaultValue: T
  /** Return undefined to reject the stored value and fall back to the default. */
  deserialize: (raw: string) => T | undefined
  serialize?: (value: T) => string
}

/**
 * useState backed by localStorage. Reads once on mount and writes on every
 * change — including a write-back of the initial value on mount, which the
 * app relies on to normalize stored values (e.g. clamped BPM).
 */
export function usePersistentState<T>(
  key: string,
  options: PersistentStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const { defaultValue, deserialize, serialize = String } = options

  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return defaultValue
    }

    const raw = readRaw(key)
    if (raw === null) {
      return defaultValue
    }

    const parsed = deserialize(raw)
    return parsed === undefined ? defaultValue : parsed
  })

  const serializeRef = useRef(serialize)

  useEffect(() => {
    serializeRef.current = serialize
  })

  useEffect(() => {
    writeRaw(key, serializeRef.current(value))
  }, [key, value])

  return [value, setValue]
}
