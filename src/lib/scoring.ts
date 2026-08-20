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
 *
 * What a note is worth is decided before it is played, by how hard the settings
 * made it: `difficultyMultiplier` prices mixed sharps-and-flats above one
 * spelling, the fretboard map hidden above shown, a shorter note span above a
 * longer one, and a tempo above the default above one at or below it. The four
 * inputs are the ones in force when the note was *called*, which is why they
 * ride the beat event rather than being read here — see program.ts.
 *
 * Both halves of the arithmetic stay outside `applyHit`/`applyBonus`:
 * `hitAward` and `scaleBonus` round to whole points where a `Bonus` is built,
 * and the two `apply*` functions add what they are handed verbatim. That is the
 * only way the `+5 streak` the readout prints can be the five points that
 * actually landed rather than a pre-scale figure.
 *
 * The balance, in shipped whole points. Notes per minute is already
 * `bpm / beatsPerNote`, so a *linear* tempo factor would compound into a
 * roughly quadratic advantage and slow practice could never catch up. So the
 * factor is sublinear — `1 + TEMPO_MULTIPLIER_GAIN * (√(bpm / DEFAULT_BPM) - 1)`
 * — flat at or below `DEFAULT_BPM` and capped by `TEMPO_MULTIPLIER_MAX`, short
 * of doubling. Take two setups that differ only in tempo, both at 4 beats per
 * note: 72 BPM is 18 notes/min at `hitAward(1) = 10`, so 180 points/min; 144
 * BPM is 36 notes/min at a factor of 1.2071, so `hitAward(1.2071) = 12` and 432
 * points/min. Doubling the tempo buys **2.4×** the points per minute (2.414×
 * before rounding) rather than 4× — under the 2.5× ceiling, which is to say
 * about two and a half minutes of slow practice matches a minute of fast. The
 * cap binds at `MAX_BPM`, where the raw factor would be 1.413.
 */

import { DEFAULT_BPM, type BeatsPerNote } from '../constants'
import type { SpellingPreference } from './notes'

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
 * Sharps and flats mixed: the same fret is asked for by either name, so the
 * player has to know both rather than one. Named apart from the fretboard and
 * span factors so a change to one is never a change to another.
 */
export const MIXED_SPELLING_MULTIPLIER = 1.15
export const SINGLE_SPELLING_MULTIPLIER = 1

/** The map put away: the neck has to be in your head instead of on the screen. */
export const FRETBOARD_HIDDEN_MULTIPLIER = 1.2
export const FRETBOARD_SHOWN_MULTIPLIER = 1

/**
 * How long you get to find the note, priced. Typed over `BEAT_SPAN_OPTIONS`, so
 * a new span has to be given a price here before it compiles; `4` — the default
 * — is the neutral one, and every longer span is worth less than a whole note.
 */
export const BEAT_SPAN_MULTIPLIERS: Record<BeatsPerNote, number> = { 1: 1.4, 2: 1.2, 4: 1, 8: 0.85, 12: 0.75 }

/**
 * The tempo factor. Sublinear in the tempo and capped short of doubling, for
 * the reason set out at the top of this file: notes per minute already scales
 * with the tempo, so anything linear here would pay a fast player quadratically
 * and put catching up out of reach.
 */
export const TEMPO_MULTIPLIER_GAIN = 0.5
export const TEMPO_MULTIPLIER_MAX = 1.4

/** The settings a note was *called* under, which is what prices it. */
export type DifficultyInputs = {
  spelling: SpellingPreference
  showFretboard: boolean
  bpm: number
  beatsPerNote: number
}

/** A span with no price of its own is neutral rather than free. */
const beatSpanMultiplier = (beatsPerNote: number) => BEAT_SPAN_MULTIPLIERS[beatsPerNote as BeatsPerNote] ?? 1

/** Nothing is owed for practising at or below the default tempo. */
const tempoMultiplier = (bpm: number) =>
  bpm <= DEFAULT_BPM
    ? 1
    : Math.min(TEMPO_MULTIPLIER_MAX, 1 + TEMPO_MULTIPLIER_GAIN * (Math.sqrt(bpm / DEFAULT_BPM) - 1))

/** What every point earned on a note called under these settings is worth. */
export const difficultyMultiplier = ({ spelling, showFretboard, bpm, beatsPerNote }: DifficultyInputs) =>
  (spelling === 'mixed' ? MIXED_SPELLING_MULTIPLIER : SINGLE_SPELLING_MULTIPLIER) *
  (showFretboard ? FRETBOARD_SHOWN_MULTIPLIER : FRETBOARD_HIDDEN_MULTIPLIER) *
  beatSpanMultiplier(beatsPerNote) *
  tempoMultiplier(bpm)

