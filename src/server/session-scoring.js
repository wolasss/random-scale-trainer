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
/** @type {Record<number, number>} */
export const BEAT_SPAN_MULTIPLIERS = { 1: 1.4, 2: 1.2, 4: 1, 8: 0.85, 12: 0.75 }
export const TEMPO_MULTIPLIER_GAIN = 0.5
export const TEMPO_MULTIPLIER_MAX = 1.4

/**
 * How much of the octave was in play, by pool size. A table and not a curve for
 * the reason src/lib/scoring.ts gives beside its copy: this is the one factor
 * whose formula would have to be evaluated identically in two engines, and
 * twelve written-down numbers cannot disagree.
 */
/** @type {Record<number, number>} */
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

/**
 * The other end of the same ruler: the longest the app can possibly leave
 * between two called notes — the widest span at the lowest tempo. Like the
 * fastest interval it is derived from the app's own limits and not from
 * anything a session declared, so nothing a client sends can stretch it.
 */
export const SLOWEST_NOTE_INTERVAL_MS = Math.max(...BEAT_SPAN_OPTIONS) * Math.floor(60_000 / MIN_BPM)

/**
 * The fewest judged notes a session can honestly have seen by each milestone.
 *
 * A milestone is what staying in the chair is worth, and the wall-clock check
 * above (`MILESTONE_LEAD_MS`) only proves the *session* is old enough — a
 * session left open with nothing played in it gets old for free, and an idle
 * scripted client could otherwise bank all three milestones without reporting
 * a single note. But practice time only accrues while playback runs, and
 * playback calls a note at least every `SLOWEST_NOTE_INTERVAL_MS` — every one
 * of them judged as a hit or a miss — so N minutes of practice cannot have
 * produced fewer judged notes than the slowest pace would. The lead is
 * subtracted first, same generosity about the boundary as the clock check: a
 * missing note or two at the edge refuses nobody honest, and an idle session
 * has nothing like the floor.
 */
export const MILESTONE_MIN_JUDGED_NOTES = Object.fromEntries(
  Object.entries(PRACTICE_MILESTONES).map(([kind, { atMs }]) => [
    kind,
    Math.floor((atMs - MILESTONE_LEAD_MS) / SLOWEST_NOTE_INTERVAL_MS),
  ]),
)

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

/**
 * The streak bonus for landing the `streak`-th consecutive note.
 *
 * @param {number} streak
 */
export const streakBonusPoints = (streak) =>
  streak < STREAK_BONUS_FROM
    ? 0
    : Math.min((streak - STREAK_BONUS_FROM + 1) * STREAK_BONUS_STEP, STREAK_BONUS_MAX)

/**
 * A tempo the app's own slider can reach, and a span it offers.
 *
 * @param {unknown} bpm
 * @returns {bpm is number}
 */
const isTempo = (bpm) => typeof bpm === 'number' && Number.isInteger(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM
/**
 * @param {unknown} beatsPerNote
 * @returns {beatsPerNote is number}
 */
const isSpan = (beatsPerNote) => typeof beatsPerNote === 'number' && BEAT_SPAN_OPTIONS.includes(beatsPerNote)

/**
 * @param {unknown} spelling
 * @returns {spelling is import('./session-scoring.js').SessionDifficulty['spelling']}
 */
const isSpelling = (spelling) => typeof spelling === 'string' && SPELLING_OPTIONS.includes(spelling)

/**
 * A set of pitch classes somebody could actually have practised: at least one,
 * at most the octave, each of them a pitch class, and none of them twice. The
 * duplicate rule is not fussiness — a pool is priced by how many notes are in
 * it, and a list that repeats one is a list claiming to be bigger than it is.
 *
 * @param {unknown} pool
 * @returns {pool is number[]}
 */
const isPool = (pool) =>
  Array.isArray(pool) &&
  pool.length > 0 &&
  pool.length <= PITCH_CLASS_COUNT &&
  pool.every((pc) => Number.isInteger(pc) && pc >= 0 && pc < PITCH_CLASS_COUNT) &&
  new Set(pool).size === pool.length

/**
 * A span with no price of its own is neutral rather than free.
 *
 * @param {number} beatsPerNote
 */
const beatSpanMultiplier = (beatsPerNote) => BEAT_SPAN_MULTIPLIERS[beatsPerNote] ?? 1

/**
 * The same for a pool size, counted distinct so a repeat is still one note.
 *
 * @param {readonly number[]} pool
 */
const poolMultiplier = (pool) => POOL_MULTIPLIERS[new Set(pool).size] ?? 1

/**
 * Whether a spelling preference has anything to be a preference about here.
 *
 * @param {readonly number[]} pool
 */
const holdsAccidental = (pool) => pool.some((pc) => ACCIDENTAL_PITCH_CLASSES.includes(pc))

/**
 * Nothing is owed for practising at or below the default tempo.
 *
 * @param {number} bpm
 */
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
 *
 * @param {import('./session-scoring.js').SessionDifficulty} difficulty
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
 *
 * @param {unknown} raw
 */
export const validateDifficulty = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const { spelling, showFretboard, bpm, beatsPerNote, pool } = /** @type {Record<string, unknown>} */ (raw)

  return isSpelling(spelling) &&
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
/** @param {unknown} raw */
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
/** @param {unknown} raw */
export const validateConfig = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const { bpm, beatsPerNote } = /** @type {Record<string, unknown>} */ (raw)

  return isTempo(bpm) && isSpan(beatsPerNote) ? { bpm, beatsPerNote } : null
}

