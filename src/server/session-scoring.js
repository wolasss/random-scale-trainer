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
 * For the same reason the config prices nothing. Every note is worth the same
 * here, so nobody can claim a hard setup they never practised under. The
 * readout on the player's own screen still prices what they played; the shared
 * board is deliberately the flatter of the two numbers.
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
 * The tempo range and the note spans the app offers, duplicated from
 * src/constants.ts the way the challenge-name rules already are. A config
 * outside these is *rejected* rather than clamped: a caller sending one is not
 * a player whose slider went too far, and silently accepting a number nobody
 * chose would make the recorded config a fiction.
 */
export const MIN_BPM = 30
export const MAX_BPM = 240
export const BEAT_SPAN_OPTIONS = [1, 2, 4, 8, 12]

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
const EVENT_KINDS = new Set(['hit', 'miss', 'bonus'])

/** The bonuses it may report, and what each is worth. */
const BONUS_POINTS = { octaves: OCTAVES_BONUS_POINTS, tempo: TEMPO_BONUS_POINTS }

/** The streak bonus for landing the `streak`-th consecutive note. */
export const streakBonusPoints = (streak) =>
  streak < STREAK_BONUS_FROM
    ? 0
    : Math.min((streak - STREAK_BONUS_FROM + 1) * STREAK_BONUS_STEP, STREAK_BONUS_MAX)

/**
 * The config a session is fixed at, or null if it is not one this app offers.
 * Recorded and reported; it prices nothing and times nothing.
 */
export const validateConfig = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const { bpm, beatsPerNote } = raw
  if (!Number.isInteger(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
    return null
  }

  if (!BEAT_SPAN_OPTIONS.includes(beatsPerNote)) {
    return null
  }

  return { bpm, beatsPerNote }
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
    completed: false,
  })

/** Abandoned, or simply old. Either way it takes no more events. */
export const isSessionExpired = (session, now) =>
  now - session.lastSeenAt > SESSION_IDLE_MS || now - session.startedAt > SESSION_MAX_MS

/** After this nothing else lands on it; a replayed finish is worth nothing. */
export const completeSession = (session) => Object.freeze({ ...session, completed: true })

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

  return event.kind === 'bonus'
    ? Object.hasOwn(BONUS_POINTS, event.bonus)
    : event.bonus === undefined || event.bonus === null
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

  let { nextSeq, points, streak, lastAt, lastNote } = session
  const startingPoints = points

  for (const event of events) {
    if (!isWellFormed(event) || event.seq !== nextSeq || event.at < lastAt || event.at > ceiling) {
      return { ok: false, reason: 'invalid_event' }
    }

    if (event.kind === 'bonus') {
      // Spacing-exempt — a bonus is earned on a note, not between two — but only
      // ever on the note just hit, and only once per kind.
      if (lastNote === null || !lastNote.hit || lastNote.bonuses.includes(event.bonus)) {
        return { ok: false, reason: 'invalid_event' }
      }

      points += BONUS_POINTS[event.bonus]
      lastNote = { ...lastNote, bonuses: [...lastNote.bonuses, event.bonus] }
    } else {
      if (lastNote !== null && event.at - lastNote.at < FASTEST_NOTE_INTERVAL_MS) {
        return { ok: false, reason: 'too_fast' }
      }

      if (event.kind === 'hit') {
        streak += 1
        points += POINTS_PER_HIT + streakBonusPoints(streak)
      } else {
        streak = 0
      }

      lastNote = { at: event.at, hit: event.kind === 'hit', bonuses: [] }
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
    }),
    points,
    gained: points - startingPoints,
  }
}
