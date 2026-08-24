import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeNickname, nicknameKey, readChallengeName } from '../lib/challenge'
import {
  claimNickname,
  fetchTopScores,
  finishScoringSession,
  MAX_EVENTS_PER_BATCH,
  sendScoreEvents,
  startScoringSession,
  type ScoreboardFailure,
  type ScoreEntry,
  type ScoreEvent,
  type SessionConfig,
} from '../lib/scoreboard'
import type { DifficultyInputs, PracticeMilestoneKind } from '../lib/scoring'
import { readRaw, writeRaw } from '../lib/storage'
import { STORAGE_KEYS } from '../constants'

/** What the strip has to say for itself while it has no scores to show. */
export type ChallengeStatus = 'off' | 'loading' | 'ready' | 'unavailable'

/** Why a join did not happen, in the words the prompt puts on screen. */
export type JoinError = 'taken' | 'rate-limited' | 'error'

/**
 * The kinds of thing the scoring hook reports; see `recordEvent`. `at` is the
 * audio time in seconds of the note it is about — the app's own call, which is
 * the only timestamp with no response jitter in it.
 */
export type ScoredEvent =
  /**
   * A hit carries what its note was called under, which is what the server
   * prices it by. Optional, and null is the same as absent: a hit that declares
   * nothing is priced flat at both ends, which is what a beat carrying no
   * settings produces.
   */
  | { kind: 'hit'; at: number; difficulty?: DifficultyInputs | null }
  | { kind: 'miss'; at: number }
  | { kind: 'bonus'; bonus: 'octaves' | 'tempo'; at: number }
  /** The clock's own, which the server checks its own clock against. */
  | { kind: 'milestone'; milestone: PracticeMilestoneKind; at: number }

export type Challenge = {
  /** The whole feature, in one boolean. False means none of it exists. */
  active: boolean
  name: string | null
  nickname: string | null
  /** Active, and nobody has said who they are yet — so the modal is up. */
  needsNickname: boolean
  /** The name this browser used last, so the prompt is a tap rather than typing. */
  prefill: string
  scores: ScoreEntry[]
  status: ChallengeStatus
  /** A claim is a round trip, so the prompt has something to wait on. */
  joining: boolean
  joinError: JoinError | null
  /** One line about why the board has stopped taking this browser's play. */
  notice: string | null
  /** Reserves the nickname, then joins under it. A taken one does not join. */
  join: (raw: string) => void
  /** Leaves the prompt behind without joining: the board stays, read-only. */
  dismissPrompt: () => void
  /** Queues one thing that happened. The server decides what it is worth. */
  recordEvent: (event: ScoredEvent) => void
  /** Sends whatever is queued, opening a session first if there is not one. */
  flushEvents: () => void
  /** Flushes, then closes the session for good. The next event opens a new one. */
  endSession: () => void
}

export type UseChallengeOptions = {
  /** The query string to read. Defaults to the window's; a test passes its own. */
  search?: string
  fetchImpl?: typeof fetch
  /** The settings a session opened now would be recorded under. */
  config?: SessionConfig
}

const INACTIVE_SCORES: ScoreEntry[] = []

/**
 * How often an open board asks what everybody else has been doing. Long enough
 * that a room full of players is a trickle of small GETs, short enough that a
 * board you are watching is never far behind the room it belongs to.
 */
export const SCOREBOARD_REFRESH_MS = 20_000

/** What each way of being locked out says on the strip. */
const NOTICES: Record<Exclude<ScoreboardFailure, 'error'>, string> = {
  taken: 'That name’s taken on this board — try another?',
  unauthorized: 'Watching only — this name was claimed in another browser.',
  expired: 'That run timed out. Press start and you’re back in.',
  'invalid-config': 'The board would not accept these practice settings.',
  'rate-limited': 'Whoa — a little too fast. Give it a moment.',
  rejected: 'The board couldn’t read that run. Scoring starts fresh from here.',
}

