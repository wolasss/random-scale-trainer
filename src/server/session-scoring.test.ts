// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  applySessionEvents,
  BEAT_SPAN_OPTIONS,
  CLOCK_SKEW_MS,
  completeSession,
  createSessionState,
  FASTEST_NOTE_INTERVAL_MS,
  isSessionExpired,
  MAX_BPM,
  MAX_EVENTS_PER_BATCH,
  MAX_SESSION_EVENTS,
  MIN_BPM,
  OCTAVES_BONUS_POINTS,
  POINTS_PER_HIT,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  STREAK_BONUS_FROM,
  STREAK_BONUS_MAX,
  STREAK_BONUS_STEP,
  streakBonusPoints,
  TEMPO_BONUS_POINTS,
  validateConfig,
  type SessionEvent,
  type SessionState,
} from './session-scoring.js'
import * as clientScoring from '../lib/scoring'
import { BEAT_SPAN_OPTIONS as CLIENT_SPANS, MAX_BPM as CLIENT_MAX_BPM, MIN_BPM as CLIENT_MIN_BPM } from '../constants'

const CONFIG = { bpm: 72, beatsPerNote: 4 }
const START = 1_000_000

const session = () => createSessionState(CONFIG, START)

/** A batch, spaced at exactly the fastest the app can call notes. */
const notes = (kinds: Array<'hit' | 'miss'>, from = 0): SessionEvent[] =>
  kinds.map((kind, index) => ({ seq: from + index, kind, at: (from + index) * FASTEST_NOTE_INTERVAL_MS }))

/** `now` far enough ahead that the wall clock is never what refuses a batch. */
const later = (events: SessionEvent[]) => START + events[events.length - 1].at + 1

const apply = (state: SessionState, events: SessionEvent[], now = later(events)) =>
  applySessionEvents(state, events, now)

describe('the point rules the server owns', () => {
  /**
   * The server cannot import src/lib/scoring.ts — it is plain JS the container
   * runs with bare node — so the constants are duplicated. A drift here is a
   * board that disagrees with the readout on the player's own screen, so it is
   * a failing test rather than a surprise.
   */
  it('prices a note exactly as the client library does', () => {
    expect(POINTS_PER_HIT).toBe(clientScoring.POINTS_PER_HIT)
    expect(STREAK_BONUS_FROM).toBe(clientScoring.STREAK_BONUS_FROM)
    expect(STREAK_BONUS_STEP).toBe(clientScoring.STREAK_BONUS_STEP)
    expect(STREAK_BONUS_MAX).toBe(clientScoring.STREAK_BONUS_MAX)
    expect(OCTAVES_BONUS_POINTS).toBe(clientScoring.OCTAVES_BONUS_POINTS)
    expect(TEMPO_BONUS_POINTS).toBe(clientScoring.TEMPO_BONUS_POINTS)
  })

  it('knows the same tempo range and note spans the app offers', () => {
    expect(MIN_BPM).toBe(CLIENT_MIN_BPM)
    expect(MAX_BPM).toBe(CLIENT_MAX_BPM)
    expect(BEAT_SPAN_OPTIONS).toEqual([...CLIENT_SPANS])
  })

  it('runs the same streak rule', () => {
    for (let streak = 0; streak <= 12; streak += 1) {
      expect(streakBonusPoints(streak)).toBe(clientScoring.streakBonus(streak)?.points ?? 0)
    }
  })

  /** The spacing bound is the app's own ceiling, not anything a client declares. */
  it('derives the note interval from the fastest the app can call one', () => {
    expect(FASTEST_NOTE_INTERVAL_MS).toBe(Math.floor(60_000 / CLIENT_MAX_BPM))
  })
})

