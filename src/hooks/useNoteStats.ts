import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BeatEvent } from '../lib/playback/machine'
import {
  clearNoteStats,
  EMPTY_NOTE_STATS,
  readNoteStats,
  recordNote,
  weakestPcs,
  writeNoteStats,
  type NoteStats,
} from '../lib/noteStats'
import { judgeDetection, openWindow, type NoteWindow } from '../lib/scoring'
import type { HeardPitch } from './useMicPitch'
import type { ScoringEngine } from './useNoteScoring'

export type UseNoteStatsOptions = {
  engine: ScoringEngine
  /** `useMicPitch`'s subscribe — the same frames the readout is judged from. */
  subscribe: (listener: (heard: HeardPitch) => void) => () => void
  /** The microphone is actually listening. Off means nothing is ever recorded. */
  active: boolean
  /** Playback is running. A pause or a stop drops the open note unjudged. */
  running: boolean
}

/** Everything the record knows between renders, in refs. */
type NoteStatsStore = {
  open: NoteWindow | null
  pendingBeats: BeatEvent[]
  flushQueued: boolean
  stats: NoteStats
  /** The record React and storage have already been told about. */
  published: NoteStats
}

const createStore = (stats: NoteStats): NoteStatsStore => ({
  open: null,
  pendingBeats: [],
  flushQueued: false,
  stats,
  published: stats,
})

/**
 * Keeps the per-note record — see src/lib/noteStats.ts for what is in it.
 *
 * This is a *sibling* of `useNoteScoring`, not a reading of it. It hangs off the
 * very same `mic.subscribe` and the same `onBeat` fan-out, and judges with the
 * same `openWindow`/`judgeDetection` out of `src/lib/scoring.ts` — identical
 * frames through identical pure functions, so what lands here cannot disagree
 * with what the readout printed. The alternative was to put the pitch class on
 * the `ScoredEvent` the shared board is fed, which would change what is posted
 * to a server for the sake of a local card.
 *
 * It is a deliberately *thin* copy of that judging. Hit or miss, and the
 * response time behind a hit: nothing here knows about the beat ring, the
 * bonuses, the multipliers or the points, because none of those are a property
 * of a note you keep losing.
 *
 * The ref-only contract is `useNoteScoring`'s, for the same reason (see the
 * note at usePlayback.ts): `handleBeat` fires from inside the scheduler's
 * animation frame, so it pushes to a queue and books a microtask and does
 * nothing else, ever. State and storage are written from that flush and from
 * nowhere else — one write per note judged, of twelve triples, which is the
 * intended cost of a record that never grows.
 *
 * A window still open when playback pauses or the microphone drops out is
 * dropped rather than counted against the note: nobody was given the chance to
 * answer it, exactly as the readout has it.
 */
export function useNoteStats({ engine, subscribe, active, running }: UseNoteStatsOptions) {
  const [stats, setStats] = useState<NoteStats>(readNoteStats)

  // The first render's value, which is what the store is seeded from. Captured
  // in a ref so `getStore` stays stable across every later change to `stats`.
  const seedRef = useRef(stats)
  const storeRef = useRef<NoteStatsStore | null>(null)
  const getStore = useCallback(() => (storeRef.current ??= createStore(seedRef.current)), [])

  const engineRef = useRef(engine)
  const activeRef = useRef(active)
  useEffect(() => {
    engineRef.current = engine
    activeRef.current = active
  })

  /** The one place the record reaches React or storage. */
  const publish = useCallback(() => {
    const store = getStore()
    if (store.stats === store.published) {
      return
    }

    store.published = store.stats
    writeNoteStats(store.stats)
    setStats(store.stats)
  }, [getStore])

  const flush = useCallback(() => {
    const store = getStore()
    store.flushQueued = false

    for (const event of store.pendingBeats) {
      // A count-in calls nothing, so there is nothing to judge under it — and
      // it does not close the note before it either. In continuous mode a
      // cycle boundary counts in while the previous call is still the
      // readout's open question, so closing it here would bank a miss against
      // a note the session card still has open, or refuse a late answer the
      // tally beside it accepted. Whether a call survives a count-in is the
      // judging's to say, in scoring.ts, for the readout and the record at
      // once; it is not a rule this card gets to keep privately.
      if (event.countInValue !== undefined) {
        continue
      }

      const called = event.note
      if (called === undefined) {
        continue
      }

      // The previous call's window closes here. A window already answered was
      // recorded the moment it was — so a close can only ever record a miss,
      // and it records it against the note that went unanswered rather than
      // against the one that just closed it.
      if (store.open !== null && store.open.verdict === null) {
        store.stats = recordNote(store.stats, store.open.pc, { hit: false, responseMs: null })
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

  /** The `onBeat` handler: a ref push and a microtask, and that is all of it. */
  const handleBeat = useCallback(
    (event: BeatEvent) => {
      getStore().pendingBeats.push(event)
      scheduleFlush()
    },
    [getStore, scheduleFlush],
  )

  useEffect(
    () =>
      subscribe((heard) => {
        const store = getStore()
        const previous = store.open
        if (previous === null) {
          return
        }

        const judged = judgeDetection(previous, heard)
        if (judged === previous) {
          return
        }

        store.open = judged
        // Only the moment the verdict *flips* counts. Every frame after it is
        // the same note still sounding, and there are no bonuses here to earn
        // from one — recording again would count the note twice.
        if (previous.verdict !== null || judged.verdict === null || !judged.verdict.hit) {
          return
        }

        store.stats = recordNote(store.stats, judged.pc, judged.verdict)
        scheduleFlush()
      }),
    [subscribe, getStore, scheduleFlush],
  )

  // A pause, a stop, or a microphone that goes away mid-note leaves a question
  // nobody was given the chance to answer. It is dropped, not missed.
  //
  // The last note of a finite session leaves by the same door, and it does get
  // a full span to be answered in first — so a record that scored it would
  // count a miss the session card standing beside it never counted. Telling
  // that ending apart from a pause means knowing when a window has expired,
  // and a `NoteWindow` carries no end: it is closed by the next call and by
  // nothing else. That is a rule of the shared judging, so the place to change
  // it is `openWindow`/`useNoteScoring`, where both the readout and this
  // record would change together.
  useEffect(() => {
    if (running && active) {
      return
    }

    const store = getStore()
    store.open = null
    store.pendingBeats = []
  }, [running, active, getStore])

  /** Everything back to nothing, in the refs, in React and in the store. */
  const reset = useCallback(() => {
    const store = getStore()
    store.open = null
    store.pendingBeats = []
    store.stats = EMPTY_NOTE_STATS
    store.published = EMPTY_NOTE_STATS
    clearNoteStats()
    setStats(EMPTY_NOTE_STATS)
  }, [getStore])

  const weakest = useMemo(() => weakestPcs(stats), [stats])

  return { stats, weakest, handleBeat, reset }
}
