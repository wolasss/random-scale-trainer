import { describe, expect, it } from 'vitest'
import {
  applyBonus,
  applyHit,
  applyMiss,
  BEAT_SPAN_MULTIPLIERS,
  claimBonus,
  difficultyMultiplier,
  EMPTY_TALLY,
  FRETBOARD_HIDDEN_MULTIPLIER,
  hitAward,
  judgeDetection,
  MIXED_SPELLING_MULTIPLIER,
  POOL_MULTIPLIERS,
  octavesBonus,
  OCTAVES_BONUS_POINTS,
  openWindow,
  POINTS_PER_HIT,
  PRACTICE_MILESTONES,
  practiceMilestonesCrossed,
  scaleBonus,
  SCORE_DECAY_MARGIN_S,
  streakBonus,
  STREAK_BONUS_MAX,
  SUSTAIN_MAX_GAP_S,
  TEMPO_BONUS_POINTS,
  TEMPO_CLICK_SHADOW_S,
  TEMPO_LATE_MAX_FRACTION,
  TEMPO_MULTIPLIER_MAX,
  TEMPO_TOLERANCE_FRACTION,
  tempoBonus,
  type DifficultyInputs,
  type NoteWindow,
  type ScoredDetection,
  type Tally,
} from './scoring'
import { BEAT_SPAN_OPTIONS, DEFAULT_BPM, MAX_BPM, MIN_BPM } from '../constants'
import { isNaturalPitchClass, PITCH_CLASSES, type SpellingPreference } from './notes'

const BEAT_TIME = 10
const CUE_END = 10.4

/** Feeds a run of detections through a window in order, as the mic poll does. */
const feed = (noteWindow: NoteWindow, detections: ScoredDetection[]) =>
  detections.reduce(judgeDetection, noteWindow)

/** One frame. The octave only matters to the tests that name one. */
const heard = (pitchClass: number, audioTime: number, octave = 3): ScoredDetection => ({
  pitchClass,
  octave,
  audioTime,
})

/** Audio times are floats, so the response time is asserted to the millisecond. */
const expectHit = (noteWindow: NoteWindow, responseMs: number) => {
  expect(noteWindow.verdict?.hit).toBe(true)
  expect(noteWindow.verdict?.responseMs).toBeCloseTo(responseMs, 3)
}

describe('openWindow', () => {
  it('opens after the app has finished sounding, not on the beat', () => {
    expect(openWindow(3, BEAT_TIME, CUE_END).opensAt).toBeCloseTo(CUE_END + SCORE_DECAY_MARGIN_S)
  })

  it('falls back to the beat when the cue could not be measured', () => {
    // A speech cue the engine never got a length for, or a test engine with no
    // cues at all. The margin still applies; nothing goes NaN.
    expect(openWindow(3, BEAT_TIME, null).opensAt).toBeCloseTo(BEAT_TIME + SCORE_DECAY_MARGIN_S)
  })

  it('freezes the price the note was called at, and defaults it to the flat rate', () => {
    expect(openWindow(3, BEAT_TIME, CUE_END, 1.38).multiplier).toBe(1.38)
    expect(openWindow(3, BEAT_TIME, CUE_END).multiplier).toBe(1)
  })
})