/**
 * A hit at this price, in whole points. Rounding happens here rather than on
 * the total, so what a note paid is a number the player could have counted.
 */
export const hitAward = (multiplier: number) => Math.round(POINTS_PER_HIT * multiplier)

/**
 * The same for a bonus. A `Bonus` always carries the points it was actually
 * awarded, so whatever the readout prints beside it is what the tally moved by.
 */
export const scaleBonus = (bonus: Bonus, multiplier: number): Bonus => ({
  ...bonus,
  points: Math.round(bonus.points * multiplier),
})

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
 * Why lateness is forgiven more than earliness.
 *
 * The click is a sound the app makes, so the microphone is deaf under it: every
 * frame inside a cue is discarded before scoring ever sees it. A string struck
 * *on* a click is therefore not heard on that click — the first frame that can
 * carry it arrives once the click has stopped ringing, and a strike a shade
 * early has its sustain broken across the same gap and is re-timed to the far
 * side of it too. That delay is about a fifth of a second: the click's own
 * length, the tail the room keeps, and the one microphone poll it takes to
 * notice. Left uncompensated it is longer than the whole tolerance at every
 * tempo anyone practises at, and the bonus would only ever pay players who
 * rush.
 *
 * So the window runs from a tolerance ahead of the click to that shadow behind
 * it. It is never stretched past `TEMPO_LATE_MAX_FRACTION` of the interval,
 * because beyond that the nearer click is the next one and a strike halfway
 * between two would be paid for being in time with neither. Above roughly 100
 * BPM the shadow is longer than that share of the beat, and a strike on the
 * click genuinely cannot be told from one played late; there the bonus goes
 * unpaid rather than being handed to everybody. That is the limit of listening
 * through a metronome, not a number to keep widening.
 */
export const TEMPO_CLICK_SHADOW_S = 0.23
export const TEMPO_LATE_MAX_FRACTION = 0.4

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
 *
 * `multiplier` is the price this note was called at, frozen when the window
 * opened. A settings change while the note is still sounding moves the next
 * note's price and not this one's, so a bonus discovered late is paid at what
 * the note it belongs to was worth.
 */
export type NoteWindow = {
  pc: number
  beatTime: number
  opensAt: number
  multiplier: number
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
 *
 * `multiplier` is the price the note is being called at, frozen here: a
 * settings change while it is still sounding prices the next note, not this one.
 */
export function openWindow(pc: number, beatTime: number, cueEnd: number | null, multiplier = 1): NoteWindow {
  return {
    pc,
    beatTime,
    opensAt: (cueEnd ?? beatTime) + SCORE_DECAY_MARGIN_S,
    multiplier,
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
 * from it. Every entry is asked, not just the last: the click a player was
 * aiming at is as often the one just gone as the one just arrived.
 *
 * The window around a click is not symmetrical — see `TEMPO_CLICK_SHADOW_S`.
 * Ahead of it there is the tolerance and nothing more; behind it there is the
 * stretch of time the click's own sound keeps the strike from being heard at
 * all, up to the ceiling that stops the window reaching the next click.
 */
export function tempoBonus(struckAt: number, beatTimes: number[]): Bonus | null {
  if (beatTimes.length < 2) {
    return null
  }

  const interval = beatTimes[beatTimes.length - 1] - beatTimes[beatTimes.length - 2]
  if (!(interval > 0)) {
    return null
  }

  const early = interval * TEMPO_TOLERANCE_FRACTION
  const late = Math.min(early + TEMPO_CLICK_SHADOW_S, interval * TEMPO_LATE_MAX_FRACTION)
  const inTime = beatTimes.some((time) => time - struckAt <= early && struckAt - time <= late)

  return inTime ? { kind: 'tempo', points: TEMPO_BONUS_POINTS } : null
}

/**
 * Banks a correct note: the count, the response time, the streak it continues,
 * and the points — `award`, which is `POINTS_PER_HIT` at the flat price and
 * `hitAward(multiplier)` at any other, plus every bonus it is handed.
 *
 * Everything is added verbatim, the streak included. Working the streak bonus
 * out here would mean paying a figure nobody handed in and nobody can print, so
 * `streakBonus` keeps the *rule* and the caller — which knows what the note was
 * priced at — builds the bonus, scales it, and passes it in. That is what makes
 * every entry in the readout's list the delta that actually landed in `points`.
 */
export const applyHit = (
  tally: Tally,
  responseMs: number,
  bonuses: Bonus[] = [],
  award: number = POINTS_PER_HIT,
): Tally => {
  const streak = tally.streak + 1
  const extra = bonuses.reduce((total, bonus) => total + bonus.points, 0)

  return {
    scored: tally.scored + 1,
    hits: tally.hits + 1,
    responseTimesMs: [...tally.responseTimesMs, responseMs],
    points: tally.points + award + extra,
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
