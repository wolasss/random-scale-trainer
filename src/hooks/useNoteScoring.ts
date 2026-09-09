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
  isPracticeMilestone,
  judgeDetection,
  octavesBonus,
  openWindow,
  practiceMilestonesCrossed,
  scaleBonus,
  streakBonus,
  tempoBonus,
  type Bonus,
  type BonusKind,
  type NoteVerdict,
  type NoteWindow,
  type ScoredEvent,
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
  /**
   * The bonuses that landed on the last note scored, in the order they did —
   * or, for a practice milestone, the bonus the session clock just earned. A
   * milestone belongs to no note of its own, so it rides here too, shown
   * beside whatever note was scored last until the next one clears it.
   */
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
  /**
   * The call the last note was made on, which is what a practice milestone is
   * stamped with. A milestone belongs to the clock rather than to a note, so it
   * has no time of its own to report — and hanging it on the latest call is
   * what keeps the reported run in order, since every note after it is called
   * later still. Zero until a note has been called, and a milestone before that
   * is not reported at all: there is no run for it to belong to yet.
   */
  lastCallAt: number
  /** The session-elapsed total, plus `rebase`'s offset, already priced. */
  milestoneSeenMs: number
  /** What `rebase` has added to `sessionElapsedMs` to keep the total continuous. */
  milestoneOffsetMs: number
  /** Which milestones this session has already banked — paid once, ever. */
  milestonesPaid: Set<BonusKind>
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
  lastCallAt: 0,
  milestoneSeenMs: 0,
  milestoneOffsetMs: 0,
  milestonesPaid: new Set(),
  flushQueued: false,
  listeners: new Set(),
})

export type { ScoredEvent } from '../lib/scoring'

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
   * A hit also carries what its note was *called* under, so the same board can
   * price it exactly as the readout does. Only the hit does: a miss is worth
   * nothing at any price, and a bonus is paid at the price of the note it
   * landed on, which whoever is counting has had since that note's hit.
   *
   * Ref-only, like `onBeat`: it is called from inside the microtask flush, and
   * anything it does must not re-enter React from there.
   */
  onScored?: (event: ScoredEvent) => void
  /**
   * The session clock, raw — the caller does not need to adjust it around a
   * clear. `rebase` below folds a cleared amount back in so the milestones it
   * drives stay continuous across the reset.
   */
  sessionElapsedMs: number
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
 *
 * The practice milestones ride the same session but not the same beats: they
 * are earned by `sessionElapsedMs` crossing 10, 20 or 30 minutes, credited by
 * `creditElapsedMs`, a function that never touches the microphone
 * subscription and is both run from its own effect and exposed for a caller
 * that cannot wait for the next render — `App.tsx`'s `onSessionPause` calls
 * it with the elapsed that pause just pushed, so a crossing landing on the
 * very update that stops playback is banked with the pause itself rather
 * than a render later. They are gated on `active` rather than
 * `running`, because `sessionTimer.pause()` pushes its final elapsed on the
 * very render that turns `running` off — a routine that finishes exactly at a
 * milestone would lose it if the gate were `running`. Paid flat, through
 * `applyBonus`, never through `scaleBonus`: a milestone belongs to no note,
 * so no note's multiplier prices it. `milestoneSeenMs` remembers the elapsed
 * total already accounted for and `milestonesPaid` remembers which kinds have
 * been banked, so calling `creditElapsedMs` twice with the same total, from
 * the effect or from `onSessionPause`, recomputes the same crossing and pays
 * nothing twice. A session clock put back to zero — `App.tsx`'s `clearTimer`
 * — would otherwise strand those guards partway to a threshold they will
 * never see again, which is what `rebase` is for: it offsets the total
 * `creditElapsedMs` reads without touching what has already been seen or paid.
 */
