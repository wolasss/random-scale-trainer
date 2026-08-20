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
 * call of D♭ and a detection named C♯ are both 1. The octave a detection was
 * heard at is carried alongside, but only a bonus ever looks at it — the
 * verdict itself stays pitch-class-only, so an octave the detector got wrong
 * can never turn a hit into a miss.
 *
 * On top of the verdict sits the score. A hit is worth `POINTS_PER_HIT`, and a
 * bonus is worth whatever the bonus says it is worth. Bonuses arrive at two
 * different moments, which is why there are two ways to bank one: some are
 * known when the hit is confirmed, and some are only discovered afterwards,
 * while the same note is still sounding. `applyHit` takes the first kind;
 * `applyBonus` takes the second and moves the points and nothing else, so a
 * late bonus can never re-count the note it belongs to. Guarding against the
 * same bonus landing twice is the *window's* job — `awarded` — because a
 * microphone frame that says the same thing as the one before it is normal, and
 * the tally has no way to tell that replay from a second earning.
 */

/** How long the room is given to go quiet after the app stops sounding. */
export const SCORE_DECAY_MARGIN_S = 0.15

/**
 * The most silence allowed between the two frames that confirm a note. The
 * microphone polls every 50 ms (`MIC_POLL_MS`), so this tolerates a dropped
 * frame between them without letting two unrelated plucks confirm each other.
 */
export const SUSTAIN_MAX_GAP_S = 0.15

/** What one correct note is worth before any bonus is added to it. */
export const POINTS_PER_HIT = 10

/**
 * The streak bonus: nothing for the first two notes in a row, then a step per
 * note from the third, up to a ceiling. Two right notes are a coincidence; the
 * third is a run, and the ceiling is there so a long session cannot turn every
 * later note into a jackpot that dwarfs the ones that earned it.
 */
export const STREAK_BONUS_FROM = 3
export const STREAK_BONUS_STEP = 5
export const STREAK_BONUS_MAX = 25

/**
 * The octaves bonus: the called note sounded at two different octaves inside
 * one span.
 *
 * Be careful what this is claimed to be. A microphone yields absolute pitch and
 * nothing else, so what is observable is two *octaves*, never two places on the
 * neck — the fretboard has several positions per pitch class, some of them
 * unisons at the very same pitch, and more than two octaves across its range. A
 * player who finds the note twice in unison earns nothing here, and the copy
 * says "two octaves" so that reads as the rule rather than a bug.
 *
 * It is also the bonus most likely to be built on a wrong reading, because a
 * plucked string's subharmonic scores nearly as well as its fundamental (see
 * `OCTAVE_TIE_FRACTION` in audio/pitch.ts). So it may only ever add: a bad
 * octave read at worst awards nothing, and never costs a point.
 */
export const OCTAVES_BONUS_POINTS = 15

/**
 * The tempo bonus: the string was struck on a click rather than somewhere
 * between two.
 *
 * The tolerance is a fraction of the beat interval, and that interval is
 * measured from two adjacent beats that actually sounded — never from a BPM
 * setting handed down from the UI. Scoring is arithmetic on the audio clock and
 * nothing else, and the speed ramp moves the BPM underneath a session anyway;
 * two ticks that happened are the only honest statement of how far apart ticks
 * are right now. With fewer than two of them to measure, nothing is awarded:
 * guessing an interval would be guessing the answer.
 *
 * What it can be earned on depends on the note-change rate. At
 * `beatsPerNote = 1` every beat starts a note, so the only tick to be in time
 * with is the call itself — and a window does not open until the app has
 * finished speaking that call, so there is almost nothing left to play in time
 * with. From two beats per note up there are in-span ticks under the note, and
 * those are the ones this bonus is really for. That is the shape of the
 * feature, not a gap in it.
 */
export const TEMPO_BONUS_POINTS = 10
export const TEMPO_TOLERANCE_FRACTION = 0.15

/**
 * What happened on one called note. A hit always knows how long it took; a
 * miss has nothing to time, which is why the two are one union rather than a
 * flag beside a nullable number.
 */
export type NoteVerdict = { hit: true; responseMs: number } | { hit: false; responseMs: null }

/** The bonuses a note can earn. More kinds join these as they are written. */
export type BonusKind = 'streak' | 'octaves' | 'tempo'

