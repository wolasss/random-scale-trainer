// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ACCIDENTAL_PITCH_CLASSES,
  applySessionEvents,
  BEAT_SPAN_MULTIPLIERS,
  BEAT_SPAN_OPTIONS,
  CLOCK_SKEW_MS,
  DEFAULT_BPM,
  difficultyMultiplier,
  FRETBOARD_HIDDEN_MULTIPLIER,
  FRETBOARD_SHOWN_MULTIPLIER,
  MAX_DIFFICULTY_MULTIPLIER,
  MILESTONE_LEAD_MS,
  MIXED_SPELLING_MULTIPLIER,
  PITCH_CLASS_COUNT,
  POOL_MULTIPLIERS,
  PRACTICE_MILESTONES,
  SINGLE_SPELLING_MULTIPLIER,
  SPELLING_OPTIONS,
  TEMPO_MULTIPLIER_GAIN,
  TEMPO_MULTIPLIER_MAX,
  validateDifficulty,
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
  type SessionDifficulty,
  type SessionEvent,
  type SessionState,
} from './session-scoring.js'
import * as clientScoring from '../lib/scoring'
import {
  BEAT_SPAN_OPTIONS as CLIENT_SPANS,
  DEFAULT_BPM as CLIENT_DEFAULT_BPM,
  MAX_BPM as CLIENT_MAX_BPM,
  MIN_BPM as CLIENT_MIN_BPM,
} from '../constants'
import { isNaturalPitchClass, PITCH_CLASSES, SPELLING_OPTIONS as CLIENT_SPELLINGS } from '../lib/notes'

/** The pools a player can actually build, from the whole octave down to one note. */
const NATURALS = PITCH_CLASSES.filter((pc) => isNaturalPitchClass(pc))
const ACCIDENTALS = PITCH_CLASSES.filter((pc) => !isNaturalPitchClass(pc))
const EVERY_POOL: number[][] = [
  [...PITCH_CLASSES],
  NATURALS,
  ACCIDENTALS,
  [0],
  [1],
  [0, 1],
  [0, 2, 4, 5],
  PITCH_CLASSES.slice(0, 9),
]

/**
 * Every setup the app can put a note in front of somebody under: both ends of
 * the tempo range and a spread through it, crossed with every spelling, both
 * fretboard states, every span and a spread of pools. This is what the parity
 * tests below run over, so "the same arithmetic" means the same on all of it
 * rather than on one example.
 */
const EVERY_DIFFICULTY: SessionDifficulty[] = CLIENT_SPELLINGS.flatMap((spelling) =>
  [false, true].flatMap((showFretboard) =>
    [...CLIENT_SPANS].flatMap((beatsPerNote) =>
      [CLIENT_MIN_BPM, 60, 71, 72, 73, 95, 120, 144, 180, CLIENT_MAX_BPM].flatMap((bpm) =>
        EVERY_POOL.map((pool) => ({ spelling, showFretboard, bpm, beatsPerNote, pool })),
      ),
    ),
  ),
)

/** The whole octave, which is the pool that prices nothing up or down. */
const WHOLE_OCTAVE = [...PITCH_CLASSES]

const CONFIG = { bpm: 72, beatsPerNote: 4 }
const START = 1_000_000

const session = () => createSessionState(CONFIG, START)

/** A batch, spaced at exactly the fastest the app can call notes. */
const notes = (kinds: Array<'hit' | 'miss'>, from = 0): SessionEvent[] =>
  kinds.map((kind, index) => ({ seq: from + index, kind, at: (from + index) * FASTEST_NOTE_INTERVAL_MS }))

