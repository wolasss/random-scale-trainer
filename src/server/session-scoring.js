/**
 * What a scoring session is worth, decided here and nowhere else.
 *
 * The old contract let a browser post the number it had arrived at. That is not
 * a score, it is a claim, and `curl -d '{"points":1000000}'` is as good a claim
 * as an hour of practice. So the client no longer sends a total at all: it opens
 * a session, streams the *events* it observed — a note hit, a note missed, a
 * bonus earned — and this file adds them up under rules the browser cannot
 * reach.
 *
 * Two things bound how fast a scripted client can accumulate points.
 *
 * The first is the wall clock. Every event is stamped `at`, in milliseconds
 * since the session began, and an event may not claim a moment the server has
 * not lived through yet (plus `CLOCK_SKEW_MS`, which is the round trip and a
 * slightly-wrong device clock, not a licence). So five thousand events cannot be
 * posted in one request and read as an afternoon: they have to be *waited* for.
 *
 * The second is note spacing. `FASTEST_NOTE_INTERVAL_MS` is 60000 / MAX_BPM at
 * one beat per note — the fastest the app itself can possibly call a note — and
 * two judged notes closer together than that did not happen. Crucially this is
 * derived from the app's own ceiling and *not* from the config the session
 * declared: a routine that moves the tempo or the note span mid-session must
 * never read as cheating, and a declared config must never buy a faster budget.
 *
 * What a note is *worth*, though, is the settings it was called under, and this
 * file prices it by them — the same arithmetic as `difficultyMultiplier` in
 * src/lib/scoring.ts, on the same inputs, so the board and the readout under
 * the play button are one number rather than two. The price rides on the `hit`
 * that reports the note rather than on the session, because that is the only
 * way the two can agree: the client freezes a note's price when the note is
 * *called*, so a speed ramp, a routine block or a hand on the tempo moves the
 * next note's price and not the one still sounding. A session-wide config
 * could not reproduce that, and a hit that reports no settings at all is
 * priced flat here exactly as the client prices a beat that carried none.
 *
 * That does hand the client something to declare, so be clear about what it is
 * worth: the inputs are checked against the options the app actually offers and
 * are rejected rather than clamped, which bounds one note at
 * `MAX_DIFFICULTY_MULTIPLIER` — mixed spelling, no fretboard, one beat a note,
 * top tempo. Nothing declared moves the two rules above: the wall clock and the
 * spacing floor are what stop a scripted client, and both are deaf to it. So
 * the worst a lie buys is that ceiling per note, on notes it still has to wait
 * out in real time.
 *
 * `seq` is the replay defence: it must equal `nextSeq` exactly, so an event
 * already counted, an event out of order, and an event from a session that has
 * moved on all fail the same test. A batch is all-or-nothing — it is validated
 * against a copy and a new session is only ever returned when every event in it
 * passed — so a rejected request leaves the session exactly where it was and
 * cannot be used to probe for what would be accepted.
 *
 * Plain JS for the same reason scoreboard.js is: the container runs the server
 * with bare `node` and no build step. The point constants below duplicate
 * src/lib/scoring.ts, which cannot be imported from here; session-scoring.test.ts
 * imports both and asserts they are equal, so a drift is a failing test rather
 * than a board that disagrees with the screen.
 */

/** What one correct note is worth. Mirrors POINTS_PER_HIT in src/lib/scoring.ts. */
export const POINTS_PER_HIT = 10

/** The streak rule, mirroring src/lib/scoring.ts: nothing until the third. */
export const STREAK_BONUS_FROM = 3
export const STREAK_BONUS_STEP = 5
export const STREAK_BONUS_MAX = 25

/** The two bonuses a client may report, priced as src/lib/scoring.ts prices them. */
export const OCTAVES_BONUS_POINTS = 15
export const TEMPO_BONUS_POINTS = 10

