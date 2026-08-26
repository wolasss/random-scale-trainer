/** Cues this far behind the clock are gone from the room and from the array. */
const CUE_HISTORY_S = 5

/** A beat's click and its note are scheduled at one time; float maths is not exact. */
const BEAT_MATCH_EPSILON_S = 0.001

/**
 * When a sound the app makes starts and stops, on the AudioContext clock, plus
 * how long the room keeps ringing with it afterwards. The decay belongs to the
 * cue rather than to whoever asks, because a spoken note and a click leave very
 * different amounts of themselves behind.
 */
type CueInterval = { start: number; end: number; decay: number }

/**
 * Bookkeeping of the intervals during which the app itself was sounding —
 * kept as intervals rather than a running "last cue" because the scheduler
 * works up to SCHEDULE_AHEAD_S ahead of the beat you are hearing, so the most
 * recently scheduled sound is routinely a different beat's from the one
 * playing now. Clock-free: every method takes `now` rather than reading it,
 * so the AudioEngine remains the only reader of AudioContext.currentTime.
 */
export const createCueLog = () => {
  let cueIntervals: CueInterval[] = []

  return {
    record(start: number, end: number, decay: number, now: number): void {
      // Bounded by the clock, not by a count: a long session must not grow an
      // array of every click it has ever played.
      const cutoff = now - CUE_HISTORY_S
      cueIntervals = cueIntervals.filter((cue) => cue.end >= cutoff)
      cueIntervals.push({ start, end, decay })
    },

    /**
     * Whether the app itself was making a sound at this moment, or had just
     * made one and left the room ringing — the microphone's defence against
     * scoring the player for the note the speakers just called.
     */
    isWithinCue(time: number): boolean {
      return cueIntervals.some((cue) => time >= cue.start && time <= cue.end + cue.decay)
    },

    /**
     * When the app stops sounding over the beat scheduled at `beatTime` — the
     * earliest moment anything heard could be the player rather than the app.
     *
     * Looked up by the beat's own time rather than by recency, which is what
     * makes it correct while the scheduler is running a look-ahead window
     * ahead of the music. Both the cues that begin on the beat (its click and
     * its note share one start time) and any still ringing over it (the
     * previous note, at a fast tempo) count, since either one is the app's
     * voice, not the player's.
     */
    endForBeat(beatTime: number): number | null {
      let end: number | null = null
      for (const cue of cueIntervals) {
        const onTheBeat = Math.abs(cue.start - beatTime) <= BEAT_MATCH_EPSILON_S
        const stillRinging = cue.start <= beatTime && beatTime <= cue.end
        if ((onTheBeat || stillRinging) && (end === null || cue.end > end)) {
          end = cue.end
        }
      }

      return end
    },

    /**
     * A cue that was cancelled before it sounded never occupied the room, so
     * it must not go on suppressing the microphone — otherwise pressing stop
     * would deafen the app for a phantom second of look-ahead.
     */
    pruneCancelled(now: number): void {
      cueIntervals = cueIntervals.filter((cue) => cue.start <= now)
    },
  }
}

export type CueLog = ReturnType<typeof createCueLog>
