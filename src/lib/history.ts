import { STORAGE_KEYS } from '../constants'

/** One day's practice. Seconds, not minutes — a 90-second day is real. */
export type PracticeDay = {
  sec: number
  notes: number
}

export type PracticeHistory = {
  days: Record<string, PracticeDay>
}

export const EMPTY_HISTORY: PracticeHistory = { days: {} }

/** How many daily bars the card shows. */
export const HISTORY_WINDOW_DAYS = 14

/**
 * A day counts toward the streak at a minute of practice. Pressing start and
 * walking away must not build one: a number that can be gamed stops meaning
 * anything to the person holding it.
 */
export const STREAK_MIN_SECONDS = 60

/**
 * Floor for the bar-scale denominator, so a single light day doesn't render as
 * a full-height column and read like a personal best.
 */
export const BAR_SCALE_FLOOR_SECONDS = 20 * 60

/** Written this often while playing — a crash should cost seconds, not a session. */
export const HISTORY_FLUSH_MS = 10_000

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/**
 * Local date key, never UTC: someone practising at 11pm has to see it counted
 * on the day they lived through, not tomorrow.
 */
export const dayKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}

/** Local midnight for a key. Invalid keys give an invalid Date, never a throw. */
export const parseDayKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)

  return new Date(year, month - 1, day)
}

/**
 * A key is only real if it survives the round trip: `parseDayKey` happily rolls
 * '2026-02-30' over into March, and a day that no calendar ever had would sit in
 * the store forever, invisible to the window but still countable as a streak.
 */
const isDayKey = (key: string) => DAY_KEY_PATTERN.test(key) && dayKey(parseDayKey(key)) === key

/**
 * Calendar-day arithmetic, so a DST change still moves exactly one day —
 * subtracting 24 hours would land on the same date twice a year.
 */
export const shiftDays = (date: Date, delta: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta)

export const weekdayInitial = (date: Date) => WEEKDAY_INITIALS[date.getDay()]

const isPracticeDay = (day: PracticeDay | undefined) => day !== undefined && day.sec >= STREAK_MIN_SECONDS

const sanitizeCount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

/**
 * Everything stored is user-editable and may be half-written, so each day is
 * validated on the way in and anything unrecognisable is dropped rather than
 * allowed to poison a streak.
 */
const sanitize = (parsed: unknown): PracticeHistory => {
  if (typeof parsed !== 'object' || parsed === null) {
    return EMPTY_HISTORY
  }

  const rawDays = (parsed as { days?: unknown }).days
  if (typeof rawDays !== 'object' || rawDays === null) {
    return EMPTY_HISTORY
  }

  const days: Record<string, PracticeDay> = {}
  for (const [key, value] of Object.entries(rawDays as Record<string, unknown>)) {
    if (!isDayKey(key)) {
      continue
    }

    if (typeof value !== 'object' || value === null) {
      continue
    }

    const sec = sanitizeCount((value as PracticeDay).sec)
    const notes = sanitizeCount((value as PracticeDay).notes)
    if (sec > 0 || notes > 0) {
      days[key] = { sec, notes }
    }
  }

  return { days }
}

/** Safari's private mode throws on every localStorage call, so all three wrap. */
export const readHistory = (): PracticeHistory => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.practiceLog)

    return raw === null ? EMPTY_HISTORY : sanitize(JSON.parse(raw))
  } catch {
    return EMPTY_HISTORY
  }
}

export const writeHistory = (history: PracticeHistory) => {
  try {
    window.localStorage.setItem(STORAGE_KEYS.practiceLog, JSON.stringify(history))
  } catch {
    // A full or locked store costs the log, never the practice session.
  }
}

/** Adds to a day without mutating the history it was given. */
export const addPractice = (
  history: PracticeHistory,
  key: string,
  sec: number,
  notes: number,
): PracticeHistory => {
  const existing = history.days[key] ?? { sec: 0, notes: 0 }

  return {
    days: {
      ...history.days,
      [key]: { sec: existing.sec + Math.max(0, sec), notes: existing.notes + Math.max(0, notes) },
    },
  }
}

/**
 * Days with practice, counted backwards from today. A day that hasn't been
 * practised yet doesn't break the run — a streak that reads as broken at 9am
 * punishes the user for the time of day they opened the app.
 */
export const currentStreak = (history: PracticeHistory, today = new Date()) => {
  let cursor = isPracticeDay(history.days[dayKey(today)]) ? today : shiftDays(today, -1)
  let streak = 0

  while (isPracticeDay(history.days[dayKey(cursor)])) {
    streak += 1
    cursor = shiftDays(cursor, -1)
  }

  return streak
}

/**
 * Derived from the same map every time, never stored — a remembered best can
 * drift away from the data behind it, and then it is just a number.
 */
export const bestStreak = (history: PracticeHistory) => {
  const keys = Object.keys(history.days)
    .filter((key) => isPracticeDay(history.days[key]))
    .sort()

  let best = 0
  let run = 0
  let previous: string | null = null

  for (const key of keys) {
    const followsPrevious = previous !== null && key === dayKey(shiftDays(parseDayKey(previous), 1))
    run = followsPrevious ? run + 1 : 1
    best = Math.max(best, run)
    previous = key
  }

  return best
}

export type PracticeBar = {
  key: string
  sec: number
  notes: number
  minutes: number
  weekday: string
  isToday: boolean
  /** 0–1 of the track height; 0 for a day without practice. */
  ratio: number
}

/**
 * The last `days` days, oldest first, each scaled against the busiest day in
 * the window.
 */
export const buildWindow = (
  history: PracticeHistory,
  today = new Date(),
  days = HISTORY_WINDOW_DAYS,
): PracticeBar[] => {
  const todayKey = dayKey(today)
  const dates = Array.from({ length: days }, (_, index) => shiftDays(today, index - days + 1))
  const seconds = dates.map((date) => history.days[dayKey(date)]?.sec ?? 0)
  const scale = Math.max(BAR_SCALE_FLOOR_SECONDS, ...seconds)

  return dates.map((date, index) => {
    const key = dayKey(date)

    return {
      key,
      sec: seconds[index],
      notes: history.days[key]?.notes ?? 0,
      minutes: Math.round(seconds[index] / 60),
      weekday: weekdayInitial(date),
      isToday: key === todayKey,
      ratio: seconds[index] === 0 ? 0 : Math.min(1, seconds[index] / scale),
    }
  })
}

/** Rolling totals for the footer line, today included. */
export const recentTotals = (history: PracticeHistory, today = new Date(), days = 7) => {
  let sec = 0
  let notes = 0

  for (let index = 0; index < days; index += 1) {
    const day = history.days[dayKey(shiftDays(today, -index))]
    sec += day?.sec ?? 0
    notes += day?.notes ?? 0
  }

  return { minutes: Math.round(sec / 60), notes }
}

export const hasHistory = (history: PracticeHistory) => Object.keys(history.days).length > 0
