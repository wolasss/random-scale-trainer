import { MAX_BPM, RAMP_BPM_STEP } from '../../constants'

/** The ceiling the ramp is working towards, never above the app's own limit. */
export const rampCeiling = (targetBpm: number) => Math.min(MAX_BPM, targetBpm)

export type RampRequest = {
  /** False whenever the session is not running a ramp at all. */
  enabled: boolean
  targetBpm: number
}

export type TempoControl = {
  /** The tempo the scheduler is actually using right now. */
  bpm(): number
  /** Seconds between beats at the current tempo. */
  beatDuration(): number
  /** Session start: the settings value becomes the authority again. */
  reset(bpm: number): void
  /** Fold the latest observed settings value into the authority. */
  reconcile(externalBpm: number): void
  /** Steps the ramp; returns the new tempo when it moved, else null. */
  applyRamp(request: RampRequest): number | null
}

/**
 * The machine's authoritative tempo. The ramp bumps it immediately (before
 * React round-trips onBpmChange); external slider/tap changes win when the
 * observed settings value moves to anything other than the pending ramp value.
 */
export const createTempoControl = (): TempoControl => {
  let currentBpm = 0
  let lastSeenExternalBpm = 0
  let awaitingWriteback: number | null = null

  return {
    bpm: () => currentBpm,
    beatDuration: () => 60 / currentBpm,

    reset: (bpm) => {
      currentBpm = bpm
      lastSeenExternalBpm = bpm
      awaitingWriteback = null
    },

    reconcile: (externalBpm) => {
      if (externalBpm === lastSeenExternalBpm) {
        return
      }

      if (awaitingWriteback !== null && externalBpm === awaitingWriteback) {
        awaitingWriteback = null // our ramp landed; currentBpm is already correct
      } else {
        currentBpm = externalBpm // a user change always wins
        awaitingWriteback = null
      }

      lastSeenExternalBpm = externalBpm
    },

    /**
     * Reaching the target stops the climb; it never stops playback. An unbounded
     * ramp ends every session on the first tempo the player couldn't hold, which
     * is the opposite of what practice should leave you with.
     */
    applyRamp: ({ enabled, targetBpm }) => {
      if (!enabled) {
        return null
      }

      const nextBpm = Math.min(rampCeiling(targetBpm), currentBpm + RAMP_BPM_STEP)
      if (nextBpm <= currentBpm) {
        return null
      }

      currentBpm = nextBpm
      awaitingWriteback = nextBpm

      return nextBpm
    },
  }
}
