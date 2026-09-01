import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  addPractice,
  dayKey,
  HISTORY_FLUSH_MS,
  mergeHistories,
  readHistory,
  writeHistory,
  type PracticeHistory,
} from '../lib/history'

/**
 * Reads a monotonic counter against its last value and returns how far it rose.
 * A drop (the source was reset) just re-baselines and counts as no rise, so a
 * reset never subtracts from a day.
 */
function takeRise(lastRef: RefObject<number>, value: number): number {
  const delta = value - lastRef.current
  lastRef.current = value
  return delta > 0 ? delta : 0
}

/**
 * Records practice against the calendar.
 *
 * Time comes from the session timer's tick rather than a clock of its own, so
 * the log pauses at exactly the moment playback does — a session that stopped
 * for a phone call is not practice. Seconds are held in refs and committed
 * every ten seconds (and on every pause) so a closed tab costs seconds instead
 * of a whole session.
 */
export function usePracticeHistory() {
  const [history, setHistory] = useState<PracticeHistory>(readHistory)
  const historyRef = useRef(history)
  // Assumed good until a write says otherwise — nothing has been asked of the
  // store yet, and starting on a warning nobody has earned would be noise.
  const [persisted, setPersisted] = useState(true)

  const pendingMsRef = useRef(0)
  const pendingNotesRef = useRef(0)
  const lastElapsedMsRef = useRef(0)
  const lastNotesRef = useRef(0)

  /** Folds whatever has accumulated into today and writes it through. */
  const commit = useCallback(() => {
    // Whole seconds only; the remainder stays pending so long sessions don't
    // lose a fraction of a second on every write.
    const sec = Math.floor(pendingMsRef.current / 1000)
    const notes = pendingNotesRef.current
    if (sec <= 0 && notes <= 0) {
      return
    }

    pendingMsRef.current -= sec * 1000
    pendingNotesRef.current = 0

    // Onto what is in the store *now*, not onto the copy read at mount: the
    // installed app and a browser tab can both be open, and folding this tab's
    // seconds onto a baseline from an hour ago would write the other tab's
    // minutes back out of existence. Only the pending rise is this tab's to add;
    // everything else is whichever copy is further along. A blocked or empty read
    // comes back empty, so the merge doubles as the in-memory fallback.
    //
    // Read and write are one synchronous block, so the only way two tabs can
    // still collide is by running it in genuine parallel microseconds apart, at a
    // cost of up to one flush. Closing that would mean holding a cross-tab lock,
    // and the locks a browser offers are async: the pagehide flush below would
    // never get one before the page went away, trading a rare lost flush for a
    // reliable one.
    const baseline = mergeHistories(readHistory(), historyRef.current)
    const next = addPractice(baseline, dayKey(new Date()), sec, notes)
    historyRef.current = next
    // In memory either way: a store that refuses the write is a reason to say
    // so, not a reason to stop counting the session in front of the user.
    setPersisted(writeHistory(next))
    setHistory(next)
  }, [])

  /**
   * Takes the timer's cumulative elapsed time and banks the difference, writing
   * through once enough has piled up to be worth a flush.
   */
  const trackElapsed = useCallback(
    (elapsedMs: number) => {
      const rise = takeRise(lastElapsedMsRef, elapsedMs)
      if (rise <= 0) {
        return
      }

      pendingMsRef.current += rise
      if (pendingMsRef.current >= HISTORY_FLUSH_MS) {
        commit()
      }
    },
    [commit],
  )

  /** The running note count, banked the same way but never worth a flush. */
  const trackNotes = useCallback((notesCalled: number) => {
    pendingNotesRef.current += takeRise(lastNotesRef, notesCalled)
  }, [])

  /** Whether a commit right now would actually write something. */
  const hasPending = useCallback(
    () => Math.floor(pendingMsRef.current / 1000) > 0 || pendingNotesRef.current > 0,
    [],
  )

  // A tab closed mid-session still gets its seconds; pagehide is the only
  // unload event iOS Safari fires reliably.
  useEffect(() => {
    const flush = () => commit()
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        commit()
      }
    }

    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flushWhenHidden)

    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flushWhenHidden)
      commit()
    }
  }, [commit])

  return { history, persisted, trackElapsed, trackNotes, commit, hasPending }
}
