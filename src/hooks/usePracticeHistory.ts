import { useCallback, useEffect, useRef, useState } from 'react'
import { addPractice, dayKey, HISTORY_FLUSH_MS, readHistory, writeHistory, type PracticeHistory } from '../lib/history'

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

    const next = addPractice(historyRef.current, dayKey(new Date()), sec, notes)
    historyRef.current = next
    // In memory either way: a store that refuses the write is a reason to say
    // so, not a reason to stop counting the session in front of the user.
    setPersisted(writeHistory(next))
    setHistory(next)
  }, [])

  /**
   * Takes the timer's cumulative elapsed time and banks the difference. A drop
   * (the timer was reset) just re-baselines — it never subtracts from a day.
   */
  const trackElapsed = useCallback(
    (elapsedMs: number) => {
      const delta = elapsedMs - lastElapsedMsRef.current
      lastElapsedMsRef.current = elapsedMs
      if (delta <= 0) {
        return
      }

      pendingMsRef.current += delta
      if (pendingMsRef.current >= HISTORY_FLUSH_MS) {
        commit()
      }
    },
    [commit],
  )

  /** Same shape for the running note count, which also rewinds on reset. */
  const trackNotes = useCallback((notesCalled: number) => {
    const delta = notesCalled - lastNotesRef.current
    lastNotesRef.current = notesCalled
    if (delta > 0) {
      pendingNotesRef.current += delta
    }
  }, [])

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

  return { history, persisted, trackElapsed, trackNotes, commit }
}
