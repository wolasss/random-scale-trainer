import { spellNote, type NoteCall, type SpellingPreference } from '../notes'
import { shuffleStrings } from '../strings'

export type NoteDeckDeps = {
  /** Read fresh at every refill so pool edits land on the next bag. */
  getPool(): number[]
  /** Read fresh at every refill; mixed spelling is decided per enqueued call. */
  getSpelling(): SpellingPreference
  /** Read fresh at every refill: should each call also name a string? */
  getStringCalls?(): boolean
  random?: () => number
}

export type NoteDeck = {
  /** Upcoming note without consuming it; tops the deck up so it always exists. */
  peek(offset?: number): NoteCall | null
  /** Pops the next note and remembers its pitch class for the boundary rule. */
  draw(): NoteCall | null
  /** Drops pending entries (pool/spelling changed) so the change takes effect
   * on the next note; the last played pitch class is kept. */
  invalidate(): void
  reset(): void
}

/**
 * Shuffled-bag note source: each refill deals every pool note exactly once in
 * random order, so nothing repeats or starves within a cycle. A bag whose
 * first note would repeat the previous one is reordered at the boundary.
 *
 * String calls ride a second bag of their own, dealt a string at a time and
 * refilled when it runs dry. Keeping it separate from the note bag is what
 * makes all six strings come up whatever the pool is: a two-note pool still
 * walks the whole neck, over three bags rather than one.
 */
export const createNoteDeck = (deps: NoteDeckDeps): NoteDeck => {
  const random = deps.random ?? Math.random

  let deck: NoteCall[] = []
  let lastPc: number | null = null
  let stringBag: number[] = []

  const nextString = () => {
    if (stringBag.length === 0) {
      stringBag = shuffleStrings(random)
    }

    return stringBag.shift()!
  }

  const refill = () => {
    const pool = deps.getPool()
    if (pool.length === 0) {
      return false
    }

    const bag = [...pool]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }

    const previousPc = deck.length > 0 ? deck[deck.length - 1].pc : lastPc
    if (bag.length > 1 && bag[0] === previousPc) {
      ;[bag[0], bag[1]] = [bag[1], bag[0]]
    }

    const spelling = deps.getSpelling()
    const stringCalls = deps.getStringCalls?.() ?? false
    deck.push(
      ...bag.map((pc, index) => ({
        pc,
        ...spellNote(pc, spelling, random),
        cycleStart: index === 0,
        bagSize: bag.length,
        ...(stringCalls ? { stringIndex: nextString() } : {}),
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
      // The string bag survives, exactly as lastPc does: a pool edit is no
      // reason to hand out a string that has already come round this bag.
      deck = []
    },
    reset: () => {
      deck = []
      lastPc = null
      stringBag = []
    },
  }
}
