import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faAnglesLeft,
  faAnglesRight,
  faArrowTrendUp,
  faChevronDown,
  faChevronUp,
} from '@fortawesome/free-solid-svg-icons'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { usePersistentState } from '../hooks/usePersistentState'
import { STORAGE_KEYS } from '../constants'
import type { ChallengeStatus } from '../hooks/useChallenge'
import type { ScoreEntry } from '../lib/scoreboard'

/**
 * Which of the two readings the board is in. Picked by App from the viewport
 * rather than by a media query in here: the fold is a different component tree
 * — a button and a sheet — and not a rail with narrower rules.
 */
export type ScoreboardLayout = 'rail' | 'fold'

/**
 * Wide enough to give the board a 300px column and still leave the note the
 * room it is read from a metre away. Below it the board folds; see `fold`.
 */
export const SCOREBOARD_RAIL_QUERY = '(min-width: 1024px)'

type ScoreboardStripProps = {
  challenge: string
  /** Whoever is at this browser, so their own row can be picked out. */
  nickname: string | null
  scores: ScoreEntry[]
  status: ChallengeStatus
  /** Why this browser has stopped being able to score, if it has. */
  notice?: string | null
  layout: ScoreboardLayout
}

/** What stands in for the board while there is nothing to show. */
const EMPTY_MESSAGES: Record<ChallengeStatus, string> = {
  off: '',
  loading: 'Loading the board…',
  ready: 'No scores yet. Set the bar.',
  unavailable: 'Scoreboard unavailable right now.',
}

/** Challenge name → whether its rail is folded away. See STORAGE_KEYS. */
type HiddenMap = Record<string, boolean>

/** Whole-value rejection: anything that is not an object of booleans is junk. */
const readHidden = (raw: string): HiddenMap | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }

    return Object.values(parsed).every((value) => typeof value === 'boolean')
      ? (parsed as HiddenMap)
      : undefined
  } catch {
    return undefined
  }
}

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd'] as const

/** 1st, 2nd, 3rd — and 11th through 13th, which are the exceptions to it. */
const ordinal = (rank: number): string => {
  const teen = rank % 100 >= 11 && rank % 100 <= 13
  return `${rank}${teen || rank % 10 > 3 ? 'th' : ORDINAL_SUFFIXES[rank % 10]}`
}

/** Where the player stands, and who is one row above them. */
type Standing = { rank: number; points: number; ahead: ScoreEntry | null }

/**
 * Read straight off the scores already on screen — the board is ordered, so
 * the row above yours is the one to catch. Nothing here asks the server
 * anything: a nudge is arithmetic on a list we are holding.
 */
const standingOf = (scores: ScoreEntry[], nickname: string | null): Standing | null => {
  const index = nickname === null ? -1 : scores.findIndex((entry) => entry.nickname === nickname)
  if (index < 0) {
    return null
  }

  return { rank: index + 1, points: scores[index].points, ahead: index === 0 ? null : scores[index - 1] }
}

/**
 * A board refetching itself every twenty seconds looks exactly like one that
 * has stopped. The pulse is the only thing that says which — so it is a dot
 * that moves, and it holds still for anyone who has asked motion not to.
 */
function LiveTag() {
  return (
    <span className="scoreboard-live" data-testid="scoreboard-live">
      <span className="scoreboard-live-dot" aria-hidden="true" />
      live
    </span>
  )
}

/**
 * The rows, shared by the rail and the sheet — one list, rendered in two
 * places, so a phone and a desktop can never disagree about what the board
 * says. Your own row is marked where it stands rather than moved: a board that
 * reorders itself to keep you in sight is not a board.
 */
