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
 * What the microphone is hearing, one line of it. The heard note is not scored
 * against the called one here — this is the readout that says the ear works at
 * all, and it is the only way to tell a mic that is off from one that is on and
 * hearing nothing.
 *
 * A note that matches the call is named exactly as the call named it. E♭ and D♯
 * are the same string on the same fret, and "you played D♯" under a screen
 * reading E♭ reads as a miss to everyone who has not been told otherwise.
 * Anything else follows the spelling preference, and 'mixed' — which has a coin
 * to flip and no call to flip it for — reads as sharps.
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
  // Math.round hands back -0 just under the note, which reads as "-0 cents".
  const cents = heard === null ? 0 : Math.round(heard.cents) || 0
  const name =
    heard === null ? '' : called !== null && called.pc === heard.pitchClass ? called.display : names[heard.pitchClass]

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
        <span className="mic-readout-heard" data-testid="heard-note">
          <span className="mic-readout-note">{name}</span>
          <span className="mic-readout-cents">
            {cents > 0 ? '+' : ''}
            {cents} cents
          </span>
        </span>
      )}
    </div>
  )
}
