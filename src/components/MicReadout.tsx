import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { FLAT_DISPLAY, SHARP_DISPLAY, type SpellingPreference } from '../lib/notes'
import type { MicStatus } from '../hooks/useMicPitch'

type MicReadoutProps = {
  status: MicStatus
  heard: { pitchClass: number; cents: number } | null
  spelling: SpellingPreference
  /** The note being called, so a hit can be named the way it was asked for. */
  called: { pc: number; display: string } | null
}

const STATUS_MESSAGES: Record<Exclude<MicStatus, 'listening'>, string> = {
  idle: 'Listening starts with playback.',
  denied: 'Mic blocked — allow microphone access in your browser.',
  unsupported: 'This browser has no microphone to listen with.',
}

/**
 * How far off the note may be and still read as in tune. A cent is a hundredth
 * of a semitone, and five of them is under what an ear picks out — a tuner's
 * usual tolerance, and well inside what a fretted string does under a finger.
 */
export const IN_TUNE_CENTS = 5

/**
 * How far off the note is, said rather than signed: "+7 cents" is only legible
 * to someone who already knows the convention, and the readout is for a player
 * who came here to name notes, not to read a tuner.
 */
const tuning = (cents: number) => {
  // Math.round hands back -0 just under the note, which reads as "-0 cents".
  const rounded = Math.round(cents) || 0

  return Math.abs(rounded) <= IN_TUNE_CENTS
    ? 'in tune'
    : `${Math.abs(rounded)} cents ${rounded > 0 ? 'sharp' : 'flat'}`
}

/**
 * What the microphone is hearing, one line of it: the note, whether it is the
 * one being called, and how far off it is. It is also the only way to tell a
 * mic that is off from one that is on and hearing nothing.
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
 */
export function MicReadout({ status, heard, spelling, called }: MicReadoutProps) {
  if (status !== 'listening') {
    return (
      <div className="mic-readout" data-testid="mic-readout" data-status={status}>
        <span className="mic-readout-label">Mic</span>
        <span className="mic-readout-message">{STATUS_MESSAGES[status]}</span>
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
          {/* How in tune the wrong note was is no use to anybody: on a miss the
              line says which note it was and stops there. */}
          {match !== false && <span className="mic-readout-cents">{tuning(heard.cents)}</span>}
        </span>
      )}
    </div>
  )
}
