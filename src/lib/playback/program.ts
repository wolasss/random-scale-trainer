import { COUNT_IN_BEATS } from '../../constants'
import type { NoteCall, SpellingPreference } from '../notes'
import type { DifficultyInputs } from '../scoring'

/** One scheduled beat, delivered to the UI when the audio clock reaches it. */
export type BeatEvent = {
  /** Absolute AudioContext time of the click. */
  time: number
  accent: boolean
  isCountIn: boolean
  countInValue?: number
  /** Present when this beat starts a new note span. */
  note?: NoteCall
  /**
   * The settings this note is being *called* under, carried so scoring prices
   * it at them. Only ever set beside `note`: a count-in click and an in-span
   * click call nothing, so there is nothing for them to price.
   */
  difficulty?: DifficultyInputs
  /** The note after `note`, peeked at schedule time (drives the NEXT chip). */
  nextNote: NoteCall | null
  beatInSpan: number
  positionInCycle: number | null
  /** True when `note` starts a new cycle right after a fully completed one. */
  completedCycle: boolean
}

/** Every field the per-beat program carries from one beat to the next. */
export type SchedulingState = {
  countInRemaining: number
  beatInSpan: number
  positionInCycle: number
  /** Size of the bag the current cycle was dealt from. */
  bagSize: number
  anyNoteScheduled: boolean
  /** A cycle boundary is processed once (ramp, stop, count-in); after a
   * between-cycle count-in the scheduler re-enters the same boundary to draw. */
  boundaryProcessed: boolean
}

/** The pre-first-beat state, optionally armed with an opening count-in. */
export const createSchedulingState = (countInRemaining = 0): SchedulingState => ({
  countInRemaining,
  beatInSpan: 0,
  positionInCycle: 0,
  bagSize: 0,
  anyNoteScheduled: false,
  boundaryProcessed: false,
})

/**
 * The caller's read of the deck, taken before the step runs. The step decides
 * whether the head is consumed; the caller performs the draw afterwards.
 */
export type DeckView = {
  head: NoteCall | null
  /** The note after the head — what the NEXT chip shows once the head pops. */
  following: NoteCall | null
}

export type BeatProgramInputs = {
  /** Absolute AudioContext time this beat is being scheduled at. */
  time: number
  beatsPerNote: number
  countInEnabled: boolean
  continuousMode: boolean
  /** The tempo this beat is being scheduled at, not the one it surfaces at. */
  bpm: number
  spelling: SpellingPreference
  showFretboard: boolean
  /** The pitch classes this beat's note is being drawn from, which price it. */
  pool: readonly number[]
}

/** What the shell should do with the beat the program just decided. */
export type BeatStep =
  /** Play and queue `event`; draw the head first when `consumesNote`. */
  | { kind: 'beat'; state: SchedulingState; event: BeatEvent; crossedBoundary: boolean; consumesNote: boolean }
  /** A between-cycle count-in is armed: no beat, no draw, no clock advance —
   * the scheduler re-enters this same boundary once the clicks are dealt. */
  | { kind: 'armCountIn'; state: SchedulingState; crossedBoundary: boolean }
  /** The last cycle finished and the session does not loop. */
  | { kind: 'end'; state: SchedulingState; bagSize: number; crossedBoundary: boolean }
  /** Nothing left to deal. */
  | { kind: 'dry' }

/**
 * The per-beat decision, as a pure function: scheduling state and a deck read
 * in, the next state and one instruction out. No audio, no deck, no clock.
 */
export const stepBeat = (state: SchedulingState, view: DeckView, inputs: BeatProgramInputs): BeatStep => {
  const advanceSpan = (beatInSpan: number) => (beatInSpan + 1) % Math.max(1, inputs.beatsPerNote)

  if (state.countInRemaining > 0) {
    const value = state.countInRemaining
    const accent = value === COUNT_IN_BEATS

    return {
      kind: 'beat',
      // The count-in sits outside the note span, so beatInSpan does not move.
      state: { ...state, countInRemaining: value - 1 },
      event: {
        time: inputs.time,
        accent,
        isCountIn: true,
        countInValue: value,
        nextNote: view.head,
        beatInSpan: 0,
        positionInCycle: null,
        completedCycle: false,
      },
      crossedBoundary: false,
      consumesNote: false,
    }
  }

  if (state.beatInSpan !== 0) {
    return {
      kind: 'beat',
      state: { ...state, beatInSpan: advanceSpan(state.beatInSpan) },
      event: {
        time: inputs.time,
        accent: false,
        isCountIn: false,
        nextNote: view.head,
        beatInSpan: state.beatInSpan,
        positionInCycle: state.positionInCycle,
        completedCycle: false,
      },
      crossedBoundary: false,
      consumesNote: false,
    }
  }

  const head = view.head
  if (!head) {
    return { kind: 'dry' }
  }

  // A cycle only counts as completed when the previous bag was fully dealt;
  // a bag truncated by a pool edit must not trigger the ramp or the ending.
  const completedCycle = head.cycleStart && state.anyNoteScheduled && state.positionInCycle === state.bagSize
  const crossedBoundary = completedCycle && !state.boundaryProcessed

  if (crossedBoundary) {
    const atBoundary: SchedulingState = { ...state, boundaryProcessed: true }

    if (!inputs.continuousMode) {
      return { kind: 'end', state: atBoundary, bagSize: state.bagSize, crossedBoundary }
    }

    if (inputs.countInEnabled) {
      // Count in again before the new cycle; the next scheduler passes deal
      // the clicks, then re-enter this boundary to draw the note.
      return {
        kind: 'armCountIn',
        state: { ...atBoundary, countInRemaining: COUNT_IN_BEATS },
        crossedBoundary,
      }
    }
  }

  const positionInCycle = head.cycleStart ? 1 : state.positionInCycle + 1

  return {
    kind: 'beat',
    state: {
      ...state,
      beatInSpan: advanceSpan(state.beatInSpan),
      positionInCycle,
      bagSize: head.bagSize,
      anyNoteScheduled: true,
      boundaryProcessed: false,
    },
    event: {
      time: inputs.time,
      accent: true,
      isCountIn: false,
      note: head,
      difficulty: {
        spelling: inputs.spelling,
        showFretboard: inputs.showFretboard,
        bpm: inputs.bpm,
        beatsPerNote: inputs.beatsPerNote,
        pool: inputs.pool,
      },
      nextNote: view.following,
      beatInSpan: 0,
      positionInCycle,
      completedCycle,
    },
    crossedBoundary,
    consumesNote: true,
  }
}