describe('difficultyMultiplier', () => {
  /**
   * The neutral setup: nothing about it is priced above the flat rate. The pool
   * is the whole octave, which is both what the app starts on and the hardest
   * it gets — every other factor discounts from there, and this one only ever
   * discounts.
   */
  const FLAT: DifficultyInputs = {
    spelling: 'sharp',
    showFretboard: true,
    bpm: DEFAULT_BPM,
    beatsPerNote: 4,
    pool: [...PITCH_CLASSES],
  }

  it('prices the neutral setup at exactly one', () => {
    expect(difficultyMultiplier(FLAT)).toBe(1)
  })

  it('pays more for sharps and flats mixed than for either alone', () => {
    const spellings: SpellingPreference[] = ['sharp', 'flat']
    for (const spelling of spellings) {
      expect(difficultyMultiplier({ ...FLAT, spelling })).toBe(1)
    }

    expect(difficultyMultiplier({ ...FLAT, spelling: 'mixed' })).toBeCloseTo(MIXED_SPELLING_MULTIPLIER, 10)
  })

  it('pays more with the fretboard map put away than with it on screen', () => {
    expect(difficultyMultiplier({ ...FLAT, showFretboard: true })).toBe(1)
    expect(difficultyMultiplier({ ...FLAT, showFretboard: false })).toBeCloseTo(FRETBOARD_HIDDEN_MULTIPLIER, 10)
  })

  it('prices every span the app offers, fewer beats higher, with four neutral', () => {
    const priced = BEAT_SPAN_OPTIONS.map((beatsPerNote) => difficultyMultiplier({ ...FLAT, beatsPerNote }))

    // Every option has a price of its own — a new one has to be given one
    // before BEAT_SPAN_MULTIPLIERS compiles.
    expect(Object.keys(BEAT_SPAN_MULTIPLIERS).map(Number)).toEqual([...BEAT_SPAN_OPTIONS])
    expect(difficultyMultiplier({ ...FLAT, beatsPerNote: 4 })).toBe(1)
    for (const [index, value] of priced.entries()) {
      if (index > 0) {
        expect(value).toBeLessThan(priced[index - 1])
      }
    }
  })

  it('leaves a span it has never heard of at the flat rate', () => {
    expect(difficultyMultiplier({ ...FLAT, beatsPerNote: 3 })).toBe(1)
  })

  it('pays nothing extra at or below the default tempo, and climbs above it', () => {
    expect(difficultyMultiplier({ ...FLAT, bpm: MIN_BPM })).toBe(1)
    expect(difficultyMultiplier({ ...FLAT, bpm: DEFAULT_BPM })).toBe(1)
    expect(difficultyMultiplier({ ...FLAT, bpm: DEFAULT_BPM + 1 })).toBeGreaterThan(1)
  })

  /**
   * The pool is the one factor whose neutral setting is also its hardest: the
   * app starts on the whole octave, and every narrower pool is a discount.
   */
  it('pays less the less of the octave is in play', () => {
    expect(difficultyMultiplier({ ...FLAT, pool: [...PITCH_CLASSES] })).toBe(1)

    const naturals = PITCH_CLASSES.filter((pc) => isNaturalPitchClass(pc))
    const accidentals = PITCH_CLASSES.filter((pc) => !isNaturalPitchClass(pc))

    // Naturals only, or the five accidentals only, are both worth less than the
    // whole octave — and the smaller of the two is worth less than the other.
    expect(difficultyMultiplier({ ...FLAT, pool: naturals })).toBe(POOL_MULTIPLIERS[7])
    expect(difficultyMultiplier({ ...FLAT, pool: accidentals })).toBe(POOL_MULTIPLIERS[5])
    expect(POOL_MULTIPLIERS[5]).toBeLessThan(POOL_MULTIPLIERS[7])
    expect(POOL_MULTIPLIERS[7]).toBeLessThan(POOL_MULTIPLIERS[12])

    // A pool of one note is a call whose answer is known before it is made.
    expect(difficultyMultiplier({ ...FLAT, pool: [5] })).toBe(POOL_MULTIPLIERS[1])
  })

  it('prices a pool by how many notes are in it, not how they are written down', () => {
    // The same note twice is still one note, and order is nothing.
    expect(difficultyMultiplier({ ...FLAT, pool: [3, 3, 7] })).toBe(difficultyMultiplier({ ...FLAT, pool: [7, 3] }))
  })

  /**
   * Mixed spelling asks for the same fret by two names — but only five pitch
   * classes have two names. On a pool without one of them the preference is a
   * setting that changes nothing, and a setting that changes nothing is not
   * worth points.
   */
  it('pays for mixed spelling only when the pool holds a note with two names', () => {
    const naturals = PITCH_CLASSES.filter((pc) => isNaturalPitchClass(pc))

    expect(difficultyMultiplier({ ...FLAT, spelling: 'mixed', pool: naturals })).toBe(
      difficultyMultiplier({ ...FLAT, spelling: 'sharp', pool: naturals }),
    )
    expect(difficultyMultiplier({ ...FLAT, spelling: 'mixed', pool: [...naturals, 1] })).toBeCloseTo(
      MIXED_SPELLING_MULTIPLIER * POOL_MULTIPLIERS[8],
      10,
    )
  })

  /** What the user is being pointed at: the whole octave, both spellings. */
  it('tops out at the whole octave with sharps and flats mixed', () => {
    const everything = { ...FLAT, spelling: 'mixed' as const, pool: [...PITCH_CLASSES] }

    for (const pool of [PITCH_CLASSES.filter((pc) => isNaturalPitchClass(pc)), PITCH_CLASSES.filter((pc) => !isNaturalPitchClass(pc)), [0, 1, 2]]) {
      expect(difficultyMultiplier({ ...everything, pool })).toBeLessThan(difficultyMultiplier(everything))
    }
  })

  it('caps the tempo factor short of doubling, and the cap binds at the top', () => {
    expect(difficultyMultiplier({ ...FLAT, bpm: MAX_BPM })).toBeCloseTo(TEMPO_MULTIPLIER_MAX, 10)
    expect(TEMPO_MULTIPLIER_MAX).toBeLessThan(2)
  })

  it('multiplies them all together rather than picking one', () => {
    const hardest: DifficultyInputs = { ...FLAT, spelling: 'mixed', showFretboard: false, bpm: MAX_BPM, beatsPerNote: 1 }

    expect(difficultyMultiplier(hardest)).toBeCloseTo(
      MIXED_SPELLING_MULTIPLIER *
        FRETBOARD_HIDDEN_MULTIPLIER *
        BEAT_SPAN_MULTIPLIERS[1] *
        TEMPO_MULTIPLIER_MAX,
      10,
    )
  })

  /**
   * The reason the tempo factor is sublinear at all. Notes per minute is
   * already `bpm / beatsPerNote`, so a linear factor would compound into a
   * roughly quadratic advantage and a slow player could never catch up by
   * practising longer. Computed through `hitAward`, because rounded whole
   * points are what a player is actually paid.
   */
  it('leaves twice the tempo worth well under two and a half times the points', () => {
    const setup = (bpm: number): DifficultyInputs => ({ ...FLAT, bpm })
    const perMinute = (bpm: number) => (bpm / 4) * hitAward(difficultyMultiplier(setup(bpm)))

    // 72 BPM at 4 beats per note: 18 notes a minute at 10 points each.
    expect(perMinute(72)).toBe(180)
    // 144 BPM: 36 notes a minute, and a ×1.2071 note is worth 12 whole points.
    expect(hitAward(difficultyMultiplier(setup(144)))).toBe(12)
    expect(perMinute(144)).toBe(432)

    expect(perMinute(144) / perMinute(72)).toBe(2.4)
    expect(perMinute(144) / perMinute(72)).toBeLessThan(2.5)
  })
})