/**
 * A fresh session, fixed at `config` from this moment. `lastNote` is the last
 * judged note — a bonus may only ever be claimed straight after a hit, and only
 * once per kind on it, which is what stops one lucky note being billed twice.
 *
 * @param {import('./session-scoring.js').SessionConfig} config
 * @param {number} now
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
    /** Hits and misses together — what the milestone floor counts. */
    judgedNotes: 0,
    /** Which practice milestones this session has already paid. Once each. */
    milestones: [],
    completed: false,
  })

/**
 * Abandoned, or simply old. Either way it takes no more events.
 *
 * @param {import('./session-scoring.js').SessionState} session
 * @param {number} now
 */
export const isSessionExpired = (session, now) =>
  now - session.lastSeenAt > SESSION_IDLE_MS || now - session.startedAt > SESSION_MAX_MS

/**
 * After this nothing else lands on it; a replayed finish is worth nothing.
 *
 * @param {import('./session-scoring.js').SessionState} session
 */
export const completeSession = (session) => Object.freeze({ ...session, completed: true })

/**
 * A field an event actually declared. Absent and null are the same thing.
 *
 * @param {Record<string, unknown>} event
 * @param {string} field
 */
const carries = (event, field) => event[field] !== undefined && event[field] !== null

/**
 * Whether one event is even the right shape to be judged.
 *
 * @param {unknown} event
 * @returns {event is import('./session-scoring.js').SessionEvent}
 */
const isWellFormed = (event) => {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return false
  }

  const record =
    /** @type {{ kind: string, seq: number, at: number, bonus?: unknown, milestone?: unknown, difficulty?: unknown }} */ (
      event
    )

  if (!EVENT_KINDS.has(record.kind) || !Number.isInteger(record.seq) || !Number.isInteger(record.at)) {
    return false
  }

  if (record.at < 0 || record.at > SESSION_MAX_MS) {
    return false
  }

  // Every kind carries its own one extra field and none of the others'. Only a
  // hit is priced, because only a hit is worth something a difficulty could
  // scale: a miss pays nothing whatever it was called under, a bonus is paid at
  // the price of the note it landed on, and a milestone is not a note at all.
  if (carries(record, 'difficulty') && record.kind !== 'hit') {
    return false
  }

  if (carries(record, 'bonus') !== (record.kind === 'bonus')) {
    return false
  }

  if (carries(record, 'milestone') !== (record.kind === 'milestone')) {
    return false
  }

  if (record.kind === 'bonus') {
    return Object.hasOwn(BONUS_POINTS, /** @type {string} */ (record.bonus))
  }

  return record.kind !== 'milestone' || Object.hasOwn(PRACTICE_MILESTONES, /** @type {string} */ (record.milestone))
}

/**
 * Folds a batch of events into a session.
 *
 * All-or-nothing on purpose: everything below runs against a copy, and the copy
 * only becomes the session when the last event has passed. A batch with one bad
 * event in it changes nothing at all — not the points, not `nextSeq`, not
 * `lastSeenAt` — so a rejected request is not a way to walk a session forward
 * one accepted event at a time.
 *
 * @param {import('./session-scoring.js').SessionState} session
 * @param {unknown} events
 * @param {number} now
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

  let { nextSeq, points, streak, lastAt, lastNote, milestones, judgedNotes } = session
  const startingPoints = points

  for (const event of events) {
    if (!isWellFormed(event) || event.seq !== nextSeq || event.at < lastAt || event.at > ceiling) {
      return { ok: false, reason: 'invalid_event' }
    }

    if (event.kind === 'milestone') {
      // The session clock's own bonus. Spacing-exempt and note-blind: it leaves
      // `lastNote` exactly where it is, so a bonus that follows one still
      // belongs to the note it was earned on, and it never touches the streak.
      const milestoneKind = /** @type {import('./session-scoring.js').PracticeMilestoneKind} */ (event.milestone)
      if (milestones.includes(milestoneKind)) {
        return { ok: false, reason: 'invalid_event' }
      }

      const milestone = PRACTICE_MILESTONES[milestoneKind]
      if (now - session.startedAt + MILESTONE_LEAD_MS < milestone.atMs) {
        return { ok: false, reason: 'too_soon' }
      }

      // The clock proves the session is old enough; the notes prove somebody
      // was in it. A session idled to the threshold has judged nothing and
      // earns nothing — see MILESTONE_MIN_JUDGED_NOTES.
      if (judgedNotes < MILESTONE_MIN_JUDGED_NOTES[milestoneKind]) {
        return { ok: false, reason: 'too_soon' }
      }

      points += milestone.points
      milestones = [...milestones, milestoneKind]
    } else if (event.kind === 'bonus') {
      // Spacing-exempt — a bonus is earned on a note, not between two — but only
      // ever on the note just hit, and only once per kind. Paid at the price
      // that note was called at, which is what src/lib/scoring.ts does with a
      // bonus discovered late: the window it belongs to froze the price, and a
      // click or an octave landing under it cannot re-price the note.
      const bonusKind = /** @type {'octaves' | 'tempo'} */ (event.bonus)
      if (lastNote === null || !lastNote.hit || lastNote.bonuses.includes(bonusKind)) {
        return { ok: false, reason: 'invalid_event' }
      }

      points += Math.round(BONUS_POINTS[bonusKind] * lastNote.multiplier)
      lastNote = { ...lastNote, bonuses: [...lastNote.bonuses, bonusKind] }
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
      judgedNotes += 1
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
      judgedNotes,
    }),
    points,
    gained: points - startingPoints,
  }
}