/**
 * What staying in the chair is worth, mirroring `PRACTICE_MILESTONES` in
 * src/lib/scoring.ts. Paid flat and never priced: a milestone belongs to the
 * session's clock and not to any note, so no note's multiplier applies to it.
 */
export const PRACTICE_MILESTONES = {
  practice10: { atMs: 10 * 60_000, points: 50 },
  practice20: { atMs: 20 * 60_000, points: 100 },
  practice30: { atMs: 30 * 60_000, points: 150 },
}

/**
 * How early a milestone may be claimed against the server's own clock.
 *
 * The two clocks are not the same one and cannot be. The app's is *practice*
 * time, which starts with playback and stops with it; this session's starts
 * when the first note was called, a count-in and a note span later — up to half
 * a minute at the slowest tempo and the longest span. What this check is for is
 * refusing a thirty-minute milestone from a session a minute old, so it is
 * written to be generous about the boundary and strict about the fraud: a
 * minute of slack on a ten-minute threshold costs it nothing, and pauses only
 * ever push the claim later than the wall clock, never earlier.
 */
export const MILESTONE_LEAD_MS = 60_000

/**
 * The tempo range, the note spans and the spellings the app offers, duplicated
 * from src/constants.ts and src/lib/notes.ts the way the challenge-name rules
 * already are. Anything outside these is *rejected* rather than clamped: a
 * caller sending one is not a player whose slider went too far, and silently
 * accepting a number nobody chose would make what is recorded a fiction.
 */
export const MIN_BPM = 30
export const MAX_BPM = 240
export const DEFAULT_BPM = 72
export const BEAT_SPAN_OPTIONS = [1, 2, 4, 8, 12]
export const SPELLING_OPTIONS = ['flat', 'sharp', 'mixed']

/** The twelve pitch classes, and the five of them that have two names. */
export const PITCH_CLASS_COUNT = 12
export const ACCIDENTAL_PITCH_CLASSES = [1, 3, 6, 8, 10]

/**
 * The difficulty factors, mirroring src/lib/scoring.ts one for one. They are
 * multiplied in the same order there and here, so both sides land on the same
 * double and `Math.round` breaks the same way on both.
 */
export const MIXED_SPELLING_MULTIPLIER = 1.15
export const SINGLE_SPELLING_MULTIPLIER = 1
export const FRETBOARD_HIDDEN_MULTIPLIER = 1.2
export const FRETBOARD_SHOWN_MULTIPLIER = 1
export const BEAT_SPAN_MULTIPLIERS = { 1: 1.4, 2: 1.2, 4: 1, 8: 0.85, 12: 0.75 }
export const TEMPO_MULTIPLIER_GAIN = 0.5
export const TEMPO_MULTIPLIER_MAX = 1.4

/**
 * How much of the octave was in play, by pool size. A table and not a curve for
 * the reason src/lib/scoring.ts gives beside its copy: this is the one factor
 * whose formula would have to be evaluated identically in two engines, and
 * twelve written-down numbers cannot disagree.
 */
export const POOL_MULTIPLIERS = {
  1: 0.5,
  2: 0.64,
  3: 0.72,
  4: 0.78,
  5: 0.82,
  6: 0.86,
  7: 0.89,
  8: 0.92,
  9: 0.94,
  10: 0.96,
  11: 0.98,
  12: 1,
}

/**
 * The most one note can be worth: every factor at its hardest. Worked out from
 * the table rather than written down, so a span added later cannot leave a
 * stated ceiling that is no longer the ceiling.
 */
export const MAX_DIFFICULTY_MULTIPLIER =
  MIXED_SPELLING_MULTIPLIER *
  FRETBOARD_HIDDEN_MULTIPLIER *
  Math.max(...Object.values(BEAT_SPAN_MULTIPLIERS)) *
  TEMPO_MULTIPLIER_MAX

/**
 * The closest two judged notes may ever be: one beat per note at the highest
 * tempo the app supports. Not a function of the session's config — see the
 * module note.
 */