/** Said once, when a claim worked but this browser could not write it down. */
const UNSAVED_TOKEN_NOTICE = 'This browser could not save the name — it is yours until you reload, and no longer.'

/** Challenge name → the nickname this browser owns on it, and its token. */
type TokenMap = Record<string, { nickname: string; token: string }>

/** Accepts only a well-formed `{nickname, token}`; everything else is junk. */
const readEntry = (value: unknown): { nickname: string; token: string } | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const { nickname, token } = value as Partial<Record<'nickname' | 'token', unknown>>

  return typeof nickname === 'string' &&
    nicknameKey(nickname) !== null &&
    typeof token === 'string' &&
    token !== ''
    ? { nickname, token }
    : null
}

const readTokens = (): TokenMap => {
  const raw = readRaw(STORAGE_KEYS.challengeTokens)
  if (raw === null) {
    return {}
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const tokens: TokenMap = {}
    for (const [challenge, value] of Object.entries(parsed)) {
      const entry = readEntry(value)
      if (entry !== null) {
        tokens[challenge] = entry
      }
    }

    return tokens
  } catch {
    return {}
  }
}

/** This browser's claim on one challenge, or null if it holds none. */
const readToken = (challenge: string) => {
  const tokens = readTokens()
  return Object.hasOwn(tokens, challenge) ? tokens[challenge] : null
}

/** False when storage refused it — a token nothing wrote down is one reload old. */
const writeToken = (challenge: string, nickname: string, token: string) =>
  writeRaw(STORAGE_KEYS.challengeTokens, JSON.stringify({ ...readTokens(), [challenge]: { nickname, token } }))

/** Throws away a claim the server has stopped recognising, so it can be remade. */
const forgetToken = (challenge: string) => {
  const tokens = readTokens()
  delete tokens[challenge]
  writeRaw(STORAGE_KEYS.challengeTokens, JSON.stringify(tokens))
}

/**
 * Everything the shared challenge needs, gated on one query parameter.
 *
 * The name is resolved once, on mount, and never again: a challenge is what you
 * arrived on, and a board that changed identity under a running session would
 * be scoring one thing against another. With no `?challenge=` in the URL this
 * hook does nothing at all — no storage read, no request, no state that moves —
 * which is what keeps the feature invisible to everybody who was not invited.
 *
 * What makes somebody a member of a challenge is the *token*, not a stored
 * name. A browser that has been on some other challenge before still gets the
 * prompt here — prefilled from the remembered name, so it is one tap — and
 * claims the nickname properly. That is the whole difference between a board
 * anybody can write your row on and one only you can.
 *
 * Points are never computed here. `recordEvent` queues what the scoring hook
 * observed, `flushEvents` posts it in batches under the token, and the total
 * that comes back is the server's arithmetic. It is the *same* arithmetic as
 * the readout's, run on the same inputs — a hit is queued with the settings its
 * note was called under, and src/server/session-scoring.js prices it by them —
 * so the board and the number under the play button are one figure and not two.
 */
