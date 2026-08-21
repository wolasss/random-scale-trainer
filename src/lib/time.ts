export const formatElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

/**
 * mm:ss still to go, clamped at '00:00' once the goal is passed — practice that
 * runs long reads as no time left, never as negative time. Floors the way
 * `formatElapsed` does, so both readings agree on the second boundary.
 */
export const formatRemaining = (elapsedMs: number, goalMs: number) =>
  formatElapsed(Math.max(0, goalMs - elapsedMs))

/** Seconds for one full cycle: every pool note once, each held for its beat span. */
export const cycleSeconds = (poolSize: number, beatsPerNote: number, bpm: number) =>
  (poolSize * beatsPerNote * 60) / bpm

/** mm:ss for the derived cycle-length line, e.g. 40 → '00:40'. */
export const formatCycleLength = (seconds: number) => formatElapsed(Math.round(seconds) * 1000)