export const FASTEST_NOTE_INTERVAL_MS = Math.floor(60_000 / MAX_BPM)

/** A session nobody has posted to for this long is abandoned. */
export const SESSION_IDLE_MS = 10 * 60_000

/** And no session lives longer than this, however busy it is. */
export const SESSION_MAX_MS = 2 * 60 * 60_000

/** One request carries a batch, not a session: the wall clock has to pass. */
export const MAX_EVENTS_PER_BATCH = 20

/** A ceiling on one session's bookkeeping, well past any real practice run. */
export const MAX_SESSION_EVENTS = 5_000

/** The round trip, plus a device clock that is a little out. Not a licence. */
export const CLOCK_SKEW_MS = 2_000

/** The kinds of event a client may report. */
const EVENT_KINDS = new Set(['hit', 'miss', 'bonus', 'milestone'])

/** The bonuses it may report, and what each is worth. */
const BONUS_POINTS = { octaves: OCTAVES_BONUS_POINTS, tempo: TEMPO_BONUS_POINTS }

/** The streak bonus for landing the `streak`-th consecutive note. */
export const streakBonusPoints = (streak) =>
  streak < STREAK_BONUS_FROM
    ? 0
    : Math.min((streak - STREAK_BONUS_FROM + 1) * STREAK_BONUS_STEP, STREAK_BONUS_MAX)

/** A tempo the app's own slider can reach, and a span it offers. */
const isTempo = (bpm) => Number.isInteger(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM
const isSpan = (beatsPerNote) => BEAT_SPAN_OPTIONS.includes(beatsPerNote)

/**
 * A set of pitch classes somebody could actually have practised: at least one,
 * at most the octave, each of them a pitch class, and none of them twice. The
 * duplicate rule is not fussiness — a pool is priced by how many notes are in
 * it, and a list that repeats one is a list claiming to be bigger than it is.
 */
const isPool = (pool) =>
  Array.isArray(pool) &&
  pool.length > 0 &&
  pool.length <= PITCH_CLASS_COUNT &&
  pool.every((pc) => Number.isInteger(pc) && pc >= 0 && pc < PITCH_CLASS_COUNT) &&
  new Set(pool).size === pool.length

/** A span with no price of its own is neutral rather than free. */
const beatSpanMultiplier = (beatsPerNote) => BEAT_SPAN_MULTIPLIERS[beatsPerNote] ?? 1

/** The same for a pool size, counted distinct so a repeat is still one note. */
const poolMultiplier = (pool) => POOL_MULTIPLIERS[new Set(pool).size] ?? 1

/** Whether a spelling preference has anything to be a preference about here. */
const holdsAccidental = (pool) => pool.some((pc) => ACCIDENTAL_PITCH_CLASSES.includes(pc))

/** Nothing is owed for practising at or below the default tempo. */
const tempoMultiplier = (bpm) =>
  bpm <= DEFAULT_BPM
    ? 1
    : Math.min(TEMPO_MULTIPLIER_MAX, 1 + TEMPO_MULTIPLIER_GAIN * (Math.sqrt(bpm / DEFAULT_BPM) - 1))

/**
 * What every point earned on a note called under these settings is worth.
 * Character for character the same expression as `difficultyMultiplier` in
 * src/lib/scoring.ts; session-scoring.test.ts runs both over every combination
 * the app can produce and asserts they never differ, so a change to one that is
 * not a change to the other is a failing test rather than a board that
 * disagrees with the screen.
 */
export const difficultyMultiplier = ({ spelling, showFretboard, bpm, beatsPerNote, pool }) =>
  (spelling === 'mixed' && holdsAccidental(pool) ? MIXED_SPELLING_MULTIPLIER : SINGLE_SPELLING_MULTIPLIER) *
  (showFretboard ? FRETBOARD_SHOWN_MULTIPLIER : FRETBOARD_HIDDEN_MULTIPLIER) *
  beatSpanMultiplier(beatsPerNote) *
  tempoMultiplier(bpm) *
  poolMultiplier(pool)

/**
 * The settings one note was called under, or null if they are not settings this
 * app offers. Every field is required: a partial one would be priced by the
 * defaults of whatever was left out, which is a price nobody played at.
 */
export const validateDifficulty = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const { spelling, showFretboard, bpm, beatsPerNote, pool } = raw

  return SPELLING_OPTIONS.includes(spelling) &&
    typeof showFretboard === 'boolean' &&
    isTempo(bpm) &&
    isSpan(beatsPerNote) &&
    isPool(pool)
    ? { spelling, showFretboard, bpm, beatsPerNote, pool: [...pool] }
    : null
}