describe('validateConfig', () => {
  it('takes the settings the app actually offers', () => {
    for (const beatsPerNote of BEAT_SPAN_OPTIONS) {
      expect(validateConfig({ bpm: 120, beatsPerNote })).toEqual({ bpm: 120, beatsPerNote })
    }
  })

  /** Rejected, never clamped: a number nobody chose must not be recorded as one. */
  it('refuses anything outside them rather than clamping it', () => {
    for (const raw of [
      null,
      'nope',
      [],
      {},
      { bpm: 120 },
      { bpm: MIN_BPM - 1, beatsPerNote: 4 },
      { bpm: MAX_BPM + 1, beatsPerNote: 4 },
      { bpm: 72.5, beatsPerNote: 4 },
      { bpm: '120', beatsPerNote: 4 },
      { bpm: 120, beatsPerNote: 3 },
      { bpm: 120, beatsPerNote: '4' },
    ]) {
      expect(validateConfig(raw)).toBeNull()
    }
  })
})

describe('applySessionEvents', () => {
  it('adds a hit up, streak bonus included, and hands back the running total', () => {
    const result = apply(session(), notes(['hit', 'hit', 'hit']))

    expect(result.ok).toBe(true)
    // Three hits, and the third is the first that earns a streak bonus.
    expect(result.ok && result.points).toBe(POINTS_PER_HIT * 3 + STREAK_BONUS_STEP)
  })

  it('ends the run on a miss without taking points away', () => {
    const first = apply(session(), notes(['hit', 'hit', 'hit']))
    const after = first.ok ? apply(first.session, notes(['miss', 'hit'], 3)) : first

    expect(after.ok && after.points).toBe(POINTS_PER_HIT * 4 + STREAK_BONUS_STEP)
    expect(after.ok && after.session.streak).toBe(1)
  })

  it('pays a bonus only on the note just hit, and only once per kind', () => {
    const hit = apply(session(), notes(['hit']))
    expect(hit.ok).toBe(true)
    if (!hit.ok) {
      return
    }

    const bonus = apply(hit.session, [{ seq: 1, kind: 'bonus', bonus: 'octaves', at: 10 }], START + 20)
    expect(bonus.ok && bonus.points).toBe(POINTS_PER_HIT + OCTAVES_BONUS_POINTS)
    if (!bonus.ok) {
      return
    }

    // The same kind again on the same note earns nothing and is refused.
    expect(apply(bonus.session, [{ seq: 2, kind: 'bonus', bonus: 'octaves', at: 11 }], START + 20)).toEqual({
      ok: false,
      reason: 'invalid_event',
    })
  })

  it('refuses a bonus that follows a miss, or that follows nothing at all', () => {
    expect(apply(session(), [{ seq: 0, kind: 'bonus', bonus: 'tempo', at: 0 }], START + 10)).toEqual({
      ok: false,
      reason: 'invalid_event',
    })

    const missed = apply(session(), notes(['miss']))
    expect(missed.ok).toBe(true)
    if (missed.ok) {
      expect(apply(missed.session, [{ seq: 1, kind: 'bonus', bonus: 'tempo', at: 10 }], START + 20)).toEqual({
        ok: false,
        reason: 'invalid_event',
      })
    }
  })

  /** The whole point of the exercise: no arbitrary total in one request. */
  it('will not take a thousand notes in one breath', () => {
    const burst: SessionEvent[] = Array.from({ length: MAX_EVENTS_PER_BATCH }, (_, index) => ({
      seq: index,
      kind: 'hit',
      at: index,
    }))

    expect(apply(session(), burst, START + 50)).toEqual({ ok: false, reason: 'too_fast' })
  })

  it('refuses an event stamped later than the session has actually run', () => {
    // An hour of practice claimed one second in: `at` runs ahead of the clock.
    expect(
      apply(session(), [{ seq: 0, kind: 'hit', at: 60 * 60_000 }], START + 1_000),
    ).toEqual({ ok: false, reason: 'invalid_event' })
  })

  it('allows the round trip and a slightly wrong device clock, and no more', () => {
    const one: SessionEvent[] = [{ seq: 0, kind: 'hit', at: CLOCK_SKEW_MS }]

    expect(apply(session(), one, START).ok).toBe(true)
    expect(apply(session(), [{ seq: 0, kind: 'hit', at: CLOCK_SKEW_MS + 1 }], START)).toEqual({
      ok: false,
      reason: 'invalid_event',
    })
  })

  it('refuses a replay: seq has to be exactly the next one', () => {
    const first = apply(session(), notes(['hit', 'hit']))
    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    // The very batch that just landed, sent again.
    expect(apply(first.session, notes(['hit', 'hit']))).toEqual({ ok: false, reason: 'invalid_event' })
    expect(first.session.points).toBe(POINTS_PER_HIT * 2)
  })

  it('refuses an out-of-order or skipped batch on the same test', () => {
    expect(apply(session(), notes(['hit'], 1))).toEqual({ ok: false, reason: 'invalid_event' })
    expect(
      apply(session(), [
        { seq: 1, kind: 'hit', at: FASTEST_NOTE_INTERVAL_MS },
        { seq: 0, kind: 'hit', at: 0 },
      ]),
    ).toEqual({ ok: false, reason: 'invalid_event' })
  })

  it('refuses time running backwards inside a batch', () => {
    expect(
      apply(session(), [
        { seq: 0, kind: 'hit', at: FASTEST_NOTE_INTERVAL_MS * 2 },
        { seq: 1, kind: 'hit', at: 0 },
      ]),
    ).toEqual({ ok: false, reason: 'invalid_event' })
  })

  /**
   * All-or-nothing. Otherwise a rejected batch would be a way to walk a session
   * forward one accepted event at a time, and to probe for what lands.
   */
  it('changes nothing at all when one event in a batch is bad', () => {
    const state = session()
    const result = apply(state, [
      { seq: 0, kind: 'hit', at: 0 },
      { seq: 1, kind: 'hit', at: FASTEST_NOTE_INTERVAL_MS },
      { seq: 2, kind: 'nonsense' as 'hit', at: FASTEST_NOTE_INTERVAL_MS * 2 },
    ])

    expect(result).toEqual({ ok: false, reason: 'invalid_event' })
    expect(state.points).toBe(0)
    expect(state.nextSeq).toBe(0)
    expect(state.lastSeenAt).toBe(START)
  })

  it('refuses a batch bigger than one request may carry', () => {
    const big = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, (_, index): SessionEvent => ({
      seq: index,
      kind: 'hit',
      at: index * FASTEST_NOTE_INTERVAL_MS,
    }))

    expect(apply(session(), big)).toEqual({ ok: false, reason: 'too_many' })
  })

  it('refuses a batch that would run past the session event ceiling', () => {
    const nearly = { ...session(), nextSeq: MAX_SESSION_EVENTS - 1 }

    expect(applySessionEvents(nearly, notes(['hit', 'hit'], MAX_SESSION_EVENTS - 1), START + 10_000)).toEqual({
      ok: false,
      reason: 'too_many',
    })
  })

  it('refuses an empty batch and a body that is not a list of events', () => {
    for (const events of [[], null, 'events', { seq: 0 }]) {
      expect(applySessionEvents(session(), events, START + 10)).toEqual({ ok: false, reason: 'invalid_event' })
    }
  })

  it('refuses everything once the session is finished', () => {
    expect(apply(completeSession(session()), notes(['hit']))).toEqual({ ok: false, reason: 'session_completed' })
  })

  it('refuses everything once the session is abandoned or simply old', () => {
    expect(applySessionEvents(session(), notes(['hit']), START + SESSION_IDLE_MS + 1)).toEqual({
      ok: false,
      reason: 'session_expired',
    })

    const busy = { ...session(), lastSeenAt: START + SESSION_MAX_MS }
    expect(applySessionEvents(busy, notes(['hit']), START + SESSION_MAX_MS + 1)).toEqual({
      ok: false,
      reason: 'session_expired',
    })
  })
})

describe('isSessionExpired', () => {
  it('is false while the session is being used and young', () => {
    expect(isSessionExpired(session(), START + SESSION_IDLE_MS)).toBe(false)
  })

  it('is true once nobody has posted for the idle window', () => {
    expect(isSessionExpired(session(), START + SESSION_IDLE_MS + 1)).toBe(true)
  })
})
