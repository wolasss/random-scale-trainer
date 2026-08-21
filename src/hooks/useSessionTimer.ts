import { useEffect, useRef, useState } from 'react'

const TICK_MS = 200

/**
 * A gap this far past `TICK_MS` means the page was frozen, not merely slow.
 * The bar has to clear the slowest tab that is still *running*: Chrome's
 * intensive throttling drops a backgrounded tab to about one callback a
 * minute, so anything under a couple of minutes is treated as real practice
 * time rather than thrown away. Freezes worth catching — a phone pocketed
 * mid-session, a lid closed — run far longer than that.
 */
const FROZEN_GAP_MS = 120_000

export type UseSessionTimerOptions = {
  /** Fired on every tick while running — the routine's block clock rides it. */
  onTick?: (elapsedMs: number) => void
}

/**
 * Stopwatch that accumulates elapsed time across start/pause cycles.
 * `start`/`pause`/`reset` are safe to call from stale closures (timeout
 * callbacks): they only touch refs and stable setState functions.
 */
export function useSessionTimer(options: UseSessionTimerOptions = {}) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const startedAtRef = useRef<number | null>(null)
  const lastSeenAtRef = useRef<number | null>(null)
  const accumulatedMsRef = useRef(0)
  const isRunningRef = useRef(false)
  const onTickRef = useRef(options.onTick)

  useEffect(() => {
    onTickRef.current = options.onTick
  })

  /**
   * Reads the clock, discounting time the page could not have been practised
   * through: a phone pocketed mid-session freezes the page, so the next read
   * lands hours later with no ticks in between, and a device clock can also
   * jump backwards. Both shift the start anchor by the whole gap, leaving
   * elapsed exactly where the last live read left it.
   */
  const observeNow = () => {
    const now = Date.now()

    if (startedAtRef.current !== null && lastSeenAtRef.current !== null) {
      const gap = now - lastSeenAtRef.current

      if (gap < 0 || gap > FROZEN_GAP_MS) {
        startedAtRef.current += gap
      }
    }

    lastSeenAtRef.current = now
    return now
  }

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    const timer = window.setInterval(() => {
      if (startedAtRef.current === null) {
        return
      }

      const now = observeNow()
      const elapsed = accumulatedMsRef.current + (now - startedAtRef.current)
      setElapsedMs(elapsed)
      onTickRef.current?.(elapsed)
    }, TICK_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [isRunning])

  const start = () => {
    if (isRunningRef.current) {
      return
    }

    isRunningRef.current = true
    startedAtRef.current = Date.now()
    lastSeenAtRef.current = startedAtRef.current
    setIsRunning(true)
  }

  /** Returns the elapsed time as of the pause, for readers that cannot wait for the next render. */
  const pause = () => {
    if (startedAtRef.current !== null) {
      const now = observeNow()
      accumulatedMsRef.current += now - startedAtRef.current
      startedAtRef.current = null
      setElapsedMs(accumulatedMsRef.current)
    }

    isRunningRef.current = false
    setIsRunning(false)

    return accumulatedMsRef.current
  }

  /** Returns the elapsed time it threw away, for clocks measured against it. */
  const reset = () => {
    let cleared = accumulatedMsRef.current
    if (startedAtRef.current !== null) {
      const now = observeNow()
      cleared += now - startedAtRef.current
    }

    isRunningRef.current = false
    startedAtRef.current = null
    accumulatedMsRef.current = 0
    setElapsedMs(0)
    setIsRunning(false)

    return cleared
  }

  return { elapsedMs, isRunning, start, pause, reset }
}