/** One bonus that landed: what it was for, and what it was worth. */
export type Bonus = { kind: BonusKind; points: number }

/**
 * The streak bonus earned by landing the `streak`-th consecutive note, or null
 * when the run is still too short to be one.
 */
export function streakBonus(streak: number): Bonus | null {
  if (streak < STREAK_BONUS_FROM) {
    return null
  }

  return {
    kind: 'streak',
    points: Math.min((streak - STREAK_BONUS_FROM + 1) * STREAK_BONUS_STEP, STREAK_BONUS_MAX),
  }
}

/**
 * The session's running score. `scored` counts notes judged, hit or miss;
 * `streak` is the run of correct notes still going, and `bestStreak` the
 * longest one the session has managed, which a miss cannot take away.
 */
export type Tally = {
  scored: number
  hits: number
  responseTimesMs: number[]
  points: number
  streak: number
  bestStreak: number
}

export const EMPTY_TALLY: Tally = {
  scored: 0,
  hits: 0,
  responseTimesMs: [],
  points: 0,
  streak: 0,
  bestStreak: 0,
}

/** One detection, reduced to the fields judging cares about. */
export type ScoredDetection = {
  pitchClass: number
  octave: number
  audioTime: number
}

/**
 * A called note's open question. `candidateAt` is the audio time of a first
 * matching detection still waiting for the second that would confirm it, and
 * `awarded` remembers which bonuses this note has already paid out, so a bonus
 * is earned once per note however many frames go on saying so.
 *
 * `octaves` and `octaveCandidate` are the same sustain rule again, run a second
 * time on the octave: which octaves of the called pitch class have actually
 * been held, and the frame still waiting to be confirmed by another like it.
 * They are tracked independently of the verdict, and go on being tracked after
 * it settles — a second octave is normally played after the note has already
 * been got right.
 */
export type NoteWindow = {
  pc: number
  beatTime: number
  opensAt: number
  candidateAt: number | null
  verdict: NoteVerdict | null
  awarded: Set<BonusKind>
  octaves: Set<number>
  octaveCandidate: { octave: number; at: number } | null
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
    awarded: new Set(),
    octaves: new Set(),
    octaveCandidate: null,
  }
}

/**
 * Claims a bonus for this note, or refuses. Returns a window that has the kind
 * marked as paid, or null when it was paid already — so the caller banks points
 * exactly when it gets a window back, and a replayed frame earns nothing.
 */
export function claimBonus(noteWindow: NoteWindow, kind: BonusKind): NoteWindow | null {
  if (noteWindow.awarded.has(kind)) {
    return null
  }

  return { ...noteWindow, awarded: new Set([...noteWindow.awarded, kind]) }
}

/**
 * Folds one detection into a window. Returns the window unchanged — the same
 * object — when nothing about it moved, so a caller can tell a real change from
 * a frame that told it nothing.
 *
 * A window goes on listening after its verdict settles, because the octaves it
 * has heard are still accumulating. What it will not do is answer twice: the
 * verdict and the response time behind it are computed once and never revised.
 */
export function judgeDetection(
  noteWindow: NoteWindow,
  { pitchClass, octave, audioTime }: ScoredDetection,
): NoteWindow {
  // Heard while the app was still the loudest thing in the room, which is the
  // app hearing its own spoken note rather than the player.
  if (audioTime < noteWindow.opensAt) {
    return noteWindow
  }

  if (pitchClass !== noteWindow.pc) {
    // A different note breaks a sustain in progress — but not the window: the
    // player is allowed to hunt for the right fret and still get there.
    return noteWindow.candidateAt === null && noteWindow.octaveCandidate === null
      ? noteWindow
      : { ...noteWindow, candidateAt: null, octaveCandidate: null }
  }

  // The octave gets the sustain rule of its own, on the same two-frames-close-
  // together terms a hit is confirmed on, so one fluke frame at a subharmonic
  // adds nothing to the set.
  const lastOctave = noteWindow.octaveCandidate
  const octaveSustained =
    lastOctave !== null && lastOctave.octave === octave && audioTime - lastOctave.at <= SUSTAIN_MAX_GAP_S
  const heard = {
    octaves:
      octaveSustained && !noteWindow.octaves.has(octave)
        ? new Set([...noteWindow.octaves, octave])
        : noteWindow.octaves,
    octaveCandidate: { octave, at: audioTime },
  }

  // Answered already: the octaves move on, the verdict does not.
  if (noteWindow.verdict !== null) {
    return { ...noteWindow, ...heard }
  }

  // A match with no live candidate behind it — or one too far behind to be the
  // same held note — is the start of a sustain rather than the end of one.
  const candidateAt = noteWindow.candidateAt
  const sustained = candidateAt !== null && audioTime - candidateAt <= SUSTAIN_MAX_GAP_S
  if (!sustained) {
    return { ...noteWindow, ...heard, candidateAt: audioTime }
  }

  // Timed from the first of the two frames: that is when the string was struck.
  return { ...noteWindow, ...heard, verdict: { hit: true, responseMs: (candidateAt - noteWindow.beatTime) * 1000 } }
}

