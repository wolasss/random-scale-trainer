import { useEffect, useState } from 'react'

const listFor = (query: string): MediaQueryList | null => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null
  }

  return window.matchMedia(query)
}

/**
 * Tracks a media query. Everything the installed app changes about its layout
 * keys off one of these, so the desktop build never takes a different branch:
 * on a pointer-and-keyboard browser these queries simply never match.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => listFor(query)?.matches ?? false)

  useEffect(() => {
    const list = listFor(query)
    if (list === null) {
      return undefined
    }

    // Re-read on subscribe: the query may have flipped between the initial
    // render and this effect (rotating the phone during hydration).
    const sync = () => setMatches(list.matches)
    sync()

    if (typeof list.addEventListener !== 'function') {
      return undefined
    }

    list.addEventListener('change', sync)
    return () => list.removeEventListener('change', sync)
  }, [query])

  return matches
}
