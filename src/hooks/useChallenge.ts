import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeNickname, readChallengeName } from '../lib/challenge'
import { fetchTopScores, submitScore, type ScoreEntry } from '../lib/scoreboard'
import { readRaw, writeRaw } from '../lib/storage'
import { STORAGE_KEYS } from '../constants'

/** What the strip has to say for itself while it has no scores to show. */
export type ChallengeStatus = 'off' | 'loading' | 'ready' | 'unavailable'

export type Challenge = {
  /** The whole feature, in one boolean. False means none of it exists. */
  active: boolean
  name: string | null
  nickname: string | null
  /** Active, and nobody has said who they are yet — so the modal is up. */
  needsNickname: boolean
  scores: ScoreEntry[]
  status: ChallengeStatus
  /** Joins under this name and remembers it. Ignores one that normalises away. */
  join: (raw: string) => void
  /** Leaves the prompt behind without joining: the board stays, read-only. */
  dismissPrompt: () => void
  /** Sends a session tally up, if it beats what this browser has already sent. */
  submit: (points: number) => void
}

export type UseChallengeOptions = {
  /** The query string to read. Defaults to the window's; a test passes its own. */
  search?: string
  fetchImpl?: typeof fetch
}

const INACTIVE_SCORES: ScoreEntry[] = []

/**
 * How often an open board asks what everybody else has been doing. Long enough
 * that a room full of players is a trickle of small GETs, short enough that a
 * board you are watching is never far behind the room it belongs to.
 */
export const SCOREBOARD_REFRESH_MS = 20_000

/**
 * Everything the shared challenge needs, gated on one query parameter.
 *
 * The name is resolved once, on mount, and never again: a challenge is what you
 * arrived on, and a board that changed identity under a running session would
 * be scoring one thing against another. With no `?challenge=` in the URL this
 * hook does nothing at all — no storage read, no request, no state that moves —
 * which is what keeps the feature invisible to everybody who was not invited.
 *
 * The nickname is deliberately not `usePersistentState`: that writes its value
 * back on mount, and a browser that has been on a challenge once should not
 * keep rewriting the name on every ordinary visit afterwards.
 *
 * Submitting is idempotent by two separate mechanisms, because a pause is a
 * thing people do often: nothing is sent unless the tally has actually grown
 * past the last one this browser sent, and the server keeps the best per
 * nickname anyway, so a resend changes nothing.
 */
export function useChallenge({ search, fetchImpl }: UseChallengeOptions = {}): Challenge {
  const [name] = useState(() =>
    readChallengeName(search ?? (typeof window === 'undefined' ? '' : window.location.search)),
  )
  const active = name !== null

  const [nickname, setNickname] = useState<string | null>(() =>
    active ? normalizeNickname(readRaw(STORAGE_KEYS.challengeNickname) ?? '') : null,
  )
  const [promptDismissed, setPromptDismissed] = useState(false)
  const [scores, setScores] = useState<ScoreEntry[]>(INACTIVE_SCORES)
  const [status, setStatus] = useState<ChallengeStatus>(active ? 'loading' : 'off')

  // The highest tally this browser has put on the board. A ref rather than
  // state: it gates a request, and nothing renders differently for it.
  const lastSubmittedRef = useRef(-1)
  const fetchRef = useRef(fetchImpl)
  useEffect(() => {
    fetchRef.current = fetchImpl
  })

  // Every request is stamped with the number it was issued as, and only the
  // newest one is ever shown. Requests overlap in ordinary use — a poll under a
  // submit, two pauses in quick succession — and responses come back in
  // whatever order the network hands them over, so arrival order would let an
  // older top ten land on top of a newer one.
  const issuedRef = useRef(0)

  /** Null once the component is gone, so a slow response lands nowhere. */
  const applyRef = useRef<((next: ScoreEntry[] | null, issue: number) => void) | null>(null)

  useEffect(() => {
    if (!active) {
      return undefined
    }

    const controller = new AbortController()
    applyRef.current = (next, issue) => {
      if (controller.signal.aborted || issue !== issuedRef.current) {
        return
      }

      // A board that could not be read leaves whatever is on screen where it
      // is: a stale top ten beside "not available" says more than an empty one.
      if (next === null) {
        setStatus('unavailable')
        return
      }

      setScores(next)
      setStatus('ready')
    }

    const load = () => {
      const issue = ++issuedRef.current
      void fetchTopScores(name, { signal: controller.signal, fetchImpl: fetchRef.current }).then((next) =>
        applyRef.current?.(next, issue),
      )
    }

    load()

    // A shared board that loaded once is a photograph: everyone else's rounds
    // land while this page sits open, and a player who dismissed the prompt to
    // watch would otherwise see nothing move until they reloaded. Only while
    // the page is actually on screen — a pocketed phone asks for nothing, and
    // catches up the moment it comes back.
    const refresh = () => {
      if (!document.hidden) {
        load()
      }
    }

    const timer = window.setInterval(refresh, SCOREBOARD_REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      applyRef.current = null
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [active, name])

  const join = useCallback(
    (raw: string) => {
      const chosen = normalizeNickname(raw)
      if (!active || chosen === null) {
        return
      }

      writeRaw(STORAGE_KEYS.challengeNickname, chosen)
      setNickname(chosen)
    },
    [active],
  )

  const dismissPrompt = useCallback(() => setPromptDismissed(true), [])

  const submit = useCallback(
    (points: number) => {
      if (!active || nickname === null || points <= lastSubmittedRef.current) {
        return
      }

      const previous = lastSubmittedRef.current
      lastSubmittedRef.current = points
      const issue = ++issuedRef.current
      void submitScore(name, nickname, points, { fetchImpl: fetchRef.current }).then((next) => {
        // A submit that never landed is not one to skip next time — unless a
        // higher tally has gone up since, which supersedes this one anyway.
        if (next === null && lastSubmittedRef.current === points) {
          lastSubmittedRef.current = previous
        }

        applyRef.current?.(next, issue)
      })
    },
    [active, name, nickname],
  )

  return {
    active,
    name,
    nickname,
    needsNickname: active && nickname === null && !promptDismissed,
    scores,
    status,
    join,
    dismissPrompt,
    submit,
  }
}