function ScoreboardRows({
  nickname,
  scores,
  status,
}: Pick<ScoreboardStripProps, 'nickname' | 'scores' | 'status'>) {
  if (scores.length === 0) {
    return (
      <p className="scoreboard-empty" data-testid="scoreboard-empty">
        {EMPTY_MESSAGES[status]}
      </p>
    )
  }

  return (
    <ol className="scoreboard-list">
      {scores.map((entry, index) => {
        const you = entry.nickname === nickname

        return (
          <li className="scoreboard-entry" key={entry.nickname} data-you={you ? 'true' : undefined}>
            <span className="scoreboard-rank">{index + 1}</span>
            <span className="scoreboard-nickname">
              <span className="scoreboard-name">{entry.nickname}</span>
              {you ? <span className="scoreboard-you-tag">· you</span> : null}
            </span>
            <span className="scoreboard-points">{entry.points}</span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The one line under the board that is about you rather than about everybody.
 *
 * Only ever the next row up, never the top: "896 behind the leader" is a
 * number to give up at, and the person immediately above you is the one you
 * can actually catch this session. Nothing at all for somebody who is not on
 * the board — there is no gap to close until there is a row to close it from.
 */
function ScoreboardNudge({ standing }: { standing: Standing | null }) {
  if (standing === null) {
    return null
  }

  return (
    <p className="scoreboard-nudge" data-testid="scoreboard-nudge">
      <FontAwesomeIcon className="scoreboard-nudge-icon" icon={faArrowTrendUp} />
      {standing.ahead === null
        ? 'Top of the board — hold it.'
        : `${standing.ahead.points - standing.points} pts behind ${standing.ahead.nickname} — keep going`}
    </p>
  )
}

/**
 * The top ten, in whichever of its two shapes the screen has room for.
 *
 * On a desktop it is a rail down the right-hand side of the practice stage,
 * divided from the note by a hairline rather than boxed into a second card —
 * the same treatment as the neck, and for the same reason: it is part of the
 * playing view, not a widget beside it. It can be folded away to a handle, and
 * that choice is remembered per challenge, because a board you have dropped
 * out of is not worth a column of the stage and one you are winning is.
 *
 * On a phone there is no column to give it, so it folds instead: one line
 * above the play button saying where you stand, and a sheet when you want the
 * rest. Both readings are the same list and the same nudge.
 *
 * A board that could not be loaded says so on one line and leaves it there.
 * There is nothing to retry by hand, and a failed fetch is not worth a button.
 *
 * `notice` is the other half of that: an expired session, a nickname this
 * browser does not own, a rate limit. All three leave the board readable and
 * say why nothing of yours is landing on it, which is more use than a row that
 * silently stops moving — so on the fold it sits under the summary strip
 * rather than inside the sheet, where a folded board would swallow it.
 */
export function ScoreboardStrip({
  challenge,
  nickname,
  scores,
  status,
  notice = null,
  layout,
}: ScoreboardStripProps) {
  // Only ever reached on a challenge: this component is the whole of what
  // `?challenge=` mounts, so the key is untouched by everybody else.
  const [hiddenMap, setHiddenMap] = usePersistentState<HiddenMap>(STORAGE_KEYS.challengeBoardHidden, {
    defaultValue: {},
    deserialize: readHidden,
    serialize: (value) => JSON.stringify(value),
  })
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  // A no-op while the sheet is shut, which is all of the time on a desktop.
  useFocusTrap(sheetRef, sheetOpen, () => setSheetOpen(false))

  const standing = standingOf(scores, nickname)
  const label = <span className="scoreboard-label">{challenge}</span>
  const noticeLine =
    notice === null ? null : (
      <p className="scoreboard-notice" data-testid="scoreboard-notice" role="status">
        {notice}
      </p>
    )

  if (layout === 'fold') {
    const leader = scores.length === 0 ? null : scores[0]

    return (
      <section className="scoreboard scoreboard-fold" data-testid="scoreboard" aria-label={`Scoreboard for ${challenge}`}>
        <button
          type="button"
          className="scoreboard-summary"
          data-testid="scoreboard-summary"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          <span className="scoreboard-live-dot" aria-hidden="true" />
          {label}
          {/* Where you stand, or — for somebody watching rather than playing —
              the number at the top, which is the only figure a board means to
              them. */}
          {standing === null ? (
            <span className="scoreboard-summary-leader">
              {leader === null ? EMPTY_MESSAGES[status] : `${leader.nickname} · ${leader.points}`}
            </span>
          ) : (
            <span className="scoreboard-summary-you">
              you #{standing.rank} · {standing.points}
            </span>
          )}

          {/* Always rendered, empty or not: it is what pushes the chevron to
              the right-hand edge, and a strip whose chevron moved with the
              board would be a target that will not sit still. */}
          <span className="scoreboard-summary-next">
            {standing?.ahead == null
              ? ''
              : `${standing.ahead.nickname} +${standing.ahead.points - standing.points}`}
          </span>
          <FontAwesomeIcon className="scoreboard-summary-chevron" icon={faChevronUp} />
        </button>

        {noticeLine}

        {/* Through the body, not the strip. The fold lives inside the practice
            stage, and that panel's backdrop-filter is enough to make it the
            containing block for anything fixed inside it — which would pin a
            full-screen sheet to the corner of one card. */}
        {sheetOpen
          ? createPortal(
              <div className="sheet-layer scoreboard-sheet-layer" data-testid="scoreboard-sheet">
                <button
                  type="button"
                  className="sheet-scrim"
                  aria-label="Close the board"
                  tabIndex={-1}
                  onClick={() => setSheetOpen(false)}
                />

                <div
                  className="sheet scoreboard-sheet"
                  ref={sheetRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Scoreboard for ${challenge}`}
                >
                  <div className="sheet-header">
                    <span className="sheet-grip" aria-hidden="true" />
                    <h2 className="sheet-title scoreboard-sheet-title">
                      {label}
                      <LiveTag />
                    </h2>
                    <button
                      type="button"
                      className="sheet-close"
                      data-testid="scoreboard-sheet-close"
                      aria-label="Close the board"
                      onClick={() => setSheetOpen(false)}
                    >
                      <FontAwesomeIcon icon={faChevronDown} />
                    </button>
                  </div>

                  <div className="sheet-body scoreboard-sheet-body">
                    <ScoreboardRows nickname={nickname} scores={scores} status={status} />
                    <ScoreboardNudge standing={standing} />
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </section>
    )
  }

  if (hiddenMap[challenge] === true) {
    return (
      <button
        type="button"
        className="scoreboard-handle"
        data-testid="scoreboard-handle"
        // The whole standing, said out loud: a rotated `#3 · 896` is a glance
        // for a sighted reader and nothing at all for anybody else.
        aria-label={
          standing === null
            ? `Show the ${challenge} scoreboard`
            : `Show the ${challenge} scoreboard — you are ${ordinal(standing.rank)} with ${standing.points} points`
        }
        onClick={() => setHiddenMap((current) => ({ ...current, [challenge]: false }))}
      >
        <FontAwesomeIcon icon={faAnglesLeft} />
        {label}
        {standing === null ? null : (
          <span className="scoreboard-handle-standing" aria-hidden="true">
            #{standing.rank} · {standing.points}
          </span>
        )}
        <span className="scoreboard-live-dot" aria-hidden="true" />
      </button>
    )
  }

  return (
    <section className="scoreboard scoreboard-rail" data-testid="scoreboard" aria-label={`Scoreboard for ${challenge}`}>
      <div className="scoreboard-rail-header">
        {label}
        <LiveTag />
        <button
          type="button"
          className="ghost-button scoreboard-hide"
          data-testid="scoreboard-hide"
          aria-label="Hide the board"
          onClick={() => setHiddenMap((current) => ({ ...current, [challenge]: true }))}
        >
          <FontAwesomeIcon icon={faAnglesRight} />
        </button>
      </div>

      {noticeLine}

      <ScoreboardRows nickname={nickname} scores={scores} status={status} />

      <ScoreboardNudge standing={standing} />
    </section>
  )
}