describe('what a note is paid', () => {
  it('rounds a hit to whole points', () => {
    expect(hitAward(1)).toBe(POINTS_PER_HIT)
    expect(hitAward(1.2071)).toBe(12)
    expect(Number.isInteger(hitAward(1.38))).toBe(true)
  })

  it('rounds a bonus to whole points and changes nothing else about it', () => {
    const scaled = scaleBonus({ kind: 'streak', points: 5 }, 1.38)

    expect(scaled).toEqual({ kind: 'streak', points: 7 })
    expect(Number.isInteger(scaleBonus({ kind: 'octaves', points: OCTAVES_BONUS_POINTS }, 1.2071).points)).toBe(true)
  })

  it('leaves both alone at the flat rate', () => {
    expect(hitAward(1)).toBe(POINTS_PER_HIT)
    expect(scaleBonus({ kind: 'tempo', points: TEMPO_BONUS_POINTS }, 1)).toEqual({
      kind: 'tempo',
      points: TEMPO_BONUS_POINTS,
    })
  })
})

describe('judgeDetection', () => {
  it('confirms a hit on the second of two sustained frames', () => {
    const open = openWindow(3, BEAT_TIME, CUE_END)
    const judged = feed(open, [heard(3, 10.7), heard(3, 10.75)])

    expectHit(judged, 700)
  })

  it('times the response from the beat to the first frame of the sustain', () => {
    // Not from when the window opened, and not from the frame that confirmed
    // it: the player was asked on the beat and answered on the first frame.
    const judged = feed(openWindow(3, BEAT_TIME, CUE_END), [heard(3, 11.2), heard(3, 11.25)])

    expectHit(judged, 1200)
  })

  it('never confirms a single fluke frame', () => {
    // One frame of a neighbouring string's overtone is not playing the note.
    const judged = judgeDetection(openWindow(3, BEAT_TIME, CUE_END), heard(3, 10.7))

    expect(judged.verdict).toBeNull()
    expect(judged.candidateAt).toBe(10.7)
  })

  it('restarts the candidate when the two frames are too far apart', () => {
    const judged = feed(openWindow(3, BEAT_TIME, CUE_END), [
      heard(3, 10.7),
      heard(3, 10.7 + SUSTAIN_MAX_GAP_S + 0.01),
    ])

    expect(judged.verdict).toBeNull()
    expect(judged.candidateAt).toBeCloseTo(10.86)
  })

  it('breaks a sustain on a different note without closing the window', () => {
    const judged = feed(openWindow(3, BEAT_TIME, CUE_END), [heard(3, 10.7), heard(8, 10.75), heard(3, 10.8)])

    expect(judged.verdict).toBeNull()
    expect(judged.candidateAt).toBe(10.8)
  })

  it('lets a player hunt for the fret and still hit it', () => {
    const judged = feed(openWindow(3, BEAT_TIME, CUE_END), [
      heard(2, 10.7),
      heard(4, 10.75),
      heard(3, 10.8),
      heard(3, 10.85),
    ])

    expectHit(judged, 800)
  })

  it('hears nothing at all as nothing at all', () => {
    const open = openWindow(3, BEAT_TIME, CUE_END)

    expect(feed(open, []).verdict).toBeNull()
  })

  /**
   * The whole anti-self-scoring design in one test. The app plays the called
   * note out of the speaker the microphone is pointed at, so a detection of the
   * called pitch during the cue is the app hearing itself.
   */
  it('discards the app hearing itself and scores the same playing after it', () => {
    const open = openWindow(3, BEAT_TIME, CUE_END)
    const duringTheCue = feed(open, [heard(3, BEAT_TIME + 0.01), heard(3, BEAT_TIME + 0.06)])

    expect(duringTheCue).toBe(open)
    expect(duringTheCue.verdict).toBeNull()

    const afterIt = feed(duringTheCue, [heard(3, 10.6), heard(3, 10.65)])

    // Still timed from the beat, not from when the window opened.
    expectHit(afterIt, 600)
  })

  it('discards a frame at the margin and takes the one on it', () => {
    const open = openWindow(3, BEAT_TIME, CUE_END)
    const justInside = openWindow(3, BEAT_TIME, CUE_END).opensAt

    expect(judgeDetection(open, heard(3, justInside - 0.001))).toBe(open)
    expect(judgeDetection(open, heard(3, justInside)).candidateAt).toBe(justInside)
  })

  it('matches a D♭ call with C♯ playing — one fret, one pitch class', () => {
    const judged = feed(openWindow(1, BEAT_TIME, CUE_END), [heard(1, 10.7), heard(1, 10.75)])

    expectHit(judged, 700)
  })

  it('leaves a settled verdict alone while it goes on listening', () => {
    // The window stays open for the octaves still to be played on this note,
    // but the answer it already gave is never revised — not by a wrong note,
    // and not by more of the right one.
    const hit = feed(openWindow(3, BEAT_TIME, CUE_END), [heard(3, 10.7), heard(3, 10.75)])
    const after = feed(hit, [heard(8, 10.9), heard(3, 11.2), heard(3, 11.25)])

    expect(after.verdict).toBe(hit.verdict)
    expectHit(after, 700)
  })

  it('returns the very same window when a frame told it nothing', () => {
    // The hook leans on identity to tell a real change from a wasted frame.
    const open = openWindow(3, BEAT_TIME, CUE_END)

    expect(judgeDetection(open, heard(8, 10.7))).toBe(open)
  })
})

