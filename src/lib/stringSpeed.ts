/**
 * How fast the early advance ("Move on when I've got it") has found the
 * called note, kept per physical string.
 *
 * The microphone hears a pitch class and an octave, never a string — nothing
 * here can prove which string a note was actually played on, any more than
 * `heardBothOctaves` (scoring.ts) can prove two octaves were two places on
 * the neck rather than one string bent sharp. What this measures is how long
 * the note took to confirm while a given string was named, in Practice
 * options, as the one being drilled — a claim the player makes, not one the
 * mic can check.
 *
 * A running count, best and last, rather than a list of times: this is
 * written on every early advance, and an unbounded array would turn that
 * into a per-note storage write that only grows. See noteStats.ts for the
 * same call made about a different record.
 *
 * Keyed by an open key space — a tuning and a string, not a fixed twelve —
 * so a corrupt entry is salvaged around rather than taking the whole log
 * down with it, the way the routines shelf and the practice log already do.
 * noteStats.ts's whole-value rejection is for a record whose shape is fixed
 * at twelve; this one grows with however many strings have actually been
 * drilled, so there is something here worth keeping around a bad entry.
 */
import { STORAGE_KEYS } from '../constants'
import { readRaw, writeRaw } from './storage'
import { isTuningId, type TuningId } from './tunings'

export type StringSpeedEntry = {
  count: number
  bestMs: number
  lastMs: number
}

export type StringSpeedLog = Readonly<Record<string, StringSpeedEntry>>

export const EMPTY_STRING_SPEED: StringSpeedLog = {}

/** One physical string, keyed by its tuning and open-string MIDI note. */
export const stringSpeedKey = (tuningId: TuningId, midi: number): string => `${tuningId}:${midi}`

const isPositiveMs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Folds one early advance into the log, without mutating what it was given.
 * A non-positive or non-finite reading changes nothing rather than poisoning
 * a best time nothing that fast was actually played — the same clamp
 * `noteStats.ts`'s `recordNote` puts on a clock that ran backwards.
 */
export const recordEarlyAdvance = (log: StringSpeedLog, key: string, elapsedMs: number): StringSpeedLog => {
  if (!isPositiveMs(elapsedMs)) {
    return log
  }

  const previous = log[key]
  const next: StringSpeedEntry = previous
    ? { count: previous.count + 1, bestMs: Math.min(previous.bestMs, elapsedMs), lastMs: elapsedMs }
    : { count: 1, bestMs: elapsedMs, lastMs: elapsedMs }

  return { ...log, [key]: next }
}

export const hasStringSpeed = (log: StringSpeedLog): boolean => Object.keys(log).length > 0

/**
 * `stringSpeedKey`'s inverse: real values of both halves, not just two
 * non-empty ones — for reading a key back out to label it, or null for
 * anything `stringSpeedKey` did not build.
 */
export const parseStringSpeedKey = (key: string): { tuningId: TuningId; midi: number } | null => {
  const separator = key.lastIndexOf(':')
  if (separator === -1) {
    return null
  }

  const tuningId = key.slice(0, separator)
  const midi = Number(key.slice(separator + 1))

  return isTuningId(tuningId) && Number.isSafeInteger(midi) && midi > 0 ? { tuningId, midi } : null
}

/**
 * Everything stored is user-editable and may be half-written, so each entry
 * is validated on the way in and anything unrecognisable is dropped rather
 * than taking the rest of the log down with it.
 */
export const parseStringSpeed = (raw: string): StringSpeedLog => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_STRING_SPEED
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return EMPTY_STRING_SPEED
  }

  const log: Record<string, StringSpeedEntry> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (parseStringSpeedKey(key) === null || typeof value !== 'object' || value === null) {
      continue
    }

    const { count, bestMs, lastMs } = value as Partial<Record<keyof StringSpeedEntry, unknown>>
    // bestMs is a running minimum over every reading including lastMs, so it
    // can never read higher than the most recent one — a record where it does
    // is not one an honest session could have written.
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      !isPositiveMs(bestMs) ||
      !isPositiveMs(lastMs) ||
      bestMs > lastMs
    ) {
      continue
    }

    log[key] = { count, bestMs, lastMs }
  }

  return log
}

/** A blocked or absent store is the shared helpers' problem; everything left
 * here is a value that failed the parser, which reads as no record. */
export const readStringSpeed = (): StringSpeedLog => {
  const raw = readRaw(STORAGE_KEYS.stringSpeed)

  return raw === null ? EMPTY_STRING_SPEED : parseStringSpeed(raw)
}

export const writeStringSpeed = (log: StringSpeedLog): boolean =>
  writeRaw(STORAGE_KEYS.stringSpeed, JSON.stringify(log))
