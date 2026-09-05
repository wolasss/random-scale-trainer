/**
 * What each of the twelve notes has been worth to you, kept across sessions.
 *
 * A session's tally already says how many notes were hit; it says nothing about
 * *which*, and it dies with the session. So a player who loses B♭ every single
 * time has no way of finding that out — the one thing the microphone knows that
 * would actually change what they practise next. This is that record: twelve
 * slots, one per pitch class, each holding how many times the note was scored,
 * how many of those were hits, and the response times behind the hits.
 *
 * Pitch classes, not names. A call of D♭ and a call of C♯ are the same fret and
 * the same weakness, and splitting them would halve a record that is already
 * only twelve numbers wide.
 *
 * Sums rather than a list of times. The practice log grows a day at a time and
 * is worth migrating; this is a fixed twelve triples and is written on every
 * judged note, so keeping every response time would turn an unbounded array
 * into a per-note storage write. The mean is what the card prints, and three
 * numbers carry it.
 *
 * `responseMsTotal` is the total behind `hits` and nothing else. A miss has no
 * time to record — that is what `NoteVerdict` says by being a union — so a
 * record with time in it and no hits behind it is one no session could have
 * written, and the parser refuses it.
 */
import { STORAGE_KEYS } from '../constants'
import { PITCH_CLASSES } from './notes'
import type { NoteVerdict } from './scoring'
import { readRaw, removeRaw, writeRaw } from './storage'

/** One pitch class's record. `responseMsTotal` belongs to `hits` alone. */
export type NoteStat = {
  scored: number
  hits: number
  responseMsTotal: number
}

/** Always exactly twelve, indexed by pitch class. */
export type NoteStats = readonly NoteStat[]

export const EMPTY_NOTE_STATS: NoteStats = PITCH_CLASSES.map(() => ({ scored: 0, hits: 0, responseMsTotal: 0 }))

const isPitchClass = (pc: number) => Number.isInteger(pc) && pc >= 0 && pc < PITCH_CLASSES.length

/**
 * Folds one judged note into the record, without mutating what it was given.
 *
 * The verdict comes in as the union `src/lib/scoring.ts` judges with rather than
 * as a flag beside a nullable number, so a miss cannot arrive carrying a
 * response time and a hit cannot arrive without one. A pitch class outside the
 * octave changes nothing: there is no slot for it, and inventing one would give
 * the card a thirteenth row.
 */
export const recordNote = (stats: NoteStats, pc: number, verdict: NoteVerdict): NoteStats => {
  if (!isPitchClass(pc)) {
    return stats
  }

  return stats.map((stat, index) =>
    index === pc
      ? {
          scored: stat.scored + 1,
          hits: stat.hits + (verdict.hit ? 1 : 0),
          // Clamped: a clock that ran backwards must not take time off a total
          // that other notes have already paid into.
          responseMsTotal: stat.responseMsTotal + (verdict.hit ? Math.max(0, verdict.responseMs) : 0),
        }
      : stat,
  )
}

/** 0–1, or null for a note that has never been called with the mic on. */
export const accuracy = (stat: NoteStat): number | null => (stat.scored === 0 ? null : stat.hits / stat.scored)

/** Null when nothing was hit: a note answered no times has no time to average. */
export const meanResponseMs = (stat: NoteStat): number | null =>
  stat.hits === 0 ? null : stat.responseMsTotal / stat.hits

export const hasNoteStats = (stats: NoteStats) => stats.some((stat) => stat.scored > 0)

/** How many notes "drill the weakest" loads into the pool. */
export const WEAK_POOL_SIZE = 4

/**
 * The notes worth drilling next: lowest accuracy first, and among equals the
 * one with the most evidence behind it, so a note missed once out of one does
 * not outrank a note missed nine times out of ten.
 *
 * Only notes that have actually been scored are eligible — a note never called
 * is not a weakness, it is an unknown, and loading unknowns into the pool would
 * hand back the twelve the app already starts on. Empty only when nothing at
 * all has been played: `setPool` refuses an empty pool and accepts a pool of
 * one, so a single practised note is still a drill worth loading.
 */
export const weakestPcs = (stats: NoteStats): number[] =>
  PITCH_CLASSES.filter((pc) => stats[pc].scored > 0)
    .sort((left, right) => {
      const byAccuracy = (accuracy(stats[left]) ?? 0) - (accuracy(stats[right]) ?? 0)
      if (byAccuracy !== 0) {
        return byAccuracy
      }

      const byEvidence = stats[right].scored - stats[left].scored

      return byEvidence !== 0 ? byEvidence : left - right
    })
    .slice(0, WEAK_POOL_SIZE)

/**
 * Twelve `[scored, hits, responseMsTotal]` triples. Positional rather than
 * named: the shape is fixed at twelve by definition, and a key per field would
 * roughly triple a value that is rewritten on every judged note.
 */
const serialize = (stats: NoteStats) =>
  JSON.stringify(stats.map(({ scored, hits, responseMsTotal }) => [scored, hits, responseMsTotal]))

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/**
 * A stored value back into a record, or `EMPTY_NOTE_STATS` for anything this
 * app did not write.
 *
 * Rejection is whole rather than per entry. Everything stored is user-editable
 * and may be half-written, and unlike the practice log there is nothing here
 * worth salvaging: eleven good notes and one impossible one still prints a card
 * of accuracies, and the one that reads wrong is indistinguishable from the ten
 * that read right. So every triple has to hold — counts that are whole and not
 * negative, no more hits than notes scored, a finite response total, and no
 * response total at all behind zero hits — or the record reads as unplayed.
 */
export const parseNoteStats = (raw: string): NoteStats => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_NOTE_STATS
  }

  if (!Array.isArray(parsed) || parsed.length !== PITCH_CLASSES.length) {
    return EMPTY_NOTE_STATS
  }

  const stats: NoteStat[] = []
  for (const entry of parsed as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 3) {
      return EMPTY_NOTE_STATS
    }

    const [scored, hits, responseMsTotal] = entry as unknown[]
    if (!isCount(scored) || !isCount(hits) || hits > scored) {
      return EMPTY_NOTE_STATS
    }

    if (typeof responseMsTotal !== 'number' || !Number.isFinite(responseMsTotal) || responseMsTotal < 0) {
      return EMPTY_NOTE_STATS
    }

    // Time with no hit behind it: not a record any session could have written.
    if (hits === 0 && responseMsTotal !== 0) {
      return EMPTY_NOTE_STATS
    }

    stats.push({ scored, hits, responseMsTotal })
  }

  return stats
}

/**
 * A blocked or absent store is the shared helpers' problem; everything left
 * here is a value that failed the parser, which reads as no record.
 */
export const readNoteStats = (): NoteStats => {
  const raw = readRaw(STORAGE_KEYS.noteStats)

  return raw === null ? EMPTY_NOTE_STATS : parseNoteStats(raw)
}

/** Whether the record actually stuck, for a caller that wants to say so. */
export const writeNoteStats = (stats: NoteStats): boolean => writeRaw(STORAGE_KEYS.noteStats, serialize(stats))

export const clearNoteStats = (): void => removeRaw(STORAGE_KEYS.noteStats)