/**
 * What the note an event reports was called at: the declared price, or the flat
 * one when it declared none. Null means it declared something this app cannot
 * produce, which is a rejection rather than a fallback — see `validateDifficulty`.
 */
const notePrice = (raw) => {
  if (raw === undefined || raw === null) {
    return 1
  }

  const difficulty = validateDifficulty(raw)

  return difficulty === null ? null : difficultyMultiplier(difficulty)
}

/**
 * The config a session is fixed at, or null if it is not one this app offers.
 * Recorded and reported; it times nothing, and it prices nothing either — what
 * prices a note rides on the note, because the settings move under a session.
 */
export const validateConfig = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const { bpm, beatsPerNote } = raw

  return isTempo(bpm) && isSpan(beatsPerNote) ? { bpm, beatsPerNote } : null
}

/**
 * A fresh session, fixed at `config` from this moment. `lastNote` is the last
 * judged note — a bonus may only ever be claimed straight after a hit, and only
 * once per kind on it, which is what stops one lucky note being billed twice.
 */
export const createSessionState = (config, now) =>
  Object.freeze({
    config,
    startedAt: now,
    lastSeenAt: now,
    nextSeq: 0,
    points: 0,
    streak: 0,
    lastAt: -1,
    lastNote: null,
    /** Which practice milestones this session has already paid. Once each. */
    milestones: [],
    completed: false,
  })

/** Abandoned, or simply old. Either way it takes no more events. */
export const isSessionExpired = (session, now) =>
  now - session.lastSeenAt > SESSION_IDLE_MS || now - session.startedAt > SESSION_MAX_MS

/** After this nothing else lands on it; a replayed finish is worth nothing. */
export const completeSession = (session) => Object.freeze({ ...session, completed: true })

/** A field an event actually declared. Absent and null are the same thing. */
const carries = (event, field) => event[field] !== undefined && event[field] !== null

/** Whether one event is even the right shape to be judged. */
const isWellFormed = (event) => {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return false
  }

  if (!EVENT_KINDS.has(event.kind) || !Number.isInteger(event.seq) || !Number.isInteger(event.at)) {
    return false
  }

  if (event.at < 0 || event.at > SESSION_MAX_MS) {
    return false
  }

  // Every kind carries its own one extra field and none of the others'. Only a
  // hit is priced, because only a hit is worth something a difficulty could
  // scale: a miss pays nothing whatever it was called under, a bonus is paid at
  // the price of the note it landed on, and a milestone is not a note at all.
  if (carries(event, 'difficulty') && event.kind !== 'hit') {
    return false
  }

  if (carries(event, 'bonus') !== (event.kind === 'bonus')) {
    return false
  }

  if (carries(event, 'milestone') !== (event.kind === 'milestone')) {
    return false
  }

  if (event.kind === 'bonus') {
    return Object.hasOwn(BONUS_POINTS, event.bonus)
  }

  return event.kind !== 'milestone' || Object.hasOwn(PRACTICE_MILESTONES, event.milestone)
}

/**
 * Folds a batch of events into a session.
 *
 * All-or-nothing on purpose: everything below runs against a copy, and the copy
 * only becomes the session when the last event has passed. A batch with one bad
 * event in it changes nothing at all — not the points, not `nextSeq`, not
 * `lastSeenAt` — so a rejected request is not a way to walk a session forward
 * one accepted event at a time.
 */
