import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { BeatEvent } from '../lib/playback/machine'
import {
  applyBonus,
  applyHit,
  applyMiss,
  claimBonus,
  difficultyMultiplier,
  EMPTY_TALLY,
  hitAward,
  judgeDetection,
  octavesBonus,
  openWindow,
  scaleBonus,
  streakBonus,
  tempoBonus,
  type Bonus,
  type NoteVerdict,
  type NoteWindow,
  type Tally,
} from '../lib/scoring'
import type { HeardPitch } from './useMicPitch'

/** The slice of AudioEngine scoring needs: when the app stopped sounding. */
export type ScoringEngine = {
  getCueEndForBeat(beatTime: number): number | null
}

/** Stable identity, so a note that earned nothing publishes no change. */
const NO_BONUSES: Bonus[] = []

/**
 * How much of the beat grid is kept. The tempo bonus asks how far a strike was
 * from the nearest click and how far apart two adjacent clicks are; a handful
 * of the most recent beats answers both, and a window never outlives its span.
 */
const BEAT_RING_SIZE = 4

export type ScoreSnapshot = {
  lastVerdict: NoteVerdict | null
  tally: Tally
  /** The bonuses that landed on the last note scored, in the order they did. */
  lastBonuses: Bonus[]
  /** What the last note called was priced at, which is the reading on the line. */
  multiplier: number
}

const EMPTY_SNAPSHOT: ScoreSnapshot = {
  lastVerdict: null,
  tally: EMPTY_TALLY,
  lastBonuses: NO_BONUSES,
  multiplier: 1,
}

/**
 * Everything scoring knows, in refs. React sees only `snapshot`, and only when
 * something in it actually changed — see `publish`.
 */
type ScoringStore = {
  open: NoteWindow | null
  tally: Tally
  lastVerdict: NoteVerdict | null
  lastBonuses: Bonus[]
  /** The price in force, kept past the window that froze it so it stays readable. */
  multiplier: number
  snapshot: ScoreSnapshot
  pendingBeats: BeatEvent[]
  /** The last few clicks that sounded, oldest first: the beat grid. */
  beatTimes: number[]
  flushQueued: boolean
  listeners: Set<() => void>
}

const createStore = (): ScoringStore => ({
  open: null,
  tally: EMPTY_TALLY,
  lastVerdict: null,
  lastBonuses: NO_BONUSES,
  multiplier: 1,
  snapshot: EMPTY_SNAPSHOT,
  pendingBeats: [],
  beatTimes: [],
  flushQueued: false,
  listeners: new Set(),
})

/** One thing that landed, in the shape the shared board reports it in. */
export type ScoredEvent = { kind: 'hit' | 'miss' } | { kind: 'bonus'; bonus: 'octaves' | 'tempo' }

export type UseNoteScoringOptions = {
  engine: ScoringEngine
  /** `useMicPitch`'s subscribe — every clarity-gated detection, on the clock. */
  subscribe: (listener: (heard: HeardPitch) => void) => () => void
  /** The microphone is actually listening. Off means nothing is ever scored. */
  active: boolean
  /** Playback is running. A pause or a stop closes the open note unjudged. */
  running: boolean
  /**
   * Fired for each thing the tally banks, in the order it banked them: a hit
   * with the non-streak bonuses that landed on it, a bonus discovered later on
   * the same note, and a miss when a window closes unanswered. The streak is
   * left out because whoever is counting can count a run themselves — the
   * shared board does, from these very events, which is the point of them.
   *
   * Ref-only, like `onBeat`: it is called from inside the microtask flush, and
   * anything it does must not re-enter React from there.
   */
  onScored?: (event: ScoredEvent) => void
}