export function useNoteScoring({
  engine,
  subscribe,
  active,
  running,
  onScored,
  sessionElapsedMs,
}: UseNoteScoringOptions) {
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
            scoredRef.current?.({ kind: 'bonus', bonus: 'tempo', at: open.beatTime })
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
        // The note that went unanswered, not the beat that closed it: a miss
        // belongs to its own call, exactly as a hit does.
        scoredRef.current?.({ kind: 'miss', at: store.open.beatTime })
      }

      // The settings this note was *called* under rode the event here, because
      // the beat was scheduled up to a look-ahead before it surfaced. A beat
      // carrying none of them — an older event shape, or a test one — is priced
      // flat rather than guessed at.
      const price = event.difficulty ?? 1
      store.multiplier = typeof price === 'number' ? price : difficultyMultiplier(price)
      store.lastCallAt = event.time
      store.open = activeRef.current
        ? openWindow(called.pc, event.time, engineRef.current.getCueEndForBeat(event.time), price)
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
          scoredRef.current?.({ kind: 'bonus', bonus: 'octaves', at: judged.beatTime })
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
        // All of them stamped with the note's own call, so a run of notes is
        // reported at the spacing the app actually called them at, and the hit
        // carries the settings that priced it so the same run reprices to the
        // same total. Only the two kinds a note is worth more for go up: the
        // streak is re-derived from the hits themselves, and a practice
        // milestone is the clock's rather than any note's, so neither is a
        // note's to report.
        scoredRef.current?.({ kind: 'hit', at: previous.beatTime, difficulty: previous.difficulty })
        for (const bonus of landed) {
          if (bonus.kind === 'octaves' || bonus.kind === 'tempo') {
            scoredRef.current?.({ kind: 'bonus', bonus: bonus.kind, at: previous.beatTime })
          }
        }

        scheduleFlush()
      }),
    [subscribe, getStore, scheduleFlush],
  )

  // The clock's own bonus, entirely apart from the beat/microphone machinery
  // above: nothing here is a subscription input, so a tick can never tear
  // down and rebuild the mic listener. `milestoneSeenMs` is updated whether
  // or not it is paid, so a re-run finds nothing new to credit —
  // `milestonesPaid` is the second guard on top of that, so nothing here is
  // ever banked twice. Also exposed as `creditElapsedMs` below: `onSessionPause`
  // runs outside React's render cycle, and a crossing that lands on the very
  // elapsed update that stops playback is banked with that pause rather than
  // left for the next render.
  const creditElapsedMs = useCallback(
    (elapsedMs: number) => {
      const store = getStore()
      const total = elapsedMs + store.milestoneOffsetMs
      const crossed = practiceMilestonesCrossed(store.milestoneSeenMs, total)
      store.milestoneSeenMs = total

      if (!active || crossed.length === 0) {
        return
      }

      let changed = false
      for (const bonus of crossed) {
        if (store.milestonesPaid.has(bonus.kind)) {
          continue
        }

        store.milestonesPaid.add(bonus.kind)
        store.tally = applyBonus(store.tally, bonus)
        store.lastBonuses = [...store.lastBonuses, bonus]
        if (store.lastCallAt > 0 && isPracticeMilestone(bonus.kind)) {
          scoredRef.current?.({ kind: 'milestone', milestone: bonus.kind, at: store.lastCallAt })
        }

        changed = true
      }

      if (changed) {
        publish()
      }
    },
    [active, getStore, publish],
  )

  useEffect(() => {
    creditElapsedMs(sessionElapsedMs)
  }, [sessionElapsedMs, creditElapsedMs])

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
    store.lastCallAt = 0
    store.tally = EMPTY_TALLY
    store.lastVerdict = null
    store.lastBonuses = NO_BONUSES
    store.multiplier = 1
    store.milestoneSeenMs = 0
    store.milestoneOffsetMs = 0
    store.milestonesPaid = new Set()
    publish()
  }, [getStore, publish])

  /**
   * Offsets the milestone clock by `removedMs` without touching what has
   * already been seen or paid. `sessionElapsedMs` is owned by the caller —
   * see `App.tsx`'s `clearTimer`, which puts the session clock back to zero
   * while playback keeps running — and without this the milestone guards
   * would be stranded partway to a threshold `sessionElapsedMs` can never
   * reach again, so a later milestone would arrive late or never.
   */
  const rebase = useCallback(
    (removedMs: number) => {
      getStore().milestoneOffsetMs += removedMs
    },
    [getStore],
  )

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
    rebase,
    creditElapsedMs,
  }
}
