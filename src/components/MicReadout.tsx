import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { FLAT_DISPLAY, SHARP_DISPLAY, type SpellingPreference } from '../lib/notes'
import { carriesPitch, describeString, STRING_ORDINALS } from '../lib/strings'
import type { MicStatus } from '../hooks/useMicPitch'
import type { Bonus, BonusKind, NoteVerdict } from '../lib/scoring'

type MicReadoutProps = {
  status: MicStatus
  /** The octave comes along because a string only carries a note in some of them. */
  heard: { pitchClass: number; octave: number } | null
  spelling: SpellingPreference
  /** The note being called, so a hit can be named the way it was asked for. */
  called: { pc: number; display: string; stringIndex?: number | null } | null
  /** How the session is going, or null when nothing is being scored. */
  score: {
    lastVerdict: NoteVerdict | null
    hits: number
    scored: number
    points: number
    streak: number
    /**
     * What the last note earned beyond the flat rate, named as it landed —
     * or a practice milestone the session clock just earned, which belongs
     * to no note but is shown here beside whatever note was scored last.
     */
    bonuses: Bonus[]
    /** What the settings are pricing a note at right now. 1 is the flat rate. */
    multiplier: number
  } | null
}

/** What each bonus is called on the line. One key per kind, and no more. */
const BONUS_LABELS: Record<BonusKind, string> = {
  streak: 'streak',
  octaves: 'two octaves',
  tempo: 'in time',
  practice10: '10 min',
  practice20: '20 min',
  practice30: '30 min',
}

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
 * note called was actually played, the points the session has banked with the
 * run behind them, and the session's running accuracy beside it. That line
 * stays out until there is something to say — a mic that has been on for four
 * seconds has nothing yet, and "0/0" over an untouched session reads as a
 * failure rather than a beginning.
 *
 * Points do not replace the accuracy: they are the number that goes up, and
 * `hits/scored` is the one that says how it is actually going. They sit on the
 * same line so a player reads both in one glance, and the bonus that just
 * landed is named beside them for exactly as long as it is the last note's.
 * A practice milestone is the same reading with no note behind it — earned by
 * the session clock crossing 10, 20 or 30 minutes rather than by anything
 * played — but shown and cleared exactly like any other bonus: beside
 * whatever note was scored last, gone with the next one. "two octaves" is
 * named as exactly that and never as two places on the neck:
 * the microphone hears pitch, and the same note in unison two strings apart is
 * one pitch that earns nothing.
 *
 * The tally outlives the microphone. Stopping playback closes the mic, and a
 * stopped session is exactly when someone wants to read how it went, so the
 * count stays on the line the status message is on until the session is reset.
 * The verdict does not follow it there: it answers the note that was on screen
 * when it was played, and once the listening stops that question is closed.
 * The bonus beside the count does follow it there — a practice milestone is as
 * likely to land on the very update that stops the mic as on any other, and a
 * bonus already counted in the total it sits beside should not vanish from it.
 *
 * Every number on the score line is named: "N pts", "N in a row", and
 * "hits/scored · N%". None of it is a bare number beside a glyph — a player
 * who has not been told what a figure means reads it as part of the total
 * next to it. The one glyph on the line is the verdict's tick or cross; "×"
 * belongs to the difficulty multiplier and to nothing else, which is why a
 * streak — a count of notes, not a factor on points — is spelled out as "N in
 * a row" rather than "×N".
 *
 * When the call named a string, a hint follows the note the mic heard — but
 * only ever as a hint. A microphone yields pitch and nothing else: several
 * strings sound the very same pitch, so which one was actually struck is not a
 * thing that can be heard. What can be said is whether the string that was
 * called can produce the pitch that came out at all, and that is exactly what
 * this reads out. It scores nothing, moves no tick or cross, and stays out of
 * the line entirely whenever the note itself was wrong — a hint about the
 * string under a cross would be answering a question nobody got to yet.
 *
 * The multiplier itself is only shown when it is doing something. At ×1 the
 * reading would say nothing and the row is narrow enough already, so it is left
 * out entirely rather than printed as a number that changes no total.
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
            {score.bonuses.length > 0 ? (
              <span className="mic-readout-bonus" data-testid="score-bonus">
                {score.bonuses.map((bonus) => `+${bonus.points} ${BONUS_LABELS[bonus.kind]}`).join(' ')}
              </span>
            ) : null}
            <ScoreTally hits={score.hits} scored={score.scored} />
          </div>
        ) : null}
      </div>
    )
  }

  const names = spelling === 'flat' ? FLAT_DISPLAY : SHARP_DISPLAY
  const match = heard === null || called === null ? null : heard.pitchClass === called.pc
  const name = heard === null ? '' : match && called !== null ? called.display : names[heard.pitchClass]
  const calledString = called?.stringIndex ?? null

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
          {match && calledString !== null ? <StringHint stringIndex={calledString} heard={heard} /> : null}
        </span>
      )}

      {score !== null && (score.lastVerdict !== null || score.scored > 0) ? (
        <div className="mic-readout-score">
          <span className="mic-readout-label">Score</span>

          {score.lastVerdict !== null ? <ScoreResponse verdict={score.lastVerdict} /> : null}

          {score.scored > 0 ? (
            <>
              <ScorePoints points={score.points} streak={score.streak} />
              <ScoreMultiplier multiplier={score.multiplier} />
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
 * Whether the pitch that was heard is one the called string can actually sound,
 * spoken as the guess it is. The microphone cannot say which string was played
 * — it hears a pitch — so this never becomes a verdict: it is the same right
 * note read an octave away from where it was asked for, said out loud.
 */
function StringHint({
  stringIndex,
  heard,
}: {
  stringIndex: number
  heard: { pitchClass: number; octave: number }
}) {
  const onString = carriesPitch(stringIndex, heard)
  const ordinal = STRING_ORDINALS[stringIndex]

  return (
    <span
      className="mic-readout-string"
      data-testid="heard-string"
      role="img"
      aria-label={
        onString
          ? `that pitch is on the ${describeString(stringIndex)}`
          : `that pitch is not on the ${describeString(stringIndex)} — the right note, somewhere else on the neck`
      }
    >
      · {onString ? `${ordinal} string` : `not the ${ordinal} string`}
    </span>
  )
}

/**
 * The number that goes up, and the run behind it. Both are one reading to a
 * screen reader — "120 points, 4 in a row" — because a streak is a count of
 * notes, not a factor on the points beside it, so it is spelled out rather
 * than shown as "×4". The glyph is reserved for the difficulty multiplier.
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
      {points} pts{inARow ? ` · ${streak} in a row` : ''}
    </span>
  )
}

/** Two decimals at most: ×1.38, never ×1.3799999999999999. */
const formatMultiplier = (multiplier: number) => String(Math.round(multiplier * 100) / 100)

/**
 * What the settings are pricing a note at. Out of the line entirely at the flat
 * rate — the common case, and a row this narrow does not spend width on a
 * factor of one — but shown for a discount as readily as for a premium: a long
 * note span pays below ×1, and a player owed less has more reason to be told
 * than one owed more. Read out in words, since "×1.38" beside a points total is
 * exactly the bare number this line refuses to print anywhere else.
 */
function ScoreMultiplier({ multiplier }: { multiplier: number }) {
  const reading = formatMultiplier(multiplier)
  if (reading === '1') {
    return null
  }

  return (
    <span
      className="mic-readout-multiplier"
      data-testid="score-multiplier"
      role="img"
      aria-label={`${reading} times points`}
    >
      ×{reading}
    </span>
  )
}

/**
 * Whether the last note called was actually played, named so it cannot be
 * mistaken for part of the score total beside it.
 */
function ScoreResponse({ verdict }: { verdict: NoteVerdict }) {
  return (
    <span
      className="mic-readout-verdict-row"
      data-testid="score-verdict"
      data-hit={verdict.hit}
      role="img"
      aria-label={verdict.hit ? 'Played it' : 'Not played in time'}
    >
      <FontAwesomeIcon icon={verdict.hit ? faCheck : faXmark} aria-hidden="true" />
      {verdict.hit ? null : <span className="mic-readout-response">missed</span>}
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
