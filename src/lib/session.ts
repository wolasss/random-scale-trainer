/**
 * What a session was, once it has stopped.
 *
 * Everything here is a read: the summary is built from state the app already
 * holds, and the day it is placed against is looked up in the stored log
 * without ever writing back to it. A recap that could edit the practice log
 * would be a second writer racing the one in usePracticeHistory, and the whole
 * point of the reading is that it reports rather than changes.
 */
import { currentStreak, dayKey, type PracticeHistory } from './history'
import { matchPreset, presetGroups, type SavedPreset } from './presets'

/**
 * Under this and there is no recap at all. The same minute a day needs to count
 * toward a streak (`STREAK_MIN_SECONDS`): a session too short to be practice is
 * too short to be reported on, and a summary of forty seconds reads as the app
 * congratulating someone for pressing start.
 */
export const SESSION_RECAP_MIN_MS = 60_000

/** One finished session, in the terms the player played it in. */
export type SessionSummary = {
  elapsedMs: number
  notesCalled: number
  cyclesCompleted: number
  /** The tempo the run opened on, not the tempo the settings started the day at. */
  startBpm: number
  endBpm: number
  /** The fastest it ever got, which a ramp or a hand on the stepper can beat both ends with. */
  peakBpm: number
  /** The pool or saved setup that was running, already named for reading. */
  setup: string
}

/**
 * The summary, or null for a session not worth one. The peak is clamped up to
 * whichever end is higher rather than trusted as given: a run that was never
 * observed mid-tempo still peaked at least as high as it started and finished,
 * and "peaked at 60" under "72 → 74" would be a plain contradiction.
 */
export const summarizeSession = (input: SessionSummary): SessionSummary | null => {
  if (input.elapsedMs < SESSION_RECAP_MIN_MS) {
    return null
  }

  return { ...input, peakBpm: Math.max(input.peakBpm, input.startBpm, input.endBpm) }
}

/** Where the day stands after the session that just ended. */
export type DayStanding = { todaySec: number; streak: number }

/**
 * Today's total and the run it belongs to, straight out of the stored log.
 * Called after the pause has already committed, so the seconds just played are
 * in the history handed in rather than still pending in a ref.
 */
export const readDayStanding = (history: PracticeHistory, today = new Date()): DayStanding => ({
  todaySec: history.days[dayKey(today)]?.sec ?? 0,
  streak: currentStreak(history, today),
})

/**
 * What was running, in one phrase. A selected routine answers for itself — the
 * name it was saved under is what the player picked it by, and naming the shape
 * ("routine", "block") tells them nothing they did not already choose. Failing
 * that it is the pool: whichever preset the notes match, shipped or saved, and
 * a count when they match none.
 */
export const describeSetup = ({
  routineName,
  pool,
  saved,
}: {
  routineName: string | null
  pool: readonly number[]
  saved: readonly SavedPreset[]
}): string => {
  if (routineName !== null) {
    return routineName
  }

  const id = matchPreset(pool, saved)
  const preset = presetGroups(saved)
    .flatMap((group) => group.presets)
    .find((candidate) => candidate.id === id)

  // 'custom' is a preset in the list too, and its pcs are null — the one entry
  // whose label ("Custom") says less than the count does.
  return preset === undefined || preset.pcs === null ? `Custom pool (${pool.length} notes)` : preset.label
}
