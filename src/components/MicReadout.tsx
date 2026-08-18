import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { FLAT_DISPLAY, SHARP_DISPLAY, type SpellingPreference } from '../lib/notes'
import type { MicStatus } from '../hooks/useMicPitch'

type MicReadoutProps = {
  status: MicStatus
  heard: { pitchClass: number } | null
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
 * Only the status line is announced. A blocked or unsupported mic is silent
 * failure otherwise — the player turned listening on and nothing ever happens —
 * so it is a live region. The heard-note line changes with every note played
 * and would talk over the app it is reporting on, so it is not.
 */
export function MicReadout({ status, heard, spelling, called }: MicReadoutProps) {
  if (status !== 'listening') {
    return (
      <div className="mic-readout" data-testid="mic-readout" data-status={status} role="status">
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
        </span>
      )}
    </div>
  )
}
