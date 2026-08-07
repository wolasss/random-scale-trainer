import { useEffect, useRef, useState } from 'react'

const TICK_MS = 200

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
  const accumulatedMsRef = useRef(0)
  const isRunningRef = useRef(false)
  const onTickRef = useRef(options.onTick)

  useEffect(() => {
    onTickRef.current = options.onTick
  })

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    const timer = window.setInterval(() => {
      if (startedAtRef.current === null) {
        return
      }

      const elapsed = accumulatedMsRef.current + (Date.now() - startedAtRef.current)
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
    setIsRunning(true)
  }

  const pause = () => {
    if (startedAtRef.current !== null) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current
      startedAtRef.current = null
      setElapsedMs(accumulatedMsRef.current)
    }

    isRunningRef.current = false
    setIsRunning(false)
  }

  const reset = () => {
    isRunningRef.current = false
    startedAtRef.current = null
    accumulatedMsRef.current = 0
    setElapsedMs(0)
    setIsRunning(false)
  }

  return { elapsedMs, isRunning, start, pause, reset }
}
