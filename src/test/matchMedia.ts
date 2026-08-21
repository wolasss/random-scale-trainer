import { act } from '@testing-library/react'

type FakeList = {
  matches: boolean
  listeners: (() => void)[]
}

/**
 * A controllable matchMedia. jsdom's own always reports false, which would make
 * every one of these tests pass for the wrong reason.
 */
export const installMatchMedia = (initial: Record<string, boolean>) => {
  const lists = new Map<string, FakeList>()

  const listFor = (query: string): FakeList => {
    const existing = lists.get(query)
    if (existing) {
      return existing
    }

    // A comma-separated query list matches when any one of its parts does, so a
    // fixture can flag the whole list or a single mode inside it.
    const matches = initial[query] ?? query.split(',').some((part) => initial[part.trim()] === true)
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