/**
 * The octaves bonus, once two different octaves of the called note have each
 * been held: two octaves of pitch, which is all a microphone can testify to.
 * Null until then. Whether it is allowed to be paid is `claimBonus`'s question.
 */
export const octavesBonus = (noteWindow: NoteWindow): Bonus | null =>
  noteWindow.octaves.size >= 2 ? { kind: 'octaves', points: OCTAVES_BONUS_POINTS } : null

/**
 * The tempo bonus, for a string struck close enough to a click. `struckAt` is
 * the moment of the strike — the first frame of a sustain, not the one that
 * confirmed it — and `beatTimes` the last few beats that sounded, oldest first.
 *
 * The interval comes from the two most recent entries because they are
 * *adjacent* beats: a ring that kept only the beats which call a note would put
 * a whole note span between neighbours and report an interval several times too
 * long, which would pay for playing badly out of time. Fewer than two entries,
 * or two that do not run forwards, is not an interval, and no bonus is invented
 * from it. Which beat is nearest is asked of every entry, not just the last:
 * the click a player was aiming at is as often the one just gone as the one
 * just arrived.
 */
export function tempoBonus(struckAt: number, beatTimes: number[]): Bonus | null {
  if (beatTimes.length < 2) {
    return null
  }

  const interval = beatTimes[beatTimes.length - 1] - beatTimes[beatTimes.length - 2]
  if (!(interval > 0)) {
    return null
  }

  const offBy = Math.min(...beatTimes.map((time) => Math.abs(struckAt - time)))

  return offBy <= interval * TEMPO_TOLERANCE_FRACTION ? { kind: 'tempo', points: TEMPO_BONUS_POINTS } : null
}

/**
 * Banks a correct note: the count, the response time, the streak it continues,
 * and the points — `POINTS_PER_HIT`, the streak bonus the new run has earned,
 * and anything else already known to have landed on this note.
 *
 * The streak bonus is this function's alone, because it is the one that knows
 * how long the run now is; a streak handed in among `bonuses` is dropped rather
 * than paid on top of the one worked out here. Every other kind is added as
 * given.
 */
export const applyHit = (tally: Tally, responseMs: number, bonuses: Bonus[] = []): Tally => {
  const streak = tally.streak + 1
  const extra = bonuses.reduce((total, bonus) => (bonus.kind === 'streak' ? total : total + bonus.points), 0)

  return {
    scored: tally.scored + 1,
    hits: tally.hits + 1,
    responseTimesMs: [...tally.responseTimesMs, responseMs],
    points: tally.points + POINTS_PER_HIT + (streakBonus(streak)?.points ?? 0) + extra,
    streak,
    bestStreak: Math.max(tally.bestStreak, streak),
  }
}

/**
 * Banks a bonus discovered *after* its note was banked — points and nothing
 * else. It must never touch `scored`, `hits`, `responseTimesMs`, `streak` or
 * `bestStreak`: the note it belongs to has already been counted, and counting
 * it again would inflate the accuracy the readout reports. Whether the bonus is
 * allowed to land at all is `claimBonus`'s question, not this one's.
 */
export const applyBonus = (tally: Tally, bonus: Bonus): Tally => ({
  ...tally,
  points: tally.points + bonus.points,
})

/** A miss ends the run. `bestStreak` stands — it was earned. */
export const applyMiss = (tally: Tally): Tally => ({ ...tally, scored: tally.scored + 1, streak: 0 })
