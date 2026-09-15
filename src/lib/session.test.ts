import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dayKey, shiftDays, type PracticeHistory } from './history'
import { describeSetup, readDayStanding, summarizeSession, SESSION_RECAP_MIN_MS } from './session'

const summary = (overrides: Partial<Parameters<typeof summarizeSession>[0]> = {}) =>
  summarizeSession({
    elapsedMs: 120_000,
    notesCalled: 30,
    cyclesCompleted: 2,
    startBpm: 72,
    endBpm: 72,
    peakBpm: 72,
    setup: 'All 12 chromatic',
    ...overrides,
  })

/** A history holding `sec` on each of the given day offsets from today. */
const history = (days: Record<number, number>): PracticeHistory => ({
  days: Object.fromEntries(
    Object.entries(days).map(([offset, sec]) => [dayKey(shiftDays(new Date(), Number(offset))), { sec, notes: 10 }]),
  ),
})

describe('summarizeSession', () => {
  it('has nothing to report a second short of the minute', () => {
    expect(summary({ elapsedMs: SESSION_RECAP_MIN_MS - 1 })).toBeNull()
  })

  it('reports from the minute itself', () => {
    expect(summary({ elapsedMs: SESSION_RECAP_MIN_MS })).not.toBeNull()
  })

  it('carries the readings through untouched', () => {
    expect(summary({ notesCalled: 41, cyclesCompleted: 3 })).toMatchObject({
      elapsedMs: 120_000,
      notesCalled: 41,
      cyclesCompleted: 3,
      setup: 'All 12 chromatic',
    })
  })

  it('keeps the peak at whichever end is higher, never below one', () => {
    // A session nobody watched the middle of still peaked at least this high.
    expect(summary({ startBpm: 72, endBpm: 90, peakBpm: 0 })?.peakBpm).toBe(90)
    expect(summary({ startBpm: 110, endBpm: 80, peakBpm: 60 })?.peakBpm).toBe(110)
  })

  it('keeps a peak that beats both ends', () => {
    expect(summary({ startBpm: 72, endBpm: 74, peakBpm: 96 })?.peakBpm).toBe(96)
  })
})

describe('describeSetup', () => {
  it('names a shipped preset by its label', () => {
    expect(describeSetup({ routineName: null, pool: [0, 2, 4, 5, 7, 9, 11], saved: [] })).toBe('Naturals only (7)')
  })

  it('names a saved pool by the name it was saved under', () => {
    expect(
      describeSetup({ routineName: null, pool: [0, 3, 6], saved: [{ name: 'Dim shapes', pcs: [0, 3, 6] }] }),
    ).toBe('Dim shapes')
  })

  it('counts a pool that matches nothing', () => {
    expect(describeSetup({ routineName: null, pool: [0, 3, 6], saved: [] })).toBe('Custom pool (3 notes)')
  })

  it('lets the routine speak for the setup when one is running', () => {
    expect(describeSetup({ routineName: 'Warm-up: naturals', pool: [0, 2, 4, 5, 7, 9, 11], saved: [] })).toBe(
      'Warm-up: naturals',
    )
  })
})

describe('readDayStanding', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads today off the stored log', () => {
    expect(readDayStanding(history({ 0: 930 }))).toEqual({ todaySec: 930, streak: 1 })
  })

  it('has nothing to say about a day nobody practised', () => {
    expect(readDayStanding(history({ '-3': 900 }))).toEqual({ todaySec: 0, streak: 0 })
  })

  it('counts the run today belongs to', () => {
    expect(readDayStanding(history({ 0: 600, '-1': 900, '-2': 900 }))).toEqual({ todaySec: 600, streak: 3 })
  })

  it('leaves a day under the minute out of the run', () => {
    expect(readDayStanding(history({ 0: 30 }))).toEqual({ todaySec: 30, streak: 0 })
  })

  it('never writes what it read', () => {
    const stored = history({ 0: 600 })
    const before = JSON.stringify(stored)
    window.localStorage.clear()

    readDayStanding(stored)

    expect(JSON.stringify(stored)).toBe(before)
    expect(window.localStorage.length).toBe(0)
  })
})
