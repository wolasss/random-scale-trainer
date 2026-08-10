import { describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import { withBlockedStorage } from '../test/blockedStorage'
import {
  addPractice,
  bestStreak,
  buildWindow,
  currentStreak,
  dayKey,
  hasHistory,
  readHistory,
  recentTotals,
  shiftDays,
  weekdayInitial,
  writeHistory,
  type PracticeHistory,
} from './history'
import { removeRaw } from './storage'

const at = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour)

/** Builds a history from day offsets relative to a reference date. */
const historyOf = (reference: Date, entries: Array<[offset: number, sec: number, notes?: number]>) => {
  const days: PracticeHistory['days'] = {}
  for (const [offset, sec, notes = 0] of entries) {
    days[dayKey(shiftDays(reference, offset))] = { sec, notes }
  }

  return { days }
}

describe('dayKey', () => {
  it('uses local calendar fields, not UTC', () => {
    // 11pm on the 14th is the 15th in UTC for anyone east of Greenwich, and
    // the day before it for anyone far enough west.
    expect(dayKey(at(2026, 2, 14, 23))).toBe('2026-02-14')
    expect(dayKey(at(2026, 2, 14, 0))).toBe('2026-02-14')
  })

  it('zero-pads months and days', () => {
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05')
  })
})

describe('shiftDays', () => {
  it('crosses month and year boundaries', () => {
    expect(dayKey(shiftDays(at(2026, 3, 1), -1))).toBe('2026-02-28')
    expect(dayKey(shiftDays(at(2026, 1, 1), -1))).toBe('2025-12-31')
  })

  it('moves exactly one calendar day across a DST change', () => {
    // 2026-03-08 is the US spring-forward date; a 24-hour subtraction would
    // land back on the same date.
    const afterSpringForward = new Date(2026, 2, 8, 12)
    expect(dayKey(shiftDays(afterSpringForward, -1))).toBe('2026-03-07')
  })
})

describe('weekdayInitial', () => {
  it('reads the local weekday', () => {
    expect(weekdayInitial(at(2026, 2, 14))).toBe('S')
    expect(weekdayInitial(at(2026, 2, 16))).toBe('M')
  })
})

describe('currentStreak', () => {
  const today = at(2026, 2, 14)

  it('is zero with no history', () => {
    expect(currentStreak({ days: {} }, today)).toBe(0)
  })

  it('counts consecutive days back from today', () => {
    const history = historyOf(today, [
      [0, 600],
      [-1, 600],
      [-2, 600],
    ])
    expect(currentStreak(history, today)).toBe(3)
  })

  it('keeps counting through yesterday when today is still untouched', () => {
    const history = historyOf(today, [
      [-1, 600],
      [-2, 600],
    ])
    expect(currentStreak(history, today)).toBe(2)
  })

  it('breaks on a missed day', () => {
    const history = historyOf(today, [
      [-1, 600],
      [-3, 600],
    ])
    expect(currentStreak(history, today)).toBe(1)
  })

  it('ignores days under a minute', () => {
    // Pressing start and walking away must not build a streak.
    const history = historyOf(today, [
      [0, 59],
      [-1, 59],
    ])
    expect(currentStreak(history, today)).toBe(0)
  })

  it('counts a day at exactly a minute', () => {
    expect(currentStreak(historyOf(today, [[0, 60]]), today)).toBe(1)
  })

  it('does not let a short day today hide a real streak', () => {
    const history = historyOf(today, [
      [0, 30],
      [-1, 600],
      [-2, 600],
    ])
    expect(currentStreak(history, today)).toBe(2)
  })

  it('is zero once two days have been missed', () => {
    expect(currentStreak(historyOf(today, [[-2, 600]]), today)).toBe(0)
  })
})

describe('bestStreak', () => {
  const today = at(2026, 2, 14)

  it('is zero with no history', () => {
    expect(bestStreak({ days: {} })).toBe(0)
  })

  it('finds the longest run anywhere in the map', () => {
    const history = historyOf(today, [
      [0, 600],
      [-1, 600],
      [-5, 600],
      [-6, 600],
      [-7, 600],
      [-8, 600],
    ])
    expect(bestStreak(history)).toBe(4)
  })

  it('skips days under the minute threshold', () => {
    const history = historyOf(today, [
      [0, 600],
      [-1, 10],
      [-2, 600],
    ])
    expect(bestStreak(history)).toBe(1)
  })

  it('joins runs across a month boundary', () => {
    const history = historyOf(at(2026, 3, 1), [
      [0, 600],
      [-1, 600],
      [-2, 600],
    ])
    expect(bestStreak(history)).toBe(3)
  })
})