describe('the octaves bonus', () => {
  /** The called note got right at octave 3, exactly as any other test gets it. */
  const hitAtOctaveThree = () => feed(openWindow(3, BEAT_TIME, CUE_END), [heard(3, 10.7, 3), heard(3, 10.75, 3)])

  it('pays for the called note held at a second octave', () => {
    const played = feed(hitAtOctaveThree(), [heard(3, 11, 4), heard(3, 11.05, 4)])

    expect(played.octaves).toEqual(new Set([3, 4]))
    expect(octavesBonus(played)).toEqual({ kind: 'octaves', points: OCTAVES_BONUS_POINTS })
  })

  it('pays it once, however long the second octave rings on', () => {
    const claimed = claimBonus(feed(hitAtOctaveThree(), [heard(3, 11, 4), heard(3, 11.05, 4)]), 'octaves')
    const ringingOn = feed(claimed as NoteWindow, [heard(3, 11.1, 4), heard(3, 11.15, 4)])

    expect(octavesBonus(ringingOn)).not.toBeNull()
    expect(claimBonus(ringingOn, 'octaves')).toBeNull()
  })

  it('pays nothing for the same octave played again', () => {
    // Two unison positions on the neck are one pitch, and a pitch is the whole
    // of what a microphone can testify to.
    const played = feed(hitAtOctaveThree(), [heard(3, 11, 3), heard(3, 11.05, 3)])

    expect(played.octaves).toEqual(new Set([3]))
    expect(octavesBonus(played)).toBeNull()
  })

  it('pays nothing for a single stray frame at another octave', () => {
    // Which is exactly the subharmonic the detector's octave rule makes
    // unlikely rather than impossible.
    const played = feed(hitAtOctaveThree(), [heard(3, 11, 2), heard(3, 11.05, 3), heard(3, 11.1, 4)])

    expect(octavesBonus(played)).toBeNull()
  })

  it('needs the second octave sustained, not merely heard twice', () => {
    const played = feed(hitAtOctaveThree(), [heard(3, 11, 4), heard(3, 11 + SUSTAIN_MAX_GAP_S + 0.01, 4)])

    expect(octavesBonus(played)).toBeNull()
  })

  it('changes nothing about the hit it rides on', () => {
    const hit = hitAtOctaveThree()
    const played = feed(hit, [heard(3, 11, 4), heard(3, 11.05, 4)])

    expect(octavesBonus(played)).not.toBeNull()
    // The answer, when it was given, and what it was worth are all untouched.
    expectHit(played, 700)
    expect(played.candidateAt).toBe(hit.candidateAt)
    expect(played.awarded).toEqual(hit.awarded)
  })
})

