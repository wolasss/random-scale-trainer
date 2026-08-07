import { useCallback, useRef } from 'react'
import type { BeatEvent } from '../lib/playback/machine'

/**
 * Drives the hero's expanding beat ring by mutating the element directly on
 * each beat event — no React state, so nothing re-renders per animation frame.
 */
export function useBeatPulse() {
  const ringRef = useRef<HTMLDivElement | null>(null)

  const handleBeat = useCallback((event: BeatEvent) => {
    const ring = ringRef.current
    if (!ring) {
      return
    }

    ring.classList.remove('pulse', 'downbeat')
    // Force a reflow so removing and re-adding the class restarts the animation.
    void ring.offsetWidth
    if (event.accent) {
      ring.classList.add('downbeat')
    }
    ring.classList.add('pulse')
  }, [])

  return { ringRef, handleBeat }
}
