import { spellNote, type NoteCall, type SpellingPreference } from '../notes'

/** How each refill orders the pool: a fresh shuffle, or round the circle of fourths. */
export type NoteOrder = 'shuffled' | 'fourths'

export const NOTE_ORDERS: readonly NoteOrder[] = ['shuffled', 'fourths']

/** A fourth up is five semitones; twelve of them visit every pitch class once. */
const FOURTH = 5

const fourthAbove = (pc: number, steps: number) => (pc + FOURTH * steps) % 12

/**
 * The pool's pitch classes in circle-of-fourths order from `startPc`
 * (C F Bb Eb… from C), skipping any the pool doesn't hold.
 */
export const fourthsOrder = (pool: readonly number[], startPc: number): number[] => {
  const held = new Set(pool)
  const ordered: number[] = []
  for (let step = 0; step < 12; step++) {
    const pc = fourthAbove(startPc, step)
    if (held.has(pc)) {
      ordered.push(pc)
    }
  }

  return ordered
}

export type NoteDeckDeps = {
  /** Read fresh at every refill so pool edits land on the next bag. */
  getPool(): number[]
  /** Read fresh at every refill; mixed spelling is decided per enqueued call. */
  getSpelling(): SpellingPreference
  /** Read fresh at every refill, like the pool; shuffled when absent. */
  getOrder?: (() => NoteOrder) | undefined
  random?: (() => number) | undefined
}

export type NoteDeck = {
  /** Upcoming note without consuming it; tops the deck up so it always exists. */
  peek(offset?: number): NoteCall | null
  /** Pops the next note and remembers its pitch class for the boundary rule. */
  draw(): NoteCall | null
  /** Drops pending entries (pool/spelling/order changed) so the change takes
   * effect on the next note; the last played pitch class is kept. */
  invalidate(): void
  reset(): void
}

/**
 * Bag note source: each refill deals every pool note exactly once, so nothing
 * repeats or starves within a cycle. Shuffled deals each bag in random order,
 * and a bag whose first note would repeat the previous one is reordered at
 * the boundary. Fourths starts on a random pool note after a reset and
 * otherwise carries on round the circle from the previous note, so a cycle
 * boundary never repeats one either.
 */
export const createNoteDeck = (deps: NoteDeckDeps): NoteDeck => {
  const random = deps.random ?? Math.random

  let deck: NoteCall[] = []
  let lastPc: number | null = null

  const shuffledBag = (pool: number[], previousPc: number | null) => {
    const bag = [...pool]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }

    if (bag.length > 1 && bag[0] === previousPc) {
      ;[bag[0], bag[1]] = [bag[1], bag[0]]
    }

    return bag
  }

  const fourthsBag = (pool: number[], previousPc: number | null) => {
    if (previousPc === null) {
      return fourthsOrder(pool, pool[Math.floor(random() * pool.length)])
    }

    // Start on the first pool note round the circle from the previous one.
    // Twelve steps come back to it, so a pool of one still deals.
    const held = new Set(pool)
    let step = 1
    while (!held.has(fourthAbove(previousPc, step))) {
      step++
    }

    return fourthsOrder(pool, fourthAbove(previousPc, step))
  }

  const refill = () => {
    const pool = deps.getPool()
    if (pool.length === 0) {
      return false
    }

    const previousPc = deck.length > 0 ? deck[deck.length - 1].pc : lastPc
    const order = deps.getOrder?.() ?? 'shuffled'
    const bag = order === 'fourths' ? fourthsBag(pool, previousPc) : shuffledBag(pool, previousPc)

    const spelling = deps.getSpelling()
    deck.push(
      ...bag.map((pc, index) => ({
        pc,
        ...spellNote(pc, spelling, random),
        cycleStart: index === 0,
        bagSize: bag.length,
      })),
    )

    return true
  }

  const topUp = (minimum: number) => {
    while (deck.length < minimum && refill()) {
      // refill() appends one full bag per pass.
    }
  }

  return {
    peek: (offset = 0) => {
      topUp(Math.max(2, offset + 1))
      return deck[offset] ?? null
    },
    draw: () => {
      topUp(2)
      const call = deck.shift() ?? null
      if (call) {
        lastPc = call.pc
      }
      topUp(2)

      return call
    },
    invalidate: () => {
      deck = []
    },
    reset: () => {
      deck = []
      lastPc = null
    },
  }
}