describe('the tempo bonus', () => {
  /** A half-second grid: 120 BPM, which is the middle of the app's range. */
  const GRID = [9.5, 10, 10.5]
  const TOLERANCE = 0.5 * TEMPO_TOLERANCE_FRACTION
  const PAID = { kind: 'tempo', points: TEMPO_BONUS_POINTS }

  it('pays for a string struck on a click', () => {
    expect(tempoBonus(10.5, GRID)).toEqual(PAID)
  })

  it('pays for a click already gone by, not just the latest one', () => {
    // The player was aiming at the beat before last and the ring has moved on.
    expect(tempoBonus(10.01, GRID)).toEqual(PAID)
  })

  it('pays nothing for a strike between two clicks', () => {
    expect(tempoBonus(10.25, GRID)).toBeNull()
  })

  it('pays inside the tolerance ahead of a click and not outside it', () => {
    // Asserted either side of the edge rather than on it: the exact boundary is
    // a float subtraction, and what matters is which side of it pays.
    expect(tempoBonus(10.5 - TOLERANCE * 0.99, GRID)).toEqual(PAID)
    expect(tempoBonus(10.5 - TOLERANCE * 1.01, GRID)).toBeNull()
  })

  it('pays for the strike the click itself hid', () => {
    // A 1 s grid, where the shadow is shorter than the ceiling and so is what
    // binds. The microphone is deaf under the app's own click, so a string
    // struck on one is not heard until the click has finished ringing — far
    // outside the tolerance, and the whole bonus if it were not allowed for.
    const slow = [9, 10, 11]

    expect(tempoBonus(11 + TEMPO_CLICK_SHADOW_S, slow)).toEqual(PAID)
    expect(tempoBonus(11 + TEMPO_CLICK_SHADOW_S + TOLERANCE, slow)).toEqual(PAID)
    // Earliness gets no such allowance: nothing was deaf to a strike that
    // sounded before the click did.
    expect(tempoBonus(11 - TEMPO_CLICK_SHADOW_S, slow)).toBeNull()
  })

  it('never forgives lateness past the ceiling', () => {
    // Past it the nearer click is the next one, and a strike that is in time
    // with neither would be paid for both.
    const ceiling = 0.5 * TEMPO_LATE_MAX_FRACTION

    expect(tempoBonus(10.5 + ceiling * 0.99, GRID)).toEqual(PAID)
    expect(tempoBonus(10.5 + ceiling * 1.01, GRID)).toBeNull()
  })

  it('pays nothing when there is no interval to measure', () => {
    // One beat, or none, is not a tempo — and a guessed interval would be a
    // guessed answer.
    expect(tempoBonus(10, [])).toBeNull()
    expect(tempoBonus(10, [10])).toBeNull()
    expect(tempoBonus(10, [10, 10])).toBeNull()
  })

  it('measures the interval from the two most recent beats', () => {
    // The tempo just changed — the speed ramp does this every completed round —
    // and it is the beats that have actually sounded that say what it is now,
    // never a BPM handed down from the UI.
    const ramped = [9, 10, 10.4]

    expect(tempoBonus(10.4 - 0.4 * TEMPO_TOLERANCE_FRACTION * 0.99, ramped)).toEqual(PAID)
    // Inside a tolerance drawn from the old, slower interval; outside this one.
    expect(tempoBonus(10.4 - 1.0 * TEMPO_TOLERANCE_FRACTION * 0.99, ramped)).toBeNull()
  })
})

