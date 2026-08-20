import { describe, expect, it } from 'vitest'
import {
  applyBonus,
  applyHit,
  applyMiss,
  claimBonus,
  EMPTY_TALLY,
  judgeDetection,
  octavesBonus,
  OCTAVES_BONUS_POINTS,
  openWindow,
  POINTS_PER_HIT,
  SCORE_DECAY_MARGIN_S,
  streakBonus,
  STREAK_BONUS_MAX,
  SUSTAIN_MAX_GAP_S,
  type NoteWindow,
  type ScoredDetection,
  type Tally,
} from './scoring'

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

describe('the tally', () => {
  /** `n` hits in a row, all answered in the same time. */
  const run = (n: number, tally: Tally = EMPTY_TALLY) =>
    Array.from({ length: n }).reduce<Tally>((current) => applyHit(current, 420), tally)

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

  it('pays the streak it worked out itself, never one handed to it as well', () => {
    // The third note earns +5. Handing the same bonus in with it must not buy a
    // second one: `applyHit` is the only thing that pays the streak.
    const banked = applyHit(run(2), 420, [{ kind: 'streak', points: 5 }])

    expect(banked.points).toBe(POINTS_PER_HIT * 3 + 5)
    expect(banked.scored).toBe(3)
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
