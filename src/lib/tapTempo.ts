import { MAX_BPM, MIN_BPM } from '../constants'

/** A pause longer than this clears the tap buffer and starts a new measurement. */
export const TAP_RESET_MS = 2500

/** Taps closer together than this are treated as accidental double-fires. */
const MIN_TAP_INTERVAL_MS = 100

const MAX_TAPS = 5

export type TapTempoDeps = {
  now?: () => number
  minBpm?: number
  maxBpm?: number
}

export type TapTempo = {
  /** Records a tap; returns the averaged BPM, or null while under two taps. */
  tap(): number | null
}

export const createTapTempo = (deps: TapTempoDeps = {}): TapTempo => {
  const now = deps.now ?? (() => performance.now())
  const minBpm = deps.minBpm ?? MIN_BPM
  const maxBpm = deps.maxBpm ?? MAX_BPM

  let taps: number[] = []

  return {
    tap: () => {
      const time = now()
      const last = taps[taps.length - 1]

      if (last !== undefined && time - last > TAP_RESET_MS) {
        taps = []
      } else if (last !== undefined && time - last < MIN_TAP_INTERVAL_MS) {
        return null
      }

      taps.push(time)
      taps = taps.slice(-MAX_TAPS)

      if (taps.length < 2) {
        return null
      }

      const totalMs = taps[taps.length - 1] - taps[0]
      const averageMs = totalMs / (taps.length - 1)

      return Math.min(maxBpm, Math.max(minBpm, Math.round(60000 / averageMs)))
    },
  }
}