/**
 * Scores what was played against what was called, one note at a time.
 *
 * The shape of this hook is dictated by where beats come from. `onBeat` is
 * fired from inside the playback machine's scheduler loop (see the contract at
 * usePlayback.ts) and may only mutate refs: a `setState` reachable from it
 * re-enters React from an animation frame. So `handleBeat` does nothing but
 * push the event into a queue and book a microtask. The queue is drained, the
 * windows are opened and closed, and React is told about any of it from that
 * microtask — never synchronously from the callback.
 *
 * A hit is published the moment it is confirmed rather than when its window
 * closes, so the accuracy readout is about the note on screen instead of the
 * one before it. Closing a window can therefore only ever score a miss: a hit
 * was already banked when it happened.
 *
 * The window goes on listening after it has answered, because a bonus can still
 * be earned on a note already got right — a second octave is played after the
 * first, not instead of it. Banking the note is therefore tied to the moment
 * the verdict *changes* from unanswered to hit, and not to the window refusing
 * to move: every frame after that one can only ever add points.
 *
 * A note that is still open when playback pauses or stops, or when the
 * microphone drops out under it, is dropped rather than missed — nobody was
 * asked to play through a pause, so a run of correct notes survives it too. The
 * tally itself survives a stop, so the session's accuracy is still readable
 * after the last note.
 *
 * Every beat feeds the grid, not just the ones that call a note: the tempo
 * bonus is about the clicks *under* a note, and a ring that kept only the calls
 * would have a whole note span between neighbours and call that one beat. Only
 * a count-in is left out — it interrupts the grid rather than continuing it, so
 * it clears the ring instead of extending it. Which beats open and close a
 * window is unchanged: the ones that call a note, and no others.
 *
 * How much of that bonus is there to be won depends on the note-change rate. At
 * one beat per note every beat starts a note, so the only tick to be in time
 * with is the call itself, and the window does not open until the app has
 * finished speaking it; from two beats per note up there are in-span clicks
 * under the note, which is where the bonus really lives.
 *
 * What a note is worth rides in on the beat that called it, not out of the
 * settings. `onBeat` fires at visual time, and the beat behind it was scheduled
 * up to a look-ahead earlier — so reading the settings here would price a note
 * at a tempo or a span it was never called at, which is exactly what a ramp
 * step or a tempo nudge inside that window produces. The machine carries the
 * four inputs instead, `difficultyMultiplier` turns them into a price, and
 * `openWindow` freezes it on the note. Nothing is subscribed to for it, so the
 * microphone subscription cannot re-run because somebody moved the tempo.
 *
 * Points ride along with the verdict, and so do the bonuses that earned them:
 * the score is session-scoped, exactly as the accuracy is, and `reset` takes
 * both back to nothing. Every bonus is scaled where it is built, before the
 * tally moves, so each entry in `lastBonuses` is the delta that landed in
 * `points` and the readout can print it as it stands. Nothing here is written
 * anywhere.
 */
