import { STORAGE_KEYS } from '../constants'
import { readRaw, writeRaw } from './storage'

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
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/**
 * Spelled out here rather than taken from `toLocaleString`: the heatmap headings
 * have to read the same for everyone, and a month name that changes with the
 * browser's locale is a test that passes on one machine and fails on the next.
 */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

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

/**
 * A blocked or full store is the shared helpers' problem; the only failure left
 * here is corrupt JSON, which reads as no history at all.
 */
export const readHistory = (): PracticeHistory => {
  const raw = readRaw(STORAGE_KEYS.practiceLog)
  if (raw === null) {
    return EMPTY_HISTORY
  }

  try {
    return sanitize(JSON.parse(raw))
  } catch {
    return EMPTY_HISTORY
  }
}

/**
 * Returns whether the log actually stuck. A dropped practice write is not
 * something to swallow: the callers above use this to say so rather than let
 * somebody keep practising into a log that is never saved.
 */
export const writeHistory = (history: PracticeHistory): boolean =>
  writeRaw(STORAGE_KEYS.practiceLog, JSON.stringify(history))

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

/**
 * How one day's practice reads. Shared by the card's strip and the calendar, so
 * the same day says the same thing wherever it is shown.
 */
export const practiceDayTitle = (minutes: number, sec: number) => {
  if (sec === 0) {
    return 'no practice'
  }

  return minutes === 0 ? 'under a minute' : `${minutes} min`
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

/**
 * Folds one history into another, keeping the larger of the two for every day
 * they share. Restoring a backup is something people do when they are afraid of
 * losing what they have, so it is written to only ever be additive: an old file
 * dropped on a newer log tops it up, and never takes a day back down.
 */
export const mergeHistories = (base: PracticeHistory, incoming: PracticeHistory): PracticeHistory => {
  const days: Record<string, PracticeDay> = { ...base.days }

  for (const [key, day] of Object.entries(incoming.days)) {
    const existing = days[key]
    days[key] = {
      sec: Math.max(existing?.sec ?? 0, day.sec),
      notes: Math.max(existing?.notes ?? 0, day.notes),
    }
  }

  return { days }
}

/**
 * Stamped into every backup so a file can say what it is. Without them any JSON
 * object with a `days` key would import cleanly, and a half-recognised file is
 * worse than a rejected one.
 */
const BACKUP_APP = 'callnote'
const BACKUP_KIND = 'practice-log'
const BACKUP_VERSION = 1

/**
 * A year of daily practice serialises to a few tens of kilobytes, so this is
 * generous by orders of magnitude. It is not a format check — it is there so a
 * mis-picked video is refused at the picker instead of being read into a string
 * and JSON.parsed, which freezes the tab before any of the validation below runs.
 */
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024

/**
 * The browser's guess at what was picked, which is all that is known before the
 * file is read. An empty type is allowed through: plenty of systems have no
 * registration for `.json` and report nothing at all, and refusing those would
 * lock people out of their own backups. Only a type that positively claims to be
 * something else — `video/mp4`, `image/png` — is turned away here.
 */
export const isBackupFileType = (type: string) =>
  type === '' || type === 'text/plain' || type === 'text/json' || /^application\/(x-)?json$/.test(type)

/** Pretty-printed: a backup someone can open and read is one they can trust. */
export const serializeBackup = (history: PracticeHistory, exportedOn: Date) =>
  JSON.stringify(
    {
      app: BACKUP_APP,
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedOn: dayKey(exportedOn),
      days: history.days,
    },
    null,
    2,
  )

/**
 * A backup back into a history, or `null` for anything this app didn't write.
 * A version it has never heard of is refused rather than read optimistically —
 * guessing at a future format is how a restore quietly drops half a log.
 */
export const parseBackup = (raw: string): PracticeHistory | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  const backup = parsed as { app?: unknown; kind?: unknown; version?: unknown; days?: unknown }
  if (backup.app !== BACKUP_APP || backup.kind !== BACKUP_KIND || backup.version !== BACKUP_VERSION) {
    return null
  }

  if (typeof backup.days !== 'object' || backup.days === null) {
    return null
  }

  // Everything past the marker fields is treated as untrusted as the store is:
  // the file has been on a disk, in a mail attachment, and possibly in an editor.
  return sanitize(parsed)
}

export type PracticeCell = {
  key: string
  sec: number
  minutes: number
  isToday: boolean
  isFuture: boolean
  /** 0 for a day without practice, then 1–4 against the busiest day on record. */
  level: number
}

export type PracticeMonth = {
  key: string
  label: string
  totalMinutes: number
  /** Leading nulls pad the first week, so column 0 is always a Sunday. */
  cells: Array<PracticeCell | null>
}

const monthIndex = (year: number, month: number) => year * 12 + month

/**
 * How far either side of today the calendar will draw, however far the stored
 * keys reach. '0100-01-01' is as well-formed a day as yesterday is, and a
 * backup is a file that has been on a disk and possibly in an editor: one such
 * key, taken literally, asks for twenty thousand months and half a million
 * cells to be built before the sheet can paint. Ten years back covers a
 * lifetime of this app, and a year forward covers a device whose clock is wrong.
 * The days themselves are kept — only the drawing is bounded.
 */
export const CALENDAR_MONTHS_BACK = 120
export const CALENDAR_MONTHS_FORWARD = 12

/**
 * Every month from the first day on record to the current one, newest first.
 *
 * The range is clamped around today rather than derived from the stored keys
 * alone, so an empty log still draws this month and a day dated in the future —
 * which the sanitiser has no way to rule out, a wrong device clock is enough —
 * extends the range instead of inverting it. The loop is counted, never open.
 */
export const buildMonths = (history: PracticeHistory, today = new Date()): PracticeMonth[] => {
  const todayKey = dayKey(today)
  const todayIndex = monthIndex(today.getFullYear(), today.getMonth())

  const stored = Object.keys(history.days)
    .filter(isDayKey)
    .map((key) => {
      const date = parseDayKey(key)

      return monthIndex(date.getFullYear(), date.getMonth())
    })

  const first = Math.max(todayIndex - CALENDAR_MONTHS_BACK, Math.min(todayIndex, ...stored))
  const last = Math.min(todayIndex + CALENDAR_MONTHS_FORWARD, Math.max(todayIndex, ...stored))
  // Scaled against the whole log, not against each month: a quiet January has
  // to look quiet next to the March that followed it.
  const scale = Math.max(BAR_SCALE_FLOOR_SECONDS, ...Object.values(history.days).map((day) => day.sec))

  const months: PracticeMonth[] = []
  for (let index = last; index >= first; index -= 1) {
    const year = Math.floor(index / 12)
    const month = index - year * 12
    // Day 0 of the next month is the last day of this one.
    const dayCount = new Date(year, month + 1, 0).getDate()
    const cells: Array<PracticeCell | null> = Array.from({ length: new Date(year, month, 1).getDay() }, () => null)
    let totalSec = 0

    for (let day = 1; day <= dayCount; day += 1) {
      const key = dayKey(new Date(year, month, day))
      const sec = history.days[key]?.sec ?? 0
      totalSec += sec

      cells.push({
        key,
        sec,
        minutes: Math.round(sec / 60),
        isToday: key === todayKey,
        isFuture: key > todayKey,
        level: sec === 0 ? 0 : Math.min(4, Math.ceil((4 * sec) / scale)),
      })
    }

    months.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[month]} ${year}`,
      totalMinutes: Math.round(totalSec / 60),
      cells,
    })
  }

  return months
}
