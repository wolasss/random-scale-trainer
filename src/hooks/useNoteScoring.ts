import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { BeatEvent } from '../lib/playback/machine'
import {
  applyHit,
  applyMiss,
  EMPTY_TALLY,
  judgeDetection,
  openWindow,
  type NoteVerdict,
  type NoteWindow,
  type Tally,
} from '../lib/scoring'
import type { HeardPitch } from './useMicPitch'

/** The slice of AudioEngine scoring needs: when the app stopped sounding. */
export type ScoringEngine = {
  getCueEndForBeat(beatTime: number): number | null
}

export type ScoreSnapshot = {
  lastVerdict: NoteVerdict | null
  tally: Tally
}

const EMPTY_SNAPSHOT: ScoreSnapshot = { lastVerdict: null, tally: EMPTY_TALLY }

/**
 * Everything scoring knows, in refs. React sees only `snapshot`, and only when
 * something in it actually changed — see `publish`.
 */
type ScoringStore = {
  open: NoteWindow | null
  tally: Tally
  lastVerdict: NoteVerdict | null
  snapshot: ScoreSnapshot
  pendingBeats: BeatEvent[]
  flushQueued: boolean
  listeners: Set<() => void>
}

const createStore = (): ScoringStore => ({
  open: null,
  tally: EMPTY_TALLY,
  lastVerdict: null,
  snapshot: EMPTY_SNAPSHOT,
  pendingBeats: [],
  flushQueued: false,
  listeners: new Set(),
})

export type UseNoteScoringOptions = {
  engine: ScoringEngine
  /** `useMicPitch`'s subscribe — every clarity-gated detection, on the clock. */
  subscribe: (listener: (heard: HeardPitch) => void) => () => void
  /** The microphone is actually listening. Off means nothing is ever scored. */
  active: boolean
  /** Playback is running. A pause or a stop closes the open note unjudged. */
  running: boolean
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
 * A note that is still open when playback pauses or stops, or when the
 * microphone drops out under it, is dropped rather than missed — nobody was
 * asked to play through a pause. The tally itself survives a stop, so the
 * session's accuracy is still readable after the last note.
 */
export function useNoteScoring({ engine, subscribe, active, running }: UseNoteScoringOptions) {
  const storeRef = useRef<ScoringStore | null>(null)
  const getStore = useCallback(() => (storeRef.current ??= createStore()), [])

  const engineRef = useRef(engine)
  const activeRef = useRef(active)
  useEffect(() => {
    engineRef.current = engine
    activeRef.current = active
  })

  // Nothing published moved unless one of these two identities did, and a
  // re-render per beat for a snapshot that says the same thing is waste.
  const publish = useCallback(() => {
    const store = getStore()
    if (store.snapshot.lastVerdict === store.lastVerdict && store.snapshot.tally === store.tally) {
      return
    }

    store.snapshot = { lastVerdict: store.lastVerdict, tally: store.tally }
    for (const listener of store.listeners) {
      listener()
    }
  }, [getStore])

  const flush = useCallback(() => {
    const store = getStore()
    store.flushQueued = false

    for (const event of store.pendingBeats) {
      const called = event.note
      if (called === undefined) {
        continue
      }

      // The previous call's window closes here, and an unanswered one is the
      // only thing a close can score. A window that was already hit was banked
      // at the moment it was confirmed.
      if (store.open !== null && store.open.verdict === null) {
        store.tally = applyMiss(store.tally)
        store.lastVerdict = { hit: false, responseMs: null }
      }

      store.open = activeRef.current
        ? openWindow(called.pc, event.time, engineRef.current.getCueEndForBeat(event.time))
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
      // Count-in beats and the beats inside a note's span call nothing, so they
      // open and close nothing.
      if (event.note === undefined) {
        return
      }

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

        const judged = judgeDetection(store.open, heard)
        if (judged === store.open) {
          return
        }

        store.open = judged
        const verdict = judged.verdict
        if (verdict === null || !verdict.hit) {
          return
        }

        // Banked and published together, in one deferral, while the note this
        // is an answer to is still the one on screen.
        store.lastVerdict = verdict
        store.tally = applyHit(store.tally, verdict.responseMs)
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
  }, [running, active, getStore])

  /** Session-scoped: the score goes back to nothing with the session. */
  const reset = useCallback(() => {
    const store = getStore()
    store.open = null
    store.pendingBeats = []
    store.tally = EMPTY_TALLY
    store.lastVerdict = null
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

  return { handleBeat, lastVerdict: snapshot.lastVerdict, tally: snapshot.tally, reset }
}