describe('the tally', () => {
  /**
   * `n` hits in a row, all answered in the same time. The streak bonus is
   * handed in the way the hook hands it in — built from the run the next hit
   * will make, and scaled before it gets here.
   */
  const run = (n: number, tally: Tally = EMPTY_TALLY) =>
    Array.from({ length: n }).reduce<Tally>((current) => {
      const streak = streakBonus(current.streak + 1)
      return applyHit(current, 420, streak === null ? [] : [streak])
    }, tally)

  it('banks a hit with its response time', () => {
    expect(applyHit(EMPTY_TALLY, 420)).toEqual({
      scored: 1,
      hits: 1,
      responseTimesMs: [420],
      points: POINTS_PER_HIT,
      streak: 1,
      bestStreak: 1,
    })
  })

  it('banks a miss as a note scored and nothing else', () => {
    expect(applyMiss(applyHit(EMPTY_TALLY, 420))).toEqual({
      scored: 2,
      hits: 1,
      responseTimesMs: [420],
      points: POINTS_PER_HIT,
      streak: 0,
      bestStreak: 1,
    })
  })

  it('never mutates what it was given', () => {
    applyMiss(applyHit(EMPTY_TALLY, 420))

    expect(EMPTY_TALLY).toEqual({
      scored: 0,
      hits: 0,
      responseTimesMs: [],
      points: 0,
      streak: 0,
      bestStreak: 0,
    })
  })

  it('pays a flat rate for the first two notes of a run', () => {
    // Two right notes are a coincidence. Nothing extra yet.
    expect(run(1).points).toBe(POINTS_PER_HIT)
    expect(run(2).points).toBe(POINTS_PER_HIT * 2)
    expect(run(2).streak).toBe(2)
  })

  it('starts the streak bonus on the third consecutive note', () => {
    expect(streakBonus(2)).toBeNull()
    expect(streakBonus(3)).toEqual({ kind: 'streak', points: 5 })
    expect(run(3).points).toBe(POINTS_PER_HIT * 3 + 5)
  })

  it('climbs the streak bonus to a cap and stays there', () => {
    expect(streakBonus(7)?.points).toBe(STREAK_BONUS_MAX)
    expect(streakBonus(40)?.points).toBe(STREAK_BONUS_MAX)

    const long = run(20)

    expect(long.points).toBe(run(19).points + POINTS_PER_HIT + STREAK_BONUS_MAX)
  })

  it('adds the award and every bonus handed to it, exactly as given', () => {
    // Nothing is worked out here and nothing is dropped: the caller knows what
    // the note was priced at, so it builds the bonuses and this adds them. That
    // is what makes what the readout prints the delta that actually landed.
    const before = run(2)
    const banked = applyHit(before, 420, [{ kind: 'streak', points: 7 }, { kind: 'tempo', points: 13 }], 12)

    expect(banked.points).toBe(before.points + 12 + 7 + 13)
    expect(banked.scored).toBe(3)
    expect(banked.streak).toBe(3)
  })

  it('pays the flat rate when nobody names a price', () => {
    expect(applyHit(EMPTY_TALLY, 420).points).toBe(POINTS_PER_HIT)
  })

  it('breaks the streak on a miss without touching what it earned', () => {
    const missed = applyMiss(run(4))

    expect(missed.streak).toBe(0)
    expect(missed.bestStreak).toBe(4)
    expect(missed.points).toBe(run(4).points)

    // And the next run starts from the bottom of the ladder again.
    expect(applyHit(missed, 420).points).toBe(missed.points + POINTS_PER_HIT)
  })

  it('moves the points and nothing else for a bonus found after the hit', () => {
    const banked = run(3)
    const bonused = applyBonus(banked, { kind: 'streak', points: 5 })

    expect(bonused.points).toBe(banked.points + 5)
    expect(bonused).toMatchObject({
      scored: banked.scored,
      hits: banked.hits,
      responseTimesMs: banked.responseTimesMs,
      streak: banked.streak,
      bestStreak: banked.bestStreak,
    })
  })
})

