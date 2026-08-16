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
 *
 * The third element of the tuple says whether the value on screen is the value
 * on disk: false once a write has been dropped, for the caller that has to tell
 * the user their data is only as durable as the tab.
 */
export function usePersistentState<T>(
  key: string,
  options: PersistentStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>, boolean] {
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

  // Assumed good until a write says otherwise, so nothing is claimed before the
  // first one has actually been tried.
  const [persisted, setPersisted] = useState(true)

  const serializeRef = useRef(serialize)

  useEffect(() => {
    serializeRef.current = serialize
  })

  useEffect(() => {
    setPersisted(writeRaw(key, serializeRef.current(value)))
  }, [key, value])

  return [value, setValue, persisted]
}