/** The same, with a price declared on every hit — what the app actually sends. */
const pricedNotes = (kinds: Array<'hit' | 'miss'>, difficulty: SessionDifficulty, from = 0): SessionEvent[] =>
  notes(kinds, from).map((event) => (event.kind === 'hit' ? { ...event, difficulty } : event))

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

  it('knows the same tempo range, note spans and spellings the app offers', () => {
    expect(MIN_BPM).toBe(CLIENT_MIN_BPM)
    expect(MAX_BPM).toBe(CLIENT_MAX_BPM)
    expect(DEFAULT_BPM).toBe(CLIENT_DEFAULT_BPM)
    expect(BEAT_SPAN_OPTIONS).toEqual([...CLIENT_SPANS])
    expect([...SPELLING_OPTIONS].sort()).toEqual([...CLIENT_SPELLINGS].sort())
  })

  it('knows the same milestones the app credits', () => {
    expect(Object.entries(PRACTICE_MILESTONES).map(([kind, { atMs, points }]) => ({ kind, atMs, points }))).toEqual(
      clientScoring.PRACTICE_MILESTONES.map(({ kind, atMs, points }) => ({ kind, atMs, points })),
    )
  })

  it('knows which pitch classes have two names', () => {
    expect(ACCIDENTAL_PITCH_CLASSES).toEqual(PITCH_CLASSES.filter((pc) => !isNaturalPitchClass(pc)))
    expect(PITCH_CLASS_COUNT).toBe(PITCH_CLASSES.length)
  })

  it('prices difficulty off the same factors', () => {
    expect(MIXED_SPELLING_MULTIPLIER).toBe(clientScoring.MIXED_SPELLING_MULTIPLIER)
    expect(SINGLE_SPELLING_MULTIPLIER).toBe(clientScoring.SINGLE_SPELLING_MULTIPLIER)
    expect(FRETBOARD_HIDDEN_MULTIPLIER).toBe(clientScoring.FRETBOARD_HIDDEN_MULTIPLIER)
    expect(FRETBOARD_SHOWN_MULTIPLIER).toBe(clientScoring.FRETBOARD_SHOWN_MULTIPLIER)
    expect(TEMPO_MULTIPLIER_GAIN).toBe(clientScoring.TEMPO_MULTIPLIER_GAIN)
    expect(TEMPO_MULTIPLIER_MAX).toBe(clientScoring.TEMPO_MULTIPLIER_MAX)
    for (const span of CLIENT_SPANS) {
      expect(BEAT_SPAN_MULTIPLIERS[span]).toBe(clientScoring.BEAT_SPAN_MULTIPLIERS[span])
    }

    // Written down rather than worked out, so the two tables have to agree
    // entry for entry — which is the point of writing them down.
    expect(POOL_MULTIPLIERS).toEqual(clientScoring.POOL_MULTIPLIERS)
    for (let size = 1; size <= PITCH_CLASS_COUNT; size += 1) {
      expect(POOL_MULTIPLIERS[size]).toBeGreaterThan(0)
      expect(POOL_MULTIPLIERS[size]).toBeLessThanOrEqual(1)
      if (size > 1) {
        expect(POOL_MULTIPLIERS[size]).toBeGreaterThan(POOL_MULTIPLIERS[size - 1])
      }
    }
  })

  /**
   * The one that matters: not "close to", but the same double. Every award is
   * rounded to whole points, so a multiplier a hair off the client's would show
   * up as a board a point out on some notes and level on others — the hardest
   * kind of disagreement to notice and the easiest to argue about.
   */
  it('works out the very same multiplier as the client, on every setup the app offers', () => {
    for (const difficulty of EVERY_DIFFICULTY) {
      expect(difficultyMultiplier(difficulty)).toBe(clientScoring.difficultyMultiplier(difficulty))
    }
  })

  /** And rounds each award the same way at that multiplier, which is where whole points are decided. */
  it('rounds a hit and a bonus to the same whole points as the client', () => {
    for (const difficulty of EVERY_DIFFICULTY) {
      const multiplier = difficultyMultiplier(difficulty)
      expect(Math.round(POINTS_PER_HIT * multiplier)).toBe(clientScoring.hitAward(multiplier))

      for (const points of [OCTAVES_BONUS_POINTS, TEMPO_BONUS_POINTS, STREAK_BONUS_STEP, STREAK_BONUS_MAX]) {
        expect(Math.round(points * multiplier)).toBe(
          clientScoring.scaleBonus({ kind: 'tempo', points }, multiplier).points,
        )
      }
    }
  })

  /** What a lie is worth, stated as a number so a factor added later has to face it. */
  it('bounds one note at the hardest setup the app offers', () => {
    expect(MAX_DIFFICULTY_MULTIPLIER).toBeCloseTo(1.15 * 1.2 * 1.4 * 1.4, 10)
    for (const difficulty of EVERY_DIFFICULTY) {
      expect(difficultyMultiplier(difficulty)).toBeLessThanOrEqual(MAX_DIFFICULTY_MULTIPLIER)
    }
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

describe('validateDifficulty', () => {
  it('takes every setup the app can call a note under', () => {
    for (const difficulty of EVERY_DIFFICULTY) {
      expect(validateDifficulty(difficulty)).toEqual(difficulty)
    }
  })

  /**
   * Rejected, never clamped, and never filled in from a default: a note priced
   * by settings half of which nobody chose is priced at nothing anybody played.
   */
  it('refuses anything else, including a half-declared one', () => {
    const whole = { spelling: 'mixed', showFretboard: false, bpm: 120, beatsPerNote: 4, pool: WHOLE_OCTAVE }

    for (const raw of [
      null,
      'nope',
      [],
      {},
      { ...whole, spelling: undefined },
      { ...whole, showFretboard: undefined },
      { ...whole, bpm: undefined },
      { ...whole, beatsPerNote: undefined },
      { ...whole, spelling: 'naturals' },
      { ...whole, showFretboard: 'false' },
      { ...whole, bpm: MAX_BPM + 1 },
      { ...whole, bpm: MIN_BPM - 1 },
      { ...whole, bpm: 120.5 },
      { ...whole, beatsPerNote: 3 },
    ]) {
      expect(validateDifficulty(raw)).toBeNull()
    }
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

  /**
   * The whole of the difficulty rule, in one session: a hit is worth what its
   * own note was called under, each award rounded on its own.
   */
  it('prices a hit and its streak bonus by what the note was called under', () => {
    const difficulty: SessionDifficulty = { spelling: 'mixed', showFretboard: false, bpm: 95, beatsPerNote: 4, pool: WHOLE_OCTAVE }
    const multiplier = difficultyMultiplier(difficulty)
    const result = apply(session(), pricedNotes(['hit', 'hit', 'hit'], difficulty))

    expect(multiplier).toBeCloseTo(1.4826, 4)
    expect(result.ok && result.points).toBe(
      Math.round(POINTS_PER_HIT * multiplier) * 3 + Math.round(STREAK_BONUS_STEP * multiplier),
    )
    // And that is more than the same three notes played at the flat rate.
    expect(result.ok && result.points).toBeGreaterThan(POINTS_PER_HIT * 3 + STREAK_BONUS_STEP)
  })

  /** A hit that declares nothing is the flat rate, exactly as the client prices one. */
  it('prices a hit that declares no settings flat', () => {
    const result = apply(session(), notes(['hit']))

    expect(result.ok && result.points).toBe(POINTS_PER_HIT)
  })

  /**
   * A speed ramp, a routine block, a hand on the tempo: the settings move under
   * a session, and each note keeps the price it was called at. This is the case
   * a session-wide config could not have got right.
   */
  it('prices each note at its own settings when they move mid-session', () => {
    const slow: SessionDifficulty = { spelling: 'sharp', showFretboard: true, bpm: 72, beatsPerNote: 4, pool: WHOLE_OCTAVE }
    const fast: SessionDifficulty = { spelling: 'sharp', showFretboard: true, bpm: 180, beatsPerNote: 4, pool: WHOLE_OCTAVE }
    const events: SessionEvent[] = [
      { ...notes(['hit'])[0], difficulty: slow },
      { ...notes(['hit'], 1)[0], difficulty: fast },
    ]

    const result = apply(session(), events)

    expect(result.ok && result.points).toBe(
      Math.round(POINTS_PER_HIT * difficultyMultiplier(slow)) +
        Math.round(POINTS_PER_HIT * difficultyMultiplier(fast)),
    )
  })

  /**
   * A bonus is paid at the price of the note it landed on, which is what the
   * client does — the window froze that price when the note was called, so a
   * click or a second octave arriving later cannot re-price it.
   */
  it('pays a late bonus at the price of the note it landed on', () => {
    const difficulty: SessionDifficulty = { spelling: 'mixed', showFretboard: false, bpm: 144, beatsPerNote: 2, pool: WHOLE_OCTAVE }
    const multiplier = difficultyMultiplier(difficulty)
    const hit = apply(session(), pricedNotes(['hit'], difficulty))
    expect(hit.ok).toBe(true)
    if (!hit.ok) {
      return
    }

    const bonus = apply(hit.session, [{ seq: 1, kind: 'bonus', bonus: 'octaves', at: 10 }], START + 20)

    expect(bonus.ok && bonus.points).toBe(
      Math.round(POINTS_PER_HIT * multiplier) + Math.round(OCTAVES_BONUS_POINTS * multiplier),
    )
  })

  /** A price nobody could have played at is a malformed event, not a mistimed one. */
  it('refuses a hit declaring settings the app cannot produce', () => {
    const events: SessionEvent[] = [
      {
        seq: 0,
        kind: 'hit',
        at: 0,
        difficulty: { spelling: 'mixed', showFretboard: false, bpm: 4000, beatsPerNote: 4, pool: WHOLE_OCTAVE },
      },
    ]

    expect(apply(session(), events, START + 10)).toEqual({ ok: false, reason: 'invalid_event' })
  })

  /** Nothing else is worth anything, so nothing else may declare a price. */
  it('refuses a price on a miss or a bonus', () => {
    const difficulty: SessionDifficulty = { spelling: 'mixed', showFretboard: false, bpm: 120, beatsPerNote: 4, pool: WHOLE_OCTAVE }

    expect(apply(session(), [{ seq: 0, kind: 'miss', at: 0, difficulty }], START + 10)).toEqual({
      ok: false,
      reason: 'invalid_event',
    })

    const hit = apply(session(), pricedNotes(['hit'], difficulty))
    expect(hit.ok).toBe(true)
    if (hit.ok) {
      expect(
        apply(hit.session, [{ seq: 1, kind: 'bonus', bonus: 'tempo', at: 10, difficulty }], START + 20),
      ).toEqual({ ok: false, reason: 'invalid_event' })
    }
  })

  /**
   * A milestone is the session clock's, not a note's: paid flat at the price
   * printed on it, once ever, and only once the session has actually run that
   * long by the server's own clock.
   */
  it('pays a practice milestone flat, and only once', () => {
    const at10 = START + PRACTICE_MILESTONES.practice10.atMs
    const played = apply(session(), notes(['hit']))
    expect(played.ok).toBe(true)
    if (!played.ok) {
      return
    }

    const earned = apply(played.session, [{ seq: 1, kind: 'milestone', milestone: 'practice10', at: 0 }], at10)
    expect(earned.ok && earned.points).toBe(POINTS_PER_HIT + PRACTICE_MILESTONES.practice10.points)
    expect(earned.ok && earned.session.milestones).toEqual(['practice10'])
    if (!earned.ok) {
      return
    }

    expect(apply(earned.session, [{ seq: 2, kind: 'milestone', milestone: 'practice10', at: 0 }], at10)).toEqual({
      ok: false,
      reason: 'invalid_event',
    })
  })

  /** The defence: a thirty-minute bonus out of a session a minute old. */
  it('refuses a milestone the session has not lived through', () => {
    const early = apply(session(), [{ seq: 0, kind: 'milestone', milestone: 'practice30', at: 0 }], START + 60_000)

    expect(early).toEqual({ ok: false, reason: 'too_soon' })
  })

  /**
   * The two clocks are not the same one — the app's is practice time, this one
   * starts at the first note — so the boundary is deliberately generous. What
   * it must not do is refuse an honest player whose session opened a count-in
   * and a note span after their practice clock started.
   */
  it('allows the lead between the practice clock and the session', () => {
    const justInside = START + PRACTICE_MILESTONES.practice10.atMs - MILESTONE_LEAD_MS
    const inside = apply(session(), [{ seq: 0, kind: 'milestone', milestone: 'practice10', at: 0 }], justInside)

    expect(inside.ok).toBe(true)
    expect(apply(session(), [{ seq: 0, kind: 'milestone', milestone: 'practice10', at: 0 }], justInside - 1)).toEqual({
      ok: false,
      reason: 'too_soon',
    })
  })

  /**
   * It belongs to no note, so it must leave the note bookkeeping alone: a bonus
   * that follows one still belongs to the note it was earned on, at that note's
   * price, and a run of correct notes is not broken by the clock.
   */
  it('leaves the note and the streak exactly where they were', () => {
    const difficulty: SessionDifficulty = {
      spelling: 'mixed',
      showFretboard: false,
      bpm: 144,
      beatsPerNote: 2,
      pool: WHOLE_OCTAVE,
    }
    const multiplier = difficultyMultiplier(difficulty)
    const hit = apply(session(), pricedNotes(['hit'], difficulty))
    expect(hit.ok).toBe(true)
    if (!hit.ok) {
      return
    }

    const at10 = START + PRACTICE_MILESTONES.practice10.atMs
    const milestone = apply(hit.session, [{ seq: 1, kind: 'milestone', milestone: 'practice10', at: 0 }], at10)
    expect(milestone.ok).toBe(true)
    if (!milestone.ok) {
      return
    }

    expect(milestone.session.streak).toBe(1)

    const bonus = apply(milestone.session, [{ seq: 2, kind: 'bonus', bonus: 'octaves', at: 0 }], at10)
    expect(bonus.ok && bonus.points).toBe(
      Math.round(POINTS_PER_HIT * multiplier) +
        PRACTICE_MILESTONES.practice10.points +
        Math.round(OCTAVES_BONUS_POINTS * multiplier),
    )
  })

  /** A milestone nobody has heard of, and a kind carrying somebody else's field. */
  it('refuses a milestone it does not recognise, or one dressed as another kind', () => {
    const at10 = START + PRACTICE_MILESTONES.practice10.atMs

    for (const event of [
      { seq: 0, kind: 'milestone', milestone: 'practice45', at: 0 },
      { seq: 0, kind: 'milestone', at: 0 },
      { seq: 0, kind: 'milestone', milestone: 'practice10', bonus: 'tempo', at: 0 },
      { seq: 0, kind: 'miss', milestone: 'practice10', at: 0 },
    ] as unknown as SessionEvent[]) {
      expect(apply(session(), [event], at10)).toEqual({ ok: false, reason: 'invalid_event' })
    }
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
