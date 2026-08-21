import { describe, expect, it } from 'vitest'
import { createSchedulingState, stepBeat, type BeatProgramInputs, type DeckView } from './program'
import { COUNT_IN_BEATS } from '../../constants'
import type { NoteCall } from '../notes'

const note = (pc: number, cycleStart: boolean, bagSize: number): NoteCall => ({
  pc,
  display: 'C',
  audioKey: 'C',
  cycleStart,
  bagSize,
})

const INPUTS: BeatProgramInputs = {
  time: 1,
  beatsPerNote: 1,
  countInEnabled: false,
  continuousMode: true,
  bpm: 90,
  spelling: 'mixed',
  showFretboard: false,
  pool: [0, 1, 2],
}

const view = (head: NoteCall | null, following: NoteCall | null = null): DeckView => ({ head, following })

describe('count-in beats', () => {
  it('accents only the first digit and counts down without moving the span', () => {
    const state = createSchedulingState(COUNT_IN_BEATS)
    const first = stepBeat(state, view(note(0, true, 2)), INPUTS)

    expect(first).toMatchObject({ kind: 'beat', consumesNote: false, crossedBoundary: false })
    if (first.kind !== 'beat') throw new Error('expected a beat')
    expect(first.event).toMatchObject({ isCountIn: true, countInValue: COUNT_IN_BEATS, accent: true, beatInSpan: 0 })
    expect(first.event.nextNote?.pc).toBe(0) // the note the count-in is leading into
    expect(first.state).toMatchObject({ countInRemaining: COUNT_IN_BEATS - 1, beatInSpan: 0 })

    const second = stepBeat(first.state, view(note(0, true, 2)), INPUTS)
    if (second.kind !== 'beat') throw new Error('expected a beat')
    expect(second.event).toMatchObject({ accent: false, countInValue: COUNT_IN_BEATS - 1 })
  })
})

describe('note and filler beats', () => {
  it('reports a note beat as consuming the head and previews the follower', () => {
    const step = stepBeat(createSchedulingState(), view(note(0, true, 2), note(1, false, 2)), INPUTS)

    expect(step).toMatchObject({ kind: 'beat', consumesNote: true })
    if (step.kind !== 'beat') throw new Error('expected a beat')
    expect(step.event).toMatchObject({ accent: true, isCountIn: false, positionInCycle: 1, completedCycle: false })
    expect(step.event.note?.pc).toBe(0)
    expect(step.event.nextNote?.pc).toBe(1)
    expect(step.state).toMatchObject({ positionInCycle: 1, bagSize: 2, anyNoteScheduled: true })
  })

  it('carries the settings the note is being called under', () => {
    // Scoring prices a note at these, and the event is the only place they can
    // come from: it surfaces up to a look-ahead after they were read.
    const step = stepBeat(createSchedulingState(), view(note(0, true, 2)), { ...INPUTS, beatsPerNote: 8, bpm: 132 })

    if (step.kind !== 'beat') throw new Error('expected a beat')
    expect(step.event.difficulty).toEqual({
      spelling: 'mixed',
      showFretboard: false,
      bpm: 132,
      beatsPerNote: 8,
      // The pool is one of the settings a note is priced by: how much of the
      // octave it could have been drawn from.
      pool: [0, 1, 2],
    })
  })

  it('prices nothing on a count-in click or a beat inside a span', () => {
    // Neither calls a note, and a beat that called nothing has no price.
    const counting = stepBeat(createSchedulingState(COUNT_IN_BEATS), view(note(0, true, 2)), INPUTS)
    if (counting.kind !== 'beat') throw new Error('expected a beat')
    expect(counting.event.difficulty).toBeUndefined()

    const inputs = { ...INPUTS, beatsPerNote: 2 }
    const first = stepBeat(createSchedulingState(), view(note(0, true, 2)), inputs)
    if (first.kind !== 'beat') throw new Error('expected a beat')

    const filler = stepBeat(first.state, view(note(1, false, 2)), inputs)
    if (filler.kind !== 'beat') throw new Error('expected a beat')
    expect(filler.event.difficulty).toBeUndefined()
  })

  it('fills the rest of the span without consuming a note', () => {
    const inputs = { ...INPUTS, beatsPerNote: 3 }
    const first = stepBeat(createSchedulingState(), view(note(0, true, 2), note(1, false, 2)), inputs)
    if (first.kind !== 'beat') throw new Error('expected a beat')
    expect(first.state.beatInSpan).toBe(1)

    const filler = stepBeat(first.state, view(note(1, false, 2)), inputs)
    expect(filler).toMatchObject({ kind: 'beat', consumesNote: false })
    if (filler.kind !== 'beat') throw new Error('expected a beat')
    // The filler repeats the current note's position and previews the head.
    expect(filler.event).toMatchObject({ accent: false, beatInSpan: 1, positionInCycle: 1 })
    expect(filler.event.nextNote?.pc).toBe(1)

    const last = stepBeat(filler.state, view(note(1, false, 2)), inputs)
    if (last.kind !== 'beat') throw new Error('expected a beat')
    expect(last.event.beatInSpan).toBe(2)
    expect(last.state.beatInSpan).toBe(0) // the span wraps back to a note beat
  })
})

describe('cycle boundaries', () => {
  const dealtCycle = () => ({
    ...createSchedulingState(),
    positionInCycle: 2,
    bagSize: 2,
    anyNoteScheduled: true,
  })

  it('ends the session at a completed cycle when it does not loop', () => {
    const step = stepBeat(dealtCycle(), view(note(0, true, 2)), { ...INPUTS, continuousMode: false })

    expect(step).toEqual(expect.objectContaining({ kind: 'end', bagSize: 2, crossedBoundary: true }))
  })

  it('arms a between-cycle count-in and draws only once it is dealt', () => {
    const inputs = { ...INPUTS, countInEnabled: true }
    const armed = stepBeat(dealtCycle(), view(note(0, true, 2)), inputs)

    expect(armed).toMatchObject({ kind: 'armCountIn', crossedBoundary: true })
    if (armed.kind !== 'armCountIn') throw new Error('expected a count-in')
    expect(armed.state.countInRemaining).toBe(COUNT_IN_BEATS)

    let state = armed.state
    for (let i = 0; i < COUNT_IN_BEATS; i++) {
      const click = stepBeat(state, view(note(0, true, 2)), inputs)
      if (click.kind !== 'beat') throw new Error('expected a beat')
      state = click.state
    }

    // Re-entering the same boundary now draws, and does not ramp a second time.
    const drawn = stepBeat(state, view(note(0, true, 2), note(1, false, 2)), inputs)
    expect(drawn).toMatchObject({ kind: 'beat', consumesNote: true, crossedBoundary: false })
    if (drawn.kind !== 'beat') throw new Error('expected a beat')
    expect(drawn.event.completedCycle).toBe(true)
  })

  it('does not cross a boundary when a pool edit truncated the bag', () => {
    const truncated = { ...createSchedulingState(), positionInCycle: 1, bagSize: 3, anyNoteScheduled: true }
    const step = stepBeat(truncated, view(note(5, true, 2), note(6, false, 2)), { ...INPUTS, continuousMode: false })

    expect(step).toMatchObject({ kind: 'beat', crossedBoundary: false })
    if (step.kind !== 'beat') throw new Error('expected a beat')
    expect(step.event.completedCycle).toBe(false)
  })
})

describe('an empty deck', () => {
  it('runs dry when there is no head to deal', () => {
    expect(stepBeat(createSchedulingState(), view(null), INPUTS)).toEqual({ kind: 'dry' })
  })
})
