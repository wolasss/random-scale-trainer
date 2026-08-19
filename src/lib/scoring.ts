/**
 * Judging what was played against what was called.
 *
 * Everything here is arithmetic on the audio clock: no DOM, no React, no
 * wall-clock time. A window is opened when a note is called, fed the pitches
 * the microphone heard, and closed when the next call lands — and the two
 * things it has to get right are both about not lying to the player.
 *
 * The first is the app's own voice. It plays the called note out of the same
 * speaker the microphone is pointed at, so the very first thing heard after a
 * beat is always the right answer. A window therefore opens not at the beat but
 * at the end of the cue that beat sounded, plus a margin for the room to go
 * quiet, and anything stamped earlier is discarded outright. The response time
 * is still measured from the beat, which is when the player was asked.
 *
 * The second is the fluke frame. A pluck is a burst of overtones and a strummed
 * neighbour string rings under everything; one frame agreeing with the call is
 * a coincidence often enough to matter. So a hit needs the note *sustained* —
 * two consecutive matching detections close enough together to be one held
 * note — and the response time is taken from the first of them, which is when
 * the string was actually struck.
 *
 * Pitch classes are the currency throughout, which makes enharmonics free: a
 * call of D♭ and a detection named C♯ are both 1.
 */

/** How long the room is given to go quiet after the app stops sounding. */
export const SCORE_DECAY_MARGIN_S = 0.15

/**
 * The most silence allowed between the two frames that confirm a note. The
 * microphone polls every 50 ms (`MIC_POLL_MS`), so this tolerates a dropped
 * frame between them without letting two unrelated plucks confirm each other.
 */
export const SUSTAIN_MAX_GAP_S = 0.15

/**
 * What happened on one called note. A hit always knows how long it took; a
 * miss has nothing to time, which is why the two are one union rather than a
 * flag beside a nullable number.
 */
export type NoteVerdict = { hit: true; responseMs: number } | { hit: false; responseMs: null }

/** The session's running score. `scored` counts notes judged, hit or miss. */
export type Tally = {
  scored: number
  hits: number
  responseTimesMs: number[]
}

export const EMPTY_TALLY: Tally = { scored: 0, hits: 0, responseTimesMs: [] }

/** One detection, reduced to the two fields judging cares about. */
export type ScoredDetection = {
  pitchClass: number
  audioTime: number
}

/**
 * A called note's open question. `candidateAt` is the audio time of a first
 * matching detection still waiting for the second that would confirm it.
 */
export type NoteWindow = {
  pc: number
  beatTime: number
  opensAt: number
  candidateAt: number | null
  verdict: NoteVerdict | null
}

/**
 * Opens the window for a call. `cueEnd` is when the app itself stops sounding
 * over that beat; a null one — a speech cue the engine could not measure, or a
 * test engine with no cues at all — falls back to the beat, so the margin alone
 * carries the suppression rather than the arithmetic going anywhere strange.
 */
export function openWindow(pc: number, beatTime: number, cueEnd: number | null): NoteWindow {
  return {
    pc,
    beatTime,
    opensAt: (cueEnd ?? beatTime) + SCORE_DECAY_MARGIN_S,
    candidateAt: null,
    verdict: null,
  }
}

/**
 * Folds one detection into a window. Returns the window unchanged — the same
 * object — when nothing about it moved, so a caller can tell a real change from
 * a frame that told it nothing.
 */
export function judgeDetection(noteWindow: NoteWindow, { pitchClass, audioTime }: ScoredDetection): NoteWindow {
  // Already answered, or heard while the app was still the loudest thing in
  // the room. Neither is the player's playing.
  if (noteWindow.verdict !== null || audioTime < noteWindow.opensAt) {
    return noteWindow
  }

  if (pitchClass !== noteWindow.pc) {
    // A different note breaks a sustain in progress — but not the window: the
    // player is allowed to hunt for the right fret and still get there.
    return noteWindow.candidateAt === null ? noteWindow : { ...noteWindow, candidateAt: null }
  }

  // A match with no live candidate behind it — or one too far behind to be the
  // same held note — is the start of a sustain rather than the end of one.
  const candidateAt = noteWindow.candidateAt
  const sustained = candidateAt !== null && audioTime - candidateAt <= SUSTAIN_MAX_GAP_S
  if (!sustained) {
    return { ...noteWindow, candidateAt: audioTime }
  }

  // Timed from the first of the two frames: that is when the string was struck.
  return { ...noteWindow, verdict: { hit: true, responseMs: (candidateAt - noteWindow.beatTime) * 1000 } }
}

export const applyHit = (tally: Tally, responseMs: number): Tally => ({
  scored: tally.scored + 1,
  hits: tally.hits + 1,
  responseTimesMs: [...tally.responseTimesMs, responseMs],
})

export const applyMiss = (tally: Tally): Tally => ({ ...tally, scored: tally.scored + 1 })
