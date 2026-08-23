import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

const HIT_BUBBLE_LIFETIME_MS = 720

/**
 * A transient visual echo of confirmed correct plucks. Every upward pulse
 * creates its own check bubble; a held pitch never moves the pulse in the first
 * place, while two physical attacks can arrive back-to-back.
 *
 * The bubbles live directly in this component's private DOM layer instead of
 * React state. A hit therefore needs no follow-up render, and removing an
 * animation cannot make the hero render again while the microphone is busy.
 */
export function HitBubbles({ pulses, active = true }: { pulses: number; active?: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const seenPulsesRef = useRef(pulses)
  const nextIdRef = useRef(0)
  const timersRef = useRef<Map<HTMLElement, number> | null>(null)

  const clear = useCallback(() => {
    const timers = timersRef.current
    if (timers !== null) {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
      timersRef.current = null
    }
    containerRef.current?.replaceChildren()
  }, [])

  useLayoutEffect(() => {
    if (!active) {
      seenPulsesRef.current = pulses
      clear()
      return
    }

    const newPulses = pulses - seenPulsesRef.current
    seenPulsesRef.current = pulses

    if (newPulses < 0) {
      clear()
      return
    }

    const container = containerRef.current
    if (container === null || newPulses === 0) {
      return
    }

    const timers = (timersRef.current ??= new Map())
    for (let index = 0; index < newPulses; index += 1) {
      const id = nextIdRef.current++
      const bubble = document.createElement('span')
      bubble.className = `hit-bubble hit-bubble-lane-${id % 3}`
      bubble.dataset.testid = 'hit-bubble'
      bubble.textContent = '✓'

      const remove = () => {
        const timer = timers.get(bubble)
        if (timer !== undefined) {
          window.clearTimeout(timer)
          timers.delete(bubble)
        }
        bubble.removeEventListener('animationend', remove)
        bubble.remove()
      }

      bubble.addEventListener('animationend', remove, { once: true })
      container.append(bubble)
      timers.set(bubble, window.setTimeout(remove, HIT_BUBBLE_LIFETIME_MS))
    }
  }, [active, clear, pulses])

  useEffect(() => clear, [clear])

  return <span ref={containerRef} className="hit-bubbles" aria-hidden="true" />
}