export function useChallenge({ search, fetchImpl, config }: UseChallengeOptions = {}): Challenge {
  const [name] = useState(() =>
    readChallengeName(search ?? (typeof window === 'undefined' ? '' : window.location.search)),
  )
  const active = name !== null

  // Hydrated from *this* challenge's token, never from the global prefill.
  const [owner, setOwner] = useState(() => (active ? readToken(name) : null))
  // Read once, and only on a challenge: off one, this key is never touched.
  const [prefill] = useState(() => (active ? (normalizeNickname(readRaw(STORAGE_KEYS.challengeNickname) ?? '') ?? '') : ''))
  const [promptDismissed, setPromptDismissed] = useState(false)
  const [scores, setScores] = useState<ScoreEntry[]>(INACTIVE_SCORES)
  const [status, setStatus] = useState<ChallengeStatus>(active ? 'loading' : 'off')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<JoinError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fetchRef = useRef(fetchImpl)
  const configRef = useRef(config)
  const ownerRef = useRef(owner)
  useEffect(() => {
    fetchRef.current = fetchImpl
    configRef.current = config
    ownerRef.current = owner
  })

  // The queue of things that happened, and the session they belong to. Refs
  // throughout: `recordEvent` is called from inside the scoring hook's flush,
  // where nothing may re-enter React, and none of this renders differently.
  const queueRef = useRef<ScoreEvent[]>([])
  const sessionRef = useRef<{ id: string | null; startedAt: number; seq: number } | null>(null)
  /** The flush in flight, so a second caller joins it rather than racing it. */
  const drainRef = useRef<Promise<void> | null>(null)

  // Every request is stamped with the number it was issued as, and only the
  // newest one is ever shown. Requests overlap in ordinary use — a poll under a
  // flush, two pauses in quick succession — and responses come back in
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

  /**
   * A refusal that means this browser has stopped being able to score under the
   * session it had: the session goes, the queue goes with it, and nothing is
   * retried against a server that is saying no.
   *
   * `unauthorized` is the one that goes further. The token this browser holds is
   * not one the server recognises — it was cleared out from under it, or the
   * snapshot it was in is gone — and keeping it would leave the player with a
   * credential that cannot work and no way to ask for one that can. So it is
   * thrown away and the prompt comes back, which is the only path to a name
   * again.
   */
  const surrender = useCallback(
    (failure: ScoreboardFailure) => {
      sessionRef.current = null
      queueRef.current = []
      if (failure === 'unauthorized' && name !== null) {
        forgetToken(name)
        ownerRef.current = null
        setOwner(null)
        setPromptDismissed(false)
      }

      setNotice(failure === 'error' ? null : NOTICES[failure])
    },
    [name],
  )

  const join = useCallback(
    (raw: string) => {
      const chosen = normalizeNickname(raw)
      if (!active || chosen === null || joining) {
        return
      }

      setJoining(true)
      setJoinError(null)
      void claimNickname(name, chosen, { fetchImpl: fetchRef.current }).then((result) => {
        setJoining(false)
        if (result.outcome !== 'ok') {
          setJoinError(result.outcome === 'taken' || result.outcome === 'rate-limited' ? result.outcome : 'error')
          return
        }

        // The token is the membership; the bare name is only ever the prefill
        // the next challenge's prompt opens with.
        const saved = writeToken(name, result.value.nickname, result.value.token)
        writeRaw(STORAGE_KEYS.challengeNickname, result.value.nickname)
        setOwner({ nickname: result.value.nickname, token: result.value.token })
        // Storage full, or blocked in a private window. The name is claimed and
        // this browser can play under it, but nothing has written the only copy
        // of the token down — and after a reload the name is gone for good, so
        // that is said now rather than discovered then.
        setNotice(saved ? null : UNSAVED_TOKEN_NOTICE)
      })
    },
    [active, joining, name],
  )

  const dismissPrompt = useCallback(() => setPromptDismissed(true), [])

  /**
   * Sends what is queued, one batch at a time, opening a session if there is
   * none yet. Serialised because the server insists on exact ordering — two
   * batches in flight at once would have one of them arrive with a sequence
   * number the session has not reached.
   *
   * A second caller does not skip: it is handed the flush already running and
   * waits on that. Anything else would let a reset clear the queue out from
   * under a request that was still opening a session, and the run it was
   * carrying would go nowhere.
   *
   * An event stays in the queue until the server has taken it, so a flush that
   * never landed is retried by the next one rather than lost.
   */
  const drain = useCallback((): Promise<void> => {
    const holder = ownerRef.current
    if (!active || holder === null) {
      return Promise.resolve()
    }

    if (drainRef.current !== null) {
      return drainRef.current
    }

    const run = async () => {
      while (queueRef.current.length > 0) {
        const pending = sessionRef.current
        if (pending === null) {
          return
        }

        if (pending.id === null) {
          const settings = configRef.current
          if (settings === undefined) {
            return
          }

          const opened = await startScoringSession(name, holder.nickname, holder.token, settings, {
            fetchImpl: fetchRef.current,
          })
          if (opened.outcome !== 'ok') {
            // As below: a blip keeps what is queued for the next attempt, and
            // only a refusal the server actually made ends the session.
            if (opened.outcome !== 'error') {
              surrender(opened.outcome)
            }

            return
          }

          pending.id = opened.value.sessionId
        }

        const batch = queueRef.current.slice(0, MAX_EVENTS_PER_BATCH)
        const issue = ++issuedRef.current
        const sent = await sendScoreEvents(name, pending.id, holder.token, batch, { fetchImpl: fetchRef.current })
        if (sent.outcome !== 'ok') {
          // A network blip keeps the queue and tries again next time; anything
          // the server actually refused ends the session. `rejected` is the
          // important half of that: the batch failed rules that do not change,
          // so retrying it would stall every event after it for ever. The
          // session is abandoned instead and the next note opens a new one.
          if (sent.outcome !== 'error') {
            surrender(sent.outcome)
          }

          return
        }

        queueRef.current = queueRef.current.slice(batch.length)
        setNotice(null)
        applyRef.current?.(sent.value.scores, issue)
      }
    }

    drainRef.current = run().finally(() => {
      drainRef.current = null
    })

    return drainRef.current
  }, [active, name, surrender])

  const flushEvents = useCallback(() => {
    void drain()
  }, [drain])

  const recordEvent = useCallback(
    (event: ScoredEvent) => {
      if (!active || ownerRef.current === null) {
        return
      }

      // The session's clock starts at the first note it will hold, and every
      // `at` after that is an offset from it on the audio clock — the same
      // clock the beats are scheduled on, so two notes are reported exactly as
      // far apart as the app called them.
      const fresh = sessionRef.current === null
      const session = (sessionRef.current ??= { id: null, startedAt: event.at, seq: 0 })
      // Only what the kind actually carries: a hit's price, a bonus's kind, a
      // milestone's, and nothing at all on a miss. The server rejects a field
      // on a kind that has no use for one, and it is right to — an event
      // nobody can price is one nobody should have sent.
      queueRef.current.push({
        seq: session.seq++,
        kind: event.kind,
        ...(event.kind === 'bonus' ? { bonus: event.bonus } : {}),
        ...(event.kind === 'milestone' ? { milestone: event.milestone } : {}),
        ...(event.kind === 'hit' && event.difficulty != null ? { difficulty: event.difficulty } : {}),
        at: Math.max(0, Math.round((event.at - session.startedAt) * 1000)),
      })

      // The first note opens the session there and then, rather than waiting
      // for a full batch. The server measures a session from the moment it
      // issued one, so a client that buffered a minute of play before asking
      // for one would be reporting notes from before the session existed.
      if (fresh || queueRef.current.length >= MAX_EVENTS_PER_BATCH) {
        void drain()
      }
    },
    [active, drain],
  )

  const endSession = useCallback(() => {
    const holder = ownerRef.current
    const session = sessionRef.current
    if (!active || holder === null || session === null) {
      sessionRef.current = null
      queueRef.current = []
      return
    }

    void drain().then(() => {
      const id = sessionRef.current?.id ?? session.id
      sessionRef.current = null
      queueRef.current = []
      if (id === null) {
        return
      }

      const issue = ++issuedRef.current
      void finishScoringSession(name, id, holder.token, { fetchImpl: fetchRef.current }).then((result) => {
        if (result.outcome === 'ok') {
          applyRef.current?.(result.value.scores, issue)
        }
      })
    })
  }, [active, drain, name])

  return {
    active,
    name,
    nickname: owner?.nickname ?? null,
    needsNickname: active && owner === null && !promptDismissed,
    prefill,
    scores,
    status,
    joining,
    joinError,
    notice,
    join,
    dismissPrompt,
    recordEvent,
    flushEvents,
    endSession,
  }
}
