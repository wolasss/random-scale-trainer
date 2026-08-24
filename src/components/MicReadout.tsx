import { faArrowTrendUp, faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { FLAT_DISPLAY, SHARP_DISPLAY, type SpellingPreference } from '../lib/notes'
import type { MicStatus } from '../hooks/useMicPitch'
import {
  hitAward,
  isPracticeMilestone,
  type Bonus,
  type NoteVerdict,
  type PracticeMilestoneKind,
} from '../lib/scoring'

/**
 * Where this browser stands on the shared board, or null off a challenge —
 * which is the whole of "without ?challenge= in the URL there is no board line".
 */
export type BoardStanding = { leading: true } | { leading: false; leader: string; gap: number }

/** How the session is going, or null when nothing is being scored. */
type ScoreReading = {
  lastVerdict: NoteVerdict | null
  hits: number
  scored: number
  points: number
  /** The longest run the session has managed, which a miss cannot take away. */
  bestStreak: number
  /**
   * What the last note earned beyond the flat rate — or a practice milestone
   * the session clock just earned, which belongs to no note but is banked in
   * the same total and reported here beside whatever note was scored last.
   */
  bonuses: Bonus[]
  /** What the settings are pricing a note at right now. 1 is the flat rate. */
  multiplier: number
}

type MicReadoutProps = {
  status: MicStatus
  heard: { pitchClass: number } | null
  spelling: SpellingPreference
  /** The note being called, so a hit can be named the way it was asked for. */
  called: { pc: number; display: string } | null
  /**
   * Playback is running, which is what picks the in-play reading over the
   * summary. Deliberately not `status`: the microphone closes a render after
   * the transport stops it, and keying the swap off the mic would flash the
   * play row over a session nobody is playing any more.
   */
  isPlaying: boolean
  /** Paused rather than stopped — the difference between how it *is* going and
   * how it *went*, and the only thing the two summaries disagree about. */
  isPaused: boolean
  score: ScoreReading | null
  board?: BoardStanding | null
}

/** What a milestone stat is called. One key per kind, and no more. */
const MILESTONE_LABELS: Record<PracticeMilestoneKind, string> = {
  practice10: '10 min played',
  practice20: '20 min played',
  practice30: '30 min played',
}

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
 * Under it, the score — and what it says depends entirely on whether anyone is
 * playing, because the two moments want opposite things from it.
 *
 * **Playing.** Three readings and no more: the heard note with its verdict, the
 * session total, and what the last note put on it. Nothing else. A player
 * mid-phrase has one glance to spend and the note on screen has first claim on
 * it, so a row of five figures is a row that gets read as none. The total is
 * the one thing sized to be read from a stand, and it is bare — the display
 * face and the size say "score" without spending the width on the word, and a
 * screen reader is told "896 points" instead, since it has no size to read it
 * by. The delta beside it replaces the named bonus strings: "+26" is the whole
 * of the news, where "+5 streak +15 two octaves" is a sentence to parse. It
 * appears with the verdict and clears with the next call, which is exactly the
 * lifecycle the bonuses it stands in for already had. The multiplier, the run
 * and the accuracy are all *held back* rather than dropped — see below.
 *
 * **Paused or stopped.** The tally outlives the microphone, and a session that
 * has just stopped is precisely when someone wants to read how it went, so the
 * slot the play row had becomes a summary: a header, then the readings that
 * were too many to carry mid-phrase, one tile each in the session card's own
 * stat grid. Standing still there is room to name every figure, which is why
 * "×5" can be a best streak here and never on the play row. The price tile is
 * out at exactly ×1 — a factor that changes no total is a tile that says
 * nothing — and a practice milestone earns a tile of its own only when the
 * clock has actually paid one out. That last part is what keeps a milestone
 * landing on the very update that pauses playback: it is banked in the total
 * beside it, so it must be visible somewhere in the same reading, and inside
 * the summary is the only place that is not a stale play row.
 *
 * A challenge adds one line under the grid, and only a challenge does. A pause
 * is when the queued events flush, so "your score just went up on the board" is
 * literally true at the moment it is printed rather than a promise about the
 * next flush — which is the whole reason the line lives here and not on the
 * play row.
 */
export function MicReadout({
  status,
  heard,
  spelling,
  called,
  isPlaying,
  isPaused,
  score,
  board = null,
}: MicReadoutProps) {
  // A session that has not scored a note yet is a session that is starting, not
  // one that is going badly, so both readings wait for the first judged note.
  const scored = score !== null && score.scored > 0
  const reading = isPlaying ? (
    scored ? (
      <div className="mic-readout-score" data-testid="score-play">
        <ScoreTotal points={score.points} />
        <ScoreDelta points={lastDelta(score)} />
      </div>
    ) : null
  ) : scored ? (
    <ScoreSummary score={score} paused={isPaused} board={board} />
  ) : null

  if (status !== 'listening') {
    return (
      <div className="mic-readout" data-testid="mic-readout" data-status={status}>
        <span className="mic-readout-label">Mic</span>
        <span className="mic-readout-message">{STATUS_MESSAGES[status]}</span>
        {reading}
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

      {reading}
    </div>
  )
}

/**
 * What the last note put on the total: the flat rate its call was priced at,
 * plus every bonus that landed on it, already scaled where it was built. A miss
 * earns nothing, so it contributes only whatever the session clock paid out on
 * the same update — a practice milestone belongs to no note, and it is banked
 * in the total this stands beside either way.
 *
 * The price is the one the *last call* was made at rather than one carried on
 * the verdict, because that is all the readout is given. The two are the same
 * note for as long as the reading is about the note on screen, which is as long
 * as anyone reads it; a tempo ramp between a hit and the next call can reprice
 * a figure already shown, and a delta a couple of points out for one note span
 * is not worth another field on the snapshot.
 */
const lastDelta = (score: ScoreReading) =>
  (score.lastVerdict?.hit === true ? hitAward(score.multiplier) : 0) +
  score.bonuses.reduce((total, bonus) => total + bonus.points, 0)

/** Two decimals at most: ×1.38, never ×1.3799999999999999. */
const formatMultiplier = (multiplier: number) => String(Math.round(multiplier * 100) / 100)

/**
 * The number that goes up, and the only thing on the play row sized to be read
 * from a stand. Bare on screen and named to a screen reader — see the note on
 * the component above.
 */
function ScoreTotal({ points }: { points: number }) {
  return (
    <span className="mic-readout-total" data-testid="score-points" role="img" aria-label={`${points} points`}>
      {points}
    </span>
  )
}

/** Out entirely for a note that earned nothing: "+0" is not news. */
function ScoreDelta({ points }: { points: number }) {
  if (points <= 0) {
    return null
  }

  return (
    <span className="mic-readout-delta" data-testid="score-delta" role="img" aria-label={`plus ${points} points`}>
      +{points}
    </span>
  )
}

/**
 * How it is going, read standing still. Every tile names what it counts, so
 * nothing here can be mistaken for part of the total beside it.
 */
function ScoreSummary({
  score,
  paused,
  board,
}: {
  score: ScoreReading
  paused: boolean
  board: BoardStanding | null
}) {
  const price = formatMultiplier(score.multiplier)
  const milestones = score.bonuses.filter(
    (bonus): bonus is Bonus & { kind: PracticeMilestoneKind } => isPracticeMilestone(bonus.kind),
  )

  return (
    <div className="mic-readout-summary" data-testid="score-summary">
      <span className="mic-readout-label">{paused ? 'Paused — how it’s going' : 'How it went'}</span>

      <div className="session-stats mic-readout-stats">
        <SummaryStat testId="score-points" value={String(score.points)} label="points" />
        <SummaryStat
          testId="score-tally"
          value={`${Math.round((score.hits / score.scored) * 100)}%`}
          label={`${score.hits} of ${score.scored} hit`}
        />
        <SummaryStat testId="score-streak" value={`×${score.bestStreak}`} label="best streak" />
        {price === '1' ? null : <SummaryStat testId="score-multiplier" value={`×${price}`} label="note price" />}
        {milestones.map((bonus) => (
          <SummaryStat
            key={bonus.kind}
            testId="score-milestone"
            value={`+${bonus.points}`}
            label={MILESTONE_LABELS[bonus.kind]}
          />
        ))}
      </div>

      {board === null ? null : <BoardNudge board={board} />}
    </div>
  )
}

/** The session card's own tile, so the two readings of a session match. */
function SummaryStat({ testId, value, label }: { testId: string; value: string; label: string }) {
  return (
    <div className="session-stat">
      <span className="session-stat-value" data-testid={testId}>
        {value}
      </span>
      <span className="session-stat-label">{label}</span>
    </div>
  )
}

/**
 * The one line here that asks for something back rather than reporting. It is
 * only ever printed on a pause or a stop, which is when the queued events have
 * gone up — so the board it talks about is the board as it now stands.
 */
function BoardNudge({ board }: { board: BoardStanding }) {
  return (
    <p className="mic-readout-nudge" data-testid="score-nudge">
      <FontAwesomeIcon icon={faArrowTrendUp} aria-hidden="true" />
      {board.leading
        ? 'Top of the board — hold it.'
        : `${board.gap} pts behind ${board.leader} — your score just went up on the board.`}
    </p>
  )
}
