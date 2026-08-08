import { useEffect, useState } from 'react'
import { spellNote, type SpellingPreference } from '../lib/notes'
import { IDLE_PREVIEW_MS } from '../constants'
import { useMediaQuery } from './useMediaQuery'

export type IdlePreviewNote = {
  /** User-facing note name, spelled by the active preference. */
  display: string
  /** Bumps on every deal — the render key that restarts the CSS breathe. */
  tick: number
}

/**
 * The idle hero's ghost note: a slow cycle of names drawn from the current
 * pool, so the empty stage hints at what playback does without pretending it
 * has started. Decoration only — plain timers, no audio, and deliberately no
 * shuffled-bag guarantee; it never touches the playback machine or scheduler.
 *
 * Disabled (or an empty pool) returns null and runs nothing. The cycle also
 * parks while the tab is hidden, and under prefers-reduced-motion it deals one
 * note and holds it rather than cycling.
 */
export function useIdlePreview(
  pool: number[],
  spelling: SpellingPreference,
  enabled: boolean,
): IdlePreviewNote | null {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [note, setNote] = useState<(IdlePreviewNote & { pc: number }) | null>(null)

  // The effect keys on the pool's contents, not the array's identity — a
  // caller re-rendering with a fresh literal must not restart the cycle (or,
  // worse, loop it: the deal sets state, which renders, which would re-run an
  // identity-keyed effect).
  const poolKey = pool.join(' ')

  useEffect(() => {
    const pcs = poolKey === '' ? [] : poolKey.split(' ').map(Number)
    if (!enabled || pcs.length === 0) {
      setNote(null)
      return undefined
    }

    const deal = () => {
      setNote((previous) => {
        // Never the same name twice in a row when there is a choice — a repeat
        // reads as the animation stalling rather than as chance.
        const candidates = pcs.length > 1 && previous !== null ? pcs.filter((pc) => pc !== previous.pc) : pcs
        const pc = candidates[Math.floor(Math.random() * candidates.length)]

        return { pc, display: spellNote(pc, spelling).display, tick: (previous?.tick ?? 0) + 1 }
      })
    }

    deal()

    // One note, held: the crossfade cycle is exactly the motion being declined.
    if (reducedMotion) {
      return () => setNote(null)
    }

    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      timer ??= setInterval(deal, IDLE_PREVIEW_MS)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    // No timers burning in a background tab — the cycle parks until it can be
    // seen again.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        start()
      } else {
        stop()
      }
    }

    onVisibilityChange()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      setNote(null)
    }
  }, [enabled, poolKey, spelling, reducedMotion])

  return note
}
