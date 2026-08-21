import type { ChallengeStatus } from '../hooks/useChallenge'
import type { ScoreEntry } from '../lib/scoreboard'

type ScoreboardStripProps = {
  challenge: string
  /** Whoever is at this browser, so their own row can be picked out. */
  nickname: string | null
  scores: ScoreEntry[]
  status: ChallengeStatus
  /** Why this browser has stopped being able to score, if it has. */
  notice?: string | null
}

/** What stands in for the board while there is nothing to show. */
const EMPTY_MESSAGES: Record<ChallengeStatus, string> = {
  off: '',
  loading: 'Loading the board…',
  ready: 'Nobody has scored yet — be first.',
  unavailable: 'Scoreboard unavailable right now.',
}

/**
 * The top ten, in one quiet strip along the bottom.
 *
 * It is the same size and weight as the mic readout for the same reason: this
 * is something you glance at between phrases, not the thing you are reading
 * from across the room. Your own row is marked rather than moved — a board that
 * reorders itself to keep you in sight is not a board.
 *
 * A board that could not be loaded says so on one line and leaves it there.
 * There is nothing to retry by hand, and a failed fetch is not worth a button.
 *
 * `notice` is the other half of that: an expired session, a nickname this
 * browser does not own, a rate limit. All three leave the board readable and
 * say why nothing of yours is landing on it, which is more use than a row that
 * silently stops moving.
 */
export function ScoreboardStrip({ challenge, nickname, scores, status, notice = null }: ScoreboardStripProps) {
  return (
    <section className="scoreboard" data-testid="scoreboard" aria-label={`Scoreboard for ${challenge}`}>
      <span className="scoreboard-label">{challenge}</span>

      {notice === null ? null : (
        <span className="scoreboard-notice" data-testid="scoreboard-notice" role="status">
          {notice}
        </span>
      )}

      {scores.length === 0 ? (
        <span className="scoreboard-empty" data-testid="scoreboard-empty">
          {EMPTY_MESSAGES[status]}
        </span>
      ) : (
        <ol className="scoreboard-list">
          {scores.map((entry, index) => (
            <li
              className="scoreboard-entry"
              key={entry.nickname}
              data-you={entry.nickname === nickname ? 'true' : undefined}
            >
              <span className="scoreboard-rank">{index + 1}</span>
              <span className="scoreboard-nickname">{entry.nickname}</span>
              <span className="scoreboard-points">{entry.points}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