describe('buildWindow', () => {
  const today = at(2026, 2, 14)

  it('returns 14 days, oldest first, ending today', () => {
    const bars = buildWindow({ days: {} }, today)
    expect(bars).toHaveLength(14)
    expect(bars[0].key).toBe('2026-02-01')
    expect(bars[13].key).toBe('2026-02-14')
    expect(bars[13].isToday).toBe(true)
    expect(bars[12].isToday).toBe(false)
  })

  it('scales each day against the busiest day in the window', () => {
    const bars = buildWindow(
      historyOf(today, [
        [0, 30 * 60],
        [-1, 15 * 60],
      ]),
      today,
    )
    expect(bars[13].ratio).toBe(1)
    expect(bars[12].ratio).toBeCloseTo(0.5)
  })

  it('holds a 20-minute floor under the denominator', () => {
    // One light day alone in the window must not render full height.
    const bars = buildWindow(historyOf(today, [[0, 5 * 60]]), today)
    expect(bars[13].ratio).toBeCloseTo(0.25)
  })

  it('gives days without practice a zero ratio', () => {
    const bars = buildWindow(historyOf(today, [[0, 600]]), today)
    expect(bars[12].sec).toBe(0)
    expect(bars[12].ratio).toBe(0)
  })

  it('rounds minutes for the hover label', () => {
    const bars = buildWindow(historyOf(today, [[0, 1_284]]), today)
    expect(bars[13].minutes).toBe(21)
  })

  it('ignores days outside the window', () => {
    const bars = buildWindow(historyOf(today, [[-20, 600]]), today)
    expect(bars.every((bar) => bar.sec === 0)).toBe(true)
  })
})

describe('recentTotals', () => {
  const today = at(2026, 2, 14)

  it('sums the last seven days including today', () => {
    const history = historyOf(today, [
      [0, 20 * 60, 300],
      [-6, 10 * 60, 200],
      [-7, 99 * 60, 999],
    ])
    expect(recentTotals(history, today)).toEqual({ minutes: 30, notes: 500 })
  })

  it('is empty with no history', () => {
    expect(recentTotals({ days: {} }, today)).toEqual({ minutes: 0, notes: 0 })
  })
})

describe('addPractice', () => {
  it('accumulates without mutating the input', () => {
    const before: PracticeHistory = { days: { '2026-02-14': { sec: 100, notes: 10 } } }
    const after = addPractice(before, '2026-02-14', 20, 3)

    expect(after.days['2026-02-14']).toEqual({ sec: 120, notes: 13 })
    expect(before.days['2026-02-14']).toEqual({ sec: 100, notes: 10 })
  })

  it('starts a new day from zero', () => {
    expect(addPractice({ days: {} }, '2026-02-15', 10, 2).days['2026-02-15']).toEqual({ sec: 10, notes: 2 })
  })
})

describe('storage', () => {
  it('round-trips through localStorage', () => {
    const history: PracticeHistory = { days: { '2026-02-14': { sec: 1_284, notes: 412 } } }
    writeHistory(history)

    expect(window.localStorage.getItem(STORAGE_KEYS.practiceLog)).toBe(
      '{"days":{"2026-02-14":{"sec":1284,"notes":412}}}',
    )
    expect(readHistory()).toEqual(history)
  })

  it('reads an empty history when nothing is stored', () => {
    expect(readHistory()).toEqual({ days: {} })
    expect(hasHistory(readHistory())).toBe(false)
  })

  it('survives unparseable json', () => {
    window.localStorage.setItem(STORAGE_KEYS.practiceLog, 'not json')
    expect(readHistory()).toEqual({ days: {} })
  })

  it('drops malformed days rather than trusting them', () => {
    window.localStorage.setItem(
      STORAGE_KEYS.practiceLog,
      JSON.stringify({
        days: {
          '2026-02-14': { sec: 600, notes: 12 },
          'not-a-date': { sec: 600, notes: 12 },
          '2026-02-15': { sec: 'lots', notes: 12 },
          '2026-02-16': null,
          '2026-02-17': { sec: -600, notes: -5 },
          '2026-02-30': { sec: 600, notes: 12 },
          '2026-13-45': { sec: 600, notes: 12 },
        },
      }),
    )

    expect(readHistory()).toEqual({
      days: {
        '2026-02-14': { sec: 600, notes: 12 },
        '2026-02-15': { sec: 0, notes: 12 },
      },
    })
  })

  it('survives a store that throws, as Safari private mode does', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(readHistory()).toEqual({ days: {} })
    expect(() => writeHistory({ days: { '2026-02-14': { sec: 1, notes: 1 } } })).not.toThrow()

    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('reads empty and clears cleanly when the whole store is blocked', () => {
    const restore = withBlockedStorage()
    try {
      expect(readHistory()).toEqual({ days: {} })
      expect(() => removeRaw(STORAGE_KEYS.practiceLog)).not.toThrow()
    } finally {
      restore()
    }
  })
})