describe('practiceMilestonesCrossed', () => {
  it('pins each threshold and its flat payout', () => {
    expect(PRACTICE_MILESTONES).toEqual([
      { kind: 'practice10', atMs: 600_000, points: 50 },
      { kind: 'practice20', atMs: 1_200_000, points: 100 },
      { kind: 'practice30', atMs: 1_800_000, points: 150 },
    ])
  })

  it('earns nothing on a step that stays short of the first threshold', () => {
    expect(practiceMilestonesCrossed(0, 599_999)).toEqual([])
  })

  it('earns the threshold on the tick that reaches it', () => {
    expect(practiceMilestonesCrossed(599_999, 600_000)).toEqual([{ kind: 'practice10', points: 50 }])
  })

  it('earns nothing on the tick just after, already having earned it', () => {
    expect(practiceMilestonesCrossed(600_000, 600_001)).toEqual([])
  })

  it('returns every threshold a long step jumps past, in order', () => {
    expect(practiceMilestonesCrossed(0, 1_800_000)).toEqual([
      { kind: 'practice10', points: 50 },
      { kind: 'practice20', points: 100 },
      { kind: 'practice30', points: 150 },
    ])
  })

  it('earns nothing on a zero-length step', () => {
    expect(practiceMilestonesCrossed(600_000, 600_000)).toEqual([])
  })

  it('earns nothing on a step backwards', () => {
    expect(practiceMilestonesCrossed(600_000, 0)).toEqual([])
  })
})

describe('claimBonus', () => {
  it('pays a kind once per note and refuses the replay', () => {
    const open = openWindow(3, BEAT_TIME, CUE_END)
    const claimed = claimBonus(open, 'streak')

    expect(claimed?.awarded.has('streak')).toBe(true)
    expect(claimBonus(claimed as NoteWindow, 'streak')).toBeNull()
    // The window it was given is left alone, as everything here leaves it.
    expect(open.awarded.size).toBe(0)
  })

  it('carries what a note has been paid across the frames that follow', () => {
    const claimed = claimBonus(openWindow(3, BEAT_TIME, CUE_END), 'streak') as NoteWindow
    const judged = feed(claimed, [heard(3, 10.7), heard(3, 10.75)])

    expectHit(judged, 700)
    expect(judged.awarded.has('streak')).toBe(true)
  })
})
