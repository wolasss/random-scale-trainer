import { describe, expect, it } from 'vitest'
import {
  applyHit,
  applyMiss,
  EMPTY_TALLY,
  judgeDetection,
  openWindow,
  SCORE_DECAY_MARGIN_S,
  SUSTAIN_MAX_GAP_S,
  type NoteWindow,
  type ScoredDetection,
} from './scoring'

const BEAT_TIME = 10
const CUE_END = 10.4

/** Feeds a run of detections through a window in order, as the mic poll does. */
const feed = (noteWindow: NoteWindow, detections: ScoredDetection[]) =>
  detections.reduce(judgeDetection, noteWindow)

const heard = (pitchClass: number, audioTime: number): ScoredDetection => ({ pitchClass, audioTime })

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

  it('leaves a settled verdict alone', () => {
    const hit = feed(openWindow(3, BEAT_TIME, CUE_END), [heard(3, 10.7), heard(3, 10.75)])

    expect(judgeDetection(hit, heard(8, 10.9))).toBe(hit)
  })

  it('returns the very same window when a frame told it nothing', () => {
    // The hook leans on identity to tell a real change from a wasted frame.
    const open = openWindow(3, BEAT_TIME, CUE_END)

    expect(judgeDetection(open, heard(8, 10.7))).toBe(open)
  })
})

describe('the tally', () => {
  it('banks a hit with its response time', () => {
    expect(applyHit(EMPTY_TALLY, 420)).toEqual({ scored: 1, hits: 1, responseTimesMs: [420] })
  })

  it('banks a miss as a note scored and nothing else', () => {
    expect(applyMiss(applyHit(EMPTY_TALLY, 420))).toEqual({ scored: 2, hits: 1, responseTimesMs: [420] })
  })

  it('never mutates what it was given', () => {
    applyMiss(applyHit(EMPTY_TALLY, 420))

    expect(EMPTY_TALLY).toEqual({ scored: 0, hits: 0, responseTimesMs: [] })
  })
})