export function useNoteScoring({ engine, subscribe, active, running, onScored }: UseNoteScoringOptions) {
  const storeRef = useRef<ScoringStore | null>(null)
  const getStore = useCallback(() => (storeRef.current ??= createStore()), [])

  const engineRef = useRef(engine)
  const activeRef = useRef(active)
  const scoredRef = useRef(onScored)
  useEffect(() => {
    engineRef.current = engine
    activeRef.current = active
    scoredRef.current = onScored
  })

  // Nothing published moved unless one of these two identities did, and a
  // re-render per beat for a snapshot that says the same thing is waste.
  const publish = useCallback(() => {
    const store = getStore()
    if (
      store.snapshot.lastVerdict === store.lastVerdict &&
      store.snapshot.tally === store.tally &&
      store.snapshot.lastBonuses === store.lastBonuses &&
      store.snapshot.multiplier === store.multiplier
    ) {
      return
    }

    store.snapshot = {
      lastVerdict: store.lastVerdict,
      tally: store.tally,
      lastBonuses: store.lastBonuses,
      multiplier: store.multiplier,
    }
    for (const listener of store.listeners) {
      listener()
    }
  }, [getStore])

  const flush = useCallback(() => {
    const store = getStore()
    store.flushQueued = false

    for (const event of store.pendingBeats) {
      // A count-in interrupts the grid — at the start of a session and between
      // cycles alike. Keeping a beat either side of one would measure the whole
      // count-in as a single interval, so it is thrown away instead.
      if (event.countInValue !== undefined) {
        store.beatTimes = []
        continue
      }

      store.beatTimes = [...store.beatTimes, event.time].slice(-BEAT_RING_SIZE)

      const called = event.note
      if (called === undefined) {
        // A click landing under a note already banked can still be the one the
        // player was aiming at, when they struck it a shade early. It is the
        // beat's arrival that pays for that, not a later microphone frame that
        // may never come — through `applyBonus`, since the note is counted
        // already. Only an in-span click, which is why this sits under the
        // branch: the beat that calls the next note belongs to that note, and
        // an answer to the one before it was not played in time with it.
        const open = store.open
        if (open !== null && open.verdict?.hit === true && open.candidateAt !== null) {
          const earned = tempoBonus(open.candidateAt, store.beatTimes)
          const claimed = earned === null ? null : claimBonus(open, earned.kind)
          if (earned !== null && claimed !== null) {
            // Priced at what its own note was called at, which the window froze.
            const paid = scaleBonus(earned, open.multiplier)
            store.open = claimed
            store.tally = applyBonus(store.tally, paid)
            store.lastBonuses = [...store.lastBonuses, paid]
            scoredRef.current?.({ kind: 'bonus', bonus: 'tempo' })
          }
        }

        continue
      }

      // The previous call's window closes here, and an unanswered one is the
      // only thing a close can score. A window that was already hit was banked
      // at the moment it was confirmed.
      if (store.open !== null && store.open.verdict === null) {
        store.tally = applyMiss(store.tally)
        store.lastVerdict = { hit: false, responseMs: null }
        store.lastBonuses = NO_BONUSES
        scoredRef.current?.({ kind: 'miss' })
      }

      // The settings this note was *called* under rode the event here, because
      // the beat was scheduled up to a look-ahead before it surfaced. A beat
      // carrying none of them — an older event shape, or a test one — is priced
      // flat rather than guessed at.
      const multiplier = event.difficulty === undefined ? 1 : difficultyMultiplier(event.difficulty)
      store.multiplier = multiplier
      store.open = activeRef.current
        ? openWindow(called.pc, event.time, engineRef.current.getCueEndForBeat(event.time), multiplier)
        : null
    }

    store.pendingBeats = []
    publish()
  }, [getStore, publish])

  const scheduleFlush = useCallback(() => {
    const store = getStore()
    if (store.flushQueued) {
      return
    }

    store.flushQueued = true
    queueMicrotask(flush)
  }, [flush, getStore])

  /**
   * The `onBeat` handler. Mutates a ref and books a microtask; that is the
   * whole of it, and it has to stay that way.
   */
  const handleBeat = useCallback(
    (event: BeatEvent) => {
      // Every beat is queued, whether it calls a note or not: what it is worth
      // to the grid, and to a window, is `flush`'s question.
      getStore().pendingBeats.push(event)
      scheduleFlush()
    },
    [getStore, scheduleFlush],
  )

  useEffect(
    () =>
      subscribe((heard) => {
        const store = getStore()
        if (store.open === null) {
          return
        }

        const previous = store.open
        const judged = judgeDetection(previous, heard)
        if (judged === previous) {
          return
        }

        store.open = judged
        const verdict = judged.verdict
        if (verdict === null || !verdict.hit) {
          return
        }

        if (previous.verdict !== null) {
          // The note was banked when it was answered; this is a later frame of
          // the same note. Only a bonus can come of it, and only through
          // `applyBonus` — anything else here would count the note twice.
          const earned = octavesBonus(judged)
          const claimed = earned === null ? null : claimBonus(judged, earned.kind)
          if (claimed === null || earned === null) {
            return
          }

          // At the price its note was called at: the window froze it, so a
          // settings change under the same note cannot re-price it.
          const paid = scaleBonus(earned, judged.multiplier)
          store.open = claimed
          store.tally = applyBonus(store.tally, paid)
          store.lastBonuses = [...store.lastBonuses, paid]
          scoredRef.current?.({ kind: 'bonus', bonus: 'octaves' })
          scheduleFlush()
          return
        }

        // Banked and published together, in one deferral, while the note this
        // is an answer to is still the one on screen. The strike is timed from
        // `candidateAt` — the frame the string was actually struck on, not the
        // one that confirmed it — and the tempo bonus goes in with the hit,
        // since the click it was played against has already sounded. Every kind
        // paid here is marked on the window, so nothing can report the same
        // bonus on this note twice.
        //
        // The bonuses are built, claimed and scaled *before* the tally moves,
        // and then handed to `applyHit` whole. That order is the guarantee the
        // readout rests on: what goes into `lastBonuses` is exactly the delta
        // that went into `points`, so a scaled streak cannot print as `+5` when
        // more than five points landed.
        store.lastVerdict = verdict
        const tempo = previous.candidateAt === null ? null : tempoBonus(previous.candidateAt, store.beatTimes)

        let paid = judged
        const landed: Bonus[] = []
        for (const earned of [streakBonus(store.tally.streak + 1), tempo]) {
          const claimed = earned === null ? null : claimBonus(paid, earned.kind)
          if (earned !== null && claimed !== null) {
            paid = claimed
            landed.push(scaleBonus(earned, previous.multiplier))
          }
        }

        store.tally = applyHit(store.tally, verdict.responseMs, landed, hitAward(previous.multiplier))
        store.open = paid
        store.lastBonuses = landed.length > 0 ? landed : NO_BONUSES

        // The hit first, then the bonuses that landed with it — the order the
        // tally moved in, which is the order whoever is re-deriving it needs.
        scoredRef.current?.({ kind: 'hit' })
        for (const bonus of landed) {
          if (bonus.kind !== 'streak') {
            scoredRef.current?.({ kind: 'bonus', bonus: bonus.kind })
          }
        }

        scheduleFlush()
      }),
    [subscribe, getStore, scheduleFlush],
  )

  // A pause, a stop, or a microphone that goes away mid-note leaves a question
  // nobody was given the chance to answer. Dropping it scores nothing, and
  // nothing published changes — the tally and the last verdict stand.
  useEffect(() => {
    if (running && active) {
      return
    }

    const store = getStore()
    store.open = null
    store.pendingBeats = []
    // The grid stops with the clicks; the beats either side of a pause are not
    // an interval.
    store.beatTimes = []
  }, [running, active, getStore])

  /** Session-scoped: the score goes back to nothing with the session. */
  const reset = useCallback(() => {
    const store = getStore()
    store.open = null
    store.pendingBeats = []
    store.beatTimes = []
    store.tally = EMPTY_TALLY
    store.lastVerdict = null
    store.lastBonuses = NO_BONUSES
    store.multiplier = 1
    publish()
  }, [getStore, publish])

  const subscribeToStore = useCallback(
    (listener: () => void) => {
      const { listeners } = getStore()
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    [getStore],
  )

  const snapshot = useSyncExternalStore(
    subscribeToStore,
    useCallback(() => getStore().snapshot, [getStore]),
  )

  return {
    handleBeat,
    lastVerdict: snapshot.lastVerdict,
    tally: snapshot.tally,
    lastBonuses: snapshot.lastBonuses,
    multiplier: snapshot.multiplier,
    reset,
  }
}
