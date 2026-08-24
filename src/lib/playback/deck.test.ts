// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createNoteDeck } from './deck'
import type { SpellingPreference } from '../notes'

/** Deterministic RNG: yields the given values in order, then 0.5 forever. */
const sequence = (...values: number[]) => {
  let index = 0
  return () => values[index++] ?? 0.5
}

/** With j === i at every Fisher–Yates step the bag keeps pool order. */
const IDENTITY = 0.99

const makeDeck = (
  pool: number[],
  options: { spelling?: SpellingPreference; random?: () => number } = {},
) => {
  const state = { pool, spelling: options.spelling ?? ('flat' as SpellingPreference) }
  const deck = createNoteDeck({
    getPool: () => state.pool,
    getSpelling: () => state.spelling,
    random: options.random ?? sequence(),
  })

  return { deck, state }
}

describe('createNoteDeck', () => {
  it('deals every pool pitch class exactly once per bag', () => {
    const { deck } = makeDeck([0, 2, 4, 7, 9])

    const firstBag = Array.from({ length: 5 }, () => deck.draw()!.pc)
    expect([...firstBag].sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9])

    const secondBag = Array.from({ length: 5 }, () => deck.draw()!.pc)
    expect([...secondBag].sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9])
  })

  it('marks only bag heads as cycle starts', () => {
    const { deck } = makeDeck([0, 1, 2])

    const flags = Array.from({ length: 6 }, () => deck.draw()!.cycleStart)
    expect(flags).toEqual([true, false, false, true, false, false])
  })

  it('never repeats a pitch class across a cycle boundary', () => {
    // Bag 1 shuffles to [0,1,2] (identity); bag 2 shuffles to [2,1,0], whose
    // head repeats the previous tail → the deck must swap it to [1,2,0].
    const { deck } = makeDeck([0, 1, 2], {
      random: sequence(IDENTITY, IDENTITY, 0, IDENTITY),
    })

    const drawn = Array.from({ length: 6 }, () => deck.draw()!.pc)
    expect(drawn).toEqual([0, 1, 2, 1, 2, 0])
    expect(drawn[3]).not.toBe(drawn[2])
  })

  it('keeps the cycle-start flag on the bag head after the boundary swap', () => {
    const { deck } = makeDeck([0, 1, 2], {
      random: sequence(IDENTITY, IDENTITY, 0, IDENTITY),
    })

    const calls = Array.from({ length: 6 }, () => deck.draw()!)
    expect(calls.map((call) => call.cycleStart)).toEqual([true, false, false, true, false, false])
  })

  it('handles a pool of one without looping or applying the boundary guard', () => {
    const { deck } = makeDeck([5])

    expect(deck.draw()!.pc).toBe(5)
    expect(deck.draw()!.pc).toBe(5)
    expect(deck.peek()!.pc).toBe(5)
  })

  it('peek previews without consuming and reaches into later bags', () => {
    const { deck } = makeDeck([0, 1, 2])

    const previewed = deck.peek()!
    expect(deck.peek()).toBe(previewed)
    expect(deck.draw()).toBe(previewed)
    expect(deck.peek(3)).not.toBeNull() // beyond the current bag
  })

  it('returns null for an empty pool instead of spinning', () => {
    const { deck } = makeDeck([])

    expect(deck.peek()).toBeNull()
    expect(deck.draw()).toBeNull()
  })

  it('invalidate clears pending notes but still avoids repeating the last played note', () => {
    const { deck } = makeDeck([0, 1, 2], {
      random: sequence(IDENTITY, IDENTITY, IDENTITY, IDENTITY),
    })

    expect(deck.draw()!.pc).toBe(0)
    deck.invalidate()

    // The fresh identity bag would lead with 0 again; lastPc forces the swap.
    expect(deck.peek()!.pc).toBe(1)
  })

  it('reset forgets the last played note', () => {
    const { deck } = makeDeck([0, 1, 2], {
      random: sequence(IDENTITY, IDENTITY, IDENTITY, IDENTITY),
    })

    expect(deck.draw()!.pc).toBe(0)
    deck.reset()

    expect(deck.peek()!.pc).toBe(0) // no boundary rule against a forgotten note
  })

  it('re-reads pool and spelling at refill time', () => {
    const { deck, state } = makeDeck([0, 1])

    expect(deck.draw()!.display).toBe('C')
    state.pool = [8]
    state.spelling = 'sharp'
    deck.invalidate()

    expect(deck.peek()!).toMatchObject({ pc: 8, display: 'G♯', audioKey: 'G#' })
  })

  /**
   * invalidate() only empties the bag; the next peek/draw refills it from
   * getPool() as it reads *at that moment*. So invalidating before the new pool
   * is observable re-seeds the deck with the old one — which is why a routine
   * block must not invalidate from inside the timer callback, ahead of React
   * committing its settings. See the note in useRoutine's applyBlock.
   */
  it('re-seeds from the pool visible at invalidation time, not a later one', () => {
    const { deck, state } = makeDeck([0, 2, 4, 5, 7, 9, 11]) // naturals

    deck.peek()
    deck.invalidate()
    const beforeTheSwitchLands = deck.peek()!

    state.pool = [1, 3, 6, 8, 10] // accidentals — the pool the caller wanted

    expect([0, 2, 4, 5, 7, 9, 11]).toContain(beforeTheSwitchLands.pc)
    expect(deck.draw()!.pc).toBe(beforeTheSwitchLands.pc)

    // Invalidating again once the new pool is visible is what actually switches it.
    deck.invalidate()
    expect([1, 3, 6, 8, 10]).toContain(deck.peek()!.pc)
  })

  it('threads the RNG into mixed spelling decisions', () => {
    const { deck } = makeDeck([1], { spelling: 'mixed', random: () => 0 })

    expect(deck.draw()!).toMatchObject({ display: 'C♯', audioKey: 'C#' })
  })
})