export const applySessionEvents = (session, events, now) => {
  if (session.completed) {
    return { ok: false, reason: 'session_completed' }
  }

  if (isSessionExpired(session, now)) {
    return { ok: false, reason: 'session_expired' }
  }

  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, reason: 'invalid_event' }
  }

  if (events.length > MAX_EVENTS_PER_BATCH) {
    return { ok: false, reason: 'too_many' }
  }

  if (session.nextSeq + events.length > MAX_SESSION_EVENTS) {
    return { ok: false, reason: 'too_many' }
  }

  // The wall-clock ceiling: nothing may be stamped later than the session has
  // actually run for. This is what makes a scripted client wait rather than
  // post an afternoon's practice in one request.
  const ceiling = now - session.startedAt + CLOCK_SKEW_MS

  let { nextSeq, points, streak, lastAt, lastNote, milestones } = session
  const startingPoints = points

  for (const event of events) {
    if (!isWellFormed(event) || event.seq !== nextSeq || event.at < lastAt || event.at > ceiling) {
      return { ok: false, reason: 'invalid_event' }
    }

    if (event.kind === 'milestone') {
      // The session clock's own bonus. Spacing-exempt and note-blind: it leaves
      // `lastNote` exactly where it is, so a bonus that follows one still
      // belongs to the note it was earned on, and it never touches the streak.
      if (milestones.includes(event.milestone)) {
        return { ok: false, reason: 'invalid_event' }
      }

      const milestone = PRACTICE_MILESTONES[event.milestone]
      if (now - session.startedAt + MILESTONE_LEAD_MS < milestone.atMs) {
        return { ok: false, reason: 'too_soon' }
      }

      points += milestone.points
      milestones = [...milestones, event.milestone]
    } else if (event.kind === 'bonus') {
      // Spacing-exempt — a bonus is earned on a note, not between two — but only
      // ever on the note just hit, and only once per kind. Paid at the price
      // that note was called at, which is what src/lib/scoring.ts does with a
      // bonus discovered late: the window it belongs to froze the price, and a
      // click or an octave landing under it cannot re-price the note.
      if (lastNote === null || !lastNote.hit || lastNote.bonuses.includes(event.bonus)) {
        return { ok: false, reason: 'invalid_event' }
      }

      points += Math.round(BONUS_POINTS[event.bonus] * lastNote.multiplier)
      lastNote = { ...lastNote, bonuses: [...lastNote.bonuses, event.bonus] }
    } else {
      // Resolved before the spacing rule, so settings this app cannot produce
      // read as the malformed event they are rather than as a mistimed one.
      const multiplier = event.kind === 'hit' ? notePrice(event.difficulty) : 1
      if (multiplier === null) {
        return { ok: false, reason: 'invalid_event' }
      }

      if (lastNote !== null && event.at - lastNote.at < FASTEST_NOTE_INTERVAL_MS) {
        return { ok: false, reason: 'too_fast' }
      }

      if (event.kind === 'hit') {
        streak += 1
        // Each award rounded on its own, never the sum: `hitAward` and
        // `scaleBonus` in src/lib/scoring.ts round one at a time, and a total
        // rounded once would sit a point off the readout on every note whose
        // two halves both round the same way.
        points += Math.round(POINTS_PER_HIT * multiplier) + Math.round(streakBonusPoints(streak) * multiplier)
      } else {
        streak = 0
      }

      lastNote = { at: event.at, hit: event.kind === 'hit', bonuses: [], multiplier }
    }

    lastAt = event.at
    nextSeq += 1
  }

  return {
    ok: true,
    session: Object.freeze({
      ...session,
      lastSeenAt: now,
      nextSeq,
      points,
      streak,
      lastAt,
      lastNote,
      milestones,
    }),
    points,
    gained: points - startingPoints,
  }
}
