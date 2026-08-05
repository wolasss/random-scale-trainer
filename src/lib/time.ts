export const formatElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

/** Seconds for one full cycle: every pool note once, each held for its beat span. */
export const cycleSeconds = (poolSize: number, beatsPerNote: number, bpm: number) =>
  (poolSize * beatsPerNote * 60) / bpm

/** Compact m:ss for the derived cycle-length line, e.g. 40 → '0:40'. */
export const formatCycleLength = (seconds: number) => {
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = String(total % 60).padStart(2, '0')

  return `${minutes}:${remainder}`
}
