import { afterEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import { withBlockedStorage } from '../test/blockedStorage'
import {
  accuracy,
  clearNoteStats,
  EMPTY_NOTE_STATS,
  hasNoteStats,
  meanResponseMs,
  parseNoteStats,
  readNoteStats,
  recordNote,
  WEAK_POOL_SIZE,
  weakestPcs,
  writeNoteStats,
  type NoteStats,
} from './noteStats'

const hit = (responseMs: number) => ({ hit: true, responseMs }) as const
const miss = { hit: false, responseMs: null } as const

/** Folds a run of verdicts onto one pitch class. */
const fold = (pc: number, verdicts: Array<ReturnType<typeof hit> | typeof miss>, from = EMPTY_NOTE_STATS) =>
  verdicts.reduce<NoteStats>((stats, verdict) => recordNote(stats, pc, verdict), from)

/** A stored value in the codec's own shape, for the rejection cases. */
const triples = (overrides: Record<number, unknown[]> = {}) =>
  JSON.stringify(Array.from({ length: 12 }, (_, pc) => overrides[pc] ?? [0, 0, 0]))

describe('note stats', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('starts as twelve untouched notes', () => {
    expect(EMPTY_NOTE_STATS).toHaveLength(12)
    expect(hasNoteStats(EMPTY_NOTE_STATS)).toBe(false)
    expect(EMPTY_NOTE_STATS.every((stat) => stat.scored === 0)).toBe(true)
  })

  it('folds hits and misses onto the note they were called on', () => {
    const stats = fold(10, [hit(600), miss, hit(400)])

    expect(stats[10]).toEqual({ scored: 3, hits: 2, responseMsTotal: 1000 })
    expect(hasNoteStats(stats)).toBe(true)
    // Nothing else moved: eleven notes were never called.
    expect(stats.filter((stat) => stat.scored > 0)).toHaveLength(1)
  })

  it('leaves the record it was given alone', () => {
    const before = fold(3, [hit(500)])
    const after = recordNote(before, 3, miss)

    expect(before[3]).toEqual({ scored: 1, hits: 1, responseMsTotal: 500 })
    expect(after[3]).toEqual({ scored: 2, hits: 1, responseMsTotal: 500 })
  })

  it('has no slot for a pitch class outside the octave', () => {
    expect(recordNote(EMPTY_NOTE_STATS, 12, hit(300))).toBe(EMPTY_NOTE_STATS)
    expect(recordNote(EMPTY_NOTE_STATS, -1, hit(300))).toBe(EMPTY_NOTE_STATS)
    expect(recordNote(EMPTY_NOTE_STATS, 1.5, hit(300))).toBe(EMPTY_NOTE_STATS)
  })

  it('reports no accuracy for a note never called, and no mean for one never hit', () => {
    expect(accuracy(EMPTY_NOTE_STATS[0])).toBeNull()
    expect(meanResponseMs(EMPTY_NOTE_STATS[0])).toBeNull()

    const missedOnly = fold(5, [miss, miss])
    expect(accuracy(missedOnly[5])).toBe(0)
    expect(meanResponseMs(missedOnly[5])).toBeNull()

    const mixed = fold(5, [hit(400), hit(800), miss, miss])
    expect(accuracy(mixed[5])).toBe(0.5)
    expect(meanResponseMs(mixed[5])).toBe(600)
  })

  describe('picking the weakest', () => {
    it('is empty only while nothing at all has been played', () => {
      expect(weakestPcs(EMPTY_NOTE_STATS)).toEqual([])
      // One note played is still a drill: setPool refuses an empty pool, not a
      // pool of one.
      expect(weakestPcs(fold(7, [hit(300)]))).toEqual([7])
    })

    it('sorts by accuracy, worst first, and cuts to the pool size', () => {
      let stats = fold(0, [miss, miss]) // 0%
      stats = fold(1, [hit(300), miss, miss, miss], stats) // 25%
      stats = fold(2, [hit(300), hit(300), miss, miss], stats) // 50%
      stats = fold(3, [hit(300), hit(300), hit(300), miss], stats) // 75%
      stats = fold(4, [hit(300)], stats) // 100%

      expect(weakestPcs(stats)).toEqual([0, 1, 2, 3])
      expect(weakestPcs(stats)).toHaveLength(WEAK_POOL_SIZE)
    })

    it('breaks an accuracy tie on evidence, then on the note itself', () => {
      // Both 50%, but B has been called four times as often, so it is the
      // weakness with something behind it.
      let stats = fold(0, [hit(300), miss])
      stats = fold(11, [hit(300), hit(300), hit(300), hit(300), miss, miss, miss, miss], stats)

      expect(weakestPcs(stats).slice(0, 2)).toEqual([11, 0])

      // Same accuracy and the same evidence: the lower pitch class first, so
      // the order is at least stable rather than arbitrary.
      let even = fold(9, [hit(300), miss])
      even = fold(2, [hit(300), miss], even)

      expect(weakestPcs(even)).toEqual([2, 9])
    })
  })

  describe('the stored codec', () => {
    it('round trips a record through storage', () => {
      let stats = fold(0, [hit(500), miss])
      stats = fold(11, [miss], stats)

      expect(writeNoteStats(stats)).toBe(true)
      expect(readNoteStats()).toEqual(stats)
    })

    it('reads an untouched record when nothing is stored', () => {
      expect(readNoteStats()).toEqual(EMPTY_NOTE_STATS)
    })

    it('clears the record out of storage', () => {
      writeNoteStats(fold(4, [hit(500)]))
      clearNoteStats()

      expect(window.localStorage.getItem(STORAGE_KEYS.noteStats)).toBeNull()
      expect(readNoteStats()).toEqual(EMPTY_NOTE_STATS)
    })

    it.each([
      ['not JSON at all', 'not json'],
      ['not an array', '{"0":[1,1,300]}'],
      ['the wrong length', JSON.stringify(Array.from({ length: 11 }, () => [0, 0, 0]))],
      ['an entry that is not a triple', triples({ 3: [1, 1] })],
      ['an entry that is not an array', JSON.stringify(Array.from({ length: 12 }, () => ({ scored: 1 })))],
      ['a fractional count', triples({ 3: [1.5, 1, 300] })],
      ['a count past the safe integers', triples({ 3: [Number.MAX_SAFE_INTEGER + 2, 0, 0] })],
      ['a negative count', triples({ 3: [-1, 0, 0] })],
      ['more hits than notes scored', triples({ 3: [1, 2, 300] })],
      ['a response total that is not a number', triples({ 3: [1, 1, '300'] })],
      // JSON has no Infinity — an out-of-range total serialises to null.
      ['a response total JSON could not carry', triples({ 3: [1, 1, null] })],
      ['a negative response total', triples({ 3: [1, 1, -300] })],
      ['a response total behind no hits', triples({ 3: [1, 0, 300] })],
    ])('reads %s as an untouched record', (_case, raw) => {
      expect(parseNoteStats(raw)).toEqual(EMPTY_NOTE_STATS)

      window.localStorage.setItem(STORAGE_KEYS.noteStats, raw)
      expect(readNoteStats()).toEqual(EMPTY_NOTE_STATS)
    })

    it('keeps a fractional response total, which a mean of whole ones can be', () => {
      expect(parseNoteStats(triples({ 3: [2, 2, 1000.5] }))[3]).toEqual({
        scored: 2,
        hits: 2,
        responseMsTotal: 1000.5,
      })
    })

    it('reads empty and reports a refused write on a blocked store', () => {
      const restore = withBlockedStorage()
      try {
        expect(readNoteStats()).toEqual(EMPTY_NOTE_STATS)
        expect(writeNoteStats(fold(0, [hit(300)]))).toBe(false)
      } finally {
        restore()
      }
    })
  })
})
