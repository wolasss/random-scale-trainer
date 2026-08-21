export const formatElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

/**
 * mm:ss still to go, clamped at '00:00' once the goal is passed — practice that
 * runs long reads as no time left, never as negative time. Rounds a part-second
 * up, the way any countdown does: the timer ticks every 200ms, so flooring would
 * drop a 10-minute goal to '09:59' on the first tick and sit at '00:00' for the
 * last second. Zero shows only at the goal itself.
 */
export const formatRemaining = (elapsedMs: number, goalMs: number) =>
  formatElapsed(Math.ceil(Math.max(0, goalMs - elapsedMs) / 1000) * 1000)

/** Seconds for one full cycle: every pool note once, each held for its beat span. */
export const cycleSeconds = (poolSize: number, beatsPerNote: number, bpm: number) =>
  (poolSize * beatsPerNote * 60) / bpm

/** mm:ss for the derived cycle-length line, e.g. 40 → '00:40'. */
export const formatCycleLength = (seconds: number) => formatElapsed(Math.round(seconds) * 1000)
