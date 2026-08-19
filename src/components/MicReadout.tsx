import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { FLAT_DISPLAY, SHARP_DISPLAY, type SpellingPreference } from '../lib/notes'
import type { MicStatus } from '../hooks/useMicPitch'
import type { Bonus, BonusKind, NoteVerdict } from '../lib/scoring'

type MicReadoutProps = {
  status: MicStatus
  heard: { pitchClass: number } | null
  spelling: SpellingPreference
  /** The note being called, so a hit can be named the way it was asked for. */
  called: { pc: number; display: string } | null
  /** How the session is going, or null when nothing is being scored. */
  score: {
    lastVerdict: NoteVerdict | null
    hits: number
    scored: number
    points: number
    streak: number
    /** What the last note earned beyond the flat rate, named as it landed. */
    bonuses: Bonus[]
  } | null
}

/** What each bonus is called on the line. One key per kind, and no more. */
const BONUS_LABELS: Record<BonusKind, string> = { streak: 'streak' }

/** A run is only worth showing once it is one — a single note is not. */
const STREAK_SHOWN_FROM = 2

const STATUS_MESSAGES: Record<Exclude<MicStatus, 'listening'>, string> = {
  idle: 'Listening starts with playback.',
  denied: 'Mic blocked — allow microphone access in your browser.',
  unsupported: 'This browser has no microphone to listen with.',
}

/**
 * What the microphone is hearing, one line of it: which note, and whether it is
 * the one being called. It is also the only way to tell a mic that is off from
 * one that is on and hearing nothing.
 *
 * How far off the pitch was is deliberately not here. This app calls note names
 * to be found on the neck; whether the string was a few cents sharp is a
 * tuner's business, and a second number to parse mid-phrase is a cost with no
 * matching use.
 *
 * A note that matches the call is named exactly as the call named it. E♭ and D♯
 * are the same string on the same fret, and "you played D♯" under a screen
 * reading E♭ reads as a miss to everyone who has not been told otherwise.
 * Anything else follows the spelling preference, and 'mixed' — which has a coin
 * to flip and no call to flip it for — reads as sharps.
 *
 * The verdict is a glyph before it is a colour: a tick and a cross say hit and
 * miss on their own, so the line still reports to a player who cannot tell the
 * green from the red. Nothing is judged during a count-in, when there is no
 * note on screen to be right or wrong about.
 *
 * Under it, when there is a score to report, the second line: whether the last
 * note called was actually played and how long it took, the points the session
 * has banked with the run behind them, and the session's running accuracy
 * beside it. That line stays out until there is something to say — a mic that
 * has been on for four seconds has nothing yet, and "0/0" over an untouched
 * session reads as a failure rather than a beginning.
 *
 * Points do not replace the accuracy: they are the number that goes up, and
 * `hits/scored` is the one that says how it is actually going. They sit on the
 * same line so a player reads both in one glance, and the bonus that just
 * landed is named beside them for exactly as long as it is the last note's.
 *
 * The tally outlives the microphone. Stopping playback closes the mic, and a
 * stopped session is exactly when someone wants to read how it went, so the
 * count stays on the line the status message is on until the session is reset.
 * The verdict does not follow it there: it answers the note that was on screen
 * when it was played, and once the listening stops that question is closed.
 */
export function MicReadout({ status, heard, spelling, called, score }: MicReadoutProps) {
  if (status !== 'listening') {
    return (
      <div className="mic-readout" data-testid="mic-readout" data-status={status}>
        <span className="mic-readout-label">Mic</span>
        <span className="mic-readout-message">{STATUS_MESSAGES[status]}</span>
        {score !== null && score.scored > 0 ? (
          <div className="mic-readout-score">
            <span className="mic-readout-label">Score</span>
            <ScorePoints points={score.points} streak={score.streak} />
            <ScoreTally hits={score.hits} scored={score.scored} />
          </div>
        ) : null}
      </div>
    )
  }

  const names = spelling === 'flat' ? FLAT_DISPLAY : SHARP_DISPLAY
  const match = heard === null || called === null ? null : heard.pitchClass === called.pc
  const name = heard === null ? '' : match && called !== null ? called.display : names[heard.pitchClass]

  return (
    <div className="mic-readout" data-testid="mic-readout" data-status={status}>
      <span className="mic-readout-label">Heard</span>
      {heard === null ? (
        <span className="mic-readout-message" data-testid="heard-note">
          <span className="mic-readout-none" aria-hidden="true">
            —
          </span>{' '}
          nothing yet
        </span>
      ) : (
        <span
          className="mic-readout-heard"
          data-testid="heard-note"
          data-match={match === null ? undefined : match}
        >
          {match !== null && called !== null && (
            <span
              className="mic-readout-verdict"
              data-testid="heard-verdict"
              role="img"
              aria-label={match ? `${name} — the note called` : `${name} — not the note called, ${called.display}`}
            >
              <FontAwesomeIcon icon={match ? faCheck : faXmark} aria-hidden="true" />
            </span>
          )}
          <span className="mic-readout-note">{name}</span>
        </span>
      )}

      {score !== null && (score.lastVerdict !== null || score.scored > 0) ? (
        <div className="mic-readout-score">
          <span className="mic-readout-label">Score</span>

          {score.lastVerdict !== null ? (
            <span
              className="mic-readout-verdict-row"
              data-testid="score-verdict"
              data-hit={score.lastVerdict.hit}
              role="img"
              aria-label={
                score.lastVerdict.hit
                  ? `Played it in ${formatResponse(score.lastVerdict.responseMs)} seconds`
                  : 'Not played in time'
              }
            >
              <FontAwesomeIcon icon={score.lastVerdict.hit ? faCheck : faXmark} aria-hidden="true" />
              <span className="mic-readout-response">
                {score.lastVerdict.hit ? `${formatResponse(score.lastVerdict.responseMs)} s` : 'missed'}
              </span>
            </span>
          ) : null}

          {score.scored > 0 ? (
            <>
              <ScorePoints points={score.points} streak={score.streak} />
              {score.bonuses.length > 0 ? (
                <span className="mic-readout-bonus" data-testid="score-bonus">
                  {score.bonuses.map((bonus) => `+${bonus.points} ${BONUS_LABELS[bonus.kind]}`).join(' ')}
                </span>
              ) : null}
              <ScoreTally hits={score.hits} scored={score.scored} />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The number that goes up, and the run behind it. Both are one reading to a
 * screen reader — "120 points, 4 in a row" — because "×4" on its own is a
 * multiplication sign and a number, and says nothing about notes.
 */
function ScorePoints({ points, streak }: { points: number; streak: number }) {
  const inARow = streak >= STREAK_SHOWN_FROM

  return (
    <span
      className="mic-readout-points"
      data-testid="score-points"
      role="img"
      aria-label={inARow ? `${points} points, ${streak} in a row` : `${points} points`}
    >
      {points} pts{inARow ? ` · ×${streak}` : ''}
    </span>
  )
}

/** Read after the session as often as during it, hence its own component. */
function ScoreTally({ hits, scored }: { hits: number; scored: number }) {
  return (
    <span className="mic-readout-tally" data-testid="score-tally">
      {hits}/{scored} · {Math.round((hits / scored) * 100)}%
    </span>
  )
}

/** Seconds to two places: the useful range is a fraction of one. */
const formatResponse = (responseMs: number) => (responseMs / 1000).toFixed(2)
